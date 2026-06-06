import { BadRequestException } from '@nestjs/common';

import { ConfirmationGuardService } from './confirmation-guard.service';
import { AgentTask } from './entities/agent-task.entity';
import { SocialAgentConfirmationPolicyService } from './social-agent-confirmation-policy.service';
import { SocialAgentToolName } from './social-agent-tool.types';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 100,
    ownerUserId: 1,
    agentConnectionId: null,
    taskType: 'social_goal',
    title: 'Find partner',
    goal: 'send a confirmed message',
    input: {},
    plan: [],
    toolCalls: [],
    result: {},
    memory: {},
    status: 'pending',
    permissionMode: 'confirm',
    riskLevel: 'low' as never,
    idempotencyKey: null,
    statusReason: null,
    error: null,
    startedAt: null,
    awaitingConfirmationAt: null,
    completedAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  } as AgentTask;
}

describe('SocialAgentConfirmationPolicyService', () => {
  function makeService() {
    const targetResolver = {
      resolveCandidateTargetUser: jest.fn().mockResolvedValue(2),
    };
    const service = new SocialAgentConfirmationPolicyService(
      new ConfirmationGuardService(),
      targetResolver as never,
    );
    return { service, targetResolver };
  }

  it('adds chat confirmation metadata only to user-confirmed message tools', () => {
    const { service } = makeService();

    expect(
      service.withAdhocConfirmationMetadata(
        SocialAgentToolName.SendMessage,
        { text: 'hello' },
        1,
      ),
    ).toEqual({
      text: 'hello',
      metadata: { confirmationSource: 'social_agent_chat' },
    });
    expect(
      service.withAdhocConfirmationMetadata(
        SocialAgentToolName.AddFriend,
        { targetUserId: 2 },
        1,
      ),
    ).toEqual({ targetUserId: 2 });
  });

  it('preserves an existing confirmation source', () => {
    const { service } = makeService();

    const input = {
      text: 'hello',
      metadata: { confirmationSource: 'approval_request' },
    };

    expect(
      service.withAdhocConfirmationMetadata(
        SocialAgentToolName.SendMessage,
        input,
        1,
      ),
    ).toBe(input);
  });

  it('allows chat-confirmed messages without an agent connection', () => {
    const { service } = makeService();

    expect(() =>
      service.assertAgentConnectionBound(
        makeTask(),
        SocialAgentToolName.SendMessage,
        { metadata: { confirmationSource: 'social_agent_chat' } },
      ),
    ).not.toThrow();
  });

  it('requires an agent connection for unconfirmed real social actions', () => {
    const { service } = makeService();

    expect(() =>
      service.assertAgentConnectionBound(
        makeTask(),
        SocialAgentToolName.AddFriend,
        { targetUserId: 2 },
      ),
    ).toThrow(BadRequestException);
  });

  it('allows explicitly approved candidate actions without an agent connection', () => {
    const { service } = makeService();

    expect(() =>
      service.assertAgentConnectionBound(
        makeTask(),
        SocialAgentToolName.AddFriend,
        { targetUserId: 2, approvalId: 501 },
      ),
    ).not.toThrow();
  });

  it('validates dangerous candidate targets before returning approval required', async () => {
    const { service, targetResolver } = makeService();

    await service.validateDangerousAdhocActionTarget(
      makeTask(),
      SocialAgentToolName.ConnectCandidate,
      { targetUserId: 2 },
    );

    expect(targetResolver.resolveCandidateTargetUser).toHaveBeenCalledWith(
      { targetUserId: 2 },
      1,
    );
  });

  it('does not validate non-candidate dangerous targets', async () => {
    const { service, targetResolver } = makeService();

    await service.validateDangerousAdhocActionTarget(
      makeTask(),
      SocialAgentToolName.CreateActivity,
      { targetUserId: 2 },
    );

    expect(targetResolver.resolveCandidateTargetUser).not.toHaveBeenCalled();
  });
});
