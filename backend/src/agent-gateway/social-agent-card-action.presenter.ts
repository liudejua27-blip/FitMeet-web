import { cleanDisplayText } from '../common/display-text.util';
import type { CreateActivityDto } from '../activities/dto/activity.dto';
import {
  ActivityProofPolicy,
  ActivityType,
} from '../activities/entities/activity-template.entity';
import { AgentTask } from './entities/agent-task.entity';
import { readSocialAgentStoredCandidateSummaries } from './social-agent-chat-session.presenter';
import type {
  FitMeetAgentSchemaAction,
  FitMeetAlphaCard,
} from './fitmeet-alpha-agent.types';
import type {
  SocialAgentIntentRouteResult,
  SocialAgentPendingApprovalSnapshot,
} from './social-agent-chat.types';

export function buildSocialAgentCardActionRouteResult(input: {
  task: AgentTask;
  assistantMessage: string;
  cards: FitMeetAlphaCard[];
  emptyIntentEntities: SocialAgentIntentRouteResult['entities'];
  pendingApproval?: SocialAgentPendingApprovalSnapshot | null;
}): SocialAgentIntentRouteResult {
  return {
    intent: 'action_request',
    confidence: 1,
    entities: input.emptyIntentEntities,
    shouldSearch: false,
    shouldReplan: false,
    shouldUpdateProfile: false,
    shouldExecuteAction: true,
    replyStrategy: 'execute_action',
    source: 'rules',
    action: input.pendingApproval ? 'await_confirmation' : 'reply',
    taskId: input.task.id,
    assistantMessage: input.assistantMessage,
    savedContext: true,
    profileUpdated: false,
    shouldQueueRun: false,
    runMode: null,
    queuedRun: null,
    pendingApproval: input.pendingApproval ?? null,
    activityResults: [],
    profileUpdateProposal: null,
    cards: input.cards,
    permissionMode: input.task.permissionMode,
  };
}

export function createSocialAgentActivityDtoFromPayload(input: {
  payload: Record<string, unknown>;
  candidateUserId?: number | null;
  number: (value: unknown) => number | null;
}): CreateActivityDto {
  const { payload, candidateUserId, number } = input;
  const title =
    cleanDisplayText(payload.title, '') ||
    cleanDisplayText(payload.activityTitle, '') ||
    '轻松约练';
  const locationName =
    cleanDisplayText(
      payload.locationName ?? payload.location ?? payload.loc,
      '',
    ) || '公共场所';
  const city = cleanDisplayText(payload.city, '') || '青岛';
  const startTime = readSocialAgentActivityStartTime(payload);
  const durationMinutes =
    number(payload.durationMinutes) ?? number(payload.duration) ?? 45;
  const socialRequestId = number(payload.socialRequestId);
  const meetId = number(payload.meetId);
  const matchedCandidateId = number(
    payload.matchedCandidateId ?? payload.candidateRecordId,
  );
  return {
    type: socialAgentActivityTypeFromPayload(payload),
    title,
    description:
      cleanDisplayText(payload.description, '') ||
      '公共场所、低压力、先站内沟通的 FitMeet 约练。',
    locationName,
    city,
    ...(startTime ? { startTime } : {}),
    durationMinutes,
    ...(socialRequestId ? { socialRequestId } : {}),
    ...(meetId ? { meetId } : {}),
    ...(matchedCandidateId ? { matchedCandidateId } : {}),
    ...(candidateUserId ? { invitedUserId: candidateUserId } : {}),
    proofRequired: true,
    proofPolicy: ActivityProofPolicy.MutualOrProof,
  };
}

export function socialAgentActivityTypeFromPayload(
  payload: Record<string, unknown>,
): ActivityType {
  const raw = cleanDisplayText(
    payload.activityType ?? payload.type ?? payload.requestType,
    '',
  ).toLowerCase();
  if (/running|run|跑步|慢跑/.test(raw)) return ActivityType.Running;
  if (/fitness|gym|健身|训练/.test(raw)) return ActivityType.Fitness;
  if (/dog|遛狗/.test(raw)) return ActivityType.DogWalking;
  if (/coffee|咖啡/.test(raw)) return ActivityType.CoffeeChat;
  if (/walk|散步|city/.test(raw)) return ActivityType.CityWalk;
  return ActivityType.Running;
}

export function readSocialAgentActivityStartTime(
  payload: Record<string, unknown>,
): string | undefined {
  const raw = cleanDisplayText(
    payload.startTime ?? payload.startsAt ?? payload.dateTime,
    '',
  );
  if (!raw) return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function mergeSocialAgentActivityPayload(input: {
  task: AgentTask;
  payload: Record<string, unknown>;
  isRecord: (value: unknown) => value is Record<string, unknown>;
}): Record<string, unknown> {
  return {
    ...readSocialAgentActivityDraft(input.task, input.isRecord),
    ...readSocialAgentMeetLoopState(input.task, input.isRecord),
    ...input.payload,
  };
}

export function readSocialAgentActivityDraft(
  task: AgentTask,
  isRecord: (value: unknown) => value is Record<string, unknown>,
): Record<string, unknown> {
  const result = isRecord(task.result) ? task.result : {};
  return isRecord(result.activityDraft) ? result.activityDraft : {};
}

export function readSocialAgentMeetLoopState(
  task: AgentTask,
  isRecord: (value: unknown) => value is Record<string, unknown>,
): Record<string, unknown> {
  const result = isRecord(task.result) ? task.result : {};
  return isRecord(result.meetLoop) ? result.meetLoop : {};
}

export function readSocialAgentCardActionCandidate(input: {
  payload: Record<string, unknown>;
  task: AgentTask;
  isRecord: (value: unknown) => value is Record<string, unknown>;
}): Record<string, unknown> {
  const nested = input.isRecord(input.payload.candidate)
    ? input.payload.candidate
    : null;
  if (nested) return nested;
  return readSocialAgentStoredCandidateSummaries(input.task)[0] ?? {};
}

export function messageForSocialAgentSchemaAction(
  action: FitMeetAgentSchemaAction,
): string {
  switch (action) {
    case 'opener.regenerate':
      return '重新生成开场白';
    case 'activity.modify_time':
      return '修改约练时间';
    case 'activity.modify_location':
      return '修改约练地点';
    case 'activity.check_in':
      return '我已到达，签到';
    case 'activity.complete':
      return '活动已完成';
    case 'review.submit':
      return '提交活动评价';
    case 'life_graph.accept_update':
      return '确认更新 Life Graph';
    case 'life_graph.reject_update':
      return '不要更新 Life Graph';
    default:
      return action;
  }
}
