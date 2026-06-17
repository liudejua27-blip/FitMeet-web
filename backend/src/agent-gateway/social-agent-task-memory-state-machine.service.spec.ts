import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { SocialAgentTaskMemoryStateMachineService } from './social-agent-task-memory-state-machine.service';

function makeTask(memory: Record<string, unknown> = {}): AgentTask {
  return {
    id: 88,
    ownerUserId: 7,
    agentConnectionId: null,
    taskType: 'social_agent_chat',
    title: '',
    goal: '',
    input: {},
    plan: [],
    toolCalls: [],
    result: {},
    memory,
    status: AgentTaskStatus.AwaitingFeedback,
    permissionMode: AgentTaskPermissionMode.Confirm,
    riskLevel: 'low' as never,
    idempotencyKey: null,
    statusReason: null,
    error: null,
    startedAt: null,
    awaitingConfirmationAt: null,
    completedAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  } as unknown as AgentTask;
}

describe('SocialAgentTaskMemoryStateMachineService', () => {
  const service = new SocialAgentTaskMemoryStateMachineService();

  it('extracts and completes required social slots from one user message', () => {
    const task = makeTask();

    const result = service.applyUserMessage(
      task,
      '周末下午，散步，崂山区青岛大学，第一次见面只接受公共场所',
    );

    expect(result.missingRequired).toEqual([]);
    expect(result.slots.activity).toMatchObject({
      value: '散步',
      state: 'completed',
    });
    expect(result.slots.time_window).toMatchObject({
      value: '周末下午',
      state: 'completed',
    });
    expect(result.slots.location_text).toMatchObject({
      value: '崂山区青岛大学',
      state: 'completed',
    });
    expect(result.slots.safety_boundary?.value).toContain('公共场所');
  });

  it('does not ask again for answered slots on later turns', () => {
    const task = makeTask();
    service.applyUserMessage(task, '周末下午，散步，崂山区青岛大学');

    const second = service.applyUserMessage(task, '可以，帮我找人');
    const slots = service.readSlots(task);

    expect(second.missingRequired).toEqual([]);
    expect(
      service.avoidRepeatingAnsweredQuestions(
        ['activity', 'time_window'],
        slots,
      ),
    ).toEqual([]);
    expect(slots.activity?.value).toBe('散步');
    expect(slots.time_window?.value).toBe('周末下午');
  });

  it('does not treat inferred required slots as completed answers', () => {
    const now = new Date('2026-06-17T00:00:00.000Z').toISOString();
    const inferred = service.mergeSlots(
      {},
      {
        activity: {
          key: 'activity',
          value: '散步',
          state: 'inferred',
          source: 'inferred',
          updatedAt: now,
        },
        time_window: {
          key: 'time_window',
          value: '周末下午',
          state: 'inferred',
          source: 'inferred',
          updatedAt: now,
        },
        location_text: {
          key: 'location_text',
          value: '青岛大学附近',
          state: 'inferred',
          source: 'inferred',
          updatedAt: now,
        },
        geo_area: {
          key: 'geo_area',
          value: '崂山区',
          state: 'inferred',
          source: 'inferred',
          updatedAt: now,
        },
      },
    );

    expect(inferred.completed).toHaveLength(0);
    expect(inferred.missingRequired).toEqual([
      'activity',
      'time_window',
      'location_text',
    ]);
    expect(inferred.slots.geo_area).toMatchObject({
      value: '崂山区',
      state: 'inferred',
    });
    expect(
      service.avoidRepeatingAnsweredQuestions(
        inferred.missingRequired,
        inferred.slots,
      ),
    ).toEqual(['activity', 'time_window', 'location_text']);
  });

  it('marks modified slots when the user changes an answer', () => {
    const task = makeTask();
    service.applyUserMessage(task, '周末下午，散步，青岛大学附近');

    const updated = service.applyUserMessage(task, '改成今晚跑步吧');

    expect(
      updated.changed.find((slot) => slot.key === 'activity'),
    ).toMatchObject({
      value: '跑步',
      state: 'modified',
    });
    expect(
      updated.changed.find((slot) => slot.key === 'time_window'),
    ).toMatchObject({
      value: '今晚',
      state: 'modified',
    });
  });
});
