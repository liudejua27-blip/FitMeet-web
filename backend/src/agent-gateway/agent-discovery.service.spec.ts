import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AgentAutonomyLevel,
  AgentProfile,
  AgentProfileStatus,
  AgentType,
} from './entities/agent-profile.entity';
import {
  AgentActionStatus,
  AgentActionType,
} from './entities/agent-action-log.entity';
import {
  ApprovalRiskLevel,
  ApprovalType,
} from './entities/agent-approval-request.entity';
import { AgentDiscoveryService } from './agent-discovery.service';

const repo = () => ({
  findOne: jest.fn(),
  count: jest.fn(),
});

function makeProfile(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    id: 20,
    ownerUserId: 22,
    agentConnectionId: 220,
    agentName: '跑步伙伴 Agent',
    agentType: AgentType.UserAgent,
    status: AgentProfileStatus.Active,
    autonomyLevel: AgentAutonomyLevel.Open,
    interests: [],
    goals: [],
    avatar: '',
    bio: '',
    provider: 'custom' as never,
    preferredTargets: [],
    boundaries: [],
    lastActiveAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  } as AgentProfile;
}

function makeHarness() {
  const profiles = {
    getDiscoverable: jest.fn(),
    search: jest.fn(),
  };
  const messages = {
    startAgentConversation: jest.fn(),
    sendMessage: jest.fn(),
  };
  const messagesGateway = {
    emitAgentMessage: jest.fn(),
  };
  const actionLogs = {
    logAgentAction: jest.fn().mockResolvedValue({ id: 1 }),
  };
  const webhooks = {
    emitToConnection: jest.fn().mockResolvedValue(undefined),
  };
  const approvals = {
    create: jest.fn().mockResolvedValue({ id: 9001 }),
  };
  const profileRepo = repo();
  const connectionRepo = repo();
  const actionLogRepo = repo();
  const service = new AgentDiscoveryService(
    profiles as never,
    messages as never,
    messagesGateway as never,
    actionLogs as never,
    webhooks as never,
    approvals as never,
    profileRepo as never,
    connectionRepo as never,
    actionLogRepo as never,
  );

  return {
    actionLogs,
    approvals,
    messages,
    profileRepo,
    profiles,
    service,
  };
}

describe('AgentDiscoveryService approval gating', () => {
  it('does not couple outbound social actions to generic autonomy auto-execution', () => {
    const source = readFileSync(
      join(__dirname, 'agent-discovery.service.ts'),
      'utf8',
    );

    expect(source).not.toContain('canAutoExecute');
    expect(source).toContain('a2a_requires_approval');
    expect(source).toContain('a2a_invite_requires_approval');
  });

  it('creates a real approval request instead of sending agent-initiated messages directly', async () => {
    const harness = makeHarness();
    harness.profiles.getDiscoverable.mockResolvedValue(
      makeProfile({ id: 31, ownerUserId: 99, agentName: '羽毛球伙伴' }),
    );
    harness.profileRepo.findOne.mockResolvedValue(
      makeProfile({ id: 8, ownerUserId: 7, agentConnectionId: 77 }),
    );

    const result = await harness.service.sendMessageToAgent(7, 31, {
      fromAgentId: 8,
      content: '周末一起打羽毛球吗？',
    });

    expect(result).toEqual({
      status: 'pending_approval',
      approvalId: 9001,
      reason: 'autonomy_level_requires_approval',
    });
    expect(harness.approvals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        agentConnectionId: 77,
        type: ApprovalType.SendMessage,
        actionType: 'send_message',
        riskLevel: ApprovalRiskLevel.Medium,
        payload: expect.objectContaining({
          fromAgentId: 8,
          targetAgentId: 31,
          targetUserId: 99,
          toUserId: 99,
          content: '周末一起打羽毛球吗？',
        }),
      }),
    );
    expect(harness.messages.startAgentConversation).not.toHaveBeenCalled();
    expect(harness.messages.sendMessage).not.toHaveBeenCalled();
    expect(harness.actionLogs.logAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        agentId: 77,
        actionType: AgentActionType.SendMessage,
        actionStatus: AgentActionStatus.PendingApproval,
        payload: expect.objectContaining({ approvalId: 9001 }),
      }),
    );
  });

  it('creates a real approval request for agent-initiated connect or invite actions', async () => {
    const harness = makeHarness();
    harness.profiles.getDiscoverable.mockResolvedValue(
      makeProfile({ id: 31, ownerUserId: 99, agentName: '羽毛球伙伴' }),
    );
    harness.profileRepo.findOne.mockResolvedValue(
      makeProfile({ id: 8, ownerUserId: 7, agentConnectionId: 77 }),
    );

    const result = await harness.service.inviteAgent(7, 31, {
      fromAgentId: 8,
      note: '先站内聊聊',
    });

    expect(result).toEqual({
      status: 'pending_approval',
      approvalId: 9001,
      reason: 'autonomy_level_requires_approval',
    });
    expect(harness.approvals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        agentConnectionId: 77,
        type: ApprovalType.ContactRequest,
        actionType: 'connect_candidate',
        riskLevel: ApprovalRiskLevel.Medium,
        payload: expect.objectContaining({
          fromAgentId: 8,
          targetAgentId: 31,
          targetUserId: 99,
          note: '先站内聊聊',
        }),
      }),
    );
    expect(harness.actionLogs.logAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: AgentActionType.AddFriend,
        actionStatus: AgentActionStatus.PendingApproval,
        payload: expect.objectContaining({ approvalId: 9001 }),
      }),
    );
  });
});
