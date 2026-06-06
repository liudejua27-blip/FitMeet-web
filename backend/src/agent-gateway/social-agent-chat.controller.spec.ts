import { Response } from 'express';
import { AgentCardAssemblerService } from './response-quality/agent-card-assembler.service';
import { LightStatusMapperService } from './response-quality/light-status-mapper.service';
import { UserFacingResponseSanitizerService } from './response-quality/user-facing-response-sanitizer.service';
import { SocialAgentChatController } from './social-agent-chat.controller';
import { SocialAgentChatService } from './social-agent-chat.service';
import { AgentTaskStatus } from './entities/agent-task.entity';
import { SocialAgentCandidateCommandService } from './social-agent-candidate-command.service';

describe('SocialAgentChatController user-facing stream', () => {
  it('streams only light status and sanitized user-facing result', async () => {
    const writes: string[] = [];
    const chat = {
      runStream: jest.fn((_userId, _body, emit) => {
        emit({
          type: 'step',
          step: {
            id: 'planner.internal',
            label: 'planner tool call with traceId',
            status: 'running',
          },
        });
        emit({
          type: 'result',
          result: {
            taskId: 101,
            status: AgentTaskStatus.Succeeded,
            visibleSteps: [],
            assistantMessage: '我会先结合你的 Life Graph，再筛选合适的人。',
            socialRequestDraft: null,
            candidates: [],
            approvalRequiredActions: [],
            events: [{ traceId: 'hidden-event' }],
            cards: [
              {
                id: 'candidate-1',
                type: 'candidate_card',
                title: '小林',
                body: '你们的时间和边界比较一致。',
                data: {
                  recommendationLine: '适合从一次轻松慢跑开始。',
                  traceId: 'hidden-trace',
                  structuredIntent: { planner: 'hidden-planner' },
                  nested: { toolCalls: [{ name: 'search' }] },
                },
                actions: [],
              },
            ],
            safety: {
              blocked: false,
              level: 'low',
              reasons: ['internal guardrail reason'],
              boundaryNotes: ['第一次建议选择公共场所。'],
              requiredConfirmations: ['发送消息'],
            },
            traceId: 'hidden-trace',
            agentTrace: {
              traceId: 'hidden-trace',
              sdkEnabled: true,
              model: 'hidden-model',
              agentPath: ['Main Agent'],
              handoffs: [],
              guardrails: [],
            },
            structuredIntent: { planner: 'hidden-planner' },
          },
        });
        return Promise.resolve();
      }),
    };
    const candidateCommands = {};
    const controller = new SocialAgentChatController(
      chat as unknown as SocialAgentChatService,
      candidateCommands as unknown as SocialAgentCandidateCommandService,
      new UserFacingResponseSanitizerService(
        new LightStatusMapperService(),
        new AgentCardAssemblerService(),
      ),
    );
    const response = {
      status: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn((chunk: string) => {
        writes.push(chunk);
      }),
      end: jest.fn(),
    } as unknown as Response;

    await controller.streamUserFacingRun(
      { user: { id: 7 } } as Parameters<
        SocialAgentChatController['streamUserFacingRun']
      >[0],
      { goal: '今晚想找青岛大学附近跑步搭子' },
      response,
    );

    const serialized = writes.join('');
    expect(serialized).toContain('"type":"progress"');
    expect(serialized).toContain('正在调用工具');
    expect(serialized).toContain('正在理解你的需求');
    expect(serialized).toContain('assistantMessage');
    expect(serialized).toContain('cards');
    expect(serialized).not.toContain('traceId');
    expect(serialized).not.toContain('agentTrace');
    expect(serialized).not.toContain('structuredIntent');
    expect(serialized).not.toContain('planner');
    expect(serialized).not.toContain('toolCalls');
    expect(serialized).not.toContain('hidden-model');
    expect(chat.runStream).toHaveBeenCalledWith(
      7,
      { goal: '今晚想找青岛大学附近跑步搭子' },
      expect.any(Function),
    );
  });
});

describe('SocialAgentChatController candidate commands', () => {
  it('routes candidate command endpoints to the candidate command service', async () => {
    const chat = {};
    const candidateCommands = {
      publishDraft: jest.fn().mockResolvedValue({ taskId: 101 }),
      saveCandidate: jest.fn().mockResolvedValue({ toolCallId: 'save-1' }),
      sendCandidateMessage: jest
        .fn()
        .mockResolvedValue({ messageId: 'msg-22' }),
      connectCandidate: jest
        .fn()
        .mockResolvedValue({ conversationId: 'conv-22' }),
    };
    const controller = new SocialAgentChatController(
      chat as unknown as SocialAgentChatService,
      candidateCommands as unknown as SocialAgentCandidateCommandService,
      new UserFacingResponseSanitizerService(
        new LightStatusMapperService(),
        new AgentCardAssemblerService(),
      ),
    );
    const req = { user: { id: 7 } } as Parameters<
      SocialAgentChatController['saveCandidate']
    >[0];

    await expect(
      controller.publishSocialRequest(req, 101, {
        title: '今晚跑步',
        rawText: '今晚跑步',
      } as never),
    ).resolves.toEqual({ taskId: 101 });
    await expect(
      controller.saveCandidate(req, 101, { targetUserId: 22 }),
    ).resolves.toEqual({ toolCallId: 'save-1' });
    await expect(
      controller.sendMessage(req, 101, { targetUserId: 22, message: 'hello' }),
    ).resolves.toEqual({ messageId: 'msg-22' });
    await expect(
      controller.connectCandidate(req, 101, { targetUserId: 22 }),
    ).resolves.toEqual({ conversationId: 'conv-22' });

    expect(candidateCommands.publishDraft).toHaveBeenCalledWith(
      7,
      101,
      expect.objectContaining({ title: '今晚跑步' }),
    );
    expect(candidateCommands.saveCandidate).toHaveBeenCalledWith(7, 101, {
      targetUserId: 22,
    });
    expect(candidateCommands.sendCandidateMessage).toHaveBeenCalledWith(
      7,
      101,
      { targetUserId: 22, message: 'hello' },
    );
    expect(candidateCommands.connectCandidate).toHaveBeenCalledWith(7, 101, {
      targetUserId: 22,
    });
  });
});
