import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ClarificationBinaryCard } from '../components/assistant-ui/tool-clarification-binary-card';
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

describe('ClarificationBinaryCard', () => {
  it('renders yes/no confirmation actions without implying auto publish', () => {
    const card: SchemaDrivenAssistantCard = {
      id: 'clarification:confirm_workout_intent:101',
      type: 'clarification_binary',
      schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
      schemaType: 'clarification.binary',
      title: '确认一下',
      body: '今晚在青岛大学附近跑步，对吗？',
      data: { taskId: 101, questionKey: 'confirm_workout_intent' },
      actions: [
        {
          id: 'yes',
          label: '是',
          action: 'clarification.yes',
          schemaAction: 'clarification.yes',
          requiresConfirmation: false,
          payload: { taskId: 101, questionKey: 'confirm_workout_intent' },
        },
        {
          id: 'no',
          label: '否',
          action: 'clarification.no',
          schemaAction: 'clarification.no',
          requiresConfirmation: false,
          payload: { taskId: 101, questionKey: 'confirm_workout_intent' },
        },
      ],
    };

    render(
      <FitMeetToolUIActionsProvider value={{}}>
        <ClarificationBinaryCard card={card} />
      </FitMeetToolUIActionsProvider>,
    );

    expect(screen.getByTestId('clarification-binary-card')).toBeInTheDocument();
    expect(screen.getByText('今晚在青岛大学附近跑步，对吗？')).toBeInTheDocument();
    expect(screen.getByText('点击后不会自动发布或联系任何人')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '是' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '否' })).toBeInTheDocument();
  });
});
