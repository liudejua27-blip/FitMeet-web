import { SocialAgentChatService } from './social-agent-chat.service';

describe('SocialAgentChatService', () => {
  function makeService() {
    const runFacade = {
      run: jest.fn().mockResolvedValue({ taskId: 101 }),
      runQueued: jest.fn().mockResolvedValue({ taskId: 101, runId: 'run_1' }),
      runStream: jest.fn().mockResolvedValue({ taskId: 101 }),
    };
    const turnFacade = {
      routeMessage: jest.fn().mockResolvedValue({ intent: 'casual_chat' }),
      handleMessage: jest.fn().mockResolvedValue({ intent: 'social_search' }),
      performCardAction: jest.fn().mockResolvedValue({ action: 'reply' }),
    };
    const sessionFacade = {
      getRunStatus: jest
        .fn()
        .mockResolvedValue({ taskId: 101, runId: 'run_1' }),
      getLatestSession: jest.fn().mockResolvedValue({ taskId: 101 }),
      getTaskSession: jest.fn().mockResolvedValue({ taskId: 101 }),
      getCurrentTask: jest.fn().mockResolvedValue({ taskId: 101 }),
      getTaskTimeline: jest.fn().mockResolvedValue({ taskId: 101, events: [] }),
    };
    const replanFacade = {
      replanAndRefresh: jest
        .fn()
        .mockResolvedValue({ taskId: 101, runId: 'run_replan_1' }),
      appendContext: jest.fn().mockResolvedValue({ taskId: 101, saved: true }),
    };
    const service = new SocialAgentChatService(
      runFacade as never,
      turnFacade as never,
      sessionFacade as never,
      replanFacade as never,
    );

    return { service, runFacade, turnFacade, sessionFacade, replanFacade };
  }

  it('delegates run entrypoints to the run facade', async () => {
    const { service, runFacade } = makeService();
    const emit = jest.fn();

    await expect(service.run(7, { goal: '找青岛跑步搭子' })).resolves.toEqual({
      taskId: 101,
    });
    await expect(
      service.runQueued(7, { goal: '找青岛跑步搭子' }),
    ).resolves.toMatchObject({ runId: 'run_1' });
    await expect(
      service.runStream(7, { goal: '找青岛跑步搭子' }, emit),
    ).resolves.toEqual({ taskId: 101 });

    expect(runFacade.run).toHaveBeenCalledWith(7, { goal: '找青岛跑步搭子' });
    expect(runFacade.runQueued).toHaveBeenCalledWith(7, {
      goal: '找青岛跑步搭子',
    });
    expect(runFacade.runStream).toHaveBeenCalledWith(
      7,
      { goal: '找青岛跑步搭子' },
      emit,
      {},
    );
  });

  it('delegates chat turns and card actions to the turn facade', async () => {
    const { service, turnFacade } = makeService();

    await service.routeMessage(7, { message: '你好' });
    await service.handleMessage(7, { message: '帮我找人' });
    await service.performCardAction(7, 101, {
      action: 'candidate.like',
      payload: { candidateUserId: 22 },
    });

    expect(turnFacade.routeMessage).toHaveBeenCalledWith(7, {
      message: '你好',
    });
    expect(turnFacade.handleMessage).toHaveBeenCalledWith(7, {
      message: '帮我找人',
    });
    expect(turnFacade.performCardAction).toHaveBeenCalledWith(7, 101, {
      action: 'candidate.like',
      payload: { candidateUserId: 22 },
    });
  });

  it('delegates replan and context updates to the replan facade', async () => {
    const { service, replanFacade } = makeService();

    await service.replanAndRefresh(7, 101, { userMessage: '只看同校' });
    await service.appendContext(7, 101, { userMessage: '不要晚上' });

    expect(replanFacade.replanAndRefresh).toHaveBeenCalledWith(7, 101, {
      userMessage: '只看同校',
    });
    expect(replanFacade.appendContext).toHaveBeenCalledWith(7, 101, {
      userMessage: '不要晚上',
    });
  });

  it('delegates session reads to the session facade', async () => {
    const { service, sessionFacade } = makeService();

    await service.getRunStatus(7, 101, 'run_1');
    await service.getLatestSession(7);
    await service.getTaskSession(7, 101);
    await service.getCurrentTask(7);
    await service.getTaskTimeline(7, 101);

    expect(sessionFacade.getRunStatus).toHaveBeenCalledWith(7, 101, 'run_1');
    expect(sessionFacade.getLatestSession).toHaveBeenCalledWith(7);
    expect(sessionFacade.getTaskSession).toHaveBeenCalledWith(7, 101);
    expect(sessionFacade.getCurrentTask).toHaveBeenCalledWith(7);
    expect(sessionFacade.getTaskTimeline).toHaveBeenCalledWith(7, 101);
  });
});
