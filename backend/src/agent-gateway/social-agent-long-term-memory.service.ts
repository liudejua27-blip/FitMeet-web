import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentTask, AgentTaskStatus } from './entities/agent-task.entity';
import { SocialAgentLongTermMemory } from './entities/social-agent-long-term-memory.entity';
import { readSocialAgentTaskMemory } from './social-agent-memory.util';

const TASK_SUMMARY_LIMIT = 20;
const MATCH_SAMPLE_LIMIT = 30;
const PREFERENCE_HISTORY_LIMIT = 80;

export type LongTermMatchSample = {
  candidateUserId: number;
  reasons: string[];
  at: string;
};

export type LongTermPreferencesSnapshot = {
  interests: string[];
  socialStyle: string;
  communicationStyle: string;
  preferredTraits: string[];
  preferenceHistory: LongTermPreferenceHistoryItem[];
};

export type LongTermBoundariesSnapshot = {
  excludedGenders: string[];
  noNightMeet: boolean;
  publicPlaceOnly: boolean;
  noAutoMessage: boolean;
  noContactExchange: boolean;
};

export type LongTermActivitySnapshot = {
  favoriteCities: string[];
  favoriteActivityTypes: string[];
  favoriteTimePreferences: string[];
  favoriteLocationPreferences: string[];
};

export type LongTermMatchSignals = {
  successfulMatches: LongTermMatchSample[];
  failedMatches: LongTermMatchSample[];
};

export type LongTermMemorySnapshot = {
  userId: number;
  profileFacts: Record<string, string | string[]>;
  preferences: LongTermPreferencesSnapshot;
  boundaries: LongTermBoundariesSnapshot;
  socialGoals: string[];
  availability: string[];
  activityPreferences: LongTermActivitySnapshot;
  matchSignals: LongTermMatchSignals;
  taskCount: number;
  updatedAt: string | null;
};

export type ConfirmedLongTermMemoryUpdateInput = {
  userId: number;
  taskId?: number | null;
  memoryKey: string;
  value: string | string[] | boolean;
  reason?: string;
  proposalId?: string | number | null;
  confirmed?: boolean;
  source?: string;
  tags?: string[];
};

export type LongTermMemoryUpdateResult = {
  success: boolean;
  status: 'updated' | 'confirmation_required' | 'ignored';
  confirmationRequired: boolean;
  proposalId: string | number | null;
  memoryKey: string;
  updatedFields: string[];
  storedIn: string;
  snapshot?: LongTermMemorySnapshot;
};

export type LongTermMemoryCandidateForRanking = {
  id: number;
  candidateUserId?: number | null;
  commonTags?: string[];
  reasons?: string[];
  explanation?: Record<string, unknown> | null;
  scoreBreakdown?: Record<string, number> | null;
  distanceKm?: number | null;
};

export type LongTermMemoryRecommendationOptimizationResult = {
  rankedCandidateIds: number[];
  adjustments: Array<{
    candidateId: number;
    candidateUserId: number | null;
    memoryScore: number;
    reasons: string[];
  }>;
  memorySignalsUsed: {
    interests: string[];
    socialStyle: string;
    communicationStyle: string;
    preferredTraits: string[];
    availability: string[];
    boundaries: string[];
  };
  source: 'owner_long_term_memory';
};

export type TaskSummaryEntry = {
  taskId: number;
  goal: string;
  status: string;
  outcome: 'succeeded' | 'failed' | 'cancelled' | 'other';
  at: string;
};

export type LongTermPreferenceHistoryItem = {
  field:
    | 'interest'
    | 'socialStyle'
    | 'communicationStyle'
    | 'preferredTrait'
    | 'socialGoal'
    | 'availability';
  value: string;
  source: 'task_memory' | 'stable_profile_fact';
  taskId: number;
  outcome: TaskSummaryEntry['outcome'];
  confirmed: boolean;
  at: string;
};

/**
 * Structured long-term memory v1 (no Vector DB).
 *
 * - `summarizeTask(task)` is called when a task reaches a terminal state.
 *   It reads `task.memory.taskMemory` + `task.result` and merges those into
 *   the per-user row.
 * - `readSnapshot(userId)` is used as a *weak signal* by planning/matching:
 *   callers should treat it as hints, never as hard filters.
 */
@Injectable()
export class SocialAgentLongTermMemoryService {
  private readonly logger = new Logger(SocialAgentLongTermMemoryService.name);

  constructor(
    @InjectRepository(SocialAgentLongTermMemory)
    private readonly repo: Repository<SocialAgentLongTermMemory>,
  ) {}

  async summarizeTask(task: AgentTask): Promise<LongTermMemorySnapshot | null> {
    if (!task || !task.ownerUserId) return null;
    try {
      const taskMemory = readSocialAgentTaskMemory(task);
      const outcome = this.deriveOutcome(task);
      const summary: TaskSummaryEntry = {
        taskId: task.id,
        goal: (task.goal ?? '').slice(0, 200),
        status: task.status ?? '',
        outcome,
        at: new Date().toISOString(),
      };

      let row = await this.repo.findOne({
        where: { userId: task.ownerUserId },
      });
      if (!row) {
        row = this.repo.create({
          userId: task.ownerUserId,
          preferences: {},
          boundaries: {},
          activityPreferences: {},
          matchSignals: {},
          taskSummaries: [],
          taskCount: 0,
        });
      }

      row.preferences = mergePreferences(
        toRecord(row.preferences),
        taskMemory.preferences,
        taskMemory.stableProfileFacts,
        summary,
      );
      row.boundaries = mergeBoundaries(
        toRecord(row.boundaries),
        taskMemory.boundaries,
      );
      row.activityPreferences = mergeActivityPreferences(
        toRecord(row.activityPreferences),
        taskMemory.activeEntities,
        taskMemory.stableProfileFacts,
        summary,
      );
      row.matchSignals = this.mergeMatchSignals(
        toRecord(row.matchSignals),
        taskMemory,
        outcome,
      );
      row.taskSummaries = [
        ...(Array.isArray(row.taskSummaries) ? row.taskSummaries : []),
        summary,
      ].slice(-TASK_SUMMARY_LIMIT);
      row.taskCount = (row.taskCount ?? 0) + 1;

      const saved = await this.repo.save(row);
      return this.toSnapshot(saved);
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.long_term_memory.summarize_failed',
          taskId: task?.id,
          ownerUserId: task?.ownerUserId,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return null;
    }
  }

  async readSnapshot(userId: number): Promise<LongTermMemorySnapshot> {
    const row = await this.repo
      .findOne({ where: { userId } })
      .catch(() => null);
    if (!row) {
      return emptySnapshot(userId);
    }
    return this.toSnapshot(row);
  }

  async updateConfirmedMemory(
    input: ConfirmedLongTermMemoryUpdateInput,
  ): Promise<LongTermMemoryUpdateResult> {
    const memoryKey = normalizeMemoryKey(input.memoryKey);
    const proposalId = input.proposalId ?? null;
    if (!memoryKey || input.confirmed !== true || proposalId == null) {
      return {
        success: false,
        status: 'confirmation_required',
        confirmationRequired: true,
        proposalId,
        memoryKey,
        updatedFields: [],
        storedIn: 'none',
      };
    }

    const values = normalizeMemoryValues(input.value);
    if (values.length === 0) {
      return {
        success: true,
        status: 'ignored',
        confirmationRequired: false,
        proposalId,
        memoryKey,
        updatedFields: [],
        storedIn: 'none',
      };
    }

    let row = await this.repo.findOne({ where: { userId: input.userId } });
    if (!row) {
      row = this.repo.create({
        userId: input.userId,
        preferences: {},
        boundaries: {},
        activityPreferences: {},
        matchSignals: {},
        taskSummaries: [],
        taskCount: 0,
      });
    }

    const updatedFields: string[] = [];
    const prefs = toRecord(row.preferences);
    const activity = toRecord(row.activityPreferences);
    const bounds = toRecord(row.boundaries);
    const facts = profileFacts(prefs.profileFacts);
    const now = new Date().toISOString();
    const taskId =
      typeof input.taskId === 'number' && input.taskId > 0 ? input.taskId : 0;
    const summary: TaskSummaryEntry = {
      taskId: taskId || Number(String(proposalId).replace(/\D/g, '')) || 1,
      goal: input.reason?.slice(0, 200) || 'confirmed_memory_update',
      status: 'confirmed',
      outcome: 'succeeded',
      at: now,
    };

    const history = preferenceHistoryArray(prefs.preferenceHistory);
    const appendHistory = (
      field: LongTermPreferenceHistoryItem['field'],
      value: string,
      source: LongTermPreferenceHistoryItem['source'] = 'stable_profile_fact',
    ) => {
      history.push(preferenceHistoryItem(field, value, source, summary));
    };

    switch (memoryKey) {
      case 'interest':
      case 'activitytype':
      case 'favoriteactivitytype':
      case 'favoriteactivitytypes':
        prefs.interests = mergeStringList(
          stringList(prefs.interests),
          values,
          32,
        );
        activity.favoriteActivityTypes = mergeStringList(
          stringList(activity.favoriteActivityTypes),
          values,
          10,
        );
        for (const value of values) appendHistory('interest', value);
        updatedFields.push('preferences.interests');
        break;
      case 'socialstyle':
        prefs.socialStyle = values[0];
        appendHistory('socialStyle', values[0], 'task_memory');
        updatedFields.push('preferences.socialStyle');
        break;
      case 'communicationstyle':
        prefs.communicationStyle = values[0];
        appendHistory('communicationStyle', values[0], 'task_memory');
        updatedFields.push('preferences.communicationStyle');
        break;
      case 'preferredtrait':
      case 'preferredtraits':
      case 'targetpreference':
        prefs.preferredTraits = mergeStringList(
          stringList(prefs.preferredTraits),
          values,
          24,
        );
        for (const value of values) appendHistory('preferredTrait', value);
        updatedFields.push('preferences.preferredTraits');
        break;
      case 'socialgoal':
      case 'goal':
        prefs.socialGoals = mergeStringList(
          stringList(prefs.socialGoals),
          values,
          20,
        );
        for (const value of values) appendHistory('socialGoal', value);
        updatedFields.push('preferences.socialGoals');
        break;
      case 'availability':
      case 'timepreference':
      case 'availabletimes':
        prefs.availability = mergeStringList(
          stringList(prefs.availability),
          values,
          20,
        );
        activity.favoriteTimePreferences = mergeStringList(
          stringList(activity.favoriteTimePreferences),
          values,
          10,
        );
        for (const value of values) appendHistory('availability', value);
        updatedFields.push('preferences.availability');
        break;
      case 'city':
        facts.city = values[0];
        activity.favoriteCities = mergeStringList(
          stringList(activity.favoriteCities),
          [values[0]],
          10,
        );
        updatedFields.push('profileFacts.city');
        break;
      case 'nearbyarea':
      case 'locationpreference':
        facts.nearbyArea = values[0];
        activity.favoriteLocationPreferences = mergeStringList(
          stringList(activity.favoriteLocationPreferences),
          [values[0]],
          10,
        );
        updatedFields.push('profileFacts.nearbyArea');
        break;
      case 'publicplaceonly':
      case 'nonightmeet':
      case 'noautomessage':
      case 'nocontactexchange':
        bounds[memoryKey] = toBooleanMemoryValue(input.value);
        updatedFields.push(`boundaries.${memoryKey}`);
        break;
      default:
        facts[input.memoryKey] = values.length === 1 ? values[0] : values;
        updatedFields.push(`profileFacts.${input.memoryKey}`);
        break;
    }

    prefs.profileFacts = facts;
    prefs.preferenceHistory = mergePreferenceHistory(
      preferenceHistoryArray(prefs.preferenceHistory),
      history,
    );
    prefs.confirmedMemoryUpdates = [
      ...confirmedMemoryUpdateArray(prefs.confirmedMemoryUpdates),
      {
        proposalId,
        memoryKey: input.memoryKey,
        updatedFields,
        reason: input.reason || '',
        source: input.source || 'confirmed_memory_proposal',
        tags: Array.isArray(input.tags) ? input.tags.slice(0, 12) : [],
        at: now,
      },
    ].slice(-PREFERENCE_HISTORY_LIMIT);

    row.preferences = prefs;
    row.boundaries = bounds;
    row.activityPreferences = activity;
    const saved = await this.repo.save(row);
    return {
      success: true,
      status: 'updated',
      confirmationRequired: false,
      proposalId,
      memoryKey: input.memoryKey,
      updatedFields,
      storedIn: 'social_agent_long_term_memory',
      snapshot: this.toSnapshot(saved),
    };
  }

  async optimizeRecommendationWithMemory(input: {
    userId: number;
    candidates: LongTermMemoryCandidateForRanking[];
  }): Promise<LongTermMemoryRecommendationOptimizationResult> {
    const snapshot = await this.readSnapshot(input.userId);
    const signals = buildMemorySignals(snapshot);
    const adjustments = input.candidates.map((candidate, index) => {
      const text = candidatePublicText(candidate);
      let memoryScore = Math.max(0, input.candidates.length - index);
      const reasons: string[] = [];

      for (const interest of signals.interests) {
        if (containsSignal(text, interest)) {
          memoryScore += 6;
          reasons.push(`兴趣匹配：${interest}`);
        }
      }
      for (const trait of signals.preferredTraits) {
        if (containsSignal(text, trait)) {
          memoryScore += 4;
          reasons.push(`偏好匹配：${trait}`);
        }
      }
      if (signals.socialStyle && containsSignal(text, signals.socialStyle)) {
        memoryScore += 4;
        reasons.push(`社交风格更接近：${signals.socialStyle}`);
      }
      if (
        signals.communicationStyle &&
        containsSignal(text, signals.communicationStyle)
      ) {
        memoryScore += 3;
        reasons.push(`沟通方式更接近：${signals.communicationStyle}`);
      }
      for (const availability of signals.availability) {
        if (containsSignal(text, availability)) {
          memoryScore += 4;
          reasons.push(`时间偏好匹配：${availability}`);
        }
      }
      if (
        snapshot.boundaries.publicPlaceOnly &&
        /公共|公园|场馆|商场/.test(text)
      ) {
        memoryScore += 2;
        reasons.push('符合公共场所偏好');
      }
      if (snapshot.boundaries.noNightMeet && /夜|晚上|凌晨/.test(text)) {
        memoryScore -= 6;
        reasons.push('降低夜间安排权重');
      }
      if (
        snapshot.matchSignals.successfulMatches.some(
          (sample) => sample.candidateUserId === candidate.candidateUserId,
        )
      ) {
        memoryScore += 8;
        reasons.push('历史互动信号较好');
      }
      if (
        snapshot.matchSignals.failedMatches.some(
          (sample) => sample.candidateUserId === candidate.candidateUserId,
        )
      ) {
        memoryScore -= 12;
        reasons.push('历史反馈降低推荐权重');
      }

      return {
        candidateId: candidate.id,
        candidateUserId: candidate.candidateUserId ?? null,
        memoryScore,
        reasons,
      };
    });

    adjustments.sort(
      (a, b) => b.memoryScore - a.memoryScore || a.candidateId - b.candidateId,
    );
    return {
      rankedCandidateIds: adjustments.map((item) => item.candidateId),
      adjustments,
      memorySignalsUsed: {
        interests: signals.interests,
        socialStyle: signals.socialStyle,
        communicationStyle: signals.communicationStyle,
        preferredTraits: signals.preferredTraits,
        availability: signals.availability,
        boundaries: [
          ...(snapshot.boundaries.publicPlaceOnly ? ['publicPlaceOnly'] : []),
          ...(snapshot.boundaries.noNightMeet ? ['noNightMeet'] : []),
          ...(snapshot.boundaries.noAutoMessage ? ['noAutoMessage'] : []),
          ...(snapshot.boundaries.noContactExchange
            ? ['noContactExchange']
            : []),
        ],
      },
      source: 'owner_long_term_memory',
    };
  }

  private deriveOutcome(task: AgentTask): TaskSummaryEntry['outcome'] {
    if (task.status === AgentTaskStatus.Succeeded) return 'succeeded';
    if (task.status === AgentTaskStatus.Failed) return 'failed';
    if (task.status === AgentTaskStatus.Cancelled) return 'cancelled';
    return 'other';
  }

  private mergeMatchSignals(
    previous: Record<string, unknown>,
    taskMemory: ReturnType<typeof readSocialAgentTaskMemory>,
    outcome: TaskSummaryEntry['outcome'],
  ): Record<string, unknown> {
    const prevSuccess = sampleArray(previous.successfulMatches);
    const prevFail = sampleArray(previous.failedMatches);
    const now = new Date().toISOString();

    const successful = [...prevSuccess];
    const failed = [...prevFail];

    if (outcome === 'succeeded') {
      for (const candidateId of taskMemory.candidateState.savedIds) {
        successful.push({
          candidateUserId: candidateId,
          reasons: ['saved_by_user'],
          at: now,
        });
      }
      for (const candidateId of taskMemory.candidateState.messagedIds) {
        successful.push({
          candidateUserId: candidateId,
          reasons: ['messaged_after_confirmation'],
          at: now,
        });
      }
    }
    for (const candidateId of taskMemory.candidateState.rejectedIds) {
      failed.push({
        candidateUserId: candidateId,
        reasons: ['user_rejected_recommendation'],
        at: now,
      });
    }

    return {
      successfulMatches: dedupSamples(successful).slice(-MATCH_SAMPLE_LIMIT),
      failedMatches: dedupSamples(failed).slice(-MATCH_SAMPLE_LIMIT),
    };
  }

  private toSnapshot(row: SocialAgentLongTermMemory): LongTermMemorySnapshot {
    const prefs = toRecord(row.preferences);
    const bounds = toRecord(row.boundaries);
    const activity = toRecord(row.activityPreferences);
    const signals = toRecord(row.matchSignals);
    const preferenceHistory = preferenceHistoryArray(prefs.preferenceHistory);
    return {
      userId: row.userId,
      preferences: {
        interests: confirmedCurrentList(
          stringList(prefs.interests),
          preferenceHistory,
          'interest',
        ),
        socialStyle: confirmedCurrentValue(
          typeof prefs.socialStyle === 'string' ? prefs.socialStyle : '',
          preferenceHistory,
          'socialStyle',
        ),
        communicationStyle: confirmedCurrentValue(
          typeof prefs.communicationStyle === 'string'
            ? prefs.communicationStyle
            : '',
          preferenceHistory,
          'communicationStyle',
        ),
        preferredTraits: confirmedCurrentList(
          stringList(prefs.preferredTraits),
          preferenceHistory,
          'preferredTrait',
        ),
        preferenceHistory,
      },
      profileFacts: profileFacts(prefs.profileFacts),
      socialGoals: confirmedCurrentList(
        stringList(prefs.socialGoals),
        preferenceHistory,
        'socialGoal',
      ),
      availability: confirmedCurrentList(
        stringList(prefs.availability),
        preferenceHistory,
        'availability',
      ),
      boundaries: {
        excludedGenders: stringList(bounds.excludedGenders),
        noNightMeet: bounds.noNightMeet === true,
        publicPlaceOnly: bounds.publicPlaceOnly === true,
        noAutoMessage: bounds.noAutoMessage === true,
        noContactExchange: bounds.noContactExchange === true,
      },
      activityPreferences: {
        favoriteCities: stringList(activity.favoriteCities),
        favoriteActivityTypes: confirmedCurrentList(
          stringList(activity.favoriteActivityTypes),
          preferenceHistory,
          'interest',
        ),
        favoriteTimePreferences: confirmedCurrentList(
          stringList(activity.favoriteTimePreferences),
          preferenceHistory,
          'availability',
        ),
        favoriteLocationPreferences: stringList(
          activity.favoriteLocationPreferences,
        ),
      },
      matchSignals: {
        successfulMatches: sampleArray(signals.successfulMatches),
        failedMatches: sampleArray(signals.failedMatches),
      },
      taskCount: row.taskCount ?? 0,
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
    };
  }
}

function emptySnapshot(userId: number): LongTermMemorySnapshot {
  return {
    userId,
    profileFacts: {},
    preferences: {
      interests: [],
      socialStyle: '',
      communicationStyle: '',
      preferredTraits: [],
      preferenceHistory: [],
    },
    boundaries: {
      excludedGenders: [],
      noNightMeet: false,
      publicPlaceOnly: false,
      noAutoMessage: false,
      noContactExchange: false,
    },
    socialGoals: [],
    availability: [],
    activityPreferences: {
      favoriteCities: [],
      favoriteActivityTypes: [],
      favoriteTimePreferences: [],
      favoriteLocationPreferences: [],
    },
    matchSignals: { successfulMatches: [], failedMatches: [] },
    taskCount: 0,
    updatedAt: null,
  };
}

function confirmedCurrentList(
  current: string[],
  history: LongTermPreferenceHistoryItem[],
  field: LongTermPreferenceHistoryItem['field'],
): string[] {
  const fieldHistory = history.filter((item) => item.field === field);
  if (fieldHistory.length === 0) return current;
  const confirmed = new Set(
    fieldHistory.filter((item) => item.confirmed).map((item) => item.value),
  );
  return current.filter((value) => confirmed.has(value));
}

function confirmedCurrentValue(
  current: string,
  history: LongTermPreferenceHistoryItem[],
  field: LongTermPreferenceHistoryItem['field'],
): string {
  if (!current) return '';
  const fieldHistory = history.filter((item) => item.field === field);
  if (fieldHistory.length === 0) return current;
  return fieldHistory.some((item) => item.confirmed && item.value === current)
    ? current
    : '';
}

function mergePreferences(
  previous: Record<string, unknown>,
  incoming: ReturnType<typeof readSocialAgentTaskMemory>['preferences'],
  stableProfileFacts: Record<string, string | string[]> = {},
  summary: TaskSummaryEntry,
): Record<string, unknown> {
  const shouldPromoteCurrentPreference = summary.outcome === 'succeeded';
  const profileFactTraits = [
    ...stringList(stableProfileFacts.preferredTraits),
    ...stringList(stableProfileFacts.wantToMeet),
    stringValue(stableProfileFacts.targetPreference),
  ].filter(Boolean);
  const socialGoals = [
    stringValue(stableProfileFacts.socialGoal),
    stringValue(stableProfileFacts.targetPreference),
  ].filter(Boolean);
  const availability = [
    ...stringList(stableProfileFacts.availableTimes),
    stringValue(stableProfileFacts.timePreference),
  ].filter(Boolean);

  return {
    profileFacts: {
      ...profileFacts(previous.profileFacts),
      ...(shouldPromoteCurrentPreference ? stableProfileFacts : {}),
    },
    interests: mergeStringList(
      stringList(previous.interests),
      shouldPromoteCurrentPreference
        ? mergeStringList(
            incoming.interests,
            stringList(stableProfileFacts.interestTags),
            32,
          )
        : [],
      32,
    ),
    socialStyle:
      (shouldPromoteCurrentPreference ? incoming.socialStyle : '') ||
      (typeof previous.socialStyle === 'string' ? previous.socialStyle : ''),
    communicationStyle:
      (shouldPromoteCurrentPreference ? incoming.communicationStyle : '') ||
      (typeof previous.communicationStyle === 'string'
        ? previous.communicationStyle
        : ''),
    preferredTraits: mergeStringList(
      stringList(previous.preferredTraits),
      shouldPromoteCurrentPreference
        ? mergeStringList(incoming.preferredTraits, profileFactTraits, 24)
        : [],
      24,
    ),
    socialGoals: mergeStringList(
      stringList(previous.socialGoals),
      shouldPromoteCurrentPreference ? socialGoals : [],
      20,
    ),
    availability: mergeStringList(
      stringList(previous.availability),
      shouldPromoteCurrentPreference ? availability : [],
      20,
    ),
    preferenceHistory: mergePreferenceHistory(
      preferenceHistoryArray(previous.preferenceHistory),
      [
        ...incoming.interests.map((value) =>
          preferenceHistoryItem('interest', value, 'task_memory', summary),
        ),
        ...stringList(stableProfileFacts.interestTags).map((value) =>
          preferenceHistoryItem(
            'interest',
            value,
            'stable_profile_fact',
            summary,
          ),
        ),
        preferenceHistoryItem(
          'socialStyle',
          incoming.socialStyle,
          'task_memory',
          summary,
        ),
        preferenceHistoryItem(
          'communicationStyle',
          incoming.communicationStyle,
          'task_memory',
          summary,
        ),
        ...incoming.preferredTraits.map((value) =>
          preferenceHistoryItem(
            'preferredTrait',
            value,
            'task_memory',
            summary,
          ),
        ),
        ...profileFactTraits.map((value) =>
          preferenceHistoryItem(
            'preferredTrait',
            value,
            'stable_profile_fact',
            summary,
          ),
        ),
        ...socialGoals.map((value) =>
          preferenceHistoryItem(
            'socialGoal',
            value,
            'stable_profile_fact',
            summary,
          ),
        ),
        ...availability.map((value) =>
          preferenceHistoryItem(
            'availability',
            value,
            'stable_profile_fact',
            summary,
          ),
        ),
      ],
    ),
  };
}

function preferenceHistoryItem(
  field: LongTermPreferenceHistoryItem['field'],
  value: string,
  source: LongTermPreferenceHistoryItem['source'],
  summary: TaskSummaryEntry,
): LongTermPreferenceHistoryItem {
  return {
    field,
    value: (value ?? '').trim(),
    source,
    taskId: summary.taskId,
    outcome: summary.outcome,
    confirmed: summary.outcome === 'succeeded',
    at: summary.at,
  };
}

function mergePreferenceHistory(
  previous: LongTermPreferenceHistoryItem[],
  next: LongTermPreferenceHistoryItem[],
): LongTermPreferenceHistoryItem[] {
  const out = [...previous];
  for (const item of next) {
    if (!item.value) continue;
    const duplicate = out.some(
      (existing) =>
        existing.taskId === item.taskId &&
        existing.field === item.field &&
        existing.value === item.value &&
        existing.source === item.source,
    );
    if (!duplicate) out.push(item);
  }
  return out.slice(-PREFERENCE_HISTORY_LIMIT);
}

function mergeBoundaries(
  previous: Record<string, unknown>,
  incoming: ReturnType<typeof readSocialAgentTaskMemory>['boundaries'],
): Record<string, unknown> {
  return {
    excludedGenders: mergeStringList(
      stringList(previous.excludedGenders),
      incoming.excludedGenders,
      8,
    ),
    noNightMeet: incoming.noNightMeet || previous.noNightMeet === true,
    publicPlaceOnly:
      incoming.publicPlaceOnly || previous.publicPlaceOnly === true,
    noAutoMessage: incoming.noAutoMessage || previous.noAutoMessage === true,
    noContactExchange:
      incoming.noContactExchange || previous.noContactExchange === true,
  };
}

function mergeActivityPreferences(
  previous: Record<string, unknown>,
  incoming: ReturnType<typeof readSocialAgentTaskMemory>['activeEntities'],
  stableProfileFacts: Record<string, string | string[]> = {},
  summary: TaskSummaryEntry,
): Record<string, unknown> {
  if (summary.outcome !== 'succeeded') {
    return {
      favoriteCities: stringList(previous.favoriteCities).slice(-10),
      favoriteActivityTypes: stringList(previous.favoriteActivityTypes).slice(
        -10,
      ),
      favoriteTimePreferences: stringList(
        previous.favoriteTimePreferences,
      ).slice(-10),
      favoriteLocationPreferences: stringList(
        previous.favoriteLocationPreferences,
      ).slice(-10),
    };
  }
  return {
    favoriteCities: pushIfPresent(
      stringList(previous.favoriteCities),
      incoming.city || stringValue(stableProfileFacts.city),
      10,
    ),
    favoriteActivityTypes: pushIfPresent(
      stringList(previous.favoriteActivityTypes),
      incoming.activityType,
      10,
    ),
    favoriteTimePreferences: pushIfPresent(
      stringList(previous.favoriteTimePreferences),
      incoming.timePreference || stringValue(stableProfileFacts.timePreference),
      10,
    ),
    favoriteLocationPreferences: pushIfPresent(
      stringList(previous.favoriteLocationPreferences),
      incoming.locationPreference || stringValue(stableProfileFacts.nearbyArea),
      10,
    ),
  };
}

function pushIfPresent(list: string[], value: string, limit: number): string[] {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return list.slice(-limit);
  const filtered = list.filter((item) => item !== trimmed);
  return [...filtered, trimmed].slice(-limit);
}

function mergeStringList(
  prev: string[],
  next: string[],
  limit: number,
): string[] {
  const out: string[] = [];
  for (const value of [...prev, ...next]) {
    if (typeof value === 'string' && value && !out.includes(value))
      out.push(value);
  }
  return out.slice(-limit);
}

function dedupSamples(samples: LongTermMatchSample[]): LongTermMatchSample[] {
  const seen = new Set<string>();
  const out: LongTermMatchSample[] = [];
  for (const sample of samples) {
    const key = `${sample.candidateUserId}:${sample.reasons.join('|')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(sample);
  }
  return out;
}

function sampleArray(value: unknown): LongTermMatchSample[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === 'object' && item !== null,
    )
    .map((item) => ({
      candidateUserId:
        typeof item.candidateUserId === 'number' ? item.candidateUserId : 0,
      reasons: stringList(item.reasons),
      at: typeof item.at === 'string' ? item.at : new Date(0).toISOString(),
    }))
    .filter((item) => item.candidateUserId > 0);
}

function preferenceHistoryArray(
  value: unknown,
): LongTermPreferenceHistoryItem[] {
  if (!Array.isArray(value)) return [];
  const allowedFields = new Set<LongTermPreferenceHistoryItem['field']>([
    'interest',
    'socialStyle',
    'communicationStyle',
    'preferredTrait',
    'socialGoal',
    'availability',
  ]);
  const allowedSources = new Set<LongTermPreferenceHistoryItem['source']>([
    'task_memory',
    'stable_profile_fact',
  ]);
  const allowedOutcomes = new Set<TaskSummaryEntry['outcome']>([
    'succeeded',
    'failed',
    'cancelled',
    'other',
  ]);

  return value
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === 'object' && item !== null,
    )
    .map((item) => {
      const field =
        typeof item.field === 'string' &&
        allowedFields.has(item.field as LongTermPreferenceHistoryItem['field'])
          ? (item.field as LongTermPreferenceHistoryItem['field'])
          : null;
      const source =
        typeof item.source === 'string' &&
        allowedSources.has(
          item.source as LongTermPreferenceHistoryItem['source'],
        )
          ? (item.source as LongTermPreferenceHistoryItem['source'])
          : null;
      const outcome =
        typeof item.outcome === 'string' &&
        allowedOutcomes.has(item.outcome as TaskSummaryEntry['outcome'])
          ? (item.outcome as TaskSummaryEntry['outcome'])
          : 'other';
      const value = typeof item.value === 'string' ? item.value.trim() : '';
      const taskId = typeof item.taskId === 'number' ? item.taskId : 0;
      if (!field || !source || !value || taskId <= 0) return null;
      return {
        field,
        value,
        source,
        taskId,
        outcome,
        confirmed: outcome === 'succeeded' && item.confirmed === true,
        at: typeof item.at === 'string' ? item.at : new Date(0).toISOString(),
      } satisfies LongTermPreferenceHistoryItem;
    })
    .filter((item): item is LongTermPreferenceHistoryItem => item !== null)
    .slice(-PREFERENCE_HISTORY_LIMIT);
}

function profileFacts(value: unknown): Record<string, string | string[]> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  const out: Record<string, string | string[]> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'string' && raw.trim()) {
      out[key] = raw.trim();
      continue;
    }
    if (Array.isArray(raw) && raw.every((item) => typeof item === 'string')) {
      const list = raw.map((item) => item.trim()).filter(Boolean);
      if (list.length > 0) out[key] = list;
    }
  }
  return out;
}

function normalizeMemoryKey(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/[^a-z0-9]/gi, '').toLowerCase()
    : '';
}

function normalizeMemoryValues(value: unknown): string[] {
  if (typeof value === 'boolean') return [value ? 'true' : 'false'];
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function toBooleanMemoryValue(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return false;
  return ['true', '1', 'yes', 'y', '是', '需要', '公开场所'].includes(
    value.trim().toLowerCase(),
  );
}

function confirmedMemoryUpdateArray(
  value: unknown,
): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Record<string, unknown> =>
      typeof item === 'object' && item !== null && !Array.isArray(item),
  );
}

function buildMemorySignals(snapshot: LongTermMemorySnapshot): {
  interests: string[];
  socialStyle: string;
  communicationStyle: string;
  preferredTraits: string[];
  availability: string[];
} {
  return {
    interests: [
      ...snapshot.preferences.interests,
      ...snapshot.activityPreferences.favoriteActivityTypes,
    ].filter(uniqueString),
    socialStyle: snapshot.preferences.socialStyle,
    communicationStyle: snapshot.preferences.communicationStyle,
    preferredTraits: snapshot.preferences.preferredTraits,
    availability: [
      ...snapshot.availability,
      ...snapshot.activityPreferences.favoriteTimePreferences,
    ].filter(uniqueString),
  };
}

function uniqueString(value: string, index: number, list: string[]): boolean {
  return value.trim().length > 0 && list.indexOf(value) === index;
}

function candidatePublicText(
  candidate: LongTermMemoryCandidateForRanking,
): string {
  return [
    ...stringList(candidate.commonTags),
    ...stringList(candidate.reasons),
    JSON.stringify(candidate.explanation ?? {}),
    JSON.stringify(candidate.scoreBreakdown ?? {}),
    typeof candidate.distanceKm === 'number'
      ? `${candidate.distanceKm.toFixed(1)}km`
      : '',
  ]
    .join(' ')
    .toLowerCase();
}

function containsSignal(text: string, signal: string): boolean {
  const normalized = signal.trim().toLowerCase();
  return normalized.length > 0 && text.includes(normalized);
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === 'string' && item.length > 0,
  );
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
