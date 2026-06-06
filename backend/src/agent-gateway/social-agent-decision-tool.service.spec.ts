import { AgentPermissionService } from './agent-permission.service';
import {
  AgentTask,
  AgentTaskPermissionMode,
} from './entities/agent-task.entity';
import { FitMeetAgentToolRegistryService } from './fitmeet-agent-tool-registry.service';
import { SocialAgentDecisionToolService } from './social-agent-decision-tool.service';
import { SocialAgentToolCallFactoryService } from './social-agent-tool-call-factory.service';
import { SocialAgentToolInputParserService } from './social-agent-tool-input-parser.service';
import { SocialAgentToolName } from './social-agent-tool.types';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 100,
    ownerUserId: 1,
    agentConnectionId: 7,
    permissionMode: AgentTaskPermissionMode.LimitedAuto,
    goal: 'meet someone nearby',
    title: 'Evening run',
    input: { city: 'Qingdao' },
    memory: {
      socialLoop: {
        conversationId: 'conv_1',
        targetUserId: 2,
        lastReceivedMessageId: 'msg_2',
        latestReceivedMessages: [
          {
            id: 'msg_2',
            conversationId: 'conv_1',
            text: 'Sure, where should we meet?',
            senderType: 'user',
            senderId: 2,
          },
        ],
        replySummary: {
          intent: 'ask_question',
          summary: '对方询问见面地点。',
        },
      },
    },
    ...overrides,
  } as AgentTask;
}

function makeService() {
  const permissions = new AgentPermissionService();
  const toolJsonModel = {
    callJson: jest.fn(),
  };
  const toolInput = new SocialAgentToolInputParserService();
  const toolCallFactory = new SocialAgentToolCallFactoryService(
    permissions,
    new FitMeetAgentToolRegistryService(),
  );
  const service = new SocialAgentDecisionToolService(
    permissions,
    toolJsonModel as never,
    toolCallFactory,
    toolInput,
  );

  return { service, toolJsonModel };
}

describe('SocialAgentDecisionToolService', () => {
  it('normalizes model decisions into memory, short-term, and inbox patches', async () => {
    const { service, toolJsonModel } = makeService();
    toolJsonModel.callJson.mockResolvedValue({
      nextAction: 'reply_message',
      toolName: 'reply_message',
      input: { text: '青岛大学操场正门可以吗？' },
      reason: '对方询问地点，需要低压力确认。',
      confidence: 0.84,
    });

    const result = await service.decideNextSocialAction(makeTask(), {});

    expect(toolJsonModel.callJson).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'decide_next_social_action',
        taskId: 100,
        prompt: expect.stringContaining('Sure, where should we meet?'),
      }),
    );
    expect(result.output).toMatchObject({
      toolName: SocialAgentToolName.ReplyMessage,
      input: {
        conversationId: 'conv_1',
        targetUserId: 2,
        text: '青岛大学操场正门可以吗？',
      },
      reason: '对方询问地点，需要低压力确认。',
      confidence: 0.84,
    });
    expect(result.loopUpdates).toMatchObject({
      nextActionDecision: result.output,
      sourceTool: SocialAgentToolName.DecideNextSocialAction,
    });
    expect(result.shortTermUpdates).toMatchObject({
      nextActionDecision: result.output,
      currentStep: {
        id: 'decide_next_social_action',
        label: '已决定下一步社交动作',
        status: 'done',
      },
    });
    expect(result.inboxEvent).toMatchObject({
      eventType: 'social_agent.next_action.decided',
      input: {
        conversationId: 'conv_1',
        messageId: 'msg_2',
        fromUserId: 2,
        contentPreview: '对方询问地点，需要低压力确认。',
      },
    });
  });

  it('falls back to safe reply decisions when model output is unavailable', async () => {
    const { service, toolJsonModel } = makeService();
    toolJsonModel.callJson.mockImplementation(({ fallback }) => fallback());

    const result = await service.decideNextSocialAction(
      makeTask({
        memory: {
          socialLoop: {
            conversationId: 'conv_1',
            targetUserId: 2,
            latestReceivedMessages: [
              {
                id: 'msg_2',
                conversationId: 'conv_1',
                text: 'Where should we meet?',
                senderType: 'user',
                senderId: 2,
              },
            ],
            replySummary: {
              source: 'fallback',
              intent: 'ask_question',
              summary: '对方询问地点。',
            },
          },
        },
      }),
      {},
    );

    expect(result.output).toMatchObject({
      source: 'fallback',
      toolName: SocialAgentToolName.ReplyMessage,
      input: {
        conversationId: 'conv_1',
        targetUserId: 2,
      },
    });
    expect(result.inboxEvent.input.metadata).toMatchObject({
      summary: {
        source: 'fallback',
        intent: 'ask_question',
      },
      decision: result.output,
    });
  });

  it('uses explicit messages and summary input before loop memory', async () => {
    const { service, toolJsonModel } = makeService();
    toolJsonModel.callJson.mockResolvedValue({
      nextAction: 'stop',
      toolName: null,
      input: {},
      reason: '对方明确拒绝。',
      confidence: 0.9,
    });

    const result = await service.decideNextSocialAction(makeTask(), {
      messages: [
        {
          id: 'msg_9',
          conversationId: 'conv_1',
          text: 'No thanks.',
          senderType: 'user',
          senderId: 2,
        },
      ],
      summary: {
        intent: 'decline',
        summary: '对方拒绝。',
      },
    });

    expect(toolJsonModel.callJson).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('No thanks.'),
      }),
    );
    expect(result.output).toMatchObject({
      toolName: null,
      reason: '对方明确拒绝。',
    });
    expect(result.inboxEvent.input.metadata).toMatchObject({
      summary: {
        intent: 'decline',
        summary: '对方拒绝。',
      },
    });
  });
});
