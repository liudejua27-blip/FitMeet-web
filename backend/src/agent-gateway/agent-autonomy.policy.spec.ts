import { ApprovalRiskLevel } from './entities/agent-approval-request.entity';
import { AgentSettingsMode } from './entities/agent-settings.entity';
import { canAutoExecute, type AgentAutoActionType } from './agent-autonomy.policy';

describe('agent autonomy policy', () => {
  it('never auto-executes high-risk social side effects in any autonomy mode', () => {
    const highRiskActions: AgentAutoActionType[] = [
      'send_message',
      'add_friend',
      'contact_exchange',
      'invite_activity',
      'publish_social_request',
      'send_invite',
      'send_candidate_message',
      'create_activity',
      'connect_candidate',
      'exchange_contact',
      'reveal_precise_location',
      'update_sensitive_profile',
      'life_graph_writeback',
      'invite_candidate',
      'offline_meeting',
      'payment',
    ];

    for (const action of highRiskActions) {
      for (const mode of [
        AgentSettingsMode.Normal,
        AgentSettingsMode.Standard,
        AgentSettingsMode.Open,
        'normal',
        'open',
      ] as const) {
        expect(canAutoExecute(action, mode, 'low')).toBe(false);
        expect(canAutoExecute(action, mode, ApprovalRiskLevel.Medium)).toBe(
          false,
        );
      }
    }
  });

  it('still allows low-risk intelligence work without side effects', () => {
    expect(canAutoExecute('recommend_candidate', AgentSettingsMode.Open, 'low')).toBe(
      true,
    );
    expect(canAutoExecute('generate_invite', AgentSettingsMode.Normal, 'low')).toBe(
      true,
    );
    expect(
      canAutoExecute('create_activity_draft', AgentSettingsMode.Open, 'low'),
    ).toBe(true);
  });
});
