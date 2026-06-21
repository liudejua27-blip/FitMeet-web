import { describe, expect, it, vi, beforeEach } from 'vitest';

import { socialAgentApi } from '../api/socialAgentApi';
import { fetchWithAuth, requestProtected } from '../api/baseClient';

vi.mock('../api/baseClient', () => ({
  AUTH_EXPIRED_MESSAGE: '登录已过期，请重新登录',
  fetchWithAuth: vi.fn(),
  requestProtected: vi.fn(),
}));

const fetchWithAuthMock = vi.mocked(fetchWithAuth);
const requestProtectedMock = vi.mocked(requestProtected);

describe('socialAgentApi checkpoint stream endpoints', () => {
  beforeEach(() => {
    fetchWithAuthMock.mockReset();
    requestProtectedMock.mockReset();
    fetchWithAuthMock.mockResolvedValue(streamResponse());
  });

  it.each([
    ['retry', '/social-agent/chat/checkpoints/11/steps/search%20candidates/retry/stream'],
    ['replay', '/social-agent/chat/checkpoints/11/steps/search%20candidates/replay/stream'],
    ['fork', '/social-agent/chat/checkpoints/11/steps/search%20candidates/fork/stream'],
  ] as const)(
    'uses the step-level %s stream endpoint when a stepId is provided',
    async (action, expectedPath) => {
      const onEvent = vi.fn();

      await socialAgentApi.runCheckpointStream(
        {
          checkpointId: 11,
          stepId: ' search candidates ',
          action,
        },
        onEvent,
      );

      expect(requestProtectedMock).not.toHaveBeenCalled();
      expect(fetchWithAuthMock).toHaveBeenCalledWith(
        expectedPath,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ decision: null }),
        }),
      );
      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'result',
        }),
      );
    },
  );

  it('uses checkpoint-level retry when no stepId is provided', async () => {
    await socialAgentApi.runCheckpointStream(
      {
        checkpointId: 11,
        action: 'retry',
      },
      vi.fn(),
    );

    expect(requestProtectedMock).not.toHaveBeenCalled();
    expect(fetchWithAuthMock).toHaveBeenCalledWith(
      '/social-agent/chat/checkpoints/11/retry/stream',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('preserves approval decisions and abort signals for checkpoint streams', async () => {
    const controller = new AbortController();
    const onEvent = vi.fn();

    await socialAgentApi.runCheckpointStream(
      {
        checkpointId: 12,
        stepId: 'approval gate',
        action: 'fork',
        decision: 'approved',
      },
      onEvent,
      controller.signal,
    );

    expect(requestProtectedMock).not.toHaveBeenCalled();
    expect(fetchWithAuthMock).toHaveBeenCalledWith(
      '/social-agent/chat/checkpoints/12/steps/approval%20gate/fork/stream',
      expect.objectContaining({
        method: 'POST',
        signal: controller.signal,
        body: JSON.stringify({ decision: 'approved' }),
      }),
    );
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'result' }));
  });

  it('does not pre-create a checkpoint before the streaming endpoint runs', async () => {
    await socialAgentApi.runCheckpointStream(
      {
        checkpointId: 11,
        stepId: 'search candidates',
        action: 'retry',
      },
      vi.fn(),
    );

    expect(requestProtectedMock).not.toHaveBeenCalled();
    expect(fetchWithAuthMock).toHaveBeenCalledWith(
      '/social-agent/chat/checkpoints/11/steps/search%20candidates/retry/stream',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('turns SocialAgentEventV2 run.failed into a structured stream recovery error', async () => {
    fetchWithAuthMock.mockResolvedValueOnce(runFailedStreamResponse());
    const onEvent = vi.fn();

    await expect(
      socialAgentApi.runCheckpointStream(
        {
          checkpointId: 21,
          action: 'retry',
        },
        onEvent,
      ),
    ).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      message: '当前需求还在，可以继续处理。',
      recoveryNotice: expect.objectContaining({
        kind: 'interrupted',
        title: '刚才连接中断了',
        source: 'stream_error',
      }),
    });

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'run.failed',
        eventId: 'run-failed:1',
        stage: 'hydrate_context',
      }),
    );
  });

  it('turns an incomplete user-facing stream into a structured recovery error', async () => {
    fetchWithAuthMock.mockResolvedValueOnce(incompleteRunStartedStreamResponse());
    const onEvent = vi.fn();

    await expect(
      socialAgentApi.runUserFacingStream(
        {
          goal: '继续找人',
          permissionMode: 'confirm',
        },
        onEvent,
      ),
    ).rejects.toMatchObject({
      code: 'AGENT_STREAM_INCOMPLETE',
      message: '可以继续处理，我会从这里接着处理；也可以补充新的要求。',
      recoveryNotice: expect.objectContaining({
        kind: 'interrupted',
        title: '这段需求还在',
        source: 'stream_error',
        retryable: true,
      }),
    });

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'run.started',
        eventId: 'run-started:1',
      }),
    );
  });

  it('synthesizes a final result from V2-only assistant delta and run completed events', async () => {
    fetchWithAuthMock.mockResolvedValueOnce(v2OnlyAssistantCompletedStreamResponse());
    const onEvent = vi.fn();

    const response = await socialAgentApi.runUserFacingStream(
      {
        goal: '我想在青岛大学附近找散步搭子',
        permissionMode: 'confirm',
      },
      onEvent,
    );

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'assistant.delta',
        runId: 'run-v2-only',
        messageId: 'assistant-v2-only',
        payload: expect.objectContaining({
          delta: '我会先整理你的需求。',
        }),
      }),
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'run.completed',
        runId: 'run-v2-only',
        messageId: 'assistant-v2-only',
      }),
    );
    expect(response).toMatchObject({
      assistantMessage: '我会先整理你的需求。',
      assistantMessageSource: 'llm',
      runtime: {
        threadId: 'thread-v2-only',
        runId: 'run-v2-only',
        messageId: 'assistant-v2-only',
      },
    });
  });
});

function streamResponse(): Response {
  const encoder = new TextEncoder();
  const result = {
    type: 'result',
    result: {
      assistantMessage: '已恢复这一步。',
      lightStatus: '已整理回复',
      cards: [],
      safeStatus: {
        blocked: false,
        level: 'low',
        boundaryNotes: [],
        requiredConfirmations: [],
      },
      pendingConfirmations: [],
      permissionMode: 'confirm',
    },
  };
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`event: result\ndata: ${JSON.stringify(result)}\n\n`));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

function runFailedStreamResponse(): Response {
  const encoder = new TextEncoder();
  const event = {
    type: 'run.failed',
    eventId: 'run-failed:1',
    seq: 1,
    createdAt: '2026-06-17T00:00:00.000Z',
    userId: '7',
    threadId: 'agent-task:21',
    taskId: 21,
    runId: 'run-failed',
    stage: 'hydrate_context',
    visibility: 'user_visible',
    display: {
      title: '刚才连接中断了',
      detail: '当前需求还在，可以继续处理。',
      state: 'failed',
    },
    payload: {
      code: 'NETWORK_ERROR',
      kind: 'interrupted',
      retryable: true,
      recoveryNotice: {
        kind: 'interrupted',
        title: '这次处理没有完成',
        message: 'FitMeet Agent 暂时没有顺利完成。我已经保留当前对话，请稍后再试。',
        retryable: true,
      },
    },
  };
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`event: run.failed\ndata: ${JSON.stringify(event)}\n\n`));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

function incompleteRunStartedStreamResponse(): Response {
  const encoder = new TextEncoder();
  const event = {
    type: 'run.started',
    eventId: 'run-started:1',
    seq: 1,
    createdAt: '2026-06-17T00:00:00.000Z',
    userId: '7',
    threadId: 'agent-task:31',
    taskId: 31,
    runId: 'run-incomplete',
    stage: 'hydrate_context',
    visibility: 'user_visible',
    display: {
      title: '正在恢复当前需求',
      state: 'running',
    },
  };
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`event: run.started\ndata: ${JSON.stringify(event)}\n\n`));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

function v2OnlyAssistantCompletedStreamResponse(): Response {
  const encoder = new TextEncoder();
  const assistantDelta = {
    type: 'assistant.delta',
    eventId: 'assistant-delta:1',
    seq: 1,
    createdAt: '2026-06-17T00:00:00.000Z',
    userId: '7',
    threadId: 'thread-v2-only',
    taskId: 41,
    runId: 'run-v2-only',
    messageId: 'assistant-v2-only',
    stage: 'slot_filling',
    visibility: 'user_visible',
    display: {
      title: '正在整理你的约练需求',
      state: 'running',
    },
    payload: {
      delta: '我会先整理你的需求。',
      source: 'llm',
    },
  };
  const runCompleted = {
    type: 'run.completed',
    eventId: 'run-completed:2',
    seq: 2,
    createdAt: '2026-06-17T00:00:01.000Z',
    userId: '7',
    threadId: 'thread-v2-only',
    taskId: 41,
    runId: 'run-v2-only',
    messageId: 'assistant-v2-only',
    stage: 'slot_filling',
    visibility: 'user_visible',
    display: {
      title: '已整理当前需求',
      detail: '我会先整理你的需求。',
      state: 'done',
    },
    payload: {
      assistantMessage: '我会先整理你的需求。',
      messageId: 'assistant-v2-only',
      summary: {
        title: '已整理当前需求',
        detail: '我会先整理你的需求。',
      },
    },
  };
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(`event: assistant.delta\ndata: ${JSON.stringify(assistantDelta)}\n\n`),
      );
      controller.enqueue(
        encoder.encode(`event: run.completed\ndata: ${JSON.stringify(runCompleted)}\n\n`),
      );
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}
