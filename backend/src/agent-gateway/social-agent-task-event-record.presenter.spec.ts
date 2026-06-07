import {
  AgentTaskEventActor,
  AgentTaskEventType,
  AgentTaskPermissionMode,
  AgentTaskStatus,
  type AgentTask,
} from './entities/agent-task.entity';
import { buildSocialAgentTaskEventRecord } from './social-agent-task-event-record.presenter';
import { SocialAgentToolName } from './social-agent-tool.types';

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

const safeVarchar = (value: unknown, max = 80): string => {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
};

describe('social-agent-task-event-record.presenter', () => {
  it('builds tool actor records for tool return and failure events', () => {
    expect(
      buildSocialAgentTaskEventRecord({
        task: task(),
        type: AgentTaskEventType.ToolReturned,
        event: {
          summary: 'send_message succeeded',
          payload: { toolName: SocialAgentToolName.SendMessage },
          stepId: 'step_1',
          toolCallId: 'call_1',
        },
        safeVarchar,
      }),
    ).toEqual({
      taskId: 101,
      ownerUserId: 202,
      eventType: AgentTaskEventType.ToolReturned,
      actor: AgentTaskEventActor.Tool,
      summary: 'send_message succeeded',
      payload: { toolName: SocialAgentToolName.SendMessage },
      stepId: 'step_1',
      toolCallId: 'call_1',
    });

    expect(
      buildSocialAgentTaskEventRecord({
        task: task(),
        type: AgentTaskEventType.ToolFailed,
        event: { summary: 'send_message failed' },
        safeVarchar,
      }).actor,
    ).toBe(AgentTaskEventActor.Tool);
  });

  it('builds agent actor records for non-tool events', () => {
    expect(
      buildSocialAgentTaskEventRecord({
        task: task(),
        type: AgentTaskEventType.StepStarted,
        event: { summary: 'Started send_message' },
        safeVarchar,
      }),
    ).toEqual({
      taskId: 101,
      ownerUserId: 202,
      eventType: AgentTaskEventType.StepStarted,
      actor: AgentTaskEventActor.Agent,
      summary: 'Started send_message',
      payload: {},
      stepId: null,
      toolCallId: null,
    });
  });

  it('truncates varchar fields while preserving full structured payload', () => {
    const longText = 'x'.repeat(600);
    const payload = { full: longText };

    const record = buildSocialAgentTaskEventRecord({
      task: task(),
      type: AgentTaskEventType.ToolReturned,
      event: {
        summary: longText,
        payload,
        stepId: longText,
        toolCallId: longText,
      },
      safeVarchar,
    });

    expect(record.summary).toHaveLength(500);
    expect(record.summary.endsWith('…')).toBe(true);
    expect(record.stepId).toHaveLength(80);
    expect(record.toolCallId).toHaveLength(80);
    expect(record.payload).toBe(payload);
  });
});
