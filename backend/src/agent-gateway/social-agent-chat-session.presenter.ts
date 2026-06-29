import {
  cleanDisplayText,
  sanitizeForDisplay,
} from '../common/display-text.util';
import type { AgentTask } from './entities/agent-task.entity';
import { buildRecommendationAssistantMessage } from './social-agent-chat-result.presenter';
import type {
  FitMeetAlphaCard,
  FitMeetAlphaCardAction,
} from './fitmeet-alpha-agent.types';
import type {
  SocialAgentAsyncRunSnapshot,
  SocialAgentChatCandidate,
  SocialAgentChatReplanRunResult,
  SocialAgentChatRunResult,
  SocialAgentRequestDraft,
  SocialAgentVisibleStep,
} from './social-agent-chat.types';
import { readSocialAgentTimelineCandidates } from './social-agent-chat-timeline.presenter';
import { normalizeSocialAgentVisibleStepSnapshot } from './social-agent-visible-step-snapshot.presenter';

export { buildSocialAgentTimelineSnapshot } from './social-agent-chat-timeline.presenter';

type VisibleStepLabeler = (id: string, label: string) => string;

export function readSocialAgentStoredCandidateSummaries(
  task: AgentTask,
): Array<Record<string, unknown>> {
  const memory = isRecord(task.memory) ? task.memory : {};
  const shortTerm = isRecord(memory.shortTerm) ? memory.shortTerm : {};
  const candidates = Array.isArray(shortTerm.candidates)
    ? shortTerm.candidates
    : [];
  if (candidates.length > 0) {
    return candidates.filter(
      (candidate): candidate is Record<string, unknown> => isRecord(candidate),
    );
  }
  const chat = isRecord(memory.socialAgentChat) ? memory.socialAgentChat : {};
  return Array.isArray(chat.candidates)
    ? chat.candidates.filter(
        (candidate): candidate is Record<string, unknown> =>
          isRecord(candidate),
      )
    : [];
}

export function readSocialAgentRestorableResult(input: {
  task: AgentTask;
  latestRun: SocialAgentAsyncRunSnapshot | null;
  events: Array<Record<string, unknown>>;
  visibleStepLabel: VisibleStepLabeler;
}): SocialAgentChatRunResult | SocialAgentChatReplanRunResult | null {
  const { task, latestRun, events, visibleStepLabel } = input;
  const taskMemoryResult = readResultFromTaskMemory(
    task,
    events,
    visibleStepLabel,
  );
  if (shouldPreferTaskMemoryResult(task, taskMemoryResult, latestRun)) {
    return taskMemoryResult;
  }
  if (latestRun?.result && isRecord(latestRun.result)) {
    const runResult = latestRun.result as
      | SocialAgentChatRunResult
      | SocialAgentChatReplanRunResult;
    const restorableResult = sanitizeRestorableRunResult({
      ...runResult,
      taskId: task.id,
      status: task.status,
      visibleSteps:
        runResult.visibleSteps?.length > 0
          ? runResult.visibleSteps
          : latestRun.visibleSteps,
      events,
    });
    return withRestoredOpportunityCard(
      isOpportunityDraftCancelled(task)
        ? withoutRestoredOpportunityDraft(restorableResult)
        : restorableResult,
      task.id,
    );
  }

  return taskMemoryResult;
}

function sanitizeRestorableRunResult(
  result: SocialAgentChatRunResult | SocialAgentChatReplanRunResult,
): SocialAgentChatRunResult | SocialAgentChatReplanRunResult {
  return {
    ...(sanitizeForDisplay(result) as
      | SocialAgentChatRunResult
      | SocialAgentChatReplanRunResult),
    debugReasons: null,
  };
}

function readResultFromTaskMemory(
  task: AgentTask,
  events: Array<Record<string, unknown>>,
  visibleStepLabel: VisibleStepLabeler,
): SocialAgentChatRunResult | null {
  const result = isRecord(task.result) ? task.result : {};
  const chatRun = isRecord(result.chatRun) ? result.chatRun : {};
  const memory = isRecord(task.memory) ? task.memory : {};
  const chat = isRecord(memory.socialAgentChat) ? memory.socialAgentChat : {};
  const eventResult = readCandidateResultFromEvents(task, events);
  const rawDraft = isRecord(chatRun.socialRequestDraft)
    ? chatRun.socialRequestDraft
    : isRecord(chat.socialRequestDraft)
      ? chat.socialRequestDraft
      : isRecord(eventResult?.socialRequestDraft)
        ? eventResult.socialRequestDraft
        : null;
  const storedCandidates = readSocialAgentTimelineCandidates(
    task,
    readSocialAgentStoredCandidateSummaries(task),
  );
  const candidates =
    storedCandidates.length > 0
      ? storedCandidates
      : (eventResult?.candidates ?? []);
  const storedCards = Array.isArray(chatRun.cards)
    ? chatRun.cards.filter((card): card is FitMeetAlphaCard =>
        Boolean(card && typeof card === 'object'),
      )
    : Array.isArray(result.cards)
      ? result.cards.filter((card): card is FitMeetAlphaCard =>
          Boolean(card && typeof card === 'object'),
        )
      : [];

  if (!rawDraft && candidates.length === 0) return null;
  const socialRequestDraft = rawDraft
    ? ({
        ...rawDraft,
        agentTaskId: task.id,
        socialRequestId:
          numberValue(rawDraft.socialRequestId) ??
          numberValue(chatRun.socialRequestId) ??
          numberValue(chat.socialRequestId) ??
          null,
        mode: 'draft',
      } as SocialAgentRequestDraft)
    : null;
  const restoredDraft = isOpportunityDraftCancelled(task)
    ? null
    : socialRequestDraft;
  return withRestoredOpportunityCard(
    {
      taskId: task.id,
      status: task.status,
      visibleSteps: readStoredVisibleSteps(task, visibleStepLabel),
      assistantMessage: isOpportunityDraftCancelled(task)
        ? '已取消发布，不会出现在发现页，也不会继续匹配。'
        : cleanDisplayText(chatRun.message, '') ||
          cleanDisplayText(eventResult?.message, '') ||
          buildRecommendationAssistantMessage(candidates),
      emptyReason:
        cleanDisplayText(chatRun.emptyReason, '') === 'no_real_candidates'
          ? 'no_real_candidates'
          : cleanDisplayText(eventResult?.emptyReason, '') ===
              'no_real_candidates'
            ? 'no_real_candidates'
            : null,
      message:
        cleanDisplayText(chatRun.message, '') ||
        cleanDisplayText(eventResult?.message, '') ||
        null,
      debugReasons: null,
      socialRequestDraft: restoredDraft,
      candidates,
      approvalRequiredActions: [],
      events,
      cards: storedCards,
    },
    task.id,
  );
}

function withRestoredOpportunityCard<
  T extends SocialAgentChatRunResult | SocialAgentChatReplanRunResult,
>(result: T, taskId: number): T {
  const draft = result.socialRequestDraft;
  if (!draft) return result;
  const existingCards = Array.isArray(result.cards) ? result.cards : [];
  const hasActivityCard = existingCards.some((card) => {
    if (!card || typeof card !== 'object') return false;
    const record = card as unknown as Record<string, unknown>;
    const data = isRecord(record.data) ? record.data : {};
    return (
      record.schemaType === 'social_match.activity' ||
      data.schemaType === 'social_match.activity'
    );
  });
  if (hasActivityCard) return result;
  return {
    ...result,
    cards: [buildRestoredOpportunityCard(taskId, draft), ...existingCards],
  };
}

function withoutRestoredOpportunityDraft<
  T extends SocialAgentChatRunResult | SocialAgentChatReplanRunResult,
>(result: T): T {
  const cards = Array.isArray(result.cards)
    ? result.cards.filter((card) => !isUnpublishedOpportunityCard(card))
    : [];
  return {
    ...result,
    assistantMessage: '已取消发布，不会出现在发现页，也不会继续匹配。',
    message: '已取消发布，不会出现在发现页，也不会继续匹配。',
    socialRequestDraft: null,
    cards,
  };
}

function buildRestoredOpportunityCard(
  taskId: number,
  draft: SocialAgentRequestDraft,
): FitMeetAlphaCard {
  const draftRecord = draft as unknown as Record<string, unknown>;
  const metadata = isRecord(draft.metadata) ? draft.metadata : {};
  const card = isRecord(draft.card) ? draft.card : {};
  const socialRequestId = numberValue(draft.socialRequestId);
  const publicIntentId =
    cleanDisplayText(draft.publicIntentId ?? metadata.publicIntentId, '') ||
    null;
  const discoverHref =
    cleanDisplayText(draft.discoverHref ?? metadata.discoverHref, '') || null;
  const publishStatus = cleanDisplayText(
    draftRecord.publishStatus ?? metadata.publishStatus,
    '',
  );
  const visibility = cleanDisplayText(
    draftRecord.visibility ?? metadata.visibility,
    '',
  );
  const matchingJobId =
    numberValue(draftRecord.matchingJobId) ??
    numberValue(metadata.matchingJobId);
  const matchingJobStatus =
    cleanDisplayText(
      draftRecord.matchingJobStatus ?? metadata.matchingJobStatus,
      '',
    ) || null;
  const autoPublished =
    draft.autoPublished === true ||
    metadata.autoPublished === true ||
    ((publishStatus === 'published' || visibility === 'public') &&
      Boolean(publicIntentId || discoverHref));
  const title =
    cleanDisplayText(draft.title ?? card.title ?? metadata.title, '') ||
    '约练卡草稿';
  const city =
    cleanDisplayText(draft.city ?? card.city ?? metadata.city, '') || '同城';
  const activityType =
    cleanDisplayText(
      draft.activityType ??
        draft.type ??
        card.activityType ??
        metadata.activity,
      '',
    ) || '约练';
  const time =
    cleanDisplayText(
      draftRecord.timePreference ??
        card.timePreference ??
        metadata.timePreference ??
        (isRecord(metadata.taskSlotSummary)
          ? metadata.taskSlotSummary.time_window
          : ''),
      '',
    ) || '时间待确认';
  const location =
    cleanDisplayText(
      draftRecord.locationPreference ??
        card.locationPreference ??
        metadata.locationPreference ??
        draftRecord.location ??
        draftRecord.locationName,
      '',
    ) || `${city}公共场所`;
  const description =
    cleanDisplayText(
      draft.description ?? card.description ?? draft.rawText,
      '',
    ) || '这是一张约练卡草稿，确认后才会发布到发现页。';
  const status: FitMeetAlphaCard['status'] = autoPublished
    ? 'completed'
    : 'waiting_confirmation';
  const basePayload = {
    taskId,
    socialRequestId,
    publicIntentId,
    discoverHref,
    matchingJobId,
    matchingJobStatus,
    socialRequestDraft: draft,
    draft,
    approvalRequired: !autoPublished,
    checkpointRequired: !autoPublished,
    resumeMode: 'resume_after_approval',
    riskLevel: 'medium',
    riskReasons: ['发布后附近公开可发现用户可以看到这张约练卡'],
  };
  const actions: FitMeetAlphaCardAction[] = autoPublished
    ? [
        {
          id: `view_public_intent:${taskId}:${publicIntentId ?? socialRequestId ?? 'published'}`,
          label: '查看发现详情',
          action: 'activity.view_detail',
          schemaAction: 'activity.view_detail',
          requiresConfirmation: false,
          payload: basePayload,
        },
      ]
    : [
        {
          id: `publish_to_discover:${taskId}:${socialRequestId ?? 'draft'}`,
          label: '确认发布',
          action: 'publish_to_discover',
          schemaAction: 'publish_to_discover',
          loopStage: 'activity_draft_created',
          requiresConfirmation: true,
          payload: basePayload,
        },
        {
          id: `modify_activity_plan:${taskId}:${socialRequestId ?? 'draft'}`,
          label: '修改卡片',
          action: 'reschedule_meet_loop',
          schemaAction: 'activity.modify_time',
          loopStage: 'activity_draft_created',
          requiresConfirmation: false,
          payload: basePayload,
        },
        {
          id: `skip_publish_activity:${taskId}:${socialRequestId ?? 'draft'}`,
          label: '暂不发布',
          action: 'activity.skip_publish',
          schemaAction: 'activity.skip_publish',
          loopStage: 'activity_draft_created',
          requiresConfirmation: false,
          payload: { taskId, socialRequestId },
        },
      ];

  return {
    id: `activity_plan:${taskId}:${socialRequestId ?? publicIntentId ?? 'draft'}`,
    type: 'activity_plan',
    schemaVersion: 'fitmeet.tool-ui.v1',
    schemaType: 'social_match.activity',
    title: autoPublished ? '已发布到发现' : title,
    body: autoPublished
      ? '这张约练卡已经发布到发现页。'
      : '确认后这张约练卡才会出现在发现页；不会公开精确位置或联系方式。',
    status,
    data: {
      taskId,
      schemaName: 'OpportunityCard',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'social_match.activity',
      opportunityCard: true,
      socialRequestId,
      publicIntentId,
      discoverHref,
      matchingJobId,
      matchingJobStatus,
      autoPublished,
      publishStatus: autoPublished
        ? 'published'
        : 'draft_requires_confirmation',
      publishPolicy: autoPublished ? '已发布到发现页' : '确认后发布到发现页',
      opportunity: {
        id: `opportunity:${taskId}:activity:${socialRequestId ?? publicIntentId ?? 'draft'}`,
        type: 'activity',
        title,
        subtitle: `${city} · ${time}`,
        summary: description,
        city,
        location,
        time,
        activityType,
        safetyBadges: ['公共场所', '不共享精确位置', '确认后发布'],
        recommendedNextAction: autoPublished
          ? '可以打开发现详情查看公开展示。'
          : '确认后发布到发现页，附近公开可发现用户才能看到。',
        safetyBoundary: '不会公开精确位置、联系方式或私密资料。',
        confirmedContext: [city, time, activityType, location],
        autoPublished,
        publicIntentId,
        discoverHref,
        matchingJobId,
        matchingJobStatus,
      },
      city,
      locationName: location,
      activityType,
      time,
      interestTags: Array.isArray(draft.interestTags) ? draft.interestTags : [],
      publicPlaceOnly: true,
      noPreciseLocation: true,
      safetyBoundary: '不会公开精确位置、联系方式或私密资料。',
    },
    actions,
  };
}

function shouldPreferTaskMemoryResult(
  task: AgentTask,
  taskMemoryResult: SocialAgentChatRunResult | null,
  latestRun: SocialAgentAsyncRunSnapshot | null,
): taskMemoryResult is SocialAgentChatRunResult {
  if (!taskMemoryResult) return false;
  if (!latestRun?.result || !isRecord(latestRun.result)) return true;
  if (isOpportunityDraftCancelled(task)) return false;
  if (hasMatchingOutcome(taskMemoryResult)) return true;
  if (!hasPublishedOrMatchingState(taskMemoryResult)) return false;
  if (!hasPublishedOrMatchingState(latestRun.result)) return true;
  return taskUpdatedAfterLatestRun(task, latestRun);
}

function hasMatchingOutcome(
  result: SocialAgentChatRunResult | SocialAgentChatReplanRunResult,
): boolean {
  if ((result.candidates?.length ?? 0) > 0) return true;
  return (result.cards ?? []).some((card) => {
    const data = isRecord(card.data) ? card.data : {};
    const schemaType =
      cleanDisplayText(card.schemaType, '') ||
      cleanDisplayText(data.schemaType, '');
    return (
      schemaType === 'social_match.candidate' ||
      schemaType === 'social_match.no_candidates'
    );
  });
}

function hasPublishedOrMatchingState(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const draft = isRecord(value.socialRequestDraft)
    ? value.socialRequestDraft
    : {};
  const cards = Array.isArray(value.cards) ? value.cards : [];
  const publicIntentId = firstText(
    draft.publicIntentId,
    value.publicIntentId,
    ...cards.map((card) =>
      isRecord(card) && isRecord(card.data) ? card.data.publicIntentId : null,
    ),
  );
  const discoverHref = firstText(
    draft.discoverHref,
    value.discoverHref,
    ...cards.map((card) =>
      isRecord(card) && isRecord(card.data) ? card.data.discoverHref : null,
    ),
  );
  const state = [
    draft.publishStatus,
    draft.visibility,
    draft.matchingJobStatus,
    value.publishStatus,
    value.matchingJobStatus,
    isRecord(value.publicLoop) ? value.publicLoop.stage : null,
    ...cards.flatMap((card) => {
      if (!isRecord(card)) return [];
      const data = isRecord(card.data) ? card.data : {};
      return [
        card.status,
        data.publishStatus,
        data.visibility,
        data.matchingJobStatus,
      ];
    }),
  ]
    .map((item) => cleanDisplayText(item, '').toLowerCase())
    .filter(Boolean)
    .join(' ');
  return (
    Boolean(publicIntentId || discoverHref) &&
    /published|public|queued|running|candidate|matched|no_candidates/.test(
      state,
    )
  );
}

function taskUpdatedAfterLatestRun(
  task: AgentTask,
  latestRun: SocialAgentAsyncRunSnapshot,
): boolean {
  const taskTime = dateMillis(task.updatedAt);
  const runTime = dateMillis(latestRun.updatedAt ?? latestRun.completedAt);
  return taskTime !== null && runTime !== null && taskTime >= runTime;
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    const text = cleanDisplayText(value, '');
    if (text) return text;
  }
  return null;
}

function dateMillis(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  const text = cleanDisplayText(value, '');
  if (!text) return null;
  const time = Date.parse(text);
  return Number.isFinite(time) ? time : null;
}

function isOpportunityDraftCancelled(task: AgentTask): boolean {
  const result = isRecord(task.result) ? task.result : {};
  const memory = isRecord(task.memory) ? task.memory : {};
  const activityDraft = isRecord(result.activityDraft)
    ? result.activityDraft
    : {};
  const meetLoop = isRecord(result.meetLoop) ? result.meetLoop : {};
  const chatRun = isRecord(result.chatRun) ? result.chatRun : {};
  const shortTerm = isRecord(memory.shortTerm) ? memory.shortTerm : {};
  const socialAgentChat = isRecord(memory.socialAgentChat)
    ? memory.socialAgentChat
    : {};
  return (
    [
      activityDraft.publishStatus,
      activityDraft.status,
      activityDraft.loopStage,
      meetLoop.publishStatus,
      meetLoop.status,
      meetLoop.loopStage,
      chatRun.publishStatus,
      shortTerm.publishStatus,
      socialAgentChat.publishStatus,
    ].some((value) =>
      /cancelled|canceled|draft_cancelled|activity_publish_cancelled/.test(
        cleanDisplayText(value, ''),
      ),
    ) ||
    activityDraft.dismissed === true ||
    activityDraft.visibility === 'hidden'
  );
}

function isUnpublishedOpportunityCard(card: unknown): boolean {
  if (!isRecord(card)) return false;
  const data = isRecord(card.data) ? card.data : {};
  const schemaType =
    cleanDisplayText(card.schemaType, '') ||
    cleanDisplayText(data.schemaType, '');
  if (schemaType !== 'social_match.activity') return false;
  const autoPublished =
    card.status === 'completed' || data.autoPublished === true;
  const publicIntentId = cleanDisplayText(data.publicIntentId, '');
  return !autoPublished && !publicIntentId;
}

function readCandidateResultFromEvents(
  task: AgentTask,
  events: Array<Record<string, unknown>>,
): {
  candidates: SocialAgentChatCandidate[];
  socialRequestDraft: Record<string, unknown> | null;
  message: string | null;
  emptyReason: string | null;
} | null {
  const event = [...events]
    .reverse()
    .find(
      (item) =>
        cleanDisplayText(item.eventType, '') ===
        'social_agent.candidates.returned',
    );
  if (!event || !isRecord(event.payload)) return null;
  const payload = event.payload;
  return {
    candidates: readSocialAgentTimelineCandidates(task, payload.candidates),
    socialRequestDraft: isRecord(payload.socialRequestDraft)
      ? payload.socialRequestDraft
      : null,
    message: cleanDisplayText(payload.message, '') || null,
    emptyReason: cleanDisplayText(payload.emptyReason, '') || null,
  };
}

function readStoredVisibleSteps(
  task: AgentTask,
  visibleStepLabel: VisibleStepLabeler,
): SocialAgentVisibleStep[] {
  const memory = isRecord(task.memory) ? task.memory : {};
  const shortTerm = isRecord(memory.shortTerm) ? memory.shortTerm : {};
  const steps = Array.isArray(shortTerm.steps) ? shortTerm.steps : [];
  return steps
    .filter((step): step is Record<string, unknown> => isRecord(step))
    .map((step) => ({
      id: cleanDisplayText(step.id, ''),
      label: visibleStepLabel(
        cleanDisplayText(step.id, ''),
        cleanDisplayText(step.label, '正在处理任务'),
      ),
      status: normalizeStepStatus(step.status),
      snapshot: normalizeSocialAgentVisibleStepSnapshot(step.snapshot),
    }))
    .filter((step) => step.id);
}

function normalizeStepStatus(value: unknown): SocialAgentVisibleStep['status'] {
  if (value === 'done' || value === 'failed' || value === 'pending') {
    return value;
  }
  return 'running';
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
