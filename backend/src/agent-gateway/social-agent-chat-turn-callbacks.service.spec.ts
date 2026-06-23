import { SocialAgentChatTurnCallbacksService } from './social-agent-chat-turn-callbacks.service';

describe('SocialAgentChatTurnCallbacksService', () => {
  it('binds route-turn callbacks to the current request owner', async () => {
    const replanFacade = {
      replanAndRefresh: jest.fn().mockResolvedValue({ runId: 'run-replan' }),
    };
    const initialSearchQueue = {
      queueInitialSearchForTask: jest
        .fn()
        .mockResolvedValue({ runId: 'run-search' }),
    };
    const service = new SocialAgentChatTurnCallbacksService(
      replanFacade as never,
      initialSearchQueue as never,
    );

    const callbacks = service.forOwner(7);
    await callbacks.replanAndRefresh(999, 101, {
      userMessage: '换成周末下午',
      reason: 'user_follow_up',
    });
    await callbacks.queueInitialSearchForTask(
      999,
      { id: 101 } as never,
      '周末跑步',
      { signal: null, waitForCompletionMs: 1234 },
    );

    expect(replanFacade.replanAndRefresh).toHaveBeenCalledWith(7, 101, {
      userMessage: '换成周末下午',
      reason: 'user_follow_up',
    });
    expect(initialSearchQueue.queueInitialSearchForTask).toHaveBeenCalledWith({
      ownerUserId: 7,
      task: { id: 101 },
      goal: '周末跑步',
      signal: null,
      waitForCompletionMs: 1234,
    });
  });
});
