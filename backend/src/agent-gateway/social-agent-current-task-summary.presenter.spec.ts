import { AgentTaskStatus } from './entities/agent-task.entity';
import {
  buildSocialAgentCurrentTaskSummary,
  shouldPersistSocialAgentCurrentTaskSummary,
} from './social-agent-current-task-summary.presenter';

describe('social agent current task summary presenter', () => {
  it('builds a compact current task summary for tool output', () => {
    const plan = Array.from({ length: 12 }, (_, index) => ({
      id: `step_${index}`,
    }));
    const toolCalls = Array.from({ length: 11 }, (_, index) => ({
      id: `call_${index}`,
    }));

    const summary = buildSocialAgentCurrentTaskSummary({
      task: {
        id: 100,
        title: '认识跑步搭子',
        goal: '找一个青岛周末跑步搭子',
        status: AgentTaskStatus.WaitingReply,
        statusReason: 'waiting_for_counterpart_reply',
        permissionMode: 'limited_auto',
        riskLevel: 'medium',
        plan,
        toolCalls,
        result: { lastToolCall: { id: 'call_10' } },
      } as never,
      memory: { currentTask: { phase: 'messaging_candidate' } },
      isRecord: (value): value is Record<string, unknown> =>
        typeof value === 'object' && value !== null && !Array.isArray(value),
    });

    expect(summary).toMatchObject({
      taskId: 100,
      title: '认识跑步搭子',
      goal: '找一个青岛周末跑步搭子',
      status: AgentTaskStatus.WaitingReply,
      statusReason: 'waiting_for_counterpart_reply',
      permissionMode: 'limited_auto',
      riskLevel: 'medium',
      result: { lastToolCall: { id: 'call_10' } },
      memory: { currentTask: { phase: 'messaging_candidate' } },
    });
    expect(summary.plan).toEqual(plan.slice(-10));
    expect(summary.recentToolCalls).toEqual(toolCalls.slice(-10));
  });

  it('falls back to empty plan, tool calls, and result when task fields drift', () => {
    const summary = buildSocialAgentCurrentTaskSummary({
      task: {
        id: 101,
        title: '任务',
        goal: '目标',
        status: AgentTaskStatus.Executing,
        statusReason: null,
        permissionMode: 'assist',
        riskLevel: 'low',
        plan: null,
        toolCalls: null,
        result: 'not-json-object',
      } as never,
      memory: null,
      isRecord: (value): value is Record<string, unknown> =>
        typeof value === 'object' && value !== null && !Array.isArray(value),
    });

    expect(summary.plan).toEqual([]);
    expect(summary.recentToolCalls).toEqual([]);
    expect(summary.result).toEqual({});
  });

  it('accepts persistLongTerm or writeLongTerm as the persistence switch', () => {
    const bool = (value: unknown) => value === true || value === 'true';

    expect(
      shouldPersistSocialAgentCurrentTaskSummary({
        request: { persistLongTerm: true },
        bool,
      }),
    ).toBe(true);
    expect(
      shouldPersistSocialAgentCurrentTaskSummary({
        request: { writeLongTerm: 'true' },
        bool,
      }),
    ).toBe(true);
    expect(
      shouldPersistSocialAgentCurrentTaskSummary({
        request: {},
        bool,
      }),
    ).toBe(false);
  });
});
