import {
  AgentTaskPermissionMode,
  AgentTaskStatus,
  type AgentTask,
} from './entities/agent-task.entity';
import {
  buildSocialAgentTaskFailureLogPayload,
  buildSocialAgentToolFailureLogPayload,
} from './social-agent-tool-executor-log.presenter';
import { SocialAgentToolName } from './social-agent-tool.types';
import type { SocialAgentToolCallRecord } from './social-agent-tool.types';

function task(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 101,
    ownerUserId: 202,
    agentConnectionId: 303,
    taskType: 'social_goal',
    title: 'Find partner',
    goal: 'find a running partner',
    input: {},
    plan: [],
    toolCalls: [],
    result: {},
    memory: {},
    status: AgentTaskStatus.Failed,
    permissionMode: AgentTaskPermissionMode.Assist,
    riskLevel: 'medium' as never,
    idempotencyKey: null,
    statusReason: 'tool_failed',
    error: null,
    startedAt: null,
    awaitingConfirmationAt: null,
    completedAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  } as AgentTask;
}

function call(
  overrides: Partial<SocialAgentToolCallRecord> = {},
): SocialAgentToolCallRecord {
  return {
    id: 'call_1',
    stepId: 'step_1',
    toolName: SocialAgentToolName.SendMessage,
    status: 'failed',
    input: { text: 'hello' },
    output: null,
    error: { code: 'MESSAGE_SEND_FAILED', message: 'send failed' },
    startedAt: '2026-06-07T00:00:00.000Z',
    completedAt: '2026-06-07T00:00:01.000Z',
    ...overrides,
  };
}

describe('social-agent-tool-executor-log.presenter', () => {
  it('builds structured tool failure logs without dropping owner context', () => {
    expect(
      buildSocialAgentToolFailureLogPayload({
        task: task(),
        toolName: SocialAgentToolName.SendMessage,
        stepId: 'step_1',
        call: call(),
      }),
    ).toEqual({
      event: 'agent.task.tool_failed',
      taskId: 101,
      ownerUserId: 202,
      agentConnectionId: 303,
      permissionMode: AgentTaskPermissionMode.Assist,
      stepId: 'step_1',
      toolCallId: 'call_1',
      toolName: SocialAgentToolName.SendMessage,
      status: 'failed',
      error: { code: 'MESSAGE_SEND_FAILED', message: 'send failed' },
    });
  });

  it('builds structured task failure logs from the failed tool call', () => {
    expect(
      buildSocialAgentTaskFailureLogPayload({
        task: task({ statusReason: 'blocked_by_policy' }),
        call: call({
          id: 'call_2',
          stepId: 'step_2',
          toolName: SocialAgentToolName.AddFriend,
          status: 'blocked',
          error: { code: 'FORBIDDEN', message: 'approval required' },
        }),
      }),
    ).toEqual({
      event: 'agent.task.failed',
      taskId: 101,
      ownerUserId: 202,
      agentConnectionId: 303,
      permissionMode: AgentTaskPermissionMode.Assist,
      statusReason: 'blocked_by_policy',
      failedToolCallId: 'call_2',
      failedStepId: 'step_2',
      failedToolName: SocialAgentToolName.AddFriend,
      failedStatus: 'blocked',
      error: { code: 'FORBIDDEN', message: 'approval required' },
    });
  });
});
