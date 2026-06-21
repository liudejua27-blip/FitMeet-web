import { AgentCardAssemblerService } from './agent-card-assembler.service';
import type { FitMeetAlphaCard } from '../fitmeet-alpha-agent.types';

describe('AgentCardAssemblerService', () => {
  it('keeps connect_candidate as an explicit high-risk candidate connection action', () => {
    const [card] = new AgentCardAssemblerService().assemble([
      cardWithActions([
        {
          id: 'connect',
          label: '加好友并聊天',
          action: 'connect_candidate',
          requiresConfirmation: true,
          payload: { targetUserId: 22 },
        },
        {
          id: 'save',
          label: '收藏',
          action: 'save_candidate',
          requiresConfirmation: false,
          payload: { targetUserId: 22 },
        },
      ]),
    ]);

    expect(card.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'connect',
          schemaAction: 'candidate.connect',
          requiresConfirmation: true,
        }),
        expect.objectContaining({
          id: 'save',
          schemaAction: 'candidate.like',
          requiresConfirmation: false,
        }),
      ]),
    );
  });

  it('does not turn unknown legacy actions into executable recommendation actions', () => {
    const [card] = new AgentCardAssemblerService().assemble([
      cardWithActions([
        {
          id: 'unknown',
          label: '执行未知动作',
          action: 'legacy_unknown_action' as never,
          requiresConfirmation: false,
          payload: { debug: true },
        },
      ]),
    ]);

    expect(card.actions[0]).toMatchObject({
      id: 'unknown',
      label: '执行未知动作',
      action: 'legacy_unknown_action',
      requiresConfirmation: false,
    });
    expect(card.actions[0].schemaAction).toBeUndefined();
    expect(JSON.stringify(card)).not.toContain('debug');
  });

  it('dedupes replayed cards by stable product identity', () => {
    const cards = new AgentCardAssemblerService().assemble([
      cardWithActions([], {
        id: 'opportunity-qdu-v1',
        type: 'activity_plan',
        schemaType: 'social_match.activity',
        data: { taskId: 88, opportunityId: 'qdu-walk-tonight' },
      }),
      cardWithActions([], {
        id: 'opportunity-qdu-v2-replay',
        type: 'activity_plan',
        schemaType: 'social_match.activity',
        data: { taskId: 88, opportunity: { id: 'qdu-walk-tonight' } },
      }),
      cardWithActions([], {
        id: 'approval-send-1',
        type: 'safety_boundary',
        schemaType: 'safety.approval',
        data: { approvalId: 9001, actionType: 'send_invite' },
      }),
      cardWithActions([], {
        id: 'approval-send-replayed',
        type: 'safety_boundary',
        schemaType: 'safety.approval',
        data: { approval: { id: 9001, actionType: 'send_invite' } },
      }),
      cardWithActions([], {
        id: 'candidate-send-1',
        type: 'safety_boundary',
        schemaType: 'safety.approval',
        data: { candidateRecordId: 501, actionType: 'send_invite' },
      }),
      cardWithActions([], {
        id: 'candidate-send-replayed',
        type: 'safety_boundary',
        schemaType: 'safety.approval',
        data: { candidateRecordId: 501, actionType: 'send_invite' },
      }),
      cardWithActions([], {
        id: 'candidate-connect-1',
        type: 'safety_boundary',
        schemaType: 'safety.approval',
        data: { candidateRecordId: 501, actionType: 'connect_candidate' },
      }),
    ]);

    expect(cards.map((card) => card.id)).toEqual([
      'opportunity-qdu-v1',
      'approval-send-1',
      'candidate-send-1',
      'candidate-connect-1',
    ]);
  });
});

function cardWithActions(
  actions: FitMeetAlphaCard['actions'],
  overrides: Partial<FitMeetAlphaCard> = {},
): FitMeetAlphaCard {
  return {
    id: 'candidate-1',
    type: 'candidate_card',
    schemaVersion: 'fitmeet.tool-ui.v1',
    schemaType: 'social_match.candidate',
    title: '候选人',
    status: 'ready',
    actions,
    ...overrides,
    data: {
      schemaName: 'CandidateCard',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'social_match.candidate',
      traceId: 'trace-hidden',
      ...(overrides.data ?? {}),
    },
  };
}
