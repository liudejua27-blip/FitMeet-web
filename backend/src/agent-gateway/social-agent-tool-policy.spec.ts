import { SocialAgentAction } from './agent-permission.service';
import {
  AgentActionRiskLevel,
  AgentActionType,
} from './entities/agent-action-log.entity';
import {
  ApprovalRiskLevel,
  ApprovalType,
} from './entities/agent-approval-request.entity';
import { AgentTaskPermissionMode } from './entities/agent-task.entity';
import {
  buildSocialAgentToolApprovalSummary,
  getSocialAgentPermissionActionForTool,
  getSocialAgentToolActionType,
  getSocialAgentToolApprovalRiskLevel,
  getSocialAgentToolApprovalType,
  getSocialAgentToolRiskLevel,
  getSocialAgentToolSceneActionType,
  isConfirmableSocialAgentTool,
  shouldWriteSocialAgentActionResultInbox,
  SOCIAL_AGENT_HIGH_RISK_TOOL_DAILY_LIMITS,
} from './social-agent-tool-policy';
import { SocialAgentToolName } from './social-agent-tool.types';
import { SceneRiskPolicyResult } from './scene-risk-policy.service';

const policy = (
  overrides: Partial<SceneRiskPolicyResult> = {},
): SceneRiskPolicyResult => ({
  riskLevel: 'high',
  requiresConfirmation: true,
  requiresDoubleConfirmation: false,
  blockedActions: [],
  safetyPrompts: [],
  sceneType: 'fitness',
  actionType: 'offline_meeting',
  permissionMode: 'manual_confirm',
  ...overrides,
});

describe('social agent tool policy', () => {
  it('keeps high-risk social actions confirmable and rate limited', () => {
    expect(
      isConfirmableSocialAgentTool(SocialAgentToolName.OfflineMeeting),
    ).toBe(true);
    expect(isConfirmableSocialAgentTool(SocialAgentToolName.Payment)).toBe(
      true,
    );
    expect(
      SOCIAL_AGENT_HIGH_RISK_TOOL_DAILY_LIMITS[
        SocialAgentToolName.OfflineMeeting
      ],
    ).toBe(3);
    expect(
      SOCIAL_AGENT_HIGH_RISK_TOOL_DAILY_LIMITS[SocialAgentToolName.Payment],
    ).toBe(3);
  });

  it('maps approval policy into concrete approval contracts', () => {
    expect(
      getSocialAgentToolApprovalType(
        SocialAgentToolName.ShareLocation,
        policy({ actionType: 'precise_location', riskLevel: 'critical' }),
      ),
    ).toBe(ApprovalType.ShareLocation);
    expect(
      getSocialAgentToolApprovalType(
        SocialAgentToolName.OfflineMeeting,
        policy(),
      ),
    ).toBe(ApprovalType.OfflineMeeting);
    expect(getSocialAgentToolApprovalRiskLevel('critical')).toBe(
      ApprovalRiskLevel.High,
    );
    expect(
      buildSocialAgentToolApprovalSummary(
        SocialAgentToolName.OfflineMeeting,
        policy({ requiresDoubleConfirmation: true }),
      ),
    ).toContain('需要双确认');
  });

  it('keeps executor audit action and risk mappings explicit', () => {
    expect(getSocialAgentToolActionType(SocialAgentToolName.SendMessage)).toBe(
      AgentActionType.SendMessage,
    );
    expect(getSocialAgentToolActionType(SocialAgentToolName.Payment)).toBe(
      AgentActionType.Payment,
    );
    expect(getSocialAgentToolRiskLevel(SocialAgentToolName.Payment)).toBe(
      AgentActionRiskLevel.High,
    );
    expect(getSocialAgentToolRiskLevel(SocialAgentToolName.SearchMatches)).toBe(
      AgentActionRiskLevel.Low,
    );
    expect(
      shouldWriteSocialAgentActionResultInbox(SocialAgentToolName.SendMessage),
    ).toBe(true);
    expect(
      shouldWriteSocialAgentActionResultInbox(SocialAgentToolName.GetMyProfile),
    ).toBe(false);
  });

  it('maps planner permissions and scene action types without executor state', () => {
    expect(
      getSocialAgentPermissionActionForTool(
        AgentTaskPermissionMode.LimitedAuto,
        SocialAgentToolName.InviteActivity,
      ),
    ).toBe(SocialAgentAction.OfflineMeet);
    expect(
      getSocialAgentPermissionActionForTool(
        AgentTaskPermissionMode.Confirm,
        SocialAgentToolName.InviteActivity,
      ),
    ).toBe(SocialAgentAction.SendInvite);
    expect(
      getSocialAgentToolSceneActionType(SocialAgentToolName.ShareLocation),
    ).toBe('share_location');
  });
});
