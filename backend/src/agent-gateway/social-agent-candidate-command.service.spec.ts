import {
  SocialRequestType,
  SocialRequestVisibility,
  UserSocialRequestStatus,
} from '../social-requests/social-request.entity';
import { SocialAgentCandidateCommandService } from './social-agent-candidate-command.service';
import { SocialAgentToolName } from './social-agent-tool-executor.service';
import type { SocialAgentToolCallRecord } from './social-agent-tool-executor.service';

function makeToolCall(
  overrides: Partial<SocialAgentToolCallRecord> = {},
): SocialAgentToolCallRecord {
  return {
    id: 'tool_call_1',
    stepId: 'candidate.save',
    toolName: SocialAgentToolName.SaveCandidate,
    status: 'succeeded',
    input: {},
    output: { saved: true },
    error: null,
    startedAt: '2026-06-06T00:00:00.000Z',
    completedAt: '2026-06-06T00:00:00.000Z',
    durationMs: 12,
    ...overrides,
  };
}

function makeHarness() {
  const publishResult = {
    success: true,
    taskId: 101,
    socialRequestId: 301,
    status: 'published',
  };
  const saveResult = makeToolCall();
  const messageResult = {
    success: true,
    messageId: 'msg-22',
    conversationId: 'conv-22',
  };
  const connectResult = {
    success: true,
    friendRequestId: 'fr-22',
    conversationId: 'conv-22',
  };
  const candidateActions = {
    saveCandidate: jest.fn().mockResolvedValue(saveResult),
    sendCandidateMessage: jest.fn().mockResolvedValue(messageResult),
    connectCandidate: jest.fn().mockResolvedValue(connectResult),
  };
  const draftPublication = {
    publishDraft: jest.fn().mockResolvedValue(publishResult),
  };
  const executeCalls: Array<Record<string, unknown>> = [];
  const agentLoop = {
    execute: jest.fn(async (input: Record<string, unknown>) => {
      executeCalls.push(input);
      const runner = input.runner as () => Promise<Record<string, unknown>>;
      await runner();
      return {
        loop: {
          runId: 'loop:101:test',
          traceId: 'trace:test',
          taskId: 101,
          status: 'completed',
          steps: [],
        },
      };
    }),
  };
  const service = new SocialAgentCandidateCommandService(
    candidateActions as never,
    draftPublication as never,
    agentLoop as never,
  );
  return {
    agentLoop,
    candidateActions,
    connectResult,
    draftPublication,
    executeCalls,
    messageResult,
    publishResult,
    saveResult,
    service,
  };
}

describe('SocialAgentCandidateCommandService', () => {
  it('delegates confirmed draft publishing to the draft publication service', async () => {
    const { draftPublication, publishResult, service } = makeHarness();
    const draft = {
      socialRequestId: 301,
      type: SocialRequestType.RunningPartner,
      rawText: '今晚青岛轻松跑步',
      title: '今晚青岛轻松跑步',
      visibility: SocialRequestVisibility.Private,
      status: UserSocialRequestStatus.Draft,
    };

    await expect(service.publishDraft(7, 101, draft)).resolves.toBe(
      publishResult,
    );
    expect(draftPublication.publishDraft).toHaveBeenCalledWith(7, 101, draft);
  });

  it('delegates candidate saving with target aliases intact', async () => {
    const { candidateActions, saveResult, service } = makeHarness();
    const body = {
      targetUserId: 22,
      candidateUserId: 22,
      candidateRecordId: 501,
      socialRequestId: 301,
      candidate: {
        nickname: '小林',
        suggestedMessage: '今晚先轻松跑一段吗？',
      },
    };

    await expect(service.saveCandidate(7, 101, body)).resolves.toBe(saveResult);
    expect(candidateActions.saveCandidate).toHaveBeenCalledWith(7, 101, body);
  });

  it('delegates candidate messaging without rewriting message payloads', async () => {
    const { candidateActions, executeCalls, messageResult, service } =
      makeHarness();
    const body = {
      targetUserId: 22,
      candidateRecordId: 501,
      message: '今晚先轻松跑一段吗？',
      suggestedOpener: '可以从低压力夜跑开始',
      candidate: {
        userId: 22,
        displayName: '小林',
      },
    };

    await expect(service.sendCandidateMessage(7, 101, body)).resolves.toBe(
      messageResult,
    );
    expect(candidateActions.sendCandidateMessage).toHaveBeenCalledWith(
      7,
      101,
      body,
    );
    expect(executeCalls[0]).toMatchObject({
      taskId: 101,
      goal: 'candidate_command:send_candidate_message',
      plan: {
        reason: 'Candidate command endpoints execute only through AgentLoop.',
        tools: [
          {
            agent: 'Social Match Agent',
            toolName: 'candidate_command_execute',
            requiresApproval: false,
            input: expect.objectContaining({
              command: 'send_candidate_message',
              ownerUserId: 7,
              taskId: 101,
              confirmedEndpoint: true,
              pipelineSteps: ['execute_confirmed_action'],
              sideEffectPolicy: 'execute_only_after_user_confirmation',
            }),
          },
        ],
      },
      maxToolCalls: 1,
      maxRetries: 0,
    });
  });

  it('delegates candidate connection commands to candidate actions', async () => {
    const { candidateActions, connectResult, service } = makeHarness();
    const body = {
      candidateUserId: 22,
      candidateRecordId: 501,
      socialRequestId: 301,
      candidate: {
        targetUserId: 22,
        displayName: '小林',
      },
    };

    await expect(service.connectCandidate(7, 101, body)).resolves.toBe(
      connectResult,
    );
    expect(candidateActions.connectCandidate).toHaveBeenCalledWith(
      7,
      101,
      body,
    );
  });

  it.each([
    {
      command: 'publish_draft',
      run: (service: SocialAgentCandidateCommandService) =>
        service.publishDraft(7, 101, {
          socialRequestId: 301,
          type: SocialRequestType.RunningPartner,
          rawText: '今晚青岛轻松跑步',
          title: '今晚青岛轻松跑步',
          visibility: SocialRequestVisibility.Private,
          status: UserSocialRequestStatus.Draft,
        }),
      expectedAgent: 'Meet Loop Agent',
    },
    {
      command: 'save_candidate',
      run: (service: SocialAgentCandidateCommandService) =>
        service.saveCandidate(7, 101, {
          targetUserId: 22,
          candidateRecordId: 501,
          socialRequestId: 301,
        }),
      expectedAgent: 'Social Match Agent',
    },
    {
      command: 'send_candidate_message',
      run: (service: SocialAgentCandidateCommandService) =>
        service.sendCandidateMessage(7, 101, {
          targetUserId: 22,
          candidateRecordId: 501,
          message: '今晚先轻松跑一段吗？',
        }),
      expectedAgent: 'Social Match Agent',
    },
    {
      command: 'connect_candidate',
      run: (service: SocialAgentCandidateCommandService) =>
        service.connectCandidate(7, 101, {
          candidateUserId: 22,
          candidateRecordId: 501,
          socialRequestId: 301,
        }),
      expectedAgent: 'Social Match Agent',
    },
  ])(
    'routes $command through the confirmed-action AgentLoop contract',
    async ({ command, run, expectedAgent }) => {
      const { executeCalls, service } = makeHarness();

      await run(service);

      expect(executeCalls).toHaveLength(1);
      expect(executeCalls[0]).toMatchObject({
        taskId: 101,
        goal: `candidate_command:${command}`,
        agent: 'FitMeet Main Agent',
        plan: {
          reason: 'Candidate command endpoints execute only through AgentLoop.',
          tools: [
            {
              agent: expectedAgent,
              toolName: 'candidate_command_execute',
              covers: ['execute_confirmed_action'],
              requiresApproval: false,
              input: expect.objectContaining({
                command,
                ownerUserId: 7,
                taskId: 101,
                confirmedEndpoint: true,
                pipelineSteps: ['execute_confirmed_action'],
                sideEffectPolicy: 'execute_only_after_user_confirmation',
              }),
            },
          ],
        },
        maxToolCalls: 1,
        maxRetries: 0,
      });
    },
  );
});
