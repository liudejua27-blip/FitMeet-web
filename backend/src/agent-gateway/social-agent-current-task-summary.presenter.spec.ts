import { AgentTaskStatus } from './entities/agent-task.entity';
import {
  buildSocialAgentCurrentTaskSummary,
  shouldPersistSocialAgentCurrentTaskSummary,
} from './social-agent-current-task-summary.presenter';

describe('social agent current task summary presenter', () => {
  it('builds a compact current task summary for tool output', () => {
    const plan = Array.from({ length: 24 }, (_, index) => ({
      id: `step_${index}`,
    }));
    const toolCalls = Array.from({ length: 24 }, (_, index) => ({
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
    expect(summary.plan).toEqual(plan);
    expect(summary.recentToolCalls).toEqual(toolCalls);
  });

  it('uses the configured context window when summarizing a current task', () => {
    const plan = Array.from({ length: 88 }, (_, index) => ({
      id: `step_${index + 1}`,
    }));
    const toolCalls = Array.from({ length: 88 }, (_, index) => ({
      id: `call_${index + 1}`,
    }));

    const summary = buildSocialAgentCurrentTaskSummary({
      task: {
        id: 102,
        title: '周末散步搭子',
        goal: '找一个青岛大学附近散步搭子',
        status: AgentTaskStatus.Executing,
        statusReason: null,
        permissionMode: 'assist',
        riskLevel: 'low',
        plan,
        toolCalls,
        result: {},
      } as never,
      memory: {},
      contextLimit: 40,
      isRecord: (value): value is Record<string, unknown> =>
        typeof value === 'object' && value !== null && !Array.isArray(value),
    });

    expect(summary.plan).toHaveLength(80);
    expect(summary.recentToolCalls).toHaveLength(80);
    expect((summary.plan as Array<{ id: string }>)[0]?.id).toBe('step_9');
    expect((summary.recentToolCalls as Array<{ id: string }>)[0]?.id).toBe(
      'call_9',
    );
  });

  it('preserves slot memory and candidate preferences in the current task summary', () => {
    const memory = {
      taskMemory: {
        currentTask: {
          state: 'searching_candidates',
          shouldSearchNow: true,
        },
      },
      taskSlots: {
        activity: { value: '散步', state: 'completed' },
        time_window: { value: '今天晚上', state: 'completed' },
        location_text: { value: '青岛大学附近', state: 'completed' },
        candidate_preference: {
          value: '女生，舞蹈相关公开标签优先',
          state: 'answered',
        },
      },
      taskSlotSummary: {
        活动: '散步',
        时间: '今天晚上',
        地点: '青岛大学附近',
        候选偏好: '女生，舞蹈相关公开标签优先',
      },
    };

    const summary = buildSocialAgentCurrentTaskSummary({
      task: {
        id: 103,
        title: '今晚青岛大学散步',
        goal: '找一个青岛大学附近今晚散步搭子',
        status: AgentTaskStatus.Executing,
        statusReason: null,
        permissionMode: 'assist',
        riskLevel: 'low',
        plan: [],
        toolCalls: [],
        result: {},
      } as never,
      memory,
      contextLimit: 40,
      isRecord: (value): value is Record<string, unknown> =>
        typeof value === 'object' && value !== null && !Array.isArray(value),
    });

    expect(summary.memory).toMatchObject({
      taskMemory: {
        currentTask: {
          state: 'searching_candidates',
          shouldSearchNow: true,
        },
      },
      taskSlots: {
        activity: { value: '散步', state: 'completed' },
        time_window: { value: '今天晚上', state: 'completed' },
        location_text: { value: '青岛大学附近', state: 'completed' },
        candidate_preference: {
          value: '女生，舞蹈相关公开标签优先',
          state: 'answered',
        },
      },
      taskSlotSummary: {
        活动: '散步',
        时间: '今天晚上',
        地点: '青岛大学附近',
        候选偏好: '女生，舞蹈相关公开标签优先',
      },
    });
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
