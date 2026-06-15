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
      'create_activity',
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
