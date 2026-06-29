import { SocialAgentCardActionRouterService } from '../src/agent-gateway/social-agent-card-action-router.service';
import type { SocialAgentIntentRouteResult } from '../src/agent-gateway/social-agent-chat.types';

function routeResult(
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
    permissionMode: 'confirm' as never,
    ...overrides,
  };
}

function makeRouter() {
  const draftPublication = {
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
  const agentLoop = {
    execute: jest.fn(async (input: { runner: () => Promise<unknown> }) => {
      await input.runner();
      return {
        loop: {
          runId: 'loop:workout-publish',
          traceId: 'trace:workout-publish',
          taskId: 101,
          status: 'completed',
          steps: [],
        },
      };
    }),
  };
  const metrics = { recordDeterministicAction: jest.fn() };
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
    metrics as never,
  );
  return { agentLoop, draftPublication, metrics, service };
}

describe('Workout publish integration', () => {
  it('publishes a staged workout draft through the existing discover flow and queues matching', async () => {
    const { draftPublication, metrics, service } = makeRouter();
    const handleMessage = jest.fn().mockResolvedValue(routeResult());

    const result = await service.perform({
      ownerUserId: 7,
      taskId: 101,
      body: {
        action: 'workout_draft.publish' as never,
        payload: {
          confirmedPublish: true,
          socialRequestId: 501,
          socialRequestDraft: {
            title: '今晚青岛大学跑步约练',
            activityType: '跑步',
            city: '青岛',
            visibility: 'public',
          },
        },
      },
      handleMessage,
    });

    expect(handleMessage).not.toHaveBeenCalled();
    expect(draftPublication.publishDraft).toHaveBeenCalledWith(
      7,
      101,
      expect.objectContaining({
        socialRequestId: 501,
        title: '今晚青岛大学跑步约练',
        visibility: 'public',
      }),
    );
    expect(result.publicLoop).toMatchObject({
      stage: 'matching_queued',
      publicIntentId: 'public-intent:workout-501',
      requiredConfirmation: false,
    });
    expect(result.assistantMessage).toContain('进入约练匹配队列');
    expect(metrics.recordDeterministicAction).toHaveBeenCalledWith(
      'workout_draft.publish',
      { estimatedAvoidedLlmCalls: 1 },
    );
  });
});
