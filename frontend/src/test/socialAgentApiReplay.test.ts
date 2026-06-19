import { beforeEach, describe, expect, it, vi } from 'vitest';

import { socialAgentApi } from '../api/socialAgentApi';
import { requestProtected } from '../api/baseClient';

vi.mock('../api/baseClient', () => ({
  AUTH_EXPIRED_MESSAGE: '登录已过期，请重新登录',
  fetchWithAuth: vi.fn(),
  requestProtected: vi.fn(),
}));

const requestProtectedMock = vi.mocked(requestProtected);

describe('socialAgentApi Social Codex replay', () => {
  beforeEach(() => {
    requestProtectedMock.mockReset();
    requestProtectedMock.mockResolvedValue({
      taskId: 44,
      threadId: '44',
      runId: 'run-44',
      eventCount: 2,
      returnedCount: 1,
      lastSeq: 2,
      lastEventId: 'run-44:2',
      terminalType: 'run.completed',
      pendingApproval: false,
      events: [],
      eval: {
        pass: true,
        issues: [],
        regressionChecks: [
          {
            id: 'visible_process_trace',
            label: '可见过程时间线',
            pass: true,
            message: '已出现可见过程。',
          },
        ],
        replayCase: {
          runId: 'run-44',
          threadId: '44',
          taskId: 44,
          eventCount: 2,
          stages: ['detect_social_intent'],
          approvalRequired: false,
          terminalType: 'run.completed',
        },
      },
    });
  });

  it('reads the task replay package with cursor query parameters', async () => {
    const replay = await socialAgentApi.getTaskEventReplay(44, {
      afterSeq: 7,
      afterEventId: 'run-44:7',
    });

    expect(requestProtectedMock).toHaveBeenCalledWith(
      '/social-agent/tasks/44/events/replay?afterSeq=7&afterEventId=run-44%3A7',
    );
    expect(replay).toMatchObject({
      taskId: 44,
      threadId: '44',
      runId: 'run-44',
      eval: expect.objectContaining({
        pass: true,
        regressionChecks: [
          expect.objectContaining({
            id: 'visible_process_trace',
            pass: true,
          }),
        ],
      }),
    });
  });

  it('reads Social Codex regression checks from the task eval endpoint', async () => {
    requestProtectedMock.mockResolvedValueOnce({
      pass: false,
      issues: [
        {
          code: 'missing_visible_process_trace',
          message: '社交任务缺少用户可见过程。',
        },
      ],
      regressionChecks: [
        {
          id: 'visible_process_trace',
          label: '可见过程时间线',
          pass: false,
          message: '社交/约练 run 需要过程时间线。',
        },
        {
          id: 'thread_task_run_binding',
          label: 'Thread / task / run 绑定',
          pass: true,
          message: '绑定稳定。',
        },
      ],
      replayCase: {
        runId: 'run-44',
        threadId: 'agent-task:44',
        taskId: 44,
        eventCount: 3,
        stages: ['slot_filling'],
        approvalRequired: false,
        terminalType: 'run.completed',
      },
    });

    const evalResult = await socialAgentApi.getTaskEventEval(44);

    expect(requestProtectedMock).toHaveBeenCalledWith('/social-agent/tasks/44/events/eval');
    expect(evalResult.regressionChecks).toEqual([
      expect.objectContaining({
        id: 'visible_process_trace',
        pass: false,
      }),
      expect.objectContaining({
        id: 'thread_task_run_binding',
        pass: true,
      }),
    ]);
  });

  it('does not request debug replay unless explicitly enabled', async () => {
    await socialAgentApi.getTaskEventReplay(44);
    await socialAgentApi.getTaskEventReplay(44, { includeDebug: true });

    expect(requestProtectedMock).toHaveBeenNthCalledWith(
      1,
      '/social-agent/tasks/44/events/replay',
    );
    expect(requestProtectedMock).toHaveBeenNthCalledWith(
      2,
      '/social-agent/tasks/44/events/replay?includeDebug=true',
    );
  });

  it('keeps SocialAgentEventV2 replay events available for visible process restore', async () => {
    requestProtectedMock.mockResolvedValueOnce({
      taskId: 44,
      threadId: 'agent-task:44',
      runId: 'run-44',
      eventCount: 4,
      returnedCount: 4,
      lastSeq: 4,
      lastEventId: 'run-44:4',
      terminalType: 'run.completed',
      pendingApproval: false,
      events: [
        {
          type: 'visible_process.delta',
          eventId: 'run-44:1',
          seq: 1,
          createdAt: '2026-06-17T00:00:00.000Z',
          userId: '7',
          threadId: 'agent-task:44',
          taskId: 44,
          runId: 'run-44',
          stage: 'hydrate_context',
          visibility: 'user_visible',
          display: {
            title: '正在读取你的偏好',
            state: 'running',
          },
        },
        {
          type: 'approval.required',
          eventId: 'run-44:2',
          seq: 2,
          createdAt: '2026-06-17T00:00:01.000Z',
          userId: '7',
          threadId: 'agent-task:44',
          taskId: 44,
          runId: 'run-44',
          stage: 'approval',
          visibility: 'user_visible',
          display: {
            title: '发送邀请前需要你确认',
            state: 'waiting',
          },
          payload: {
            approvalId: 'approve-44',
            checkpointId: 44,
          },
        },
        {
          type: 'approval.resolved',
          eventId: 'run-44:3',
          seq: 3,
          createdAt: '2026-06-17T00:00:02.000Z',
          userId: '7',
          threadId: 'agent-task:44',
          taskId: 44,
          runId: 'run-44',
          stage: 'approval',
          visibility: 'user_visible',
          display: {
            title: '已确认这一步',
            state: 'done',
          },
          payload: {
            decision: 'approved',
            checkpointId: 44,
          },
        },
        {
          type: 'run.completed',
          eventId: 'run-44:4',
          seq: 4,
          createdAt: '2026-06-17T00:00:03.000Z',
          userId: '7',
          threadId: 'agent-task:44',
          taskId: 44,
          runId: 'run-44',
          stage: 'send_invite',
          visibility: 'user_visible',
          display: {
            title: '这一步处理完成',
            state: 'done',
          },
        },
      ],
      eval: {
        pass: true,
        issues: [],
        regressionChecks: [
          {
            id: 'approval_lifecycle',
            label: '审批生命周期',
            pass: true,
            message: '审批已闭环。',
          },
        ],
        replayCase: {
          runId: 'run-44',
          threadId: 'agent-task:44',
          taskId: 44,
          eventCount: 4,
          stages: ['hydrate_context', 'approval', 'send_invite'],
          approvalRequired: true,
          terminalType: 'run.completed',
        },
      },
    });

    const replay = await socialAgentApi.getTaskEventReplay(44);

    expect(replay.threadId).toBe('agent-task:44');
    expect(replay.events.map((event) => event.type)).toEqual([
      'visible_process.delta',
      'approval.required',
      'approval.resolved',
      'run.completed',
    ]);
    expect(replay.events[0]).toMatchObject({
      taskId: 44,
      display: { title: '正在读取你的偏好' },
    });
    expect(replay.eval?.replayCase).toMatchObject({
      approvalRequired: true,
      terminalType: 'run.completed',
    });
  });
});
