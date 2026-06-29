import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from '../src/agent-gateway/entities/agent-task.entity';
import { FitMeetLoopRouterService } from '../src/agent-gateway/loop-router/fitmeet-loop-router.service';
import { SocialAgentCardActionRouterService } from '../src/agent-gateway/social-agent-card-action-router.service';
import type { SocialAgentIntentRouteResult } from '../src/agent-gateway/social-agent-chat.types';
import { SocialAgentRouteEntranceService } from '../src/agent-gateway/social-agent-route-entrance.service';
import { WorkoutLoopService } from '../src/agent-gateway/workout-loop/workout-loop.service';

function makeTask(): AgentTask {
  return {
    id: 101,
    ownerUserId: 7,
    goal: '今晚青岛大学附近跑步',
    memory: {},
    result: {},
    status: AgentTaskStatus.Pending,
    permissionMode: AgentTaskPermissionMode.Confirm,
  } as AgentTask;
}

function makeRouteResult(
  overrides: Partial<SocialAgentIntentRouteResult> = {},
): SocialAgentIntentRouteResult {
  return {
    intent: 'action_request',
    confidence: 1,
    entities: {
      city: '',
      activityType: '',
      targetGender: '',
      timePreference: '',
      locationPreference: '',
    },
    shouldSearch: false,
    shouldReplan: false,
    shouldUpdateProfile: false,
    shouldExecuteAction: true,
    replyStrategy: 'execute_action',
    source: 'rules',
    action: 'reply',
    taskId: 101,
    assistantMessage: '完成',
    savedContext: true,
    profileUpdated: false,
    shouldQueueRun: false,
    runMode: null,
    queuedRun: null,
    pendingApproval: null,
    activityResults: [],
    profileUpdateProposal: null,
    cards: [],
    permissionMode: AgentTaskPermissionMode.Confirm,
    ...overrides,
  };
}

function makeRouter(draftPublication: {
  publishDraft: jest.Mock;
  dismissDraft: jest.Mock;
}) {
  const agentLoop = {
    execute: jest.fn(async (input: { runner: () => Promise<unknown> }) => {
      await input.runner();
      return {
        loop: {
          runId: 'loop:workout-mvp',
          traceId: 'trace:workout-mvp',
          taskId: 101,
          status: 'completed',
          steps: [],
        },
      };
    }),
  };
  const service = new SocialAgentCardActionRouterService(
    {
      confirmOpenerSendFromCardAction: jest.fn(),
      rejectOpenerSendFromCardAction: jest.fn(),
      regenerateOpenerDraftFromCardAction: jest.fn(),
      performCandidatePreferenceAction: jest.fn(),
      createOpenerDraftFromCardAction: jest.fn(),
      connectCandidateFromCardAction: jest.fn(),
    } as never,
    { performActivityAction: jest.fn() } as never,
    { performUpdateAction: jest.fn() } as never,
    agentLoop as never,
    draftPublication as never,
    { recordDeterministicAction: jest.fn() } as never,
  );
  return { agentLoop, service };
}

describe('Workout Loop MVP E2E contract', () => {
  it('routes a complete workout request through fast path, drafts a staged request, and publishes as matching queued', async () => {
    const task = makeTask();
    const taskRepo = {
      findOne: jest.fn().mockResolvedValue(task),
    };
    const messageLog = {
      recordUserMessage: jest.fn().mockResolvedValue(undefined),
      recordAssistantMessage: jest.fn().mockResolvedValue(undefined),
    };
    const draftPublication = {
      stagePrivateDraftForPublish: jest.fn(
        async (
          _ownerUserId: number,
          _taskId: number,
          draft: Record<string, unknown>,
        ) => ({
          task,
          socialRequestId: 501,
          draft: { ...draft, socialRequestId: 501 },
        }),
      ),
      publishDraft: jest.fn().mockResolvedValue({
        success: true,
        status: 'published',
        synced: true,
        socialRequestId: 501,
        publicIntentId: 'public-intent:workout-501',
        discoverHref: '/discover?publicIntentId=public-intent%3Aworkout-501',
        publicIntentHref: '/public-intent/public-intent%3Aworkout-501',
        sourceVersion: 'source-v1',
        matchingJob: { id: 9001, status: 'queued' },
      }),
      dismissDraft: jest.fn(),
    };
    const workoutLoop = new WorkoutLoopService(
      taskRepo as never,
      new FitMeetLoopRouterService(),
      messageLog as never,
      draftPublication as never,
    );
    const taskLifecycle = {
      ensureConversationTask: jest.fn().mockResolvedValue(task),
    };
    const mainAgentTurn = {
      handleRouteTurn: jest.fn().mockResolvedValue({
        task,
        result: makeRouteResult({
          assistantMessage: '旧链路不应处理约练 MVP。',
        }),
      }),
    };
    const routeEntrance = new SocialAgentRouteEntranceService(
      messageLog as never,
      taskLifecycle as never,
      mainAgentTurn as never,
      workoutLoop,
    );

    const entranceResult = await routeEntrance.enter({
      ownerUserId: 7,
      body: { message: '今晚青岛大学附近轻松跑步，找同校的人一起' },
    });

    expect(mainAgentTurn.handleRouteTurn).not.toHaveBeenCalled();
    expect(messageLog.recordUserMessage).toHaveBeenCalledWith(
      task,
      '今晚青岛大学附近轻松跑步，找同校的人一起',
    );
    expect(draftPublication.stagePrivateDraftForPublish).toHaveBeenCalledWith(
      7,
      101,
      expect.objectContaining({
        metadata: expect.objectContaining({
          loop: 'workout',
          source: 'workout_loop_mvp',
          workoutLoopStage: 'draft_ready',
        }),
      }),
    );
    const draftCard = entranceResult.earlyResult?.cards?.[0];
    expect(draftCard).toMatchObject({
      schemaType: 'workout.draft',
      data: expect.objectContaining({ socialRequestId: 501 }),
    });
    const publishAction = draftCard?.actions.find(
      (action) => action.schemaAction === 'workout_draft.publish',
    );
    expect(publishAction?.payload).toMatchObject({
      socialRequestId: 501,
    });

    const { service: cardRouter } = makeRouter(draftPublication);
    const handleMessage = jest.fn().mockResolvedValue(makeRouteResult());
    const publishResult = await cardRouter.perform({
      ownerUserId: 7,
      taskId: 101,
      body: {
        action: 'workout_draft.publish' as never,
        payload: {
          ...(publishAction?.payload ?? {}),
          confirmedPublish: true,
          approved: true,
          confirmed: true,
        },
      },
      handleMessage,
    });

    expect(handleMessage).not.toHaveBeenCalled();
    expect(draftPublication.publishDraft).toHaveBeenCalledWith(
      7,
      101,
      expect.objectContaining({ socialRequestId: 501 }),
    );
    expect(publishResult.publicLoop).toMatchObject({
      stage: 'matching_queued',
      publicIntentId: 'public-intent:workout-501',
    });
    expect(publishResult.assistantMessage).toContain(
      '发送邀请、加好友或私信前仍会让你确认',
    );
  });
});
