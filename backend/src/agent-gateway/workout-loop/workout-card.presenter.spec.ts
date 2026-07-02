import { SocialRequestType } from '../../social-requests/social-request.entity';
import {
  buildWorkoutDraftCard,
  buildWorkoutIntakeCard,
} from './workout-card.presenter';

describe('workout card presenters', () => {
  it('builds intake cards with submit/default/cancel actions', () => {
    const card = buildWorkoutIntakeCard({
      taskId: 101,
      slots: { activityType: '跑步', radiusKm: 3 },
      missing: ['timePreference', 'locationText'],
    });

    expect(card).toMatchObject({
      type: 'workout_intake',
      schemaType: 'workout.intake',
      data: {
        schemaName: 'WorkoutIntakeCard',
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'workout.intake',
        taskId: 101,
        activityType: '跑步',
        missingFields: ['timePreference', 'locationText'],
      },
    });
    expect(card.actions.map((action) => action.schemaAction)).toEqual([
      'workout_intake.submit',
      'workout_intake.use_defaults',
      'workout_intake.cancel',
    ]);
  });

  it('builds draft cards with socialRequestId on publish payload', () => {
    const card = buildWorkoutDraftCard({
      taskId: 101,
      slots: {
        activityType: '跑步',
        timePreference: '今晚',
        locationText: '青岛大学附近',
        radiusKm: 3,
        safetyBoundary: '公共场所',
      },
      draft: {
        socialRequestId: 501,
        type: SocialRequestType.RunningPartner,
        title: '今晚青岛大学附近跑步约练',
        description: '一起跑步',
      },
    });

    expect(card).toMatchObject({
      type: 'workout_draft',
      schemaType: 'workout.draft',
      data: {
        schemaName: 'WorkoutDraftCard',
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'workout.draft',
        taskId: 101,
        socialRequestId: 501,
      },
    });
    expect(card.actions[0]).toMatchObject({
      schemaAction: 'workout_draft.publish',
      requiresConfirmation: true,
      payload: expect.objectContaining({ socialRequestId: 501 }),
    });
  });
});
