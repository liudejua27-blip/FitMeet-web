import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { WorkoutDraftCard } from '../components/assistant-ui/tool-workout-draft-card';
import { FitMeetToolUIActionsProvider } from '../components/assistant-ui/tool-ui-actions';
import {
  FITMEET_TOOL_UI_SCHEMA_VERSION,
  type SchemaDrivenAssistantCard,
} from '../components/assistant-ui/tool-ui-schema';

vi.mock('@assistant-ui/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@assistant-ui/react')>();
  return {
    ...actual,
    useAuiState: (
      selector: (state: {
        message: { id: string; metadata: { custom: Record<string, unknown> } };
        thread: { isRunning: boolean };
      }) => unknown,
    ) =>
      selector({
        message: { id: 'test-message', metadata: { custom: {} } },
        thread: { isRunning: false },
      }),
  };
});

describe('WorkoutDraftCard', () => {
  it('requires local inline confirmation before publishing workout draft', async () => {
    const onCardAction = vi.fn().mockResolvedValue({
      assistantMessage: '已发布到发现页，并进入约练匹配队列。',
      cards: [],
    });
    const card: SchemaDrivenAssistantCard = {
      id: 'workout_draft:101:501',
      type: 'workout_draft',
      schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
      schemaType: 'workout.draft',
      title: '今晚青岛大学附近跑步约练',
      body: '确认后再发布。',
      data: {
        taskId: 101,
        socialRequestId: 501,
        activityType: '跑步',
        timePreference: '今晚',
        locationText: '青岛大学附近',
        radiusKm: 3,
        safetyBoundary: '公共场所、站内沟通',
      },
      actions: [
        {
          id: 'publish',
          label: '发布到发现',
          action: 'workout_draft.publish',
          schemaAction: 'workout_draft.publish',
          requiresConfirmation: true,
          payload: {
            taskId: 101,
            socialRequestId: 501,
            socialRequestDraft: { title: '今晚青岛大学附近跑步约练' },
          },
        },
        {
          id: 'private_match',
          label: '不公开，先保存',
          action: 'workout_draft.private_match',
          schemaAction: 'workout_draft.private_match',
          requiresConfirmation: false,
          payload: { taskId: 101, socialRequestId: 501 },
        },
      ],
    };

    render(
      <FitMeetToolUIActionsProvider value={{ onCardAction }}>
        <WorkoutDraftCard card={card} />
      </FitMeetToolUIActionsProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '发布到发现' }));

    expect(screen.getByText('确认发布到发现')).toBeInTheDocument();
    expect(onCardAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '确认发布' }));

    await waitFor(() => expect(onCardAction).toHaveBeenCalledTimes(1));
    expect(onCardAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'workout_draft.publish',
        schemaAction: 'workout_draft.publish',
        payload: expect.objectContaining({
          socialRequestId: 501,
          confirmedPublish: true,
          approved: true,
          confirmed: true,
        }),
      }),
    );
  });
});
