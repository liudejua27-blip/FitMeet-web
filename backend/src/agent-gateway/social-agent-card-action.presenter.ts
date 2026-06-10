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

export function buildSocialAgentOpenerApprovalCard(input: {
  taskId: number;
  targetUserId: number | null;
  approvalId: number;
  candidate: Record<string, unknown>;
  displayName: string;
  draft: string;
  regeneratePayload: Record<string, unknown>;
}): FitMeetAlphaCard {
  return {
    id: `opener_approval:${input.taskId}:${input.targetUserId ?? input.approvalId}`,
    type: 'opener_approval',
    title: '这条消息会发送给对方。我先帮你写好了，你确认后我再发。',
    body: input.draft,
    status: 'waiting_confirmation',
    data: {
      taskId: input.taskId,
      targetUserId: input.targetUserId,
      displayName: input.displayName,
      message: input.draft,
      loopStage: 'opener_draft_created',
      safetyBoundary: '确认前不会发送。建议先站内沟通，不急着交换联系方式。',
    },
    actions: [
      {
        id: 'opener_confirm_send',
        label: '确认发送',
        action: 'send_message',
        schemaAction: 'opener.confirm_send',
        loopStage: 'opener_draft_created',
        requiresConfirmation: true,
        payload: {
          taskId: input.taskId,
          targetUserId: input.targetUserId,
          candidate: input.candidate,
          message: input.draft,
          approvalId: input.approvalId,
        },
      },
      {
        id: 'opener_regenerate',
        label: '重新生成',
        action: 'generate_opener',
        schemaAction: 'opener.regenerate',
        loopStage: 'opener_draft_created',
        requiresConfirmation: false,
        payload: input.regeneratePayload,
      },
    ],
  };
}

export function buildSocialAgentActivityPlanCard(input: {
  taskId: number;
  approvalId: number;
  payload: Record<string, unknown>;
}): FitMeetAlphaCard {
  return {
    id: `activity_plan:${input.taskId}:${input.approvalId}`,
    type: 'activity_plan',
    title: '我可以帮你创建一个约练计划',
    body: '确认前不会创建活动。第一次见面建议选择公共场所，我不会共享你的精确位置。',
    status: 'waiting_confirmation',
    data: {
      taskId: input.taskId,
      loopStage: 'activity_draft_created',
      publicPlaceOnly: true,
      noPreciseLocation: true,
      safetyBoundary: '公共场所见面，不共享精确位置。',
      checkinReminder: '活动开始前我会提醒你确认是否到达。',
      lifeGraphUpdatePreview: '完成后会把这次活动结果用于更新你的 Life Graph。',
      trustScoreUpdatePreview:
        '完成与评价会写入 trust score，用来提升后续推荐可信度。',
    },
    actions: [
      {
        id: 'activity_confirm_create',
        label: '确认创建',
        action: 'create_activity',
        schemaAction: 'activity.confirm_create',
        loopStage: 'activity_draft_created',
        requiresConfirmation: true,
        payload: {
          taskId: input.taskId,
          approvalId: input.approvalId,
          ...input.payload,
        },
      },
    ],
  };
}

export function buildSocialAgentCheckinCard(input: {
  taskId: number;
  activityId: number | null;
  candidateUserId: number | null;
  realActivityPersisted: boolean;
}): FitMeetAlphaCard {
  return {
    id: `checkin_card:${input.taskId}:${input.activityId ?? 'draft'}`,
    type: 'checkin_card',
    title: '约练计划已创建。开始前，我会提醒你确认是否到达。',
    body: '第一次见面仍建议选择校园操场、公园等公共场所。这里不会共享你的精确位置。',
    status: 'ready',
    data: {
      taskId: input.taskId,
      activityId: input.activityId,
      candidateUserId: input.candidateUserId,
      realActivityPersisted: input.realActivityPersisted,
      loopStage: 'activity_confirmed',
      publicPlaceOnly: true,
      noPreciseLocation: true,
      safetyBoundary: '公共场所见面，不共享精确位置。',
    },
    actions: [
      {
        id: 'activity_check_in',
        label: '我已到达，签到',
        action: 'check_in',
        schemaAction: 'activity.check_in',
        loopStage: 'activity_confirmed',
        requiresConfirmation: false,
        payload: {
          taskId: input.taskId,
          activityId: input.activityId,
          candidateUserId: input.candidateUserId,
        },
      },
    ],
  };
}

export function buildSocialAgentActivityCompletionCard(input: {
  taskId: number;
  activityId: number | null;
  candidateUserId: number | null;
  realActivityPersisted: boolean;
  checkedInAt: string;
}): FitMeetAlphaCard {
  return {
    id: `activity_complete:${input.taskId}:${input.activityId ?? 'draft'}`,
    type: 'checkin_card',
    title: '已签到。活动结束后，告诉我是否完成。',
    body: '如果临时不舒服或现场环境不合适，可以直接取消，不需要勉强完成。',
    status: 'ready',
    data: {
      taskId: input.taskId,
      activityId: input.activityId,
      candidateUserId: input.candidateUserId,
      realActivityPersisted: input.realActivityPersisted,
      loopStage: 'activity_checked_in',
      checkedInAt: input.checkedInAt,
    },
    actions: [
      {
        id: 'activity_complete',
        label: '活动已完成',
        action: 'submit_review',
        schemaAction: 'activity.complete',
        loopStage: 'activity_checked_in',
        requiresConfirmation: false,
        payload: {
          taskId: input.taskId,
          activityId: input.activityId,
          candidateUserId: input.candidateUserId,
        },
      },
    ],
  };
}

export function buildSocialAgentReviewCard(input: {
  taskId: number;
  activityId: number | null;
  candidateUserId: number | null;
  realActivityPersisted: boolean;
}): FitMeetAlphaCard {
  return {
    id: `review_card:${input.taskId}:${input.activityId ?? 'draft'}`,
    type: 'review_card',
    title: '这次约练完成了吗？我可以帮你记录一个简短评价。',
    body: '评价会帮助我调整后续推荐，也会用于更新你的 Life Graph 和履约可信度。',
    status: 'ready',
    data: {
      taskId: input.taskId,
      activityId: input.activityId,
      candidateUserId: input.candidateUserId,
      realActivityPersisted: input.realActivityPersisted,
      loopStage: 'activity_completed',
      defaultRating: 5,
      lifeGraphUpdatePreview:
        '会记录你完成了一次低压力运动社交，并提高类似时间、地点和运动强度的推荐权重。',
      trustScoreUpdatePreview:
        '完成记录会提升你的履约可信度；正向评价会让后续推荐更相信这类搭子适合你。',
    },
    actions: [
      {
        id: 'review_submit',
        label: '提交评价',
        action: 'submit_review',
        schemaAction: 'review.submit',
        loopStage: 'activity_completed',
        requiresConfirmation: false,
        payload: {
          taskId: input.taskId,
          activityId: input.activityId,
          candidateUserId: input.candidateUserId,
          rating: 5,
          comment: '这次约练顺利完成，节奏比较轻松。',
        },
      },
    ],
  };
}

export function buildSocialAgentLifeGraphUpdateCard(input: {
  taskId: number;
  activityId: number | null;
  candidateUserId: number | null;
  realActivityPersisted: boolean;
  rating: number;
  comment: string;
  positive: boolean;
  trustScoreDelta: number;
}): FitMeetAlphaCard {
  return {
    id: `life_graph_update:${input.taskId}:${input.activityId ?? 'draft'}`,
    type: 'audit_update',
    title: '这次约练已经记录到你的 Life Graph。',
    body: '我会用这次真实完成和评价，优化之后推荐给你的运动搭子和活动时间。',
    status: 'completed',
    data: {
      taskId: input.taskId,
      activityId: input.activityId,
      candidateUserId: input.candidateUserId,
      realActivityPersisted: input.realActivityPersisted,
      loopStage: 'trust_score_updated',
      review: { rating: input.rating, comment: input.comment },
      lifeGraphUpdatePreview: input.positive
        ? '你近期更适合低压力运动社交；公共场所、轻松强度和相近活动区域的权重会提高。'
        : '我会降低这类候选和活动安排的权重，并优先寻找更合适的节奏。',
      trustScoreUpdatePreview: `本次完成记录会让履约可信度 +${input.trustScoreDelta}。`,
      canView: true,
      canCorrect: true,
      canRevoke: true,
    },
    actions: [
      {
        id: 'life_graph_accept_update',
        label: '保留这次更新',
        action: 'confirm_profile_update',
        schemaAction: 'life_graph.accept_update',
        loopStage: 'trust_score_updated',
        requiresConfirmation: false,
        payload: {
          taskId: input.taskId,
          activityId: input.activityId,
          candidateUserId: input.candidateUserId,
        },
      },
      {
        id: 'life_graph_reject_update',
        label: '不要用于推荐',
        action: 'confirm_profile_update',
        schemaAction: 'life_graph.reject_update',
        loopStage: 'trust_score_updated',
        requiresConfirmation: false,
        payload: {
          taskId: input.taskId,
          activityId: input.activityId,
          candidateUserId: input.candidateUserId,
        },
      },
    ],
  };
}

export function buildSocialAgentProofUploadPromptCard(input: {
  taskId: number;
  activityId: number | null;
  proofStatus?: string;
}): FitMeetAlphaCard {
  return {
    id: `activity_proof_prompt:${input.taskId}:${input.activityId ?? 'draft'}`,
    type: 'activity_status',
    title: '需要补充活动完成证明',
    body: '请在活动详情里上传场景照、签到或其他完成证明。证明只用于活动履约确认，不要求露脸。',
    status: 'ready',
    data: {
      taskId: input.taskId,
      activityId: input.activityId,
      status: 'proof_required',
      proofStatus: input.proofStatus ?? '待上传证明',
      proofPolicy: 'mutual_or_proof',
      safetyBoundary: '证明仅用于活动履约确认，不公开精确位置，不强制露脸。',
    },
    actions: [
      {
        id: 'activity_view_detail',
        label: '打开活动详情',
        action: 'view_activity',
        schemaAction: 'activity.view_detail',
        loopStage: 'activity_completed',
        requiresConfirmation: false,
        payload: {
          taskId: input.taskId,
          activityId: input.activityId,
        },
      },
    ],
  };
}

export function buildSocialAgentProofSubmittedCard(input: {
  taskId: number;
  activityId: number | null;
  proofId: number | null;
  proofType: string;
}): FitMeetAlphaCard {
  return {
    id: `activity_proof_submitted:${input.taskId}:${input.proofId ?? 'draft'}`,
    type: 'activity_status',
    title: '活动证明已提交',
    body: '证明已进入待确认状态。对方确认后，我会继续更新活动履约状态和 Life Graph 信号。',
    status: 'ready',
    data: {
      taskId: input.taskId,
      activityId: input.activityId,
      proofId: input.proofId,
      status: 'proof_submitted',
      proofStatus: '证明待对方确认',
      proofType: input.proofType,
    },
    actions: [
      {
        id: 'activity_view_detail',
        label: '查看证明状态',
        action: 'view_activity',
        schemaAction: 'activity.view_detail',
        loopStage: 'activity_completed',
        requiresConfirmation: false,
        payload: {
          taskId: input.taskId,
          activityId: input.activityId,
        },
      },
    ],
  };
}

export function buildSocialAgentActivityDetailCard(input: {
  taskId: number;
  activityId: number | null;
  activity?: Record<string, unknown> | null;
  proofs?: Record<string, unknown>[];
  unavailableReason?: string;
}): FitMeetAlphaCard {
  const activity = input.activity ?? {};
  const proofs = input.proofs ?? [];
  const status = cleanDisplayText(activity.status, '') || 'detail_unavailable';
  const proofStatus = socialAgentProofStatusText(proofs);
  return {
    id: `activity_detail:${input.taskId}:${input.activityId ?? 'draft'}`,
    type: 'activity_status',
    title:
      cleanDisplayText(activity.title, '') ||
      (input.unavailableReason ? '活动详情暂不可用' : '活动详情'),
    body:
      cleanDisplayText(activity.description, '') ||
      input.unavailableReason ||
      '这里会显示活动时间、地点、证明和履约进度。',
    status: status === 'detail_unavailable' ? 'blocked' : 'ready',
    data: {
      taskId: input.taskId,
      activityId: input.activityId,
      status,
      city: cleanDisplayText(activity.city, ''),
      locationName: cleanDisplayText(activity.locationName, ''),
      startTime: cleanDisplayText(activity.startTime, ''),
      endTime: cleanDisplayText(activity.endTime, ''),
      proofRequired: Boolean(activity.proofRequired),
      proofPolicy: cleanDisplayText(activity.proofPolicy, ''),
      proofStatus,
      proofCount: proofs.length,
      proofs: proofs.slice(0, 5),
      safetyBoundary:
        '活动详情只展示当前任务关联活动；精确位置由客户端隐私开关控制。',
    },
    actions: input.activityId
      ? [
          {
            id: 'activity_upload_proof',
            label: proofStatus === '还没有上传证明' ? '上传证明' : '补充证明',
            action: 'upload_proof',
            schemaAction: 'activity.upload_proof',
            loopStage: 'activity_completed',
            requiresConfirmation: false,
            payload: {
              taskId: input.taskId,
              activityId: input.activityId,
            },
          },
        ]
      : [],
  };
}

function socialAgentProofStatusText(proofs: Record<string, unknown>[]): string {
  if (proofs.length === 0) return '还没有上传证明';
  const accepted = proofs.filter((proof) => proof.status === 'accepted').length;
  if (accepted > 0) return `${accepted} 条证明已确认`;
  const pending = proofs.filter((proof) => proof.status === 'pending').length;
  if (pending > 0) return `${pending} 条证明待确认`;
  return `${proofs.length} 条证明需重新确认`;
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
    case 'activity.upload_proof':
      return '上传活动证明';
    case 'activity.view_detail':
      return '查看活动详情';
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
