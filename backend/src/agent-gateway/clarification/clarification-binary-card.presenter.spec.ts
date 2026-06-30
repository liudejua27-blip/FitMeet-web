import { buildClarificationBinaryCard } from './clarification-binary-card.presenter';

describe('buildClarificationBinaryCard', () => {
  it('builds a binary clarification card with yes/no schema actions', () => {
    const card = buildClarificationBinaryCard({
      taskId: 101,
      questionKey: 'confirm_workout_intent',
      body: '今晚在青岛大学附近跑步，对吗？',
      inferredIntent: 'workout',
      yesPatch: { activityType: '跑步' },
      noFallback: 'workout_intake',
      confidence: 0.82,
    });

    expect(card).toMatchObject({
      type: 'clarification_binary',
      schemaType: 'clarification.binary',
      status: 'waiting_confirmation',
      data: {
        schemaName: 'ClarificationBinaryCard',
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'clarification.binary',
        taskId: 101,
        questionKey: 'confirm_workout_intent',
        inferredIntent: 'workout',
        noFallback: 'workout_intake',
      },
    });
    expect(card.actions.map((action) => action.schemaAction)).toEqual([
      'clarification.yes',
      'clarification.no',
    ]);
  });
});
