import type { Repository } from 'typeorm';

import { AgentTask, AgentTaskEvent } from './entities/agent-task.entity';
import { SocialAgentEventStore } from './social-agent-event-store.service';
import type { SocialAgentEventV2 } from './social-agent-event-v2.types';

describe('SocialAgentEventStore', () => {
  function event(
    seq: number,
    type: SocialAgentEventV2['type'],
    overrides: Partial<SocialAgentEventV2> = {},
  ): SocialAgentEventV2 {
    return {
      type,
      eventId: `run-1:${seq}`,
      seq,
      createdAt: new Date('2026-06-17T00:00:00.000Z').toISOString(),
      userId: '7',
      threadId: '44',
      taskId: 44,
      runId: 'run-1',
      stage: 'detect_social_intent',
      visibility: 'user_visible',
      display: { title: '正在理解你的需求', state: 'running' },
      ...overrides,
    };
  }

  function storeWithEvents(events: SocialAgentEventV2[]) {
    const rows = events.map(
      (item, index) =>
        ({
          id: index + 1,
          taskId: 44,
          ownerUserId: 7,
          createdAt: new Date(`2026-06-17T00:00:0${index}.000Z`),
          payload: { socialAgentEventV2: item },
        }) as unknown as AgentTaskEvent,
    );
    const findMock = jest.fn().mockResolvedValue(rows);
    const eventRepo = {
      find: findMock,
      save: jest.fn(),
      create: jest.fn((value) => value),
    } as unknown as Repository<AgentTaskEvent>;
    const taskRepo = {
      findOne: jest.fn(),
    } as unknown as Repository<AgentTask>;
    return {
      service: new SocialAgentEventStore(eventRepo, taskRepo),
      eventRepo,
      findMock,
    };
  }

  it('builds a user-visible replay package with terminal and approval state', async () => {
    const { service } = storeWithEvents([
      event(1, 'run.started'),
      event(2, 'visible_process.delta'),
      event(3, 'approval.required', {
        stage: 'approval',
        display: { title: '发送邀请前需要你确认', state: 'waiting' },
      }),
      event(4, 'run.completed', {
        stage: 'approval',
        display: { title: '发送邀请前需要你确认', state: 'waiting' },
      }),
    ]);

    const replay = await service.buildReplayPackage(44, 7);

    expect(replay).toMatchObject({
      taskId: 44,
      threadId: '44',
      runId: 'run-1',
      eventCount: 4,
      returnedCount: 4,
      lastSeq: 4,
      lastEventId: 'run-1:4',
      terminalType: 'run.completed',
      pendingApproval: true,
      summary: expect.objectContaining({
        state: 'waiting',
        pendingApproval: true,
        title: '发送邀请前需要你确认',
        currentStage: 'approval',
        currentSeq: 3,
        expandable: true,
      }),
    });
    expect(replay.events.map((item) => item.seq)).toEqual([1, 2, 3, 4]);
    expect(replay.events.at(-1)?.payload).toMatchObject({
      summary: expect.objectContaining({
        title: replay.summary.title,
        state: replay.summary.state,
        displayMode: 'covering_status',
        updateModel: 'latest_state',
        defaultVisibleCount: 1,
        historyVisibility: 'collapsed',
        pendingApproval: true,
      }),
    });
  });

  it('clears pending approval when approval.resolved is replayed later in the same run', async () => {
    const { service } = storeWithEvents([
      event(1, 'run.started'),
      event(2, 'approval.required', {
        stage: 'approval',
        display: { title: '发送邀请前需要你确认', state: 'waiting' },
        payload: { approvalId: 88, actionType: 'send_invite' },
      }),
      event(3, 'approval.resolved', {
        stage: 'approval',
        display: { title: '已确认这一步', state: 'done' },
        payload: {
          approvalId: 88,
          actionType: 'send_invite',
          decision: 'approved',
        },
      }),
      event(4, 'run.completed'),
    ]);

    await expect(service.buildReplayPackage(44, 7)).resolves.toMatchObject({
      pendingApproval: false,
      events: [
        expect.objectContaining({ type: 'run.started' }),
        expect.objectContaining({ type: 'approval.required' }),
        expect.objectContaining({ type: 'approval.resolved' }),
        expect.objectContaining({ type: 'run.completed' }),
      ],
    });
  });

  it('clears pending approval when approval.resolved arrives from a later resume run', async () => {
    const { service } = storeWithEvents([
      event(1, 'run.started', {
        runId: 'run-before-confirm',
        eventId: 'run-before-confirm:1',
      }),
      event(2, 'approval.required', {
        runId: 'run-before-confirm',
        eventId: 'run-before-confirm:2',
        stage: 'approval',
        display: { title: '发送邀请前需要你确认', state: 'waiting' },
        payload: { approvalId: 88, actionType: 'send_invite' },
      }),
      event(3, 'run.completed', {
        runId: 'run-before-confirm',
        eventId: 'run-before-confirm:3',
      }),
      event(1, 'run.started', {
        runId: 'run-after-confirm',
        eventId: 'run-after-confirm:1',
      }),
      event(2, 'approval.resolved', {
        runId: 'run-after-confirm',
        eventId: 'run-after-confirm:2',
        stage: 'approval',
        display: { title: '已确认这一步', state: 'done' },
        payload: {
          approvalId: 88,
          actionType: 'send_invite',
          decision: 'approved',
        },
      }),
      event(3, 'run.completed', {
        runId: 'run-after-confirm',
        eventId: 'run-after-confirm:3',
      }),
    ]);

    await expect(service.buildReplayPackage(44, 7)).resolves.toMatchObject({
      pendingApproval: false,
      runId: 'run-after-confirm',
      lastEventId: 'run-after-confirm:3',
      terminalType: 'run.completed',
    });
  });

  it('keeps pending approval when a later resolved event belongs to another approval', async () => {
    const { service } = storeWithEvents([
      event(1, 'run.started'),
      event(2, 'approval.required', {
        stage: 'approval',
        display: { title: '发送邀请前需要你确认', state: 'waiting' },
        payload: { approvalId: 88, actionType: 'send_invite' },
      }),
      event(3, 'approval.resolved', {
        stage: 'approval',
        display: { title: '已确认另一个动作', state: 'done' },
        payload: {
          approvalId: 99,
          actionType: 'publish_social_request',
          decision: 'approved',
        },
      }),
      event(4, 'run.completed'),
    ]);

    await expect(service.buildReplayPackage(44, 7)).resolves.toMatchObject({
      pendingApproval: true,
    });
  });

  it('supports incremental replay by seq and event id', async () => {
    const { service } = storeWithEvents([
      event(1, 'run.started'),
      event(2, 'visible_process.delta'),
      event(3, 'slot.completed', { stage: 'slot_filling' }),
      event(4, 'run.completed'),
    ]);

    await expect(
      service.buildReplayPackage(44, 7, { afterSeq: 2 }),
    ).resolves.toMatchObject({
      returnedCount: 2,
      lastSeq: 4,
      events: [
        expect.objectContaining({ seq: 3 }),
        expect.objectContaining({ seq: 4 }),
      ],
    });
    await expect(
      service.buildReplayPackage(44, 7, { afterEventId: 'run-1:3' }),
    ).resolves.toMatchObject({
      returnedCount: 1,
      events: [expect.objectContaining({ seq: 4 })],
    });
  });

  it('preserves chronological replay order across multiple runs with reset seq values', async () => {
    const { service } = storeWithEvents([
      event(1, 'run.started', { runId: 'run-1', eventId: 'run-1:1' }),
      event(2, 'run.completed', { runId: 'run-1', eventId: 'run-1:2' }),
      event(1, 'run.started', { runId: 'run-2', eventId: 'run-2:1' }),
      event(2, 'slot.completed', {
        runId: 'run-2',
        eventId: 'run-2:2',
        stage: 'slot_filling',
      }),
      event(3, 'run.completed', { runId: 'run-2', eventId: 'run-2:3' }),
    ]);

    const replay = await service.buildReplayPackage(44, 7);

    expect(replay.events.map((item) => item.eventId)).toEqual([
      'run-1:1',
      'run-1:2',
      'run-2:1',
      'run-2:2',
      'run-2:3',
    ]);
    expect(replay).toMatchObject({
      runId: 'run-2',
      lastSeq: 3,
      lastEventId: 'run-2:3',
      terminalType: 'run.completed',
    });
  });

  it('orders same-run replay events by event timestamp before row insertion order', async () => {
    const { service } = storeWithEvents([
      event(1, 'run.started', {
        runId: 'run-async',
        eventId: 'run-async:1',
        createdAt: '2026-06-17T00:00:00.001Z',
      }),
      event(2, 'visible_process.delta', {
        runId: 'run-async',
        eventId: 'run-async:2',
        createdAt: '2026-06-17T00:00:00.002Z',
      }),
      event(5, 'tool.progress', {
        runId: 'run-async',
        eventId: 'run-async:5',
        createdAt: '2026-06-17T00:00:00.005Z',
      }),
      event(4, 'tool.done', {
        runId: 'run-async',
        eventId: 'run-async:4',
        createdAt: '2026-06-17T00:00:00.004Z',
      }),
      event(6, 'run.completed', {
        runId: 'run-async',
        eventId: 'run-async:6',
        createdAt: '2026-06-17T00:00:00.006Z',
      }),
    ]);

    const replay = await service.buildReplayPackage(44, 7);

    expect(replay.events.map((item) => item.seq)).toEqual([1, 2, 4, 5, 6]);
  });

  it('does not replay internal or debug events unless debug is requested', async () => {
    const { service } = storeWithEvents([
      event(1, 'run.started'),
      event(2, 'visible_process.delta', { visibility: 'internal' }),
      event(3, 'tool.progress', { visibility: 'debug_only' }),
      event(4, 'run.completed'),
    ]);

    await expect(service.buildReplayPackage(44, 7)).resolves.toMatchObject({
      eventCount: 2,
      returnedCount: 2,
      events: [
        expect.objectContaining({ seq: 1 }),
        expect.objectContaining({ seq: 4 }),
      ],
    });
    await expect(
      service.buildReplayPackage(44, 7, { includeDebug: true }),
    ).resolves.toMatchObject({
      eventCount: 3,
      returnedCount: 3,
      events: [
        expect.objectContaining({ seq: 1 }),
        expect.objectContaining({ seq: 3 }),
        expect.objectContaining({ seq: 4 }),
      ],
    });
  });

  it('sanitizes legacy replay events before returning them to the frontend', async () => {
    const { service } = storeWithEvents([
      event(1, 'candidate_search.done', {
        stage: 'search_candidates',
        display: {
          title: 'tool_call_started planner traceId',
          detail: 'raw JSON stack internal runtime',
          state: 'done',
        },
        payload: {
          candidateCount: 3,
          activityCount: 1,
          safeSummary: '公开资料里都提到了散步',
          traceId: 'hidden-trace',
          planner: { route: 'secret-plan' },
          rawJson: { internal: true },
          toolInput: { query: 'secret-query' },
          phone: '15253005312',
          latitude: 36.123456,
          nested: {
            publicSummary: '共同兴趣匹配',
            systemPrompt: 'do not expose',
          },
          candidates: [
            {
              publicSummary: '喜欢低强度散步',
              email: 'hidden@example.com',
              sql: 'select * from users',
            },
          ],
        },
      }),
    ]);

    const replay = await service.buildReplayPackage(44, 7);
    const replayEvent = replay.events[0];

    expect(replayEvent).toMatchObject({
      type: 'candidate_search.done',
      display: {
        title: '找到 3 个公开可发现的人',
        detail: '只使用公开可发现的信息，联系对方前仍需要你确认。',
        state: 'done',
      },
      payload: {
        candidateCount: 3,
        activityCount: 1,
        safeSummary: '公开资料里都提到了散步',
        nested: { publicSummary: '共同兴趣匹配' },
        candidates: [{ publicSummary: '喜欢低强度散步' }],
      },
    });
    expect(JSON.stringify(replay)).not.toMatch(
      /tool_call_started|planner|traceId|raw JSON|stack|internal runtime|hidden-trace|secret-plan|secret-query|15253005312|36\.123456|hidden@example\.com|select \*/i,
    );
  });

  it('normalizes legacy replay events that were persisted before a task id was bound', async () => {
    const { service } = storeWithEvents([
      event(1, 'run.started', {
        taskId: null,
        threadId: 'user-7',
      }),
      event(2, 'visible_process.delta', {
        taskId: null,
        threadId: 'user-7',
        stage: 'hydrate_context',
        display: { title: '正在读取你的偏好', state: 'running' },
      }),
      event(3, 'run.completed', {
        taskId: 44,
        threadId: 'agent-task:44',
        display: { title: '这一步处理完成', state: 'done' },
      }),
    ]);

    const replay = await service.buildReplayPackage(44, 7);

    expect(replay.threadId).toBe('agent-task:44');
    expect(replay.events[0]).toMatchObject({
      taskId: 44,
      threadId: 'agent-task:44',
    });
    expect(replay.events[1]).toMatchObject({
      taskId: 44,
      threadId: 'agent-task:44',
    });
    expect(replay.summary).toMatchObject({
      title: '已理解你的需求',
      currentSeq: 3,
    });
  });

  it('lists replay events from checkpoint-style thread ids', async () => {
    const { service, findMock } = storeWithEvents([
      event(1, 'run.started'),
      event(2, 'slot.completed', { stage: 'slot_filling' }),
    ]);

    const rows = await service.listEventsByThread('agent-task:44');

    expect(rows).toHaveLength(2);
    expect(findMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { taskId: 44 },
      }),
    );
  });
});
