import { SocialAgentChatSessionFacadeService } from './social-agent-chat-session-facade.service';

describe('SocialAgentChatSessionFacadeService', () => {
  function makeService() {
    const sessionQueries = {
      getRunStatus: jest
        .fn()
        .mockResolvedValue({ taskId: 101, runId: 'run_1' }),
      getLatestSession: jest.fn().mockResolvedValue({ taskId: 101 }),
      getTaskSession: jest.fn().mockResolvedValue({ taskId: 101 }),
      getCurrentTask: jest.fn().mockResolvedValue({ taskId: 101 }),
      getTaskTimeline: jest.fn().mockResolvedValue({ taskId: 101, events: [] }),
    };

    const service = new SocialAgentChatSessionFacadeService(
      sessionQueries as never,
    );

    return { service, sessionQueries };
  }

  it('delegates session read entrypoints to session queries', async () => {
    const { service, sessionQueries } = makeService();

    await expect(service.getRunStatus(7, 101, 'run_1')).resolves.toMatchObject({
      runId: 'run_1',
    });
    await expect(service.getLatestSession(7)).resolves.toEqual({
      taskId: 101,
    });
    await expect(service.getTaskSession(7, 101)).resolves.toEqual({
      taskId: 101,
    });
    await expect(service.getCurrentTask(7)).resolves.toEqual({ taskId: 101 });
    await expect(service.getTaskTimeline(7, 101)).resolves.toMatchObject({
      events: [],
    });

    expect(sessionQueries.getRunStatus).toHaveBeenCalledWith(7, 101, 'run_1');
    expect(sessionQueries.getLatestSession).toHaveBeenCalledWith(7);
    expect(sessionQueries.getTaskSession).toHaveBeenCalledWith(7, 101);
    expect(sessionQueries.getCurrentTask).toHaveBeenCalledWith(7);
    expect(sessionQueries.getTaskTimeline).toHaveBeenCalledWith(7, 101);
  });
});
