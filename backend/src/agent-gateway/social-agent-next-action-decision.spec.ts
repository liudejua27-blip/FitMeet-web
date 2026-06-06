import { AgentPermissionService } from './agent-permission.service';
import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import {
  buildFallbackSocialAgentNextAction,
  buildFallbackSocialAgentReplySummary,
  buildSocialAgentNextActionPrompt,
  normalizeSocialAgentNextActionDecision,
  parseSocialAgentJsonObject,
} from './social-agent-next-action-decision';
import { SocialAgentToolName } from './social-agent-tool.types';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 100,
    ownerUserId: 1,
    agentConnectionId: 7,
    taskType: 'social_goal',
    title: 'Find partner',
    goal: 'find a running partner',
    input: {},
    plan: [],
    toolCalls: [],
    result: {},
    memory: {},
    status: AgentTaskStatus.Pending,
    permissionMode: AgentTaskPermissionMode.Assist,
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

describe('social agent next action decision helpers', () => {
  it('builds deterministic fallback summaries from received text', () => {
    const summary = buildFallbackSocialAgentReplySummary([
      { id: 'msg_2', text: '可以，几点在哪里见？', senderId: 2 },
    ]);

    expect(summary).toMatchObject({
      source: 'fallback',
      purpose: 'summarize_reply',
      intent: 'accept',
      sentiment: 'positive',
      needsReply: true,
    });
    expect(summary.summary).toEqual(expect.stringContaining('几点在哪里见'));
  });

  it('turns accepted replies into safe offline meeting input in limited auto mode', () => {
    const task = makeTask({
      permissionMode: AgentTaskPermissionMode.LimitedAuto,
      input: { city: ' Qingdao ' },
    });
    const decision = buildFallbackSocialAgentNextAction(
      task,
      [{ id: 'msg_2', text: 'Sure, let us run tonight.', senderId: 2 }],
      { intent: 'accept', summary: '对方接受今晚跑步邀约' },
      { conversationId: 'conv_1' },
    );

    expect(decision).toMatchObject({
      nextAction: 'offline_meeting',
      toolName: SocialAgentToolName.OfflineMeeting,
      input: {
        targetUserId: 2,
        publicPlaceOnly: true,
        noPreciseLocation: true,
        allowPreciseLocation: false,
        proofRequired: true,
      },
    });
  });

  it('includes loop state and allowed actions in the next action prompt', () => {
    const permissions = new AgentPermissionService();
    const prompt = JSON.parse(
      buildSocialAgentNextActionPrompt(
        makeTask(),
        [{ id: 'msg_2', text: 'ok', senderId: 2 }],
        { intent: 'accept' },
        {
          conversationId: 'conv_1',
          targetUserId: 2,
          lastReceivedMessageId: 'msg_2',
        },
        permissions.getAllowedActions(AgentTaskPermissionMode.Assist),
      ),
    ) as Record<string, unknown>;

    expect(prompt).toMatchObject({
      taskId: 100,
      socialLoop: {
        conversationId: 'conv_1',
        targetUserId: 2,
        lastReceivedMessageId: 'msg_2',
      },
    });
    expect(prompt.allowedActions).toContain('send_message');
  });

  it('downgrades payment decisions without a positive amount to a reply', () => {
    const permissions = new AgentPermissionService();
    const decision = normalizeSocialAgentNextActionDecision(
      makeTask({ permissionMode: AgentTaskPermissionMode.LimitedAuto }),
      {
        source: 'deepseek',
        nextAction: 'payment',
        toolName: SocialAgentToolName.Payment,
        input: { amount: 0 },
      },
      { conversationId: 'conv_1', targetUserId: 2 },
      permissions,
    );

    expect(decision).toMatchObject({
      nextAction: 'reply_message',
      toolName: SocialAgentToolName.ReplyMessage,
      input: {
        conversationId: 'conv_1',
        targetUserId: 2,
        text: expect.stringContaining('具体金额'),
      },
    });
  });

  it('stops when permissions block the requested action and message fallback', () => {
    const permissions = {
      getAllowedActions: jest.fn(() => []),
      canExecute: jest.fn(() => false),
    };
    const decision = normalizeSocialAgentNextActionDecision(
      makeTask(),
      {
        source: 'deepseek',
        nextAction: 'add_friend',
        toolName: SocialAgentToolName.AddFriend,
        confidence: 0.9,
      },
      { conversationId: 'conv_1', targetUserId: 2 },
      permissions,
    );

    expect(decision).toMatchObject({
      nextAction: 'stop',
      toolName: null,
      input: {},
      reason: expect.stringContaining('blocks add_friend'),
      confidence: 0.9,
    });
  });

  it('parses fenced JSON objects from model responses', () => {
    expect(parseSocialAgentJsonObject('```json\n{"ok":true}\n```')).toEqual({
      ok: true,
    });
  });
});
