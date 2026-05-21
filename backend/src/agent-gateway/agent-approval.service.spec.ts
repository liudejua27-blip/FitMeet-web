import { AgentApprovalService } from './agent-approval.service';
import {
  ApprovalRiskLevel,
  ApprovalType,
} from './entities/agent-approval-request.entity';
import {
  AgentSettings,
  AgentSettingsMode,
} from './entities/agent-settings.entity';

function makeSettings(overrides: Partial<AgentSettings> = {}): AgentSettings {
  return {
    id: 1,
    userId: 1,
    agentConnectionId: null,
    mode: AgentSettingsMode.Open,
    allowSearch: true,
    allowDraftMessage: true,
    allowSendMessage: true,
    allowAutoReply: true,
    allowCreateActivity: true,
    allowJoinActivity: true,
    allowShareLocation: true,
    allowUploadProof: true,
    allowContactExchange: true,
    maxDailyMessages: 20,
    requireApprovalForFirstMessage: false,
    requireApprovalForOfflineMeeting: false,
    requireApprovalForPhotoUpload: false,
    requireApprovalForAll: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  } as AgentSettings;
}

function makeService() {
  return new AgentApprovalService({} as never, {} as never, {} as never);
}

describe('AgentApprovalService classify', () => {
  it('allows low-risk send_message in open mode', () => {
    const result = makeService().classify({
      type: ApprovalType.SendMessage,
      payload: { toUserId: 2, text: 'hello' },
      settings: makeSettings({ mode: AgentSettingsMode.Open }),
    });

    expect(result).toMatchObject({
      requiresApproval: false,
      blocked: false,
      riskLevel: ApprovalRiskLevel.Low,
    });
    expect(result.reasons).toContain('auto_execute_allowed_by_open');
  });

  it('requires approval for send_message in basic mode', () => {
    const result = makeService().classify({
      type: ApprovalType.SendMessage,
      payload: { toUserId: 2, text: 'hello' },
      settings: makeSettings({ mode: AgentSettingsMode.Basic }),
    });

    expect(result.requiresApproval).toBe(true);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        'approval_required_by_permission_engine',
        'basic_mode_blocks_auto_send',
      ]),
    );
  });

  it('gates add friend by mode instead of treating it as contact exchange', () => {
    const open = makeService().classify({
      type: ApprovalType.ContactRequest,
      payload: { targetUserId: 2 },
      settings: makeSettings({ mode: AgentSettingsMode.Open }),
    });
    const basic = makeService().classify({
      type: ApprovalType.ContactRequest,
      payload: { targetUserId: 2 },
      settings: makeSettings({ mode: AgentSettingsMode.Basic }),
    });

    expect(open.requiresApproval).toBe(false);
    expect(open.riskLevel).toBe(ApprovalRiskLevel.Medium);
    expect(basic.requiresApproval).toBe(true);
  });

  it('always requires approval for contact exchange, offline meeting, and payment', () => {
    for (const type of [
      ApprovalType.ContactExchange,
      ApprovalType.OfflineMeeting,
      ApprovalType.Payment,
    ]) {
      const result = makeService().classify({
        type,
        payload: { targetUserId: 2 },
        settings: makeSettings({ mode: AgentSettingsMode.Open }),
      });

      expect(result.requiresApproval).toBe(true);
      expect(result.riskLevel).toBe(ApprovalRiskLevel.High);
      expect(result.reasons).toContain(
        'approval_required_by_permission_engine',
      );
    }
  });

  it('requires activity invites to have confirmation or a recorded permission source', () => {
    const result = makeService().classify({
      type: ApprovalType.JoinActivity,
      payload: { activityId: 33, targetUserId: 2 },
      settings: makeSettings({ mode: AgentSettingsMode.Open }),
    });

    expect(result.requiresApproval).toBe(true);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        'approval_required_by_permission_engine',
        'activity_invite_requires_approval_or_permission_source',
      ]),
    );
  });
});
