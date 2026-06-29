import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ClarificationGeoCandidatesCard } from '../components/assistant-ui/tool-clarification-geo-candidates-card';
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

describe('ClarificationGeoCandidatesCard', () => {
  it('renders candidate locations and selection actions', () => {
    const card: SchemaDrivenAssistantCard = {
      id: 'clarification_geo:workout_location:101',
      type: 'clarification_geo_candidates',
      schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
      schemaType: 'clarification.geo_candidates',
      title: '选择约练地点',
      body: '我查到几个可能的地点，请选择这次约练的地点。',
      data: {
        taskId: 101,
        questionKey: 'workout_location',
        candidates: [
          {
            name: '成都远洋太古里',
            address: '成都市锦江区中纱帽街',
            city: '成都',
            district: '锦江区',
            confidence: 0.72,
          },
          {
            name: '三里屯太古里',
            address: '北京市朝阳区三里屯路',
            city: '北京',
            district: '朝阳区',
            confidence: 0.68,
          },
        ],
      },
      actions: [
        {
          id: 'select_1',
          label: '成都 · 锦江区 · 成都远洋太古里',
          action: 'clarification.select',
          schemaAction: 'clarification.select',
          requiresConfirmation: false,
          payload: {
            taskId: 101,
            questionKey: 'workout_location',
            selectedPatch: { city: '成都', district: '锦江区' },
          },
        },
        {
          id: 'manual',
          label: '都不是，我自己填写',
          action: 'clarification.no',
          schemaAction: 'clarification.no',
          requiresConfirmation: false,
          payload: { taskId: 101, questionKey: 'workout_location' },
        },
      ],
    };

    render(
      <FitMeetToolUIActionsProvider value={{}}>
        <ClarificationGeoCandidatesCard card={card} />
      </FitMeetToolUIActionsProvider>,
    );

    expect(screen.getByTestId('clarification-geo-candidates-card')).toBeInTheDocument();
    expect(screen.getAllByText('成都 · 锦江区 · 成都远洋太古里').length).toBeGreaterThan(0);
    expect(screen.getByText('北京 · 朝阳区 · 三里屯太古里')).toBeInTheDocument();
    expect(screen.getByText('72%')).toBeInTheDocument();
    expect(screen.getByText('选择地点不会自动发布或联系任何人')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: '成都 · 锦江区 · 成都远洋太古里',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '都不是，我自己填写' })).toBeInTheDocument();
  });
});
