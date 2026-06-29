import type { CreateSocialRequestDto } from '../../social-requests/dto/create-social-request.dto';
import type { FitMeetAlphaCard } from '../fitmeet-alpha-agent.types';
import type { TravelSlots } from './travel-loop.types';

export function buildTravelIntakeCard(input: {
  taskId: number;
  slots: TravelSlots;
  missing: string[];
  title?: string;
  body?: string;
}): FitMeetAlphaCard {
  const data = travelIntakeData(input.slots, input.missing);
  return {
    id: `travel_intake:${input.taskId}:${input.missing.join('-') || 'ready'}`,
    type: 'travel_intake',
    schemaVersion: 'fitmeet.tool-ui.v1',
    schemaType: 'travel.intake',
    title: input.title ?? '填写本次结伴旅行需求',
    body:
      input.body ??
      '先补齐目的地、出发时间、预算和交通方式，我会整理成寻伴旅行卡。',
    status: 'waiting_confirmation',
    data: {
      taskId: input.taskId,
      ...data,
    },
    actions: [
      {
        id: 'submit',
        label: '生成旅行寻伴卡',
        action: 'travel_intake.submit',
        schemaAction: 'travel_intake.submit',
        requiresConfirmation: false,
        payload: { taskId: input.taskId, slots: data },
      },
      {
        id: 'use_defaults',
        label: '使用默认安全设置',
        action: 'travel_intake.use_defaults',
        schemaAction: 'travel_intake.use_defaults',
        requiresConfirmation: false,
        payload: { taskId: input.taskId, slots: data },
      },
      {
        id: 'cancel',
        label: '取消',
        action: 'travel_intake.cancel',
        schemaAction: 'travel_intake.cancel',
        requiresConfirmation: false,
        payload: { taskId: input.taskId },
      },
    ],
  };
}

export function buildTravelDraftCard(input: {
  taskId: number;
  slots: TravelSlots;
  draft: CreateSocialRequestDto & { socialRequestId: number };
}): FitMeetAlphaCard {
  const title =
    input.draft.title ?? `${input.slots.destination ?? '目的地待定'}旅行寻伴卡`;
  const basePayload = {
    taskId: input.taskId,
    socialRequestId: input.draft.socialRequestId,
    slots: input.slots,
    socialRequestDraft: input.draft,
  };
  return {
    id: `travel_draft:${input.taskId}:${input.draft.socialRequestId}`,
    type: 'travel_companion_draft',
    schemaVersion: 'fitmeet.tool-ui.v1',
    schemaType: 'travel.companion_draft',
    title,
    body: '可以发布到发现，也可以不公开继续私密旅行搭子匹配；不会自动联系任何人。',
    status: 'waiting_confirmation',
    data: {
      taskId: input.taskId,
      socialRequestId: input.draft.socialRequestId,
      title,
      destination: input.slots.destination ?? '',
      departureTime: input.slots.departureTime ?? '',
      duration: input.slots.duration ?? null,
      budgetRange: input.slots.budgetRange ?? '',
      transportMode: input.slots.transportMode ?? '',
      tags: input.slots.tags ?? [],
      genderPreference: input.slots.genderPreference ?? null,
      photoPreference: input.slots.photoPreference ?? null,
      accommodationPreference: input.slots.accommodationPreference ?? null,
      foodPreference: input.slots.foodPreference ?? null,
      candidatePreference: input.slots.candidatePreference ?? null,
      safetyBoundary: input.slots.safetyBoundary ?? '',
      visibilityPreference: 'private',
      socialRequestDraft: input.draft,
    },
    actions: [
      {
        id: 'publish',
        label: '发布到发现',
        action: 'travel_draft.publish',
        schemaAction: 'travel_draft.publish',
        requiresConfirmation: true,
        payload: basePayload,
      },
      {
        id: 'private_match',
        label: '不公开，开始私密匹配',
        action: 'travel_draft.private_match',
        schemaAction: 'travel_draft.private_match',
        requiresConfirmation: false,
        payload: basePayload,
      },
      {
        id: 'edit',
        label: '修改',
        action: 'travel_draft.edit',
        schemaAction: 'travel_draft.edit',
        requiresConfirmation: false,
        payload: basePayload,
      },
      {
        id: 'cancel',
        label: '取消',
        action: 'travel_draft.cancel',
        schemaAction: 'travel_draft.cancel',
        requiresConfirmation: false,
        payload: basePayload,
      },
    ],
  };
}

function travelIntakeData(slots: TravelSlots, missing: string[]) {
  return {
    destination: slots.destination ?? null,
    departureTime: slots.departureTime ?? null,
    duration: slots.duration ?? null,
    budgetRange: slots.budgetRange ?? null,
    transportMode: slots.transportMode ?? null,
    tags: slots.tags ?? [],
    genderPreference: slots.genderPreference ?? null,
    photoPreference: slots.photoPreference ?? null,
    accommodationPreference: slots.accommodationPreference ?? null,
    foodPreference: slots.foodPreference ?? null,
    candidatePreference: slots.candidatePreference ?? null,
    safetyBoundary: slots.safetyBoundary ?? '',
    visibilityPreference: 'private',
    missingFields: missing,
  };
}
