/* eslint-disable @typescript-eslint/require-await */
import { FitMeetAgentRuntimeService } from './fitmeet-agent-runtime.service';
import {
  FitMeetAgentRunStatus,
  FitMeetAgentToolStatus,
} from './entities/fitmeet-agent-runtime.entity';

function repoMock() {
  return {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ id: value.id ?? 1, ...value })),
    update: jest.fn(async () => ({ affected: 1 })),
  };
}

describe('FitMeetAgentRuntimeService', () => {
  let runs: ReturnType<typeof repoMock>;
  let steps: ReturnType<typeof repoMock>;
  let toolCalls: ReturnType<typeof repoMock>;
  let messages: ReturnType<typeof repoMock>;
  let memoryUpdates: ReturnType<typeof repoMock>;
  let service: FitMeetAgentRuntimeService;

  beforeEach(() => {
    runs = repoMock();
    steps = repoMock();
    toolCalls = repoMock();
    messages = repoMock();
    memoryUpdates = repoMock();
    service = new FitMeetAgentRuntimeService(
      runs as never,
      steps as never,
      toolCalls as never,
      messages as never,
      memoryUpdates as never,
    );
  });

  it('starts a first-party FitMeet Agent run and records the user message', async () => {
    const run = await service.startRun({
      userId: 42,
      userMessage: '帮我找附近跑步搭子',
      permissionMode: 'limited_auto',
    });

    expect(run).toMatchObject({
      id: 1,
      userId: 42,
      status: FitMeetAgentRunStatus.Running,
      permissionMode: 'limited_auto',
    });
    expect(messages.save).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 1,
        userId: 42,
        role: 'user',
        messageType: 'natural_language_request',
      }),
    );
  });

  it('stores only safe execution payload, not hidden reasoning or private contact data', async () => {
    await service.recordToolCall({
      runId: 1,
      userId: 42,
      toolName: 'fitmeet_search_candidates',
      status: FitMeetAgentToolStatus.Succeeded,
      safeInput: {
        city: '青岛',
        chainOfThought: 'hidden',
        email: 'person@example.com',
        token: 'secret',
      },
      safeOutput: {
        candidateCount: 3,
        phone: '13800000000',
        preciseLocation: 'exact room',
      },
    });

    expect(toolCalls.save).toHaveBeenCalledWith(
      expect.objectContaining({
        safeInput: { city: '青岛' },
        safeOutput: { candidateCount: 3 },
      }),
    );
  });

  it('marks high-risk social actions as requiring user confirmation', async () => {
    await service.recordToolCall({
      runId: 1,
      userId: 42,
      toolName: 'fitmeet_send_friend_request',
      status: FitMeetAgentToolStatus.WaitingConfirmation,
      safeInput: { targetUserId: 7 },
    });

    expect(toolCalls.save).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'fitmeet_send_friend_request',
        requiresUserConfirmation: true,
      }),
    );
  });
});
