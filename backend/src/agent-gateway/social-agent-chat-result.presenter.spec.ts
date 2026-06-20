import { buildApprovalActions } from './social-agent-chat-result.presenter';
import type {
  SocialAgentChatCandidate,
  SocialAgentRequestDraft,
} from './social-agent-chat.types';

describe('social-agent-chat-result.presenter', () => {
  it('uses canonical Social Codex action names for candidate connection actions', () => {
    const actions = buildApprovalActions(101, null, [
      candidate({ nickname: '小林', targetUserId: 22 }),
    ]);

    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'send_message',
          actionType: 'send_invite',
          label: '确认发送给 小林',
          agentTaskId: 101,
          targetUserId: 22,
        }),
        expect.objectContaining({
          type: 'connect_candidate',
          label: '加好友并聊天：小林',
          agentTaskId: 101,
          targetUserId: 22,
        }),
      ]),
    );
    expect(actions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'add_friend' })]),
    );
  });

  it('keeps public publishing on the canonical publish_social_request action', () => {
    const actions = buildApprovalActions(202, draft(), []);

    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'publish_social_request',
          agentTaskId: 202,
          socialRequestId: 77,
        }),
      ]),
    );
  });
});

function candidate(
  input: Partial<SocialAgentChatCandidate> = {},
): SocialAgentChatCandidate {
  return {
    agentTaskId: 101,
    socialRequestId: 55,
    targetUserId: 22,
    userId: 22,
    candidateRecordId: 88,
    nickname: '小林',
    avatar: '',
    color: '#111111',
    city: '青岛',
    score: 86,
    level: 'high',
    distanceKm: 2.4,
    commonTags: ['散步'],
    reasons: ['时间匹配'],
    risk: { level: 'low', warnings: [] },
    suggestedMessage: '周末下午一起散步吗？',
    ...input,
  };
}

function draft(): SocialAgentRequestDraft {
  return {
    type: 'custom',
    rawText: '周末散步',
    title: '周末青岛大学散步搭子',
    description: '找公开场所低强度散步搭子',
    city: '青岛',
    radiusKm: 5,
    interestTags: ['散步'],
    activityType: '散步',
    safetyRequirement: 'low_risk_only',
    visibility: 'private',
    status: 'draft',
    requireUserConfirmation: true,
    agentAllowed: true,
    metadata: {},
    agentTaskId: 202,
    socialRequestId: 77,
    mode: 'draft',
  } as SocialAgentRequestDraft;
}
