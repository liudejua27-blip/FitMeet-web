import { SocialAgentTasksController } from './social-agent-tasks.controller';
import {
  SocialAgentToolExecutorService,
  SocialAgentToolName,
} from './social-agent-tool-executor.service';
import type { SocialAgentEventV2 } from './social-agent-event-v2.types';

describe('SocialAgentTasksController', () => {
  function socialCodexEvent(
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
      threadId: 'agent-task:42',
      taskId: 42,
      runId: 'run-1',
      stage: 'detect_social_intent',
      visibility: 'user_visible',
      display: { title: '正在理解你的约练需求', state: 'running' },
      ...overrides,
    };
  }

  function taskEvent(event: SocialAgentEventV2, id = event.seq) {
    return {
      id,
      taskId: 42,
      ownerUserId: 7,
      payload: { socialAgentEventV2: event },
      createdAt: new Date(event.createdAt),
    };
  }

  function makeControllerForEvents(events: SocialAgentEventV2[]) {
    const task = { id: 42, ownerUserId: 7 };
    const taskRepo = {
      findOne: jest.fn().mockResolvedValue(task),
    };
    const eventRepo = {
      find: jest.fn().mockResolvedValue(events.map((event) => taskEvent(event))),
    };
    const controller = new SocialAgentTasksController(
      taskRepo as never,
      eventRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { controller, eventRepo, taskRepo };
  }

  it('routes run-next through the task executor with the authenticated user id', async () => {
    const runNextResult = {
      taskId: 42,
      executedSteps: 1,
      succeededSteps: 1,
      failedSteps: 0,
      blockedSteps: 0,
      status: 'waiting_reply',
      handledReply: true,
      decision: { nextAction: 'reply_message' },
      cards: [
        {
          id: 'meet-loop-reply-42',
          type: 'meet_loop_timeline',
          title: '对方已回复',
          body: '建议先回复对方的问题。',
          status: 'ready',
          data: {
            schemaName: 'MeetLoopTimeline',
            schemaType: 'meet_loop.timeline',
            counterpartIntent: 'ask_question',
          },
          actions: [],
        },
      ],
    };
    const executor = {
      runNext: jest.fn().mockResolvedValue(runNextResult),
    };
    const controller = new SocialAgentTasksController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      executor as unknown as SocialAgentToolExecutorService,
      {} as never,
    );

    await expect(
      controller.runNext({ user: { id: 7 } } as never, 42),
    ).resolves.toEqual(runNextResult);
    expect(executor.runNext).toHaveBeenCalledWith(42, 7);
  });

  it('routes registered tool calls through the unified executor boundary', async () => {
    const task = { id: 42, ownerUserId: 7 };
    const taskRepo = {
      findOne: jest.fn().mockResolvedValue(task),
    };
    const toolResult = {
      id: 'action_search_matches_1',
      toolName: SocialAgentToolName.SearchMatches,
      status: 'succeeded',
      output: { candidates: [] },
      error: null,
    };
    const executor = {
      executeToolAction: jest.fn().mockResolvedValue(toolResult),
    };
    const controller = new SocialAgentTasksController(
      taskRepo as never,
      {} as never,
      {} as never,
      {} as never,
      executor as unknown as SocialAgentToolExecutorService,
      {} as never,
    );

    await expect(
      controller.callRegisteredTool(
        { user: { id: 7 } } as never,
        42,
        SocialAgentToolName.SearchMatches,
        { city: '青岛', activityType: 'running' },
      ),
    ).resolves.toEqual(toolResult);
    expect(taskRepo.findOne).toHaveBeenCalledWith({
      where: { id: 42, ownerUserId: 7 },
    });
    expect(executor.executeToolAction).toHaveBeenCalledWith(
      42,
      SocialAgentToolName.SearchMatches,
      { city: '青岛', activityType: 'running' },
      7,
    );
  });

  it('exposes Social Codex trace eval failures for high-risk side effects before approved resume', async () => {
    const { controller } = makeControllerForEvents([
      socialCodexEvent(1, 'run.started'),
      socialCodexEvent(2, 'safety_check.done', {
        stage: 'safety_filter',
        display: { title: '已检查安全边界', state: 'done' },
      }),
      socialCodexEvent(3, 'approval.required', {
        stage: 'approval',
        display: { title: '发送邀请前需要你确认', state: 'waiting' },
        payload: {
          approvalId: 88,
          checkpointId: 99,
          actionType: 'send_invite',
          dryRunPreview: { title: '邀请发送草稿' },
          auditRequired: true,
        },
      }),
      socialCodexEvent(4, 'tool.done', {
        stage: 'send_invite',
        display: { title: '邀请已发送', state: 'done' },
        payload: { actionType: 'send_invite' },
      }),
      socialCodexEvent(5, 'run.completed', {
        stage: 'send_invite',
        display: { title: '这一步处理完成', state: 'done' },
      }),
    ]);

    const result = await controller.evaluateEvents(
      { user: { id: 7 } } as never,
      42,
    );

    expect(result.pass).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'high_risk_before_approval_resolved',
        }),
      ]),
    );
  });

  it('embeds the same trace eval result in replay packages for QA and reconnect', async () => {
    const { controller } = makeControllerForEvents([
      socialCodexEvent(1, 'run.started'),
      socialCodexEvent(2, 'safety_check.done', {
        stage: 'safety_filter',
        display: { title: '已检查安全边界', state: 'done' },
      }),
      socialCodexEvent(3, 'approval.required', {
        stage: 'approval',
        display: { title: '发送邀请前需要你确认', state: 'waiting' },
        payload: {
          approvalId: 88,
          checkpointId: 99,
          actionType: 'send_invite',
          dryRunPreview: { title: '邀请发送草稿' },
          auditRequired: true,
        },
      }),
      socialCodexEvent(4, 'approval.resolved', {
        stage: 'approval',
        display: { title: '已确认发送邀请', state: 'done' },
        payload: {
          approvalId: 88,
          checkpointId: 99,
          actionType: 'send_invite',
          decision: 'approved',
        },
      }),
      socialCodexEvent(5, 'tool.done', {
        stage: 'send_invite',
        display: { title: '邀请已按你的确认发送', state: 'done' },
        payload: { actionType: 'send_invite' },
      }),
      socialCodexEvent(6, 'run.completed', {
        stage: 'send_invite',
        display: { title: '这一步处理完成', state: 'done' },
      }),
    ]);

    const replay = await controller.replayEvents(
      { user: { id: 7 } } as never,
      42,
    );

    expect(replay).toMatchObject({
      taskId: 42,
      pendingApproval: false,
      terminalType: 'run.completed',
      eval: expect.objectContaining({
        pass: true,
        replayCase: expect.objectContaining({
          runId: 'run-1',
          threadId: 'agent-task:42',
          approvalRequired: true,
          terminalType: 'run.completed',
        }),
      }),
    });
  });

  it('keeps replay pendingApproval true when approval.resolved is for a different checkpoint', async () => {
    const { controller } = makeControllerForEvents([
      socialCodexEvent(1, 'run.started'),
      socialCodexEvent(2, 'approval.required', {
        stage: 'approval',
        display: { title: '发送邀请前需要你确认', state: 'waiting' },
        payload: {
          approvalId: 88,
          checkpointId: 99,
          actionType: 'send_invite',
          dryRunPreview: { title: '邀请发送草稿' },
        },
      }),
      socialCodexEvent(3, 'approval.resolved', {
        stage: 'approval',
        display: { title: '已确认另一个动作', state: 'done' },
        payload: {
          approvalId: 188,
          checkpointId: 199,
          actionType: 'publish_social_request',
          decision: 'approved',
        },
      }),
      socialCodexEvent(4, 'run.completed', {
        stage: 'approval',
        display: { title: '发送邀请前需要你确认', state: 'waiting' },
      }),
    ]);

    const replay = await controller.replayEvents(
      { user: { id: 7 } } as never,
      42,
    );

    expect(replay).toMatchObject({
      pendingApproval: true,
    });
  });

  it('clears replay pendingApproval when approval resolves in a later resume run', async () => {
    const { controller } = makeControllerForEvents([
      socialCodexEvent(1, 'run.started', {
        runId: 'run-before-confirm',
        eventId: 'run-before-confirm:1',
      }),
      socialCodexEvent(2, 'approval.required', {
        runId: 'run-before-confirm',
        eventId: 'run-before-confirm:2',
        stage: 'approval',
        display: { title: '发送邀请前需要你确认', state: 'waiting' },
        payload: {
          approvalId: 88,
          checkpointId: 99,
          actionType: 'send_invite',
          dryRunPreview: { title: '邀请发送草稿' },
          auditRequired: true,
        },
      }),
      socialCodexEvent(3, 'run.completed', {
        runId: 'run-before-confirm',
        eventId: 'run-before-confirm:3',
        stage: 'approval',
        display: { title: '发送邀请前需要你确认', state: 'waiting' },
      }),
      socialCodexEvent(1, 'run.started', {
        runId: 'run-after-confirm',
        eventId: 'run-after-confirm:1',
      }),
      socialCodexEvent(2, 'approval.resolved', {
        runId: 'run-after-confirm',
        eventId: 'run-after-confirm:2',
        stage: 'approval',
        display: { title: '已确认这一步', state: 'done' },
        payload: {
          approvalId: 88,
          checkpointId: 99,
          actionType: 'send_invite',
          decision: 'approved',
        },
      }),
      socialCodexEvent(3, 'run.completed', {
        runId: 'run-after-confirm',
        eventId: 'run-after-confirm:3',
        stage: 'approval',
        display: { title: '这一步处理完成', state: 'done' },
      }),
    ]);

    const replay = await controller.replayEvents(
      { user: { id: 7 } } as never,
      42,
    );

    expect(replay).toMatchObject({
      pendingApproval: false,
      runId: 'run-after-confirm',
      terminalType: 'run.completed',
      lastEventId: 'run-after-confirm:3',
    });
  });

  it('keeps replay endpoint user-visible by default and gates debug events', async () => {
    const { controller } = makeControllerForEvents([
      socialCodexEvent(1, 'run.started'),
      socialCodexEvent(2, 'visible_process.delta', {
        visibility: 'debug_only',
        display: {
          title: 'debug planner traceId=hidden',
          state: 'running',
        },
        payload: { planner: 'hidden plan', traceId: 'trace-hidden' },
      }),
      socialCodexEvent(3, 'visible_process.delta', {
        visibility: 'internal',
        display: {
          title: 'internal hydrate_context payload',
          state: 'running',
        },
        payload: { internalDraft: 'never show this' },
      }),
      socialCodexEvent(4, 'run.completed', {
        display: { title: '这一步处理完成', state: 'done' },
      }),
    ]);

    const defaultReplay = await controller.replayEvents(
      { user: { id: 7 } } as never,
      42,
    );
    const debugReplay = await controller.replayEvents(
      { user: { id: 7 } } as never,
      42,
      undefined,
      undefined,
      'true',
    );

    expect(defaultReplay).toMatchObject({
      eventCount: 2,
      returnedCount: 2,
      events: [
        expect.objectContaining({ seq: 1 }),
        expect.objectContaining({ seq: 4 }),
      ],
    });
    expect(JSON.stringify(defaultReplay)).not.toMatch(
      /planner|traceId|internalDraft|hydrate_context|hidden/,
    );
    expect(debugReplay).toMatchObject({
      eventCount: 3,
      returnedCount: 3,
      events: [
        expect.objectContaining({ seq: 1 }),
        expect.objectContaining({ seq: 2, visibility: 'debug_only' }),
        expect.objectContaining({ seq: 4 }),
      ],
    });
    expect(JSON.stringify(debugReplay)).not.toContain('internalDraft');
  });
});
