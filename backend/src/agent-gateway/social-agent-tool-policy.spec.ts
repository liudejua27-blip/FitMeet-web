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
  requiresMandatorySocialAgentApproval,
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
    expect(getSocialAgentToolRiskLevel(SocialAgentToolName.SaveCandidate)).toBe(
      AgentActionRiskLevel.Low,
    );
    expect(getSocialAgentToolRiskLevel(SocialAgentToolName.DraftOpener)).toBe(
      AgentActionRiskLevel.Low,
    );
    expect(getSocialAgentToolRiskLevel(SocialAgentToolName.PublishSocialRequest)).toBe(
      AgentActionRiskLevel.Medium,
    );
    expect(getSocialAgentToolRiskLevel(SocialAgentToolName.SendMessageToCandidate)).toBe(
      AgentActionRiskLevel.Medium,
    );
    expect(getSocialAgentToolRiskLevel(SocialAgentToolName.ConnectCandidate)).toBe(
      AgentActionRiskLevel.Medium,
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

  it('requires mandatory approval for launch-critical side effects', () => {
    const approvalRequiredCases: Array<
      [SocialAgentToolName, Record<string, unknown>]
    > = [
      [SocialAgentToolName.SendMessage, {}],
      [SocialAgentToolName.SendMessageToCandidate, {}],
      [SocialAgentToolName.ReplyMessage, {}],
      [SocialAgentToolName.ConnectCandidate, {}],
      [SocialAgentToolName.AddFriend, {}],
      [SocialAgentToolName.CreateActivity, {}],
      [SocialAgentToolName.InviteActivity, {}],
      [SocialAgentToolName.JoinActivity, {}],
      [SocialAgentToolName.OfflineMeeting, {}],
      [SocialAgentToolName.ShareLocation, {}],
      [SocialAgentToolName.Payment, {}],
      [SocialAgentToolName.PublishSocialRequest, {}],
      [SocialAgentToolName.CreateSocialRequest, { publish: true }],
      [SocialAgentToolName.CreateSocialRequest, { publish: 'true' }],
      [SocialAgentToolName.CreateSocialRequest, { isPublic: true }],
      [SocialAgentToolName.CreateSocialRequest, { public: true }],
      [SocialAgentToolName.CreateSocialRequest, { mode: 'public' }],
      [SocialAgentToolName.CreateSocialRequest, { visibility: 'public' }],
      [SocialAgentToolName.CreateSocialRequest, { audience: 'everyone' }],
      [SocialAgentToolName.CreateSocialRequest, { publiclyVisible: true }],
      [SocialAgentToolName.CreateSocialRequest, { discoverable: true }],
      [SocialAgentToolName.CreateSocialRequest, { profileDiscoverable: true }],
      [SocialAgentToolName.CreateSocialRequest, { agentCanRecommendMe: true }],
      [SocialAgentToolName.CreateSocialRequest, { agentMatchingEnabled: true }],
      [SocialAgentToolName.CreateSocialRequest, { recommendationOptIn: true }],
      [
        SocialAgentToolName.CreateSocialRequest,
        { strangerRecommendationOptIn: true },
      ],
      [SocialAgentToolName.CreateSocialRequest, { publicIntentEnabled: true }],
      [SocialAgentToolName.CreateSocialRequest, { visibility: 'discoverable' }],
      [SocialAgentToolName.CreateSocialRequest, { discoverability: 'recommendable' }],
      [
        SocialAgentToolName.CreateSocialRequest,
        { mode: 'public_discoverable' },
      ],
      [
        SocialAgentToolName.UpdateAiProfileFromAnswers,
        { fields: { privacyBoundary: '仅熟人可见' } },
      ],
      [
        SocialAgentToolName.UpdateProfileFromAgentContext,
        { patch: { phone: '15253005312' } },
      ],
      [
        SocialAgentToolName.UpdateProfileFromAgentContext,
        { patch: { profileDiscoverable: true, agentCanRecommendMe: true } },
      ],
      [
        SocialAgentToolName.UpdateProfileFromAgentContext,
        { patch: { profile_discoverable: true, agent_can_recommend_me: true } },
      ],
      [
        SocialAgentToolName.UpdateProfileFromAgentContext,
        { patch: { 'share-precise-location': true } },
      ],
      [
        SocialAgentToolName.UpdateAiProfileFromAnswers,
        { answers: [{ field: 'visibility', value: 'public' }] },
      ],
      [
        SocialAgentToolName.UpdateAiProfileFromAnswers,
        { answers: [{ field: 'privacy_boundary', value: '不公开联系方式' }] },
      ],
      [
        SocialAgentToolName.UpdateAiProfileFromAnswers,
        { answers: [{ path: ['visibility', 'agent_can_recommend_me'], value: true }] },
      ],
      [
        SocialAgentToolName.UpdateAiProfileFromAnswers,
        { metadata: { strangerRecommendationOptIn: true } },
      ],
      [
        SocialAgentToolName.UpdateAiProfileFromAnswers,
        { metadata: { stranger_recommendation_opt_in: true } },
      ],
    ];

    for (const [toolName, input] of approvalRequiredCases) {
      expect(requiresMandatorySocialAgentApproval(toolName, input)).toBe(true);
    }

    expect(
      requiresMandatorySocialAgentApproval(SocialAgentToolName.SearchMatches),
    ).toBe(false);
    expect(
      requiresMandatorySocialAgentApproval(
        SocialAgentToolName.CreateSocialRequest,
        { mode: 'draft' },
      ),
    ).toBe(false);
    expect(
      requiresMandatorySocialAgentApproval(
        SocialAgentToolName.CreateSocialRequest,
        { visibility: 'private' },
      ),
    ).toBe(false);
    expect(
      requiresMandatorySocialAgentApproval(
        SocialAgentToolName.CreateSocialRequest,
        { mode: 'draft', city: '青岛', activityType: '羽毛球' },
      ),
    ).toBe(false);
    expect(
      requiresMandatorySocialAgentApproval(SocialAgentToolName.SaveCandidate),
    ).toBe(false);
    expect(
      requiresMandatorySocialAgentApproval(SocialAgentToolName.DraftOpener),
    ).toBe(false);
  });
});
