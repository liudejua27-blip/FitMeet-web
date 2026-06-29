import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { WorkoutIntakeCard } from '../components/assistant-ui/tool-workout-intake-card';
import { FitMeetToolUIActionsProvider } from '../components/assistant-ui/tool-ui-actions';
import {
  FITMEET_TOOL_UI_SCHEMA_VERSION,
  type SchemaDrivenAssistantCard,
} from '../components/assistant-ui/tool-ui-schema';

describe('WorkoutIntakeCard', () => {
  it('submits dynamic local form state as workout slots', async () => {
    const onCardAction = vi.fn().mockResolvedValue({ assistantMessage: '已生成约练卡' });
    const card: SchemaDrivenAssistantCard = {
      id: 'workout_intake:101:missing',
      type: 'workout_intake',
      schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
      schemaType: 'workout.intake',
      title: '填写本次约练需求',
      body: '补齐本次约练需要的信息即可生成约练卡。',
      data: {
        taskId: 101,
        missingFields: ['activityType', 'timePreference', 'locationText'],
      },
      actions: [],
    };

    render(
      <FitMeetToolUIActionsProvider value={{ onCardAction }}>
        <WorkoutIntakeCard card={card} />
      </FitMeetToolUIActionsProvider>,
    );

    fireEvent.change(screen.getByPlaceholderText('跑步 / 健身 / 羽毛球'), {
      target: { value: '羽毛球' },
    });
    fireEvent.change(screen.getByPlaceholderText('今晚 / 周末下午 / 明天晚上'), {
      target: { value: '周末下午' },
    });
    fireEvent.change(screen.getByPlaceholderText('青岛大学附近 / 五四广场'), {
      target: { value: '市北体育馆' },
    });
    fireEvent.change(screen.getByPlaceholderText('青岛'), {
      target: { value: '青岛' },
    });
    fireEvent.change(screen.getByPlaceholderText('3'), {
      target: { value: '5' },
    });
    fireEvent.click(screen.getByRole('button', { name: '生成约练卡' }));

    await waitFor(() => expect(onCardAction).toHaveBeenCalledTimes(1));
    expect(onCardAction).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 101,
        cardId: 'workout_intake:101:missing',
        action: 'workout_intake.submit',
        schemaAction: 'workout_intake.submit',
        payload: expect.objectContaining({
          slots: expect.objectContaining({
            activityType: '羽毛球',
            timePreference: '周末下午',
            locationText: '市北体育馆',
            city: '青岛',
            radiusKm: 5,
            visibilityPreference: 'public',
          }),
        }),
      }),
    );
  });
});
