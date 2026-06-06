import { SocialAgentChatTurnFacadeService } from './social-agent-chat-turn-facade.service';

type RouteTurnInput = {
  replanAndRefresh: (
    ownerUserId: number,
    taskId: number,
    body: Record<string, unknown>,
  ) => Promise<unknown>;
  queueInitialSearchForTask: (
    ownerUserId: number,
    task: Record<string, unknown>,
    goal: string,
  ) => Promise<unknown>;
};

type CardActionInput = {
  handleMessage: (body: Record<string, unknown>) => Promise<unknown>;
};

describe('SocialAgentChatTurnFacadeService', () => {
  it('wires route turn callbacks to replan and initial search services', async () => {
    const routeTurns = {
      handleMessage: jest.fn(async (input: RouteTurnInput) => {
        await input.replanAndRefresh(7, 101, {
          userMessage: '换成周末下午',
          reason: 'user_follow_up',
        });
        await input.queueInitialSearchForTask(7, { id: 101 }, '周末跑步');
        return { taskId: 101, assistantMessage: 'ok' };
      }),
    };
    const cardActionRouter = { perform: jest.fn() };
    const replanFacade = {
      replanAndRefresh: jest.fn().mockResolvedValue({ runId: 'run-1' }),
    };
    const initialSearchQueue = {
      queueInitialSearchForTask: jest
        .fn()
        .mockResolvedValue({ runId: 'run-2' }),
    };
    const service = new SocialAgentChatTurnFacadeService(
      routeTurns as never,
      cardActionRouter as never,
      replanFacade as never,
      initialSearchQueue as never,
    );

    await expect(
      service.handleMessage(7, { message: '帮我找跑步搭子' }),
    ).resolves.toMatchObject({ taskId: 101 });

    expect(routeTurns.handleMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        body: { message: '帮我找跑步搭子' },
      }),
    );
    expect(replanFacade.replanAndRefresh).toHaveBeenCalledWith(7, 101, {
      userMessage: '换成周末下午',
      reason: 'user_follow_up',
    });
    expect(initialSearchQueue.queueInitialSearchForTask).toHaveBeenCalledWith({
      ownerUserId: 7,
      task: { id: 101 },
      goal: '周末跑步',
    });
  });

  it('routes card actions back through the same owner message flow', async () => {
    const routeTurns = {
      handleMessage: jest
        .fn()
        .mockResolvedValue({ taskId: 101, assistantMessage: 'confirmed' }),
    };
    const cardActionRouter = {
      perform: jest.fn((input: CardActionInput) =>
        input.handleMessage({
          taskId: 101,
          message: '确认发送',
          hasCandidates: true,
        }),
      ),
    };
    const service = new SocialAgentChatTurnFacadeService(
      routeTurns as never,
      cardActionRouter as never,
      { replanAndRefresh: jest.fn() } as never,
      { queueInitialSearchForTask: jest.fn() } as never,
    );

    await expect(
      service.performCardAction(7, 101, { action: 'opener.confirm_send' }),
    ).resolves.toMatchObject({ assistantMessage: 'confirmed' });

    expect(cardActionRouter.perform).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        taskId: 101,
        body: { action: 'opener.confirm_send' },
      }),
    );
    expect(routeTurns.handleMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        body: {
          taskId: 101,
          message: '确认发送',
          hasCandidates: true,
        },
      }),
    );
  });
});
