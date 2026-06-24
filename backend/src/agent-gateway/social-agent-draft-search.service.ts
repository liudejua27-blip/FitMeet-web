import { BadRequestException, Injectable } from '@nestjs/common';

import { sanitizeCity } from '../common/city.util';
import { cleanDisplayText } from '../common/display-text.util';
import type { MatchedCandidateView } from '../match/match.service';
import { CreateSocialRequestDto } from '../social-requests/dto/create-social-request.dto';
import { AgentTask } from './entities/agent-task.entity';
import { CandidatePoolDebugReasons } from './social-agent-candidate-pool.service';
import {
  buildSocialAgentRequestDraft,
  toSocialAgentChatCandidate,
  toSocialAgentDraftDto,
  toSocialAgentPublishDto,
} from './social-agent-chat-result.presenter';
import type {
  SocialAgentCandidateSearchResult,
  SocialAgentChatCandidate,
  SocialAgentRequestDraft,
} from './social-agent-chat.types';
import {
  SocialRequestSafety,
  SocialRequestType,
  SocialRequestVisibility,
  UserSocialRequestStatus,
  SocialRequestSource,
} from '../social-requests/social-request.entity';
import {
  SocialAgentToolExecutorService,
  SocialAgentToolName,
} from './social-agent-tool-executor.service';
import { summarizeSocialAgentTaskMemoryForLlm } from './social-agent-chat-memory.presenter';
import { readSocialAgentTaskMemory } from './social-agent-memory.util';
import { buildSocialAgentKnownTaskSlotConstraints } from './social-agent-task-slot-constraints.presenter';

@Injectable()
export class SocialAgentDraftSearchService {
  constructor(private readonly executor: SocialAgentToolExecutorService) {}

  async refreshDraftAndCandidates(input: {
    task: AgentTask;
    goal: string;
    refreshTask?: () => Promise<AgentTask>;
    signal?: AbortSignal | null;
  }): Promise<{
    task: AgentTask;
    draft: SocialAgentRequestDraft;
    searchResult: SocialAgentCandidateSearchResult;
    candidates: SocialAgentChatCandidate[];
  }> {
    this.assertNotAborted(input.signal);
    const draftResult = await this.generateDraftWithTool(
      input.task,
      input.goal,
      { signal: input.signal ?? null },
    );
    this.assertNotAborted(input.signal);
    let task = input.refreshTask ? await input.refreshTask() : input.task;
    const draft = buildSocialAgentRequestDraft({
      agentTaskId: task.id,
      draft: draftResult.draft,
      card: draftResult.card,
      profileUsed: draftResult.profileUsed,
    });
    draft.socialRequestId = await this.createPrivateDraftRequest(task, draft, {
      signal: input.signal ?? null,
    });
    this.assertNotAborted(input.signal);
    task = input.refreshTask ? await input.refreshTask() : task;
    const searchResult = this.publishRequiredBeforeMatchingResult();
    return {
      task,
      draft,
      searchResult,
      candidates: searchResult.candidates,
    };
  }

  async generateDraftWithTool(
    task: AgentTask,
    goal: string,
    options: { signal?: AbortSignal | null } = {},
  ): Promise<{
    draft: CreateSocialRequestDto;
    card: unknown;
    profileUsed: unknown;
  }> {
    this.assertNotAborted(options.signal);
    const taskContext = this.buildSafeTaskToolContext(task);
    const call = await this.executor.executeToolAction(
      task.id,
      SocialAgentToolName.CreateSocialRequest,
      {
        mode: 'ai_draft',
        rawText: goal,
        goal,
        taskId: task.id,
        taskContext,
        metadata: {
          agentTaskId: task.id,
          source: 'social_agent_chat',
          candidatePreferencePolicy:
            'public_discoverable_profiles_and_user_consented_public_tags_only',
        },
      },
      task.ownerUserId,
      { signal: options.signal ?? null },
    );
    this.assertNotAborted(options.signal);
    if (call.status !== 'succeeded') {
      throw new BadRequestException(
        cleanDisplayText(call.error?.message, '生成约练草稿失败'),
      );
    }
    const output = this.isRecord(call.output) ? call.output : {};
    if (!this.isRecord(output.draft)) {
      throw new BadRequestException('生成约练草稿失败：缺少 draft');
    }
    const draft = this.enrichDraftWithTaskContext(
      output.draft as unknown as CreateSocialRequestDto,
      taskContext,
    );
    return {
      draft,
      card: output.card,
      profileUsed: output.profileUsed,
    };
  }

  generateDeterministicDraftFromTask(
    task: AgentTask,
    goal: string,
  ): {
    draft: CreateSocialRequestDto;
    card: Record<string, unknown>;
    profileUsed: Record<string, unknown>;
  } {
    const taskContext = this.buildSafeTaskToolContext(task);
    const taskSlots = this.isRecord(taskContext.taskSlots)
      ? taskContext.taskSlots
      : {};
    const taskSlotSummary = this.isRecord(taskContext.taskSlotSummary)
      ? taskContext.taskSlotSummary
      : {};
    const activity =
      this.safeSlotValue(taskSlots, 'activity') ||
      this.safeSummaryValue(taskSlotSummary, 'activity') ||
      '约练';
    const timePreference =
      this.safeSlotValue(taskSlots, 'time_window') ||
      this.safeSummaryValue(taskSlotSummary, 'time_window') ||
      '时间待确认';
    const locationPreference =
      this.safeSlotValue(taskSlots, 'location_text') ||
      this.safeSummaryValue(taskSlotSummary, 'location_text');
    const geoArea =
      this.safeSlotValue(taskSlots, 'geo_area') ||
      this.safeSummaryValue(taskSlotSummary, 'geo_area');
    const city =
      this.inferCityFromPublicContext(locationPreference, geoArea, goal) ||
      '同城';
    const location = locationPreference || geoArea || `${city}公共场所`;
    const intensity =
      this.safeSlotValue(taskSlots, 'intensity') ||
      this.safeSummaryValue(taskSlotSummary, 'intensity') ||
      '轻松';
    const safetyBoundary =
      this.safeSlotValue(taskSlots, 'safety_boundary') ||
      this.safeSummaryValue(taskSlotSummary, 'safety_boundary') ||
      '首次见面优先公共场所，先在平台内沟通';
    const title = this.safePublicToolText(
      `${timePreference}${location ? ` ${location}` : ''}${activity}搭子`,
    ).slice(0, 80);
    const description = [
      `想找一位${activity}搭子，${timePreference}在${location}一起${intensity}进行。`,
      '先站内简单沟通，确认节奏和边界后再决定是否见面。',
      safetyBoundary,
    ]
      .filter(Boolean)
      .join(' ');
    const interestTags = this.uniqueStrings([
      activity,
      intensity,
      city,
      location,
      '轻松社交',
      '站内沟通',
      '公共场所',
    ]).slice(0, 8);
    const draft: CreateSocialRequestDto = this.enrichDraftWithTaskContext(
      {
        type: /跑|慢跑|夜跑|running/i.test(activity)
          ? SocialRequestType.RunningPartner
          : SocialRequestType.FitnessPartner,
        title: title || `${activity}搭子`,
        description,
        rawText: this.safePublicToolText(goal) || description,
        city: sanitizeCity(city),
        radiusKm: 5,
        interestTags,
        activityType: activity,
        safetyRequirement: SocialRequestSafety.LowRiskOnly,
        agentAllowed: true,
        requireUserConfirmation: true,
        visibility: SocialRequestVisibility.Private,
        status: UserSocialRequestStatus.Draft,
        source: SocialRequestSource.CustomAgent,
        metadata: {
          agentTaskId: task.id,
          source: 'social_agent_chat',
          timePreference,
          locationPreference: location,
          intensity,
          safetyBoundary,
          taskSlotSummary,
        },
      },
      taskContext,
    );
    return {
      draft,
      card: {
        title: draft.title,
        description: draft.description,
        timePreference,
        locationPreference: location,
        activityType: activity,
        interestTags,
        safetyBoundary,
        status: 'draft',
      },
      profileUsed: {
        city,
        activityType: activity,
        timePreference,
        locationPreference: location,
      },
    };
  }

  async createPrivateDraftRequest(
    task: AgentTask,
    draft: SocialAgentRequestDraft,
    options: { signal?: AbortSignal | null } = {},
  ): Promise<number> {
    this.assertNotAborted(options.signal);
    const call = await this.executor.executeToolAction(
      task.id,
      SocialAgentToolName.CreateSocialRequest,
      {
        ...toSocialAgentDraftDto(draft),
        mode: 'private_draft',
        metadata: {
          ...(draft.metadata ?? {}),
          agentTaskId: task.id,
          source: 'social_agent_chat',
          publishPolicy: 'requires_user_confirmation',
        },
      },
      task.ownerUserId,
      { signal: options.signal ?? null },
    );
    this.assertNotAborted(options.signal);
    if (call.status !== 'succeeded') {
      throw new BadRequestException(
        cleanDisplayText(call.error?.message, '创建私有约练草稿失败'),
      );
    }
    const output = this.isRecord(call.output) ? call.output : {};
    const socialRequestId = this.number(output.socialRequestId ?? output.id);
    if (!socialRequestId) {
      throw new BadRequestException(
        '创建私有约练草稿失败：缺少 socialRequestId',
      );
    }
    return socialRequestId;
  }

  async autoPublishDraftIfAllowed(
    task: AgentTask,
    draft: SocialAgentRequestDraft,
    options: { signal?: AbortSignal | null } = {},
  ): Promise<SocialAgentDraftAutoPublishResult> {
    this.assertNotAborted(options.signal);
    const gate = this.evaluateAutoPublishGate(task, draft);
    if (!gate.allowed) {
      return {
        autoPublished: false,
        synced: false,
        publicIntentId: null,
        discoverHref: null,
        publishPolicy: gate.publishPolicy,
        blockedReason: gate.reason,
      };
    }
    if (this.isPublicDemandFlow(task, draft)) {
      return {
        autoPublished: false,
        synced: false,
        publicIntentId: null,
        discoverHref: null,
        publishPolicy: 'requires_user_confirmation',
        blockedReason: 'explicit_publish_confirmation_required',
      };
    }

    if (!draft.socialRequestId) {
      return {
        autoPublished: false,
        synced: false,
        publicIntentId: null,
        discoverHref: null,
        publishPolicy: 'blocked_missing_social_request_id',
        blockedReason: 'missing_social_request_id',
      };
    }

    const call = await this.executor.executeToolAction(
      task.id,
      SocialAgentToolName.CreateSocialRequest,
      {
        ...toSocialAgentPublishDto(task.id, draft),
        socialRequestId: draft.socialRequestId,
        mode: 'publish',
        publish: true,
        syncPublicIntent: true,
        metadata: {
          ...(draft.metadata ?? {}),
          socialRequestId: draft.socialRequestId,
          agentTaskId: task.id,
          source: 'social_agent_chat',
          visibilityConsent: true,
          autoPublished: true,
          publishPolicy: 'auto_after_first_public_authorization',
          confirmationSource: 'minimum_profile_gate_public_authorization',
        },
      },
      task.ownerUserId,
      { signal: options.signal ?? null },
    );
    this.assertNotAborted(options.signal);

    if (call.status !== 'succeeded') {
      return {
        autoPublished: false,
        synced: false,
        publicIntentId: null,
        discoverHref: null,
        publishPolicy: 'auto_publish_failed_keep_private_draft',
        blockedReason: cleanDisplayText(call.error?.message, 'publish_failed'),
      };
    }

    const output = this.isRecord(call.output) ? call.output : {};
    const publicIntentId = cleanDisplayText(output.publicIntentId, '') || null;
    return {
      autoPublished: Boolean(publicIntentId),
      synced: output.synced === true,
      publicIntentId,
      discoverHref: publicIntentId
        ? `/discover?publicIntentId=${encodeURIComponent(publicIntentId)}`
        : null,
      publishPolicy: 'auto_after_first_public_authorization',
      blockedReason: null,
    };
  }

  async searchCandidates(
    task: AgentTask,
    draft: SocialAgentRequestDraft,
    options: { signal?: AbortSignal | null } = {},
  ): Promise<SocialAgentCandidateSearchResult> {
    this.assertNotAborted(options.signal);
    const taskContext = this.buildSafeTaskToolContext(task);
    const safetyPolicy = buildCandidateSearchSafetyPolicy(task, draft);
    const input = draft.socialRequestId
      ? {
          taskId: task.id,
          socialRequestId: draft.socialRequestId,
          rawText: draft.rawText,
          limit: 10,
          safetyPolicy,
          taskContext,
          candidatePreference: taskContext.candidatePreference,
          candidatePreferencePolicy: taskContext.candidatePreferencePolicy,
        }
      : {
          taskId: task.id,
          city: sanitizeCity(draft.city),
          activityType: cleanDisplayText(draft.activityType, ''),
          interestTags: Array.isArray(draft.interestTags)
            ? draft.interestTags
            : [],
          radiusKm: typeof draft.radiusKm === 'number' ? draft.radiusKm : 5,
          safetyRequirement: draft.safetyRequirement,
          rawText: draft.rawText,
          limit: 10,
          safetyPolicy,
          taskContext,
          candidatePreference: taskContext.candidatePreference,
          candidatePreferencePolicy: taskContext.candidatePreferencePolicy,
        };
    const call = await this.executor.executeToolAction(
      task.id,
      SocialAgentToolName.SearchMatches,
      input,
      task.ownerUserId,
      { signal: options.signal ?? null },
    );
    this.assertNotAborted(options.signal);
    if (call.status !== 'succeeded') {
      throw new BadRequestException(
        cleanDisplayText(call.error?.message, '检索候选人失败'),
      );
    }
    const matchedCandidates = this.readMatchedCandidates(call.output);
    const output = this.isRecord(call.output) ? call.output : {};
    const emptyReason =
      cleanDisplayText(output.emptyReason, '') === 'no_real_candidates'
        ? 'no_real_candidates'
        : null;
    const message = cleanDisplayText(output.message, '') || null;
    const debugReasons = this.isRecord(output.debugReasons)
      ? (output.debugReasons as CandidatePoolDebugReasons)
      : null;
    const socialRequestId = draft.socialRequestId ?? null;
    return {
      candidates: matchedCandidates.map((candidate) =>
        toSocialAgentChatCandidate(
          draft.agentTaskId,
          socialRequestId,
          candidate,
        ),
      ),
      emptyReason,
      message,
      debugReasons,
    };
  }

  private publishRequiredBeforeMatchingResult(): SocialAgentCandidateSearchResult {
    return {
      candidates: [],
      emptyReason: null,
      message: '约练卡发布到发现页并读回可见后，才会继续推荐候选。',
      debugReasons: null,
    };
  }

  private isPublicDemandFlow(
    task: AgentTask,
    draft: SocialAgentRequestDraft,
  ): boolean {
    const metadata = this.isRecord(draft.metadata) ? draft.metadata : {};
    const explicitMode = cleanDisplayText(
      metadata.productMode ??
        metadata.discoveryMode ??
        metadata.matchingMode ??
        metadata.flowMode,
      '',
    )
      .trim()
      .toLowerCase();
    if (explicitMode === 'private_discovery') return false;
    const memoryRecord = this.isRecord(task.memory) ? task.memory : {};
    const taskMemory = this.isRecord(memoryRecord.taskMemory)
      ? memoryRecord.taskMemory
      : {};
    const socialAgentChat = this.isRecord(memoryRecord.socialAgentChat)
      ? memoryRecord.socialAgentChat
      : {};
    const memoryMode = cleanDisplayText(
      taskMemory.socialMode ?? socialAgentChat.socialMode,
      '',
    )
      .trim()
      .toLowerCase();
    return memoryMode !== 'private_discovery';
  }

  private readMatchedCandidates(output: unknown): MatchedCandidateView[] {
    const record = this.isRecord(output) ? output : {};
    const candidates = Array.isArray(record.candidates)
      ? record.candidates
      : Array.isArray(record.value)
        ? record.value
        : [];
    return candidates.filter((candidate): candidate is MatchedCandidateView =>
      this.isRecord(candidate),
    );
  }

  private assertNotAborted(signal?: AbortSignal | null): void {
    if (signal?.aborted) throw new Error('Subagent worker job cancelled.');
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private number(value: unknown): number | null {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
  }

  private uniqueStrings(values: Array<string | null | undefined>): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const value of values) {
      const text = cleanDisplayText(value, '').trim();
      if (!text || seen.has(text)) continue;
      seen.add(text);
      out.push(text);
    }
    return out;
  }

  private buildSafeTaskToolContext(task: AgentTask): Record<string, unknown> {
    const summary = summarizeSocialAgentTaskMemoryForLlm(task);
    const taskSlots = this.safeTaskSlots(summary.taskSlots);
    const taskSlotSummary = this.safeTaskSlotSummary(summary.taskSlotSummary);
    const candidatePreference =
      this.slotValue(taskSlots.candidate_preference) || null;
    const knownTaskSlotConstraints =
      buildSocialAgentKnownTaskSlotConstraints(taskSlots);
    const doNotRepeatQuestionsForSlots =
      knownTaskSlotConstraints?.doNotAskAgainFor ?? [];
    const knownContextSlots =
      knownTaskSlotConstraints?.knownSlots.map((slot) => slot.key) ?? [];

    return {
      source: 'social_agent_task_memory',
      taskId: task.id,
      goal: this.safePublicToolText(summary.goal),
      taskSlots,
      taskSlotSummary,
      knownTaskSlotConstraints,
      knownSlotsAreHardConstraints: doNotRepeatQuestionsForSlots.length > 0,
      knownContextSlots,
      doNotRepeatQuestionsForSlots,
      inferredSlotsAreContextOnly: true,
      candidatePreference,
      candidatePreferencePolicy:
        'public_discoverable_profiles_and_user_consented_public_tags_only',
      privacyPolicy:
        'do_not_use_private_life_graph_or_hidden_profile_fields_for_candidate_search',
    };
  }

  private enrichDraftWithTaskContext(
    draft: CreateSocialRequestDto,
    taskContext: Record<string, unknown>,
  ): CreateSocialRequestDto {
    const taskSlots = this.isRecord(taskContext.taskSlots)
      ? taskContext.taskSlots
      : {};
    const taskSlotSummary = this.isRecord(taskContext.taskSlotSummary)
      ? taskContext.taskSlotSummary
      : {};
    const knownSlotsAreHardConstraints =
      taskContext.knownSlotsAreHardConstraints === true;
    const activity =
      this.safeSlotValue(taskSlots, 'activity') ||
      this.safeSummaryValue(taskSlotSummary, 'activity');
    const timePreference =
      this.safeSlotValue(taskSlots, 'time_window') ||
      this.safeSummaryValue(taskSlotSummary, 'time_window');
    const locationPreference =
      this.safeSlotValue(taskSlots, 'location_text') ||
      this.safeSummaryValue(taskSlotSummary, 'location_text');
    const geoArea =
      this.safeSlotValue(taskSlots, 'geo_area') ||
      this.safeSummaryValue(taskSlotSummary, 'geo_area');
    const intensity =
      this.safeSlotValue(taskSlots, 'intensity') ||
      this.safeSummaryValue(taskSlotSummary, 'intensity');
    const safetyBoundary =
      this.safeSlotValue(taskSlots, 'safety_boundary') ||
      this.safeSummaryValue(taskSlotSummary, 'safety_boundary');
    const candidatePreference =
      cleanDisplayText(taskContext.candidatePreference, '') ||
      this.safeSlotValue(taskSlots, 'candidate_preference') ||
      this.safeSummaryValue(taskSlotSummary, 'candidate_preference');
    const city =
      sanitizeCity(draft.city) ||
      this.inferCityFromPublicContext(locationPreference, geoArea);
    const metadata = this.isRecord(draft.metadata) ? draft.metadata : {};
    const nextMetadata: Record<string, unknown> = {
      ...metadata,
      taskSlotSummary: {
        ...(this.isRecord(metadata.taskSlotSummary)
          ? metadata.taskSlotSummary
          : {}),
        ...taskSlotSummary,
      },
      knownTaskSlotConstraints: taskContext.knownTaskSlotConstraints,
      knownSlotsAreHardConstraints,
    };
    if (timePreference && !cleanDisplayText(nextMetadata.timePreference, '')) {
      nextMetadata.timePreference = timePreference;
    }
    if (
      locationPreference &&
      !cleanDisplayText(nextMetadata.locationPreference, '')
    ) {
      nextMetadata.locationPreference = locationPreference;
    }
    if (geoArea && !cleanDisplayText(nextMetadata.nearbyArea, '')) {
      nextMetadata.nearbyArea = geoArea;
    }
    if (intensity && !cleanDisplayText(nextMetadata.intensity, '')) {
      nextMetadata.intensity = intensity;
    }
    if (safetyBoundary && !cleanDisplayText(nextMetadata.safetyBoundary, '')) {
      nextMetadata.safetyBoundary = safetyBoundary;
    }
    if (
      candidatePreference &&
      !cleanDisplayText(nextMetadata.candidatePreference, '')
    ) {
      nextMetadata.candidatePreference = candidatePreference;
      nextMetadata.candidatePreferencePolicy =
        taskContext.candidatePreferencePolicy;
    }
    const interestTags = Array.isArray(draft.interestTags)
      ? [...draft.interestTags]
      : [];
    if (activity && !interestTags.includes(activity)) {
      interestTags.unshift(activity);
    }
    return {
      ...draft,
      city: city || draft.city,
      activityType:
        knownSlotsAreHardConstraints && activity
          ? activity
          : cleanDisplayText(draft.activityType, '') || activity || undefined,
      interestTags,
      rawText:
        cleanDisplayText(draft.rawText, '') ||
        cleanDisplayText(taskContext.goal, '') ||
        draft.rawText,
      metadata: nextMetadata,
    };
  }

  private safeTaskSlots(
    value: unknown,
  ): Record<string, Record<string, string>> {
    const slots = this.isRecord(value) ? value : {};
    const out: Record<string, Record<string, string>> = {};
    for (const [key, rawSlot] of Object.entries(slots)) {
      if (!this.isRecord(rawSlot)) continue;
      const state = cleanDisplayText(rawSlot.state, '');
      if (!this.isSafeToolSlotState(key, state)) continue;
      const slotValue = this.safePublicToolText(rawSlot.value);
      if (!slotValue) continue;
      out[key] = {
        value: slotValue,
        state,
        source: cleanDisplayText(rawSlot.source, '').slice(0, 80),
      };
    }
    return out;
  }

  private safeTaskSlotSummary(value: unknown): Record<string, string> {
    const summary = this.isRecord(value) ? value : {};
    const out: Record<string, string> = {};
    for (const [key, rawValue] of Object.entries(summary)) {
      const text = this.safePublicToolText(rawValue);
      if (text) out[key] = text;
    }
    return out;
  }

  private isSafeToolSlotState(key: string, state: string): boolean {
    if ((key === 'geo_area' || key === 'intensity') && state === 'inferred') {
      return true;
    }
    return (
      state === 'answered' ||
      state === 'confirmed' ||
      state === 'completed' ||
      state === 'modified'
    );
  }

  private slotValue(slot: unknown): string {
    return this.isRecord(slot) ? cleanDisplayText(slot.value, '') : '';
  }

  private safeSlotValue(slots: Record<string, unknown>, key: string): string {
    return this.safePublicToolText(
      this.isRecord(slots[key]) ? slots[key].value : '',
    );
  }

  private safeSummaryValue(
    summary: Record<string, unknown>,
    key: string,
  ): string {
    return this.safePublicToolText(summary[key]);
  }

  private safePublicToolText(value: unknown): string {
    const text = cleanDisplayText(value, '').slice(0, 180);
    if (!text || containsSensitivePublishInfo(text)) return '';
    return text;
  }

  private inferCityFromPublicContext(...values: string[]): string {
    const text = values.filter(Boolean).join(' ');
    if (!text) return '';
    if (
      /(青岛|崂山|市南|市北|李沧|黄岛|青岛大学|五四广场|奥帆中心|石老人|浮山|麦岛|台东|栈桥)/.test(
        text,
      )
    ) {
      return '青岛';
    }
    return sanitizeCity(text);
  }

  private evaluateAutoPublishGate(
    task: AgentTask,
    draft: SocialAgentRequestDraft,
  ): {
    allowed: boolean;
    publishPolicy: string;
    reason: string | null;
  } {
    const memory = readSocialAgentTaskMemory(task);
    const text = [
      draft.rawText,
      draft.title,
      draft.description,
      draft.city,
      draft.activityType,
      ...(Array.isArray(draft.interestTags) ? draft.interestTags : []),
    ]
      .filter(Boolean)
      .join(' ');
    if (memory.boundaries.publicActivityAllowed === false) {
      return {
        allowed: false,
        publishPolicy: 'requires_user_confirmation',
        reason: 'public_visibility_denied_in_task_memory',
      };
    }
    const hasPublicConsent =
      draft.metadata?.visibilityConsent === true ||
      draft.metadata?.publicActivityAllowed === true ||
      memory.boundaries.publicActivityAllowed === true ||
      containsPublicPublishConsent(text);
    if (!hasPublicConsent) {
      return {
        allowed: false,
        publishPolicy: 'requires_user_confirmation',
        reason: 'missing_public_visibility_consent',
      };
    }

    if (containsSensitivePublishInfo(text)) {
      return {
        allowed: false,
        publishPolicy: 'requires_confirmation_sensitive_content',
        reason: 'sensitive_or_precise_info_detected',
      };
    }

    return {
      allowed: true,
      publishPolicy: 'auto_after_first_public_authorization',
      reason: null,
    };
  }
}

export type SocialAgentDraftAutoPublishResult = {
  autoPublished: boolean;
  synced: boolean;
  publicIntentId: string | null;
  discoverHref: string | null;
  publishPolicy: string;
  blockedReason: string | null;
};

function containsPublicPublishConsent(text: string): boolean {
  return /((可以|愿意|同意|授权|允许).{0,8}(公开|发现页|公开发起|公开活动|发布到发现|同步到发现))|(帮我|请|直接|现在|确认).{0,12}(发布|公开|发到发现|同步到发现)|发布到发现|同步到发现|公开发布/i.test(
    text,
  );
}

function containsSensitivePublishInfo(text: string): boolean {
  return /(\b1[3-9]\d{9}\b|微信|vx|wechat|手机号|电话|身份证|门牌|单元|楼栋|具体地址|精确位置|联系方式|加我|私聊我|转账|支付|红包)/i.test(
    text,
  );
}

function buildCandidateSearchSafetyPolicy(
  task: AgentTask,
  draft: SocialAgentRequestDraft,
) {
  return {
    policyVersion: 'fitmeet.candidate-search.v1',
    source: 'social_agent_chat',
    taskId: task.id,
    socialRequestId: draft.socialRequestId ?? null,
    candidateEligibility: {
      profileDiscoverable: true,
      agentCanRecommendMe: true,
      publicOrAuthorizedSourceOnly: true,
      excludeBlockedUsers: true,
      excludeComplaintRisk: true,
      excludeUnsafeMeetRisk: true,
    },
    privacy: {
      redactPreciseLocation: true,
      redactContactInfo: true,
      exposeOnlyPublicProfileFields: true,
      noPrivateLifeGraphLeakage: true,
    },
    rankingSignals: [
      'city_or_distance',
      'interests',
      'time_overlap',
      'social_boundary',
      'activity_intensity',
      'relationship_goal',
      'public_life_graph_preferences',
    ],
    sideEffectPolicy: 'search_only_no_contact_without_approval',
    approvalPolicy:
      'send_message_add_friend_connect_create_activity_publish_require_checkpoint',
  };
}
