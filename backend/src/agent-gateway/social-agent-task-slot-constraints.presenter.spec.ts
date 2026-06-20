import { buildSocialAgentKnownTaskSlotConstraints } from './social-agent-task-slot-constraints.presenter';

describe('buildSocialAgentKnownTaskSlotConstraints', () => {
  it('keeps inferred slots as context but not as do-not-ask-again answers', () => {
    const constraints = buildSocialAgentKnownTaskSlotConstraints({
      activity: {
        key: 'activity',
        value: '散步',
        state: 'completed',
      },
      location_text: {
        key: 'location_text',
        value: '青岛大学附近',
        state: 'answered',
      },
      geo_area: {
        key: 'geo_area',
        value: '崂山区',
        state: 'inferred',
      },
      time_window: {
        key: 'time_window',
        value: '今晚',
        state: 'inferred',
      },
    });

    expect(constraints).toEqual(
      expect.objectContaining({
        treatAsHardConstraints: true,
        doNotAskAgainFor: ['activity', 'location_text'],
        instruction: expect.stringContaining(
          'state 为 inferred 的字段只能作为上下文线索',
        ),
      }),
    );
    expect(constraints?.knownSlots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'activity',
          value: '散步',
          confirmation: 'user_confirmed',
        }),
        expect.objectContaining({
          key: 'geo_area',
          value: '崂山区',
          confirmation: 'inferred_context',
        }),
        expect.objectContaining({
          key: 'time_window',
          value: '今晚',
          confirmation: 'inferred_context',
        }),
      ]),
    );
  });
});
