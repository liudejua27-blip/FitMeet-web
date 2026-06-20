import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { readSocialAgentTaskMemory } from './social-agent-memory.util';
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

  it('extracts public candidate preferences without making them required', () => {
    const task = makeTask();

    const result = service.applyUserMessage(
      task,
      '我想在青岛大学、今天晚上、找个女生散步、最好是舞蹈生。',
    );

    expect(result.missingRequired).toEqual([]);
    expect(result.slots.time_window).toMatchObject({
      value: '今天晚上',
      state: 'completed',
    });
    expect(result.slots.location_text).toMatchObject({
      value: '青岛大学',
      state: 'completed',
    });
    expect(result.slots.activity).toMatchObject({
      value: '散步',
      state: 'completed',
    });
    expect(result.slots.candidate_preference).toMatchObject({
      value: expect.stringContaining('女生'),
      state: 'answered',
    });
    expect(result.slots.candidate_preference?.value).toContain('舞蹈');
  });

  it('keeps compact gender and dance preference when the user says female dance student', () => {
    const task = makeTask();

    const result = service.applyUserMessage(
      task,
      '今天晚上在青岛大学附近，找个女舞蹈生散步。',
    );

    expect(result.missingRequired).toEqual([]);
    expect(result.slots.time_window).toMatchObject({
      value: '今天晚上',
      state: 'completed',
    });
    expect(result.slots.location_text).toMatchObject({
      value: '青岛大学附近',
      state: 'completed',
    });
    expect(result.slots.activity).toMatchObject({
      value: '散步',
      state: 'completed',
    });
    expect(result.slots.candidate_preference?.value).toContain('女生');
    expect(result.slots.candidate_preference?.value).toContain('舞蹈相关');
  });

  it('persists known slot constraints with completed fields and candidate preferences', () => {
    const task = makeTask();

    service.applyUserMessage(
      task,
      '今天晚上在青岛大学附近，找个女舞蹈生散步。',
    );

    const memory = task.memory as Record<string, unknown>;
    expect(memory.knownTaskSlotConstraints).toMatchObject({
      treatAsHardConstraints: true,
      doNotAskAgainFor: expect.arrayContaining([
        'activity',
        'time_window',
        'location_text',
        'candidate_preference',
      ]),
      userVisibleSummary: expect.stringContaining('时间：今天晚上'),
      candidatePreferencePolicy: expect.stringContaining('公开可发现资料'),
    });
    expect(
      JSON.stringify(memory.knownTaskSlotConstraints),
    ).toContain('舞蹈相关');
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

  it('preserves completed core slots when the user corrects only candidate preference', () => {
    const task = makeTask();
    service.applyUserMessage(
      task,
      '今天晚上在青岛大学附近，找个女生散步。',
    );

    const corrected = service.applyUserMessage(
      task,
      '我说的是找个女舞蹈生散步，你到底懂没懂我的意思',
    );
    const slots = service.readSlots(task);

    expect(corrected.missingRequired).toEqual([]);
    expect(slots.time_window).toMatchObject({
      value: '今天晚上',
      state: 'completed',
    });
    expect(slots.location_text).toMatchObject({
      value: '青岛大学附近',
      state: 'completed',
    });
    expect(slots.activity).toMatchObject({
      value: '散步',
      state: 'completed',
    });
    expect(slots.candidate_preference?.value).toContain('女生');
    expect(slots.candidate_preference?.value).toContain('舞蹈相关');
    expect(
      service.avoidRepeatingAnsweredQuestions(
        ['activity', 'time_window', 'location_text'],
        slots,
      ),
    ).toEqual([]);
  });

  it('uses stricter required slots for publish and invite task types', () => {
    const task = makeTask({
      currentTask: { type: 'publish_social_request' },
    });

    const draft = service.applyUserMessage(
      task,
      '周末下午，散步，崂山区青岛大学',
    );

    expect(draft.missingRequired).toEqual([
      'visibility',
      'safety_boundary',
    ]);

    const completed = service.applyUserMessage(
      task,
      '可以公开到发现，第一次见面只接受公共场所',
    );

    expect(completed.missingRequired).toEqual([]);
    expect(completed.slots.visibility).toMatchObject({
      value: '可公开到发现',
      state: 'completed',
    });
    expect(completed.slots.safety_boundary?.value).toContain('公共场所');
  });

  it('reads task type from nested task memory so restored invite runs keep stricter gates', () => {
    const task = makeTask({
      taskMemory: {
        currentTask: {
          type: 'send_invite',
        },
      },
    });

    const draft = service.applyUserMessage(
      task,
      '今天晚上，散步，青岛大学附近',
    );

    expect(draft.missingRequired).toEqual(
      expect.arrayContaining(['invite_tone', 'safety_boundary']),
    );
    expect(draft.missingRequired).not.toContain('activity');
    expect(draft.missingRequired).not.toContain('time_window');
    expect(draft.missingRequired).not.toContain('location_text');

    const completed = service.applyUserMessage(
      task,
      '邀请语气轻松自然，第一次见面只接受公共场所',
    );

    expect(completed.missingRequired).toEqual([]);
    expect(completed.slots.invite_tone).toMatchObject({
      value: '轻松自然',
      state: 'completed',
    });
    expect(completed.slots.safety_boundary?.value).toContain('公共场所');
  });

  it('syncs visibility slot into task memory public activity boundary', () => {
    const task = makeTask({
      memory: {
        taskMemory: {
          boundaries: {
            publicActivityAllowed: false,
          },
        },
      },
    });

    service.applyUserMessage(task, '可以发布到发现，公开给附近的人看');

    expect(service.readSlots(task).visibility).toMatchObject({
      value: '可公开到发现',
      state: 'answered',
    });
    expect(readSocialAgentTaskMemory(task).boundaries).toMatchObject({
      publicActivityAllowed: true,
    });

    service.applyUserMessage(task, '先不要发布到发现');

    expect(service.readSlots(task).visibility).toMatchObject({
      value: '暂不公开',
      state: 'modified',
    });
    expect(readSocialAgentTaskMemory(task).boundaries).toMatchObject({
      publicActivityAllowed: false,
    });
  });

  it('does not repeat stricter task questions once answered', () => {
    const task = makeTask({
      currentTask: { type: 'send_invite' },
    });
    service.applyUserMessage(
      task,
      '周末下午，散步，崂山区青岛大学，第一次见面只接受公共场所，语气轻松自然',
    );

    const second = service.applyUserMessage(task, '可以，帮我生成开场白');

    expect(second.missingRequired).toEqual([]);
    expect(
      service.avoidRepeatingAnsweredQuestions(
        ['activity', 'time_window', 'invite_tone', 'safety_boundary'],
        service.readSlots(task),
      ),
    ).toEqual([]);
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
