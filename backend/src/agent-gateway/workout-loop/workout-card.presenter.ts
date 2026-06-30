import type { CreateSocialRequestDto } from '../../social-requests/dto/create-social-request.dto';
import type { FitMeetAlphaCard } from '../fitmeet-alpha-agent.types';
import type { WorkoutSlots } from './workout-loop.types';

export function buildWorkoutIntakeCard(input: {
  taskId: number;
  slots: WorkoutSlots;
  missing: string[];
  title?: string;
  body?: string;
}): FitMeetAlphaCard {
  const data = workoutIntakeData(input.slots, input.missing);
  return {
    id: `workout_intake:${input.taskId}:${input.missing.join('-') || 'ready'}`,
    type: 'workout_intake',
    schemaVersion: 'fitmeet.tool-ui.v1',
    schemaType: 'workout.intake',
    title: input.title ?? '填写本次约练需求',
    body:
      input.body ??
      '补齐本次约练需要的信息即可生成约练卡；资料不完整也可以继续。',
    status: 'waiting_confirmation',
    data: {
      schemaName: 'WorkoutIntakeCard',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'workout.intake',
      taskId: input.taskId,
      ...data,
    },
    actions: [
      {
        id: 'submit',
        label: '生成约练卡',
        action: 'workout_intake.submit',
        schemaAction: 'workout_intake.submit',
        requiresConfirmation: false,
        payload: {
          taskId: input.taskId,
          slots: data,
        },
      },
      {
        id: 'use_defaults',
        label: '使用默认设置',
        action: 'workout_intake.use_defaults',
        schemaAction: 'workout_intake.use_defaults',
        requiresConfirmation: false,
        payload: {
          taskId: input.taskId,
          slots: data,
        },
      },
      {
        id: 'cancel',
        label: '取消',
        action: 'workout_intake.cancel',
        schemaAction: 'workout_intake.cancel',
        requiresConfirmation: false,
        payload: {
          taskId: input.taskId,
        },
      },
    ],
  };
}

export function buildWorkoutDraftCard(input: {
  taskId: number;
  slots: WorkoutSlots;
  draft: CreateSocialRequestDto & { socialRequestId: number };
}): FitMeetAlphaCard {
  const locationText = input.slots.locationText ?? input.slots.city ?? '';
  const title =
    input.draft.title ??
    `${input.slots.timePreference ?? '近期'}${locationText}${input.slots.activityType ?? '运动'}约练`;
  const basePayload = {
    taskId: input.taskId,
    socialRequestId: input.draft.socialRequestId,
    slots: input.slots,
    socialRequestDraft: input.draft,
  };
  return {
    id: `workout_draft:${input.taskId}:${input.draft.socialRequestId}`,
    type: 'workout_draft',
    schemaVersion: 'fitmeet.tool-ui.v1',
    schemaType: 'workout.draft',
    title,
    body: '确认后再发布；不会自动公开精确位置、联系方式或触达任何人。',
    status: 'waiting_confirmation',
    data: {
      schemaName: 'WorkoutDraftCard',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'workout.draft',
      taskId: input.taskId,
      socialRequestId: input.draft.socialRequestId,
      title,
      activityType: input.slots.activityType ?? '',
      timePreference: input.slots.timePreference ?? '',
      locationText,
      city: input.slots.city ?? null,
      radiusKm: input.slots.radiusKm ?? 3,
      intensity: input.slots.intensity ?? null,
      candidatePreference: input.slots.candidatePreference ?? null,
      district: input.slots.district ?? null,
      poiName: input.slots.poiName ?? null,
      lat: input.slots.lat ?? null,
      lng: input.slots.lng ?? null,
      geoResolution: input.slots.geoResolution ?? null,
      safetyBoundary: input.slots.safetyBoundary ?? '',
      visibilityPreference: input.slots.visibilityPreference ?? 'public',
      socialRequestDraft: input.draft,
    },
    actions: [
      {
        id: 'publish',
        label: '发布到发现',
        action: 'workout_draft.publish',
        schemaAction: 'workout_draft.publish',
        requiresConfirmation: true,
        payload: basePayload,
      },
      {
        id: 'private_match',
        label: '不公开，继续私密匹配',
        action: 'workout_draft.private_match',
        schemaAction: 'workout_draft.private_match',
        requiresConfirmation: false,
        payload: basePayload,
      },
      {
        id: 'edit',
        label: '修改',
        action: 'workout_draft.edit',
        schemaAction: 'workout_draft.edit',
        requiresConfirmation: false,
        payload: basePayload,
      },
      {
        id: 'cancel',
        label: '取消',
        action: 'workout_draft.cancel',
        schemaAction: 'workout_draft.cancel',
        requiresConfirmation: false,
        payload: basePayload,
      },
    ],
  };
}

function workoutIntakeData(slots: WorkoutSlots, missing: string[]) {
  return {
    activityType: slots.activityType ?? null,
    timePreference: slots.timePreference ?? null,
    locationText: slots.locationText ?? null,
    city: slots.city ?? null,
    district: slots.district ?? null,
    poiName: slots.poiName ?? null,
    lat: slots.lat ?? null,
    lng: slots.lng ?? null,
    geoResolution: slots.geoResolution ?? null,
    radiusKm: slots.radiusKm ?? 3,
    intensity: slots.intensity ?? null,
    candidatePreference: slots.candidatePreference ?? null,
    safetyBoundary: slots.safetyBoundary ?? '',
    visibilityPreference: slots.visibilityPreference ?? 'public',
    missingFields: missing,
  };
}
