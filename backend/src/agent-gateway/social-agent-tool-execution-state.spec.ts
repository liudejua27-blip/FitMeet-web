import {
  AgentTaskPermissionMode,
  AgentTaskStatus,
  type AgentTask,
} from './entities/agent-task.entity';
import {
  appendSocialAgentToolCallToTask,
  applySocialAgentPlanStepCallToTask,
} from './social-agent-tool-execution-state';
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
    status: AgentTaskStatus.Executing,
    permissionMode: AgentTaskPermissionMode.Assist,
    riskLevel: 'medium' as never,
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

function call(
  overrides: Partial<SocialAgentToolCallRecord> = {},
): SocialAgentToolCallRecord {
  return {
    id: 'call_1',
    stepId: 'step_1',
    toolName: SocialAgentToolName.SendMessage,
    status: 'succeeded',
    input: { text: 'hello' },
    output: { conversationId: 'conv_1' },
    error: null,
    startedAt: '2026-06-07T00:00:00.000Z',
    completedAt: '2026-06-07T00:00:01.000Z',
    durationMs: 1000,
    ...overrides,
  };
}

describe('social-agent-tool-execution-state', () => {
  it('appends adhoc tool calls while preserving previous result fields', () => {
    const currentTask = task({
      toolCalls: [call({ id: 'call_0' })],
      result: { previous: true },
    });
    const nextCall = call({ id: 'call_2' });

    appendSocialAgentToolCallToTask({
      task: currentTask,
      call: nextCall,
      updatedAt: '2026-06-07T01:00:00.000Z',
    });

    expect(currentTask.toolCalls).toEqual([call({ id: 'call_0' }), nextCall]);
    expect(currentTask.result).toEqual({
      previous: true,
      lastToolCall: nextCall,
      updatedAt: '2026-06-07T01:00:00.000Z',
    });
  });

  it('applies plan-step tool calls to the targeted plan index', () => {
    const plan = [
      { id: 'step_1', status: 'planned' },
      { id: 'step_2', status: 'planned' },
    ];
    const currentTask = task({ plan });
    const nextCall = call({ id: 'call_2', stepId: 'step_2' });

    applySocialAgentPlanStepCallToTask({
      task: currentTask,
      plan: [...plan],
      stepIndex: 1,
      step: plan[1],
      call: nextCall,
      updatedAt: '2026-06-07T01:00:00.000Z',
      withStepResult: (step, toolCall) => ({
        ...step,
        status: toolCall.status,
        toolCallId: toolCall.id,
      }),
    });

    expect(currentTask.plan).toEqual([
      { id: 'step_1', status: 'planned' },
      { id: 'step_2', status: 'succeeded', toolCallId: 'call_2' },
    ]);
    expect(currentTask.toolCalls).toEqual([nextCall]);
    expect(currentTask.result).toMatchObject({
      lastToolCall: nextCall,
      updatedAt: '2026-06-07T01:00:00.000Z',
    });
  });
});
