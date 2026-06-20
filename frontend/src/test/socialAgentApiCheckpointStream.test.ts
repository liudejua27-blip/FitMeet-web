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
