import type { CreateSocialRequestDto } from '../../social-requests/dto/create-social-request.dto';
import type { FitMeetAlphaCard } from '../fitmeet-alpha-agent.types';
import type { FriendSlots } from './friend-loop.types';

export function buildFriendIntakeCard(input: {
  taskId: number;
  slots: FriendSlots;
  missing: string[];
  title?: string;
  body?: string;
}): FitMeetAlphaCard {
  const data = friendIntakeData(input.slots, input.missing);
  return {
    id: `friend_intake:${input.taskId}:${input.missing.join('-') || 'ready'}`,
    type: 'friend_intake',
    schemaVersion: 'fitmeet.tool-ui.v1',
    schemaType: 'friend.intake',
    title: input.title ?? '填写本次交友需求',
    body:
      input.body ??
      '先补齐目标和城市，我会整理成交友卡；资料不完整也可以继续。',
    status: 'waiting_confirmation',
    data: {
      taskId: input.taskId,
      ...data,
    },
    actions: [
      {
        id: 'submit',
        label: '生成交友卡',
        action: 'friend_intake.submit',
        schemaAction: 'friend_intake.submit',
        requiresConfirmation: false,
        payload: { taskId: input.taskId, slots: data },
      },
      {
        id: 'use_defaults',
        label: '使用默认安全设置',
        action: 'friend_intake.use_defaults',
        schemaAction: 'friend_intake.use_defaults',
        requiresConfirmation: false,
        payload: { taskId: input.taskId, slots: data },
      },
      {
        id: 'cancel',
        label: '取消',
        action: 'friend_intake.cancel',
        schemaAction: 'friend_intake.cancel',
        requiresConfirmation: false,
        payload: { taskId: input.taskId },
      },
    ],
  };
}

export function buildFriendDraftCard(input: {
  taskId: number;
  slots: FriendSlots;
  draft: CreateSocialRequestDto & { socialRequestId: number };
}): FitMeetAlphaCard {
  const title =
    input.draft.title ??
    `${input.slots.city ?? '同城'}${input.slots.friendGoal ?? '交友'}卡`;
  const basePayload = {
    taskId: input.taskId,
    socialRequestId: input.draft.socialRequestId,
    slots: input.slots,
    socialRequestDraft: input.draft,
  };
  return {
    id: `friend_draft:${input.taskId}:${input.draft.socialRequestId}`,
    type: 'friend_draft',
    schemaVersion: 'fitmeet.tool-ui.v1',
    schemaType: 'friend.draft',
    title,
    body: '确认后进入私密匹配；不会发布到发现页，也不会自动联系任何人。',
    status: 'waiting_confirmation',
    data: {
      taskId: input.taskId,
      socialRequestId: input.draft.socialRequestId,
      title,
      friendGoal: input.slots.friendGoal ?? '',
      city: input.slots.city ?? null,
      topicTags: input.slots.topicTags ?? [],
      scenePreference: input.slots.scenePreference ?? null,
      timePreference: input.slots.timePreference ?? null,
      candidatePreference: input.slots.candidatePreference ?? null,
      safetyBoundary: input.slots.safetyBoundary ?? '',
      visibilityPreference: 'private',
      socialRequestDraft: input.draft,
    },
    actions: [
      {
        id: 'private_match',
        label: '不公开，开始私密匹配',
        action: 'friend_draft.private_match',
        schemaAction: 'friend_draft.private_match',
        requiresConfirmation: false,
        payload: basePayload,
      },
      {
        id: 'edit',
        label: '修改',
        action: 'friend_draft.edit',
        schemaAction: 'friend_draft.edit',
        requiresConfirmation: false,
        payload: basePayload,
      },
      {
        id: 'cancel',
        label: '取消',
        action: 'friend_draft.cancel',
        schemaAction: 'friend_draft.cancel',
        requiresConfirmation: false,
        payload: basePayload,
      },
    ],
  };
}

function friendIntakeData(slots: FriendSlots, missing: string[]) {
  return {
    friendGoal: slots.friendGoal ?? null,
    city: slots.city ?? null,
    topicTags: slots.topicTags ?? [],
    scenePreference: slots.scenePreference ?? null,
    timePreference: slots.timePreference ?? null,
    candidatePreference: slots.candidatePreference ?? null,
    safetyBoundary: slots.safetyBoundary ?? '',
    visibilityPreference: 'private',
    missingFields: missing,
  };
}
