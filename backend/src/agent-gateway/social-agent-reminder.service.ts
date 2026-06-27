import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';

import { shouldRunBackgroundJobs } from '../common/process-role.util';
import { NotificationsService } from '../notifications/notifications.service';
import { UserSocialProfile } from '../users/user-social-profile.entity';
import { AgentTask, AgentTaskStatus } from './entities/agent-task.entity';
import {
  SocialAgentReminder,
  SocialAgentReminderPreference,
  type SocialAgentReminderFrequency,
  type SocialAgentReminderTopic,
} from './entities/social-agent-reminder.entity';
import {
  SocialAgentLongTermMemoryService,
  type LongTermMemorySnapshot,
  type LongTermPreferenceHistoryItem,
} from './social-agent-long-term-memory.service';
import { socialCodexThreadIdForTask } from './social-codex-runtime-model';
import {
  resolveSocialAgentMeetLoopLifecycle,
  type SocialAgentMeetLoopLifecycle,
} from './social-agent-meet-loop-lifecycle';

export type SocialAgentReminderPreferenceDto = {
  enabled?: boolean;
  topics?: SocialAgentReminderTopic[];
  scenes?: SocialAgentReminderScene[];
  frequency?: SocialAgentReminderFrequency;
  quietStart?: string;
  quietEnd?: string;
  mutedUntil?: string | null;
};

export type SocialAgentReminderScene =
  | 'new_match'
  | 'weekend_opportunities'
  | 'past_social_goal'
  | 'activity_follow_up'
  | 'life_graph_confirmation';

type ReminderCandidate = {
  topic: SocialAgentReminderTopic;
  title: string;
  message: string;
  dedupeKey: string;
  context: Record<string, unknown>;
  taskId: number | null;
  threadId: string | null;
};

export type SocialAgentReminderRunnerSummary = {
  triggeredBy: 'cron' | 'manual';
  scannedPreferences: number;
  remindersCreated: number;
  skipped: number;
  skippedReasons: Record<string, number>;
  errors: number;
};

const DEFAULT_TOPICS: SocialAgentReminderTopic[] = [
  'friendship',
  'fitness_partner',
  'activity',
];

const ACTIVE_TASK_STATUSES = [
  AgentTaskStatus.Pending,
  AgentTaskStatus.Planning,
  AgentTaskStatus.AwaitingConfirmation,
  AgentTaskStatus.WaitingResult,
  AgentTaskStatus.WaitingReply,
];

const REMINDER_DELIVERY_POLICY_EVIDENCE = {
  deliveryChannels: ['in_app', 'agent_thread'],
} as const;

const REMINDER_DELIVERY_CHANNELS =
  REMINDER_DELIVERY_POLICY_EVIDENCE.deliveryChannels;

const REMINDER_DISABLED_EXTERNAL_CHANNELS = ['sms', 'email', 'push'] as const;

const REMINDER_PROHIBITED_ACTIONS = [
  'send_message',
  'add_friend',
  'connect_candidate',
  'create_activity',
  'publish_activity',
  'change_privacy',
  'payment',
] as const;

@Injectable()
export class SocialAgentReminderService {
  private readonly logger = new Logger(SocialAgentReminderService.name);
  private runnerActive = false;
  private lastRunnerSummary: SocialAgentReminderRunnerSummary | null = null;

  constructor(
    @InjectRepository(SocialAgentReminderPreference)
    private readonly preferenceRepo: Repository<SocialAgentReminderPreference>,
    @InjectRepository(SocialAgentReminder)
    private readonly reminderRepo: Repository<SocialAgentReminder>,
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    @InjectRepository(UserSocialProfile)
    private readonly socialProfileRepo: Repository<UserSocialProfile>,
    private readonly notifications: NotificationsService,
    private readonly longTermMemory: SocialAgentLongTermMemoryService,
  ) {}

  @Cron('*/15 * * * *')
  async onCron(): Promise<void> {
    if (!shouldRunBackgroundJobs()) return;
    if (!reminderRunnerEnabled()) return;
    try {
      await this.runDueReminders('cron');
    } catch (error) {
      this.logger.error(
        `Social Agent reminder runner failed: ${
          error instanceof Error ? error.stack || error.message : String(error)
        }`,
      );
    }
  }

  async runDueReminders(
    triggeredBy: 'cron' | 'manual' = 'manual',
    options: { limit?: number } = {},
  ): Promise<SocialAgentReminderRunnerSummary> {
    if (this.runnerActive) {
      return this.emptyRunnerSummary(triggeredBy, 'already_running');
    }
    this.runnerActive = true;
    const summary = this.emptyRunnerSummary(triggeredBy);
    try {
      const limit = normalizeRunnerLimit(options.limit);
      const preferences = await this.preferenceRepo.find({
        where: {
          enabled: true,
          frequency: In(['realtime', 'daily', 'weekly']),
        },
        order: { lastSuggestedAt: 'ASC', updatedAt: 'ASC' },
        take: limit,
      });
      summary.scannedPreferences = preferences.length;
      for (const preference of preferences) {
        try {
          const result = await this.runOnce(preference.userId);
          if (result.skipped) {
            summary.skipped += 1;
            const reason = result.reason ?? 'unknown';
            summary.skippedReasons[reason] =
              (summary.skippedReasons[reason] ?? 0) + 1;
          } else {
            summary.remindersCreated += 1;
          }
        } catch (error) {
          summary.errors += 1;
          this.logger.warn(
            `Social Agent reminder failed for user=${preference.userId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
      this.lastRunnerSummary = summary;
      return summary;
    } finally {
      this.runnerActive = false;
    }
  }

  getRunnerStatus() {
    return {
      enabled: reminderRunnerEnabled(),
      backgroundJobsEnabled: shouldRunBackgroundJobs(),
      active: this.runnerActive,
      lastSummary: this.lastRunnerSummary,
    };
  }

  async getPreference(userId: number) {
    try {
      return await this.ensurePreference(userId);
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'social_agent.reminder_preferences.unavailable',
          userId,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return this.disabledFallbackPreference(userId, error);
    }
  }

  async updatePreference(
    userId: number,
    dto: SocialAgentReminderPreferenceDto,
  ) {
    const current = await this.ensurePreference(userId);
    const currentMetadata = isRecord(current.metadata) ? current.metadata : {};
    const nextEnabled =
      typeof dto.enabled === 'boolean' ? dto.enabled : current.enabled;
    const nextTopics = normalizeTopics(dto.topics, current.topics);
    const nextFrequency = normalizeFrequency(dto.frequency, current.frequency);
    const nextQuietStart = normalizeTime(dto.quietStart, current.quietStart);
    const nextQuietEnd = normalizeTime(dto.quietEnd, current.quietEnd);
    const nextMutedUntil =
      dto.mutedUntil === null
        ? null
        : dto.mutedUntil
          ? new Date(dto.mutedUntil)
          : current.mutedUntil;
    const nextScenes = normalizeScenesForPreferenceUpdate(
      dto.scenes,
      currentMetadata.reminderScenes,
    );
    const auditPatch = reminderPreferenceAuditPatch(current, currentMetadata, {
      enabled: nextEnabled,
      topics: nextTopics,
      frequency: nextFrequency,
      quietStart: nextQuietStart,
      quietEnd: nextQuietEnd,
      mutedUntil: nextMutedUntil,
      scenes: nextScenes,
    });
    const next = this.preferenceRepo.merge(current, {
      enabled: nextEnabled,
      topics: nextTopics,
      frequency: nextFrequency,
      quietStart: nextQuietStart,
      quietEnd: nextQuietEnd,
      mutedUntil: nextMutedUntil,
      metadata: {
        ...currentMetadata,
        reminderScenes: nextScenes,
        ...auditPatch,
      },
    });
    return this.preferenceRepo.save(next);
  }

  async disable(userId: number) {
    return this.updatePreference(userId, {
      enabled: false,
      mutedUntil: null,
    });
  }

  async list(userId: number, limit = 20) {
    return this.reminderRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: Math.max(1, Math.min(50, Number(limit) || 20)),
    });
  }

  async runOnce(userId: number, options: { force?: boolean } = {}) {
    const preference = await this.ensurePreference(userId);
    const now = new Date();
    const skippedReason = this.skipReason(preference, now, options.force);
    if (skippedReason) {
      return {
        ok: true,
        skipped: true,
        reason: skippedReason,
        preference,
        reminder: null,
      };
    }
    if (!options.force) {
      const activeReminder = await this.findActiveReminderThisWeek(userId, now);
      if (activeReminder) {
        return {
          ok: true,
          skipped: true,
          reason: 'active_reminder_pending',
          preference,
          reminder: activeReminder,
        };
      }
    }

    const candidate = await this.buildCandidate(userId, preference);
    if (!candidate) {
      return {
        ok: true,
        skipped: true,
        reason: 'no_safe_reminder_candidate',
        preference,
        reminder: null,
      };
    }

    const existing = await this.reminderRepo.findOne({
      where: { dedupeKey: candidate.dedupeKey },
    });
    if (existing && !options.force) {
      return {
        ok: true,
        skipped: true,
        reason: 'duplicate_reminder',
        preference,
        reminder: existing,
      };
    }

    const reminder = await this.reminderRepo.save(
      this.reminderRepo.create({
        userId,
        topic: candidate.topic,
        status: 'suggested',
        dedupeKey: options.force
          ? `${candidate.dedupeKey}:force:${Date.now()}`
          : candidate.dedupeKey,
        title: candidate.title,
        message: candidate.message,
        context: candidate.context,
        taskId: candidate.taskId,
        threadId: candidate.threadId,
      }),
    );
    preference.lastSuggestedAt = now;
    await this.preferenceRepo.save(preference);
    await this.notifications.create({
      userId,
      type: 'social_agent.reminder',
      text: reminder.message,
      fromUsername: 'FitMeet Agent',
      fromAvatar: 'AI',
      fromColor: '#18181b',
      targetId: reminder.id,
      pushPayload: {
        targetType: 'agent_reminder',
        route: reminder.taskId
          ? `/agent/chat/${reminder.taskId}`
          : '/agent/chat',
        reminderId: reminder.id,
        taskId: reminder.taskId,
        threadId: reminder.threadId,
        reminderContext: reminder.context,
        deliveryPolicy: reminderDeliveryPolicy(),
      },
    });
    return { ok: true, skipped: false, reason: null, preference, reminder };
  }

  async markOpened(userId: number, reminderId: number) {
    return this.updateStatus(userId, reminderId, 'opened');
  }

  async dismiss(userId: number, reminderId: number) {
    const result = await this.updateStatus(userId, reminderId, 'dismissed');
    if (!result.ok) return result;
    if (result.previousStatus === 'dismissed') {
      const preference = await this.ensurePreference(userId);
      return { ...result, preference };
    }
    const preference = await this.applyDismissBackoff(userId);
    return { ...result, preference };
  }

  private emptyRunnerSummary(
    triggeredBy: 'cron' | 'manual',
    skippedReason?: string,
  ): SocialAgentReminderRunnerSummary {
    return {
      triggeredBy,
      scannedPreferences: 0,
      remindersCreated: 0,
      skipped: skippedReason ? 1 : 0,
      skippedReasons: skippedReason ? { [skippedReason]: 1 } : {},
      errors: 0,
    };
  }

  private async updateStatus(
    userId: number,
    reminderId: number,
    status: 'opened' | 'dismissed',
  ) {
    const reminder = await this.reminderRepo.findOne({
      where: { id: reminderId, userId },
    });
    if (!reminder) return { ok: false, reminder: null };
    const previousStatus = reminder.status;
    reminder.status = status;
    if (status === 'opened') reminder.openedAt = new Date();
    if (status === 'dismissed') reminder.dismissedAt = new Date();
    return {
      ok: true,
      previousStatus,
      reminder: await this.reminderRepo.save(reminder),
    };
  }

  private async applyDismissBackoff(userId: number) {
    const preference = await this.ensurePreference(userId);
    const now = new Date();
    const previousMetadata = isRecord(preference.metadata)
      ? preference.metadata
      : {};
    const previousDismissCount = numberFromUnknown(
      previousMetadata.reminderDismissCount,
    );
    const dismissCount = previousDismissCount + 1;
    const mutedDays = dismissBackoffDays(dismissCount);
    preference.mutedUntil = new Date(
      now.getTime() + mutedDays * 24 * 60 * 60 * 1000,
    );
    preference.metadata = {
      ...previousMetadata,
      reminderDismissCount: dismissCount,
      reminderLastDismissedAt: now.toISOString(),
      reminderMutedDays: mutedDays,
      reminderMutedReason: 'user_dismissed_reminder',
    };
    return this.preferenceRepo.save(preference);
  }

  private async ensurePreference(userId: number) {
    const existing = await this.preferenceRepo.findOne({ where: { userId } });
    if (existing) return existing;
    return this.preferenceRepo.save(
      this.preferenceRepo.create({
        userId,
        enabled: false,
        topics: DEFAULT_TOPICS,
        frequency: 'weekly',
        quietStart: '09:00',
        quietEnd: '21:00',
        tone: 'gentle',
        metadata: {},
        lastSuggestedAt: null,
        mutedUntil: null,
      }),
    );
  }

  private disabledFallbackPreference(userId: number, error: unknown) {
    const now = new Date();
    return {
      id: 0,
      userId,
      enabled: false,
      topics: [] as SocialAgentReminderTopic[],
      frequency: 'manual' as SocialAgentReminderFrequency,
      quietStart: '09:00',
      quietEnd: '21:00',
      tone: 'quiet' as const,
      metadata: {
        unavailable: true,
        reason: 'reminder_preferences_unavailable',
        errorCode: error instanceof Error ? error.name : 'unknown_error',
      },
      lastSuggestedAt: null,
      mutedUntil: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  private skipReason(
    preference: SocialAgentReminderPreference,
    now: Date,
    force?: boolean,
  ): string | null {
    if (!preference.enabled) return 'reminders_disabled';
    if (preference.mutedUntil && preference.mutedUntil > now) {
      return 'muted';
    }
    if (this.inQuietHours(preference, now)) return 'quiet_hours';
    if (preference.lastSuggestedAt && !force) {
      if (preference.frequency === 'manual') return null;
      const intervalMs =
        preference.frequency === 'realtime'
          ? 15 * 60 * 1000
          : preference.frequency === 'daily'
            ? 24 * 60 * 60 * 1000
            : 7 * 24 * 60 * 60 * 1000;
      if (now.getTime() - preference.lastSuggestedAt.getTime() < intervalMs) {
        return 'frequency_capped';
      }
    }
    return null;
  }

  private async findActiveReminderThisWeek(userId: number, now: Date) {
    const weekStart = startOfWeek(now);
    const activeReminders = await this.reminderRepo.find({
      where: {
        userId,
        status: In(['suggested', 'opened']),
      },
      order: { createdAt: 'DESC' },
      take: 10,
    });
    return (
      activeReminders.find((reminder) => {
        const createdAt =
          reminder.createdAt instanceof Date
            ? reminder.createdAt
            : new Date(reminder.createdAt);
        return (
          Number.isFinite(createdAt.getTime()) &&
          createdAt.getTime() >= weekStart.getTime()
        );
      }) ?? null
    );
  }

  private inQuietHours(
    preference: SocialAgentReminderPreference,
    now: Date,
  ): boolean {
    const current = now.getHours() * 60 + now.getMinutes();
    const start = parseMinutes(preference.quietStart);
    const end = parseMinutes(preference.quietEnd);
    if (start === end) return false;
    return start < end
      ? current < start || current >= end
      : current >= end && current < start;
  }

  private async buildCandidate(
    userId: number,
    preference: SocialAgentReminderPreference,
  ): Promise<ReminderCandidate | null> {
    const task = await this.taskRepo.findOne({
      where: {
        ownerUserId: userId,
        status: In(ACTIVE_TASK_STATUSES),
        updatedAt: LessThan(new Date(Date.now() - 30 * 60 * 1000)),
      },
      order: { updatedAt: 'DESC' },
    });
    const profile = await this.socialProfileRepo.findOne({ where: { userId } });
    const memory = await this.longTermMemory.readSnapshot(userId);
    const topic = chooseTopic(preference.topics, task, profile);
    if (!topic) return null;
    const scenes = reminderScenes(preference);
    if (scenes.length === 0) return null;
    const meetLoopState = taskMeetLoopState(task);
    const meetLoopLifecycle = meetLoopState
      ? resolveSocialAgentMeetLoopLifecycle({
          stage: meetLoopState.loopStage ?? meetLoopState.status,
          waitingFor: meetLoopState.waitingFor,
          state: meetLoopState,
        })
      : null;
    const scene = chooseReminderScene(scenes, topic, task, meetLoopLifecycle);
    const preferenceHistorySignals = reminderPreferenceHistorySignals(memory);
    const interest = firstNonEmpty([
      task?.title,
      task?.goal,
      profile?.wantToMeet?.[0],
      profile?.socialScenes?.[0],
      memoryReminderIntent(memory),
      memory.activityPreferences.favoriteActivityTypes.at(-1),
      '新的社交机会',
    ]);
    const safeInterest = safeReminderIntent(interest);
    const title = meetLoopLifecycle?.reminderTitle ?? reminderTitle(topic);
    const message =
      meetLoopLifecycle?.reminderMessage ??
      reminderMessage(topic, safeInterest, scene);
    const dedupeKey = meetLoopLifecycle
      ? `reminder:${userId}:meet_loop:${meetLoopLifecycle.stage}:${task?.id ?? 'none'}:${weekKey(new Date())}`
      : `reminder:${userId}:${topic}:${slugify(safeInterest)}:${weekKey(new Date())}`;
    return {
      topic,
      title,
      message,
      taskId: task?.id ?? null,
      threadId: task?.id ? socialCodexThreadIdForTask(task.id) : null,
      dedupeKey,
      context: {
        source: 'social_agent_reminder',
        reminderProtocol: 'fitmeet.agent.reminder.v1',
        topic,
        scene,
        scenes,
        intent: safeInterest,
        intentSanitized: safeInterest !== interest,
        preferenceHistorySignals,
        memoryDerivedIntent:
          !task &&
          !profile?.wantToMeet?.[0] &&
          preferenceHistorySignals.length > 0,
        suggestionOnly: true,
        deliveryChannels: [...REMINDER_DELIVERY_CHANNELS],
        externalDeliveryDisabled: true,
        disabledExternalChannels: [...REMINDER_DISABLED_EXTERNAL_CHANNELS],
        deliveryPolicy: reminderDeliveryPolicy(),
        settingsRoute: '/agent/chat?settings=reminders',
        optOutAction: 'social_agent.reminder.disable',
        dismissAction: 'social_agent.reminder.dismiss',
        allowedActions: ['open_agent_chat', 'view_safe_opportunities'],
        prohibitedActions: [...REMINDER_PROHIBITED_ACTIONS],
        reminderSafetyProtocol: [
          {
            key: 'suggestion_only',
            label: '只做建议',
            detail: '提醒只会帮你查看机会，不会自动执行任何社交动作。',
          },
          {
            key: 'delivery',
            label: '站内提醒',
            detail:
              '只通过站内通知和 Agent 会话提示，不使用短信、邮件或外部推送。',
          },
          {
            key: 'approval',
            label: '执行确认',
            detail: '发送邀请、加好友、创建活动或公开发布前都会再次确认。',
          },
          {
            key: 'frequency',
            label: '频率控制',
            detail: '提醒受静默时间、频率和忽略后的降频保护约束。',
          },
          {
            key: 'opt_out',
            label: '随时关闭',
            detail: '你可以在 Agent 会话设置里关闭或调整提醒场景。',
          },
        ],
        safeBoundary:
          '提醒只会帮你查看机会，发送邀请、加好友、创建活动或公开发布前都会再次确认。',
        taskId: task?.id ?? null,
        meetLoopLifecycleStage: meetLoopLifecycle?.stage ?? null,
        meetLoopLifecycleLabel: meetLoopLifecycle?.label ?? null,
        meetLoopNextAction: meetLoopLifecycle?.nextAction ?? null,
        meetLoopWaitingFor: meetLoopState?.waitingFor ?? null,
        activityId: meetLoopState?.activityId ?? null,
        candidateUserId:
          meetLoopState?.candidateUserId ?? meetLoopState?.targetUserId ?? null,
        lifeGraphWritebackRequiresConfirmation:
          meetLoopLifecycle?.stage === 'review_requested' ||
          meetLoopLifecycle?.stage === 'closed',
        profileDiscoverable: profile?.profileDiscoverable ?? false,
        agentCanRecommendMe: profile?.agentCanRecommendMe ?? false,
      },
    };
  }
}

function normalizeScenesForPreferenceUpdate(
  input: unknown,
  current: unknown,
): SocialAgentReminderScene[] {
  if (Array.isArray(input)) {
    return Array.from(new Set(input.filter(isReminderScene)));
  }
  if (Array.isArray(current)) {
    return Array.from(new Set(current.filter(isReminderScene)));
  }
  return DEFAULT_REMINDER_SCENES;
}

const DEFAULT_REMINDER_SCENES: SocialAgentReminderScene[] = [
  'new_match',
  'weekend_opportunities',
  'past_social_goal',
  'activity_follow_up',
  'life_graph_confirmation',
];

function isReminderScene(value: unknown): value is SocialAgentReminderScene {
  return (
    value === 'new_match' ||
    value === 'weekend_opportunities' ||
    value === 'past_social_goal' ||
    value === 'activity_follow_up' ||
    value === 'life_graph_confirmation'
  );
}

function reminderScenes(
  preference: SocialAgentReminderPreference,
): SocialAgentReminderScene[] {
  const metadata = isRecord(preference.metadata) ? preference.metadata : {};
  if (Array.isArray(metadata.reminderScenes)) {
    return Array.from(new Set(metadata.reminderScenes.filter(isReminderScene)));
  }
  return DEFAULT_REMINDER_SCENES;
}

function chooseReminderScene(
  scenes: SocialAgentReminderScene[],
  topic: SocialAgentReminderTopic,
  task: AgentTask | null,
  meetLoopLifecycle?: SocialAgentMeetLoopLifecycle | null,
): SocialAgentReminderScene {
  if (topic === 'life_graph' && scenes.includes('life_graph_confirmation')) {
    return 'life_graph_confirmation';
  }
  if (meetLoopLifecycle && scenes.includes('activity_follow_up')) {
    return 'activity_follow_up';
  }
  if (
    task?.taskType?.includes('activity') &&
    scenes.includes('activity_follow_up')
  ) {
    return 'activity_follow_up';
  }
  if (scenes.includes('new_match')) return 'new_match';
  if (scenes.includes('past_social_goal')) return 'past_social_goal';
  return scenes[0] ?? 'weekend_opportunities';
}

function normalizeTopics(
  input: unknown,
  fallback: SocialAgentReminderTopic[],
): SocialAgentReminderTopic[] {
  if (!Array.isArray(input))
    return fallback?.length ? fallback : DEFAULT_TOPICS;
  const allowed = new Set<SocialAgentReminderTopic>([
    'friendship',
    'fitness_partner',
    'activity',
    'life_graph',
  ]);
  const topics = input.filter((topic): topic is SocialAgentReminderTopic =>
    allowed.has(topic as SocialAgentReminderTopic),
  );
  return topics.length ? topics : DEFAULT_TOPICS;
}

function normalizeFrequency(
  input: unknown,
  fallback: SocialAgentReminderFrequency,
) {
  return input === 'realtime' ||
    input === 'daily' ||
    input === 'weekly' ||
    input === 'manual'
    ? input
    : fallback;
}

function normalizeTime(input: unknown, fallback: string) {
  return typeof input === 'string' && /^\d{2}:\d{2}$/.test(input)
    ? input
    : fallback;
}

function parseMinutes(value: string) {
  const [hour, minute] = value.split(':').map((part) => Number(part));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
  return (
    Math.max(0, Math.min(23, hour)) * 60 + Math.max(0, Math.min(59, minute))
  );
}

function chooseTopic(
  topics: SocialAgentReminderTopic[],
  task: AgentTask | null,
  profile: UserSocialProfile | null,
): SocialAgentReminderTopic | null {
  if (
    (taskMeetLoopState(task) || task?.taskType?.includes('activity')) &&
    topics.includes('activity')
  ) {
    return 'activity';
  }
  if (topics.includes('friendship')) return 'friendship';
  if (topics.includes('activity')) return 'activity';
  if (profile?.fitnessGoals?.length && topics.includes('fitness_partner')) {
    return 'fitness_partner';
  }
  return topics[0] ?? null;
}

function reminderTitle(topic: SocialAgentReminderTopic) {
  if (topic === 'activity') return '看看新的活动机会';
  if (topic === 'fitness_partner') return '看看新的约练机会';
  if (topic === 'life_graph') return '完善你的社交偏好';
  return '看看新的认识机会';
}

function reminderMessage(
  topic: SocialAgentReminderTopic,
  intent: string,
  scene: SocialAgentReminderScene,
) {
  const cleanIntent = intent.replace(/\s+/g, ' ').trim();
  if (scene === 'life_graph_confirmation') {
    return '你的社交偏好有几处可以确认，确认后我能更稳地帮你筛选机会。';
  }
  if (scene === 'activity_follow_up') {
    return `你之前提到“${cleanIntent}”，要不要我帮你看看这件事现在有没有新的安全进展？`;
  }
  if (scene === 'new_match') {
    return `你之前提到“${cleanIntent}”，现在可能有新的匹配机会。要不要我帮你看看？`;
  }
  if (scene === 'past_social_goal') {
    return `你之前想过“${cleanIntent}”，周末可能有几个安全机会。要不要我帮你看看？`;
  }
  if (topic === 'activity' || topic === 'fitness_partner') {
    return `你之前提到“${cleanIntent}”，要不要我帮你看看近期安全的周末机会？`;
  }
  return `你之前提到“${cleanIntent}”，要不要我帮你看看有没有合适的新认识机会？`;
}

function memoryReminderIntent(memory: LongTermMemorySnapshot): string {
  const history = memory.preferences?.preferenceHistory ?? [];
  const latestAvailability = latestPreferenceValue(history, 'availability');
  const latestInterest =
    latestPreferenceValue(history, 'interest') ||
    memory.activityPreferences?.favoriteActivityTypes?.at(-1) ||
    memory.preferences?.interests?.at(-1) ||
    '';
  const latestGoal =
    latestPreferenceValue(history, 'socialGoal') ||
    memory.socialGoals?.at(-1) ||
    '';
  if (latestAvailability && latestInterest) {
    return `${latestAvailability}的${latestInterest}机会`;
  }
  if (latestInterest) return `${latestInterest}机会`;
  if (latestGoal) return latestGoal;
  return '';
}

function reminderPreferenceHistorySignals(
  memory: LongTermMemorySnapshot,
): string[] {
  const history = memory.preferences?.preferenceHistory ?? [];
  return history
    .filter((item) => item.confirmed)
    .slice(-4)
    .map(
      (item) =>
        `最近确认：${preferenceHistoryFieldLabel(item.field)}「${item.value}」`,
    );
}

function reminderDeliveryPolicy() {
  return {
    suggestionOnly: true,
    channels: [...REMINDER_DELIVERY_CHANNELS],
    externalDeliveryDisabled: true,
    disabledExternalChannels: [...REMINDER_DISABLED_EXTERNAL_CHANNELS],
    prohibitedActions: [...REMINDER_PROHIBITED_ACTIONS],
  };
}

function latestPreferenceValue(
  history: LongTermPreferenceHistoryItem[],
  field: LongTermPreferenceHistoryItem['field'],
): string {
  return (
    history.filter((item) => item.confirmed && item.field === field).at(-1)
      ?.value ?? ''
  );
}

function preferenceHistoryFieldLabel(
  field: LongTermPreferenceHistoryItem['field'],
): string {
  switch (field) {
    case 'interest':
      return '兴趣';
    case 'socialStyle':
      return '社交风格';
    case 'communicationStyle':
      return '沟通方式';
    case 'preferredTrait':
      return '理想特质';
    case 'socialGoal':
      return '社交目标';
    case 'availability':
      return '可约时间';
  }
}

function firstNonEmpty(values: Array<string | undefined | null>) {
  return (
    values.find((value) => typeof value === 'string' && value.trim())?.trim() ??
    '新的社交机会'
  );
}

function safeReminderIntent(value: string) {
  const clean = redactReminderIntent(value.replace(/\s+/g, ' ').trim());
  if (!clean) return '之前的社交目标';
  if (
    /自动\s*(发送|发消息|加好友|连接|创建|公开|发布|支付|付款|修改隐私)|直接\s*(发送|加好友|连接|创建|发布|支付)|无需确认|不用确认|免确认|绕过确认|改隐私|修改隐私|公开发布|发送邀请|加好友|连接候选人|创建活动|支付/i.test(
      clean,
    )
  ) {
    return '之前的社交目标';
  }
  return truncateReminderIntent(clean);
}

function redactReminderIntent(value: string) {
  return value
    .replace(/1[3-9]\d{9}/g, '手机号已隐藏')
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '邮箱已隐藏')
    .replace(/(?:微信|vx|wechat|qq)[:：]?\s*[a-z0-9_-]{5,}/gi, '联系方式已隐藏')
    .replace(
      /(住址|地址|精确位置|门牌|小区|宿舍|楼栋|单元)[:：]?\s*[^，。,.；;]{2,30}/gi,
      '$1已隐藏',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateReminderIntent(value: string) {
  const maxLength = 48;
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function weekKey(date: Date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const days = Math.floor((date.getTime() - start.getTime()) / 86_400_000);
  return `${date.getUTCFullYear()}-w${Math.ceil((days + 1) / 7)}`;
}

function startOfWeek(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();
  start.setDate(start.getDate() - day);
  return start;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function dismissBackoffDays(dismissCount: number) {
  if (dismissCount <= 1) return 1;
  if (dismissCount === 2) return 3;
  return 7;
}

function reminderRunnerEnabled() {
  const raw = process.env.SOCIAL_AGENT_REMINDER_RUNNER_ENABLED;
  if (raw === undefined) return true;
  return ['true', '1', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

function normalizeRunnerLimit(input: unknown) {
  const configured = Number(process.env.SOCIAL_AGENT_REMINDER_RUNNER_LIMIT);
  const value = typeof input === 'number' ? input : configured;
  if (!Number.isFinite(value) || value <= 0) return 50;
  return Math.max(1, Math.min(200, Math.floor(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function taskMeetLoopState(
  task: AgentTask | null,
): Record<string, unknown> | null {
  if (!task) return null;
  const result = isRecord(task.result) ? task.result : {};
  const meetLoop = isRecord(result.meetLoop) ? result.meetLoop : null;
  if (meetLoop) return meetLoop;
  return null;
}

function numberFromUnknown(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function reminderPreferenceAuditPatch(
  current: SocialAgentReminderPreference,
  metadata: Record<string, unknown>,
  next: {
    enabled: boolean;
    topics: SocialAgentReminderTopic[];
    frequency: SocialAgentReminderFrequency;
    quietStart: string;
    quietEnd: string;
    mutedUntil: Date | null;
    scenes: SocialAgentReminderScene[];
  },
) {
  const currentScenes = Array.isArray(metadata.reminderScenes)
    ? metadata.reminderScenes.filter(isReminderScene)
    : DEFAULT_REMINDER_SCENES;
  const changedFields = [
    current.enabled !== next.enabled ? 'enabled' : null,
    !sameStringArray(current.topics, next.topics) ? 'topics' : null,
    current.frequency !== next.frequency ? 'frequency' : null,
    current.quietStart !== next.quietStart ? 'quietStart' : null,
    current.quietEnd !== next.quietEnd ? 'quietEnd' : null,
    !sameNullableDate(current.mutedUntil, next.mutedUntil)
      ? 'mutedUntil'
      : null,
    !sameStringArray(currentScenes, next.scenes) ? 'scenes' : null,
  ].filter((field): field is string => Boolean(field));
  if (!changedFields.length) return {};
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    reminderPreferenceUpdatedAt: now,
    reminderPreferenceUpdatedFields: changedFields,
    reminderPreferenceLastSource: 'agent_web_settings',
  };
  if (!current.enabled && next.enabled) {
    patch.reminderOptInConfirmedAt = now;
    patch.reminderDisabledAt = null;
  }
  if (current.enabled && !next.enabled) {
    patch.reminderDisabledAt = now;
  }
  return patch;
}

function sameStringArray(
  left: readonly string[] = [],
  right: readonly string[] = [],
) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function sameNullableDate(left: Date | null, right: Date | null) {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return left.getTime() === right.getTime();
}
