import { SocialAgentTasksController } from './social-agent-tasks.controller';
import {
  SocialAgentToolExecutorService,
  SocialAgentToolName,
} from './social-agent-tool-executor.service';

describe('SocialAgentTasksController', () => {
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
});
