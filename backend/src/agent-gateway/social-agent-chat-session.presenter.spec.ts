import { AgentTaskStatus } from './entities/agent-task.entity';
import type { AgentTask } from './entities/agent-task.entity';
import { readSocialAgentRestorableResult } from './social-agent-chat-session.presenter';

describe('readSocialAgentRestorableResult', () => {
  it('does not restore debug reason counters from latest run results into user-facing sessions', () => {
    const task = {
      id: 101,
      status: AgentTaskStatus.WaitingReply,
      result: {},
      memory: {},
    } as unknown as AgentTask;

    const result = readSocialAgentRestorableResult({
      task,
      latestRun: {
        taskId: 101,
        runId: 'sar_debug_restore',
        status: 'completed',
        phase: 'completed',
        message: '已完成',
        visibleSteps: [{ id: 'done', label: '完成', status: 'done' }],
        queuedAt: '2026-06-05T00:00:00.000Z',
        startedAt: '2026-06-05T00:01:00.000Z',
        updatedAt: '2026-06-05T00:03:00.000Z',
        completedAt: '2026-06-05T00:03:00.000Z',
        failedAt: null,
        pollAfterMs: 1500,
        error: null,
        replan: null,
        result: {
          taskId: 101,
          status: AgentTaskStatus.WaitingReply,
          visibleSteps: [{ id: 'done', label: '完成', status: 'done' }],
          assistantMessage: '我找到了一个合适候选人',
          socialRequestDraft: null,
          candidates: [{ targetUserId: 22, nickname: 'Alex' } as never],
          approvalRequiredActions: [],
          events: [],
          debugReasons: {
            usersTotal: 3,
            socialProfilesTotal: 2,
            publicIntentsTotal: 1,
            eligibleProfiles: 1,
            eligiblePublicIntents: 1,
            eligibleActivities: 0,
            filteredBySelf: 0,
            filteredByBlocked: 0,
            filteredByCity: 0,
            filteredByBoundary: 2,
            scoreBelowThreshold: 0,
          },
        },
      },
      events: [],
      visibleStepLabel: (_, label) => label,
    });

    expect(result).toMatchObject({
      taskId: 101,
      assistantMessage: '我找到了一个合适候选人',
      debugReasons: null,
    });
    expect(JSON.stringify(result)).not.toContain('filteredByBoundary');
  });

  it('does not restore debug reason counters from legacy task memory into user-facing session results', () => {
    const task = {
      id: 101,
      status: AgentTaskStatus.WaitingReply,
      result: {
        chatRun: {
          message: '我找到了一个合适候选人',
          debugReasons: {
            usersTotal: 3,
            socialProfilesTotal: 2,
            publicIntentsTotal: 1,
            eligibleProfiles: 1,
            eligiblePublicIntents: 1,
            eligibleActivities: 0,
            filteredBySelf: 0,
            filteredByBlocked: 0,
            filteredByCity: 0,
            filteredByBoundary: 2,
            scoreBelowThreshold: 0,
          },
        },
      },
      memory: {
        shortTerm: {
          candidates: [
            {
              targetUserId: 22,
              nickname: 'Alex',
              matchReasons: ['公开资料显示你们都喜欢散步'],
            },
          ],
        },
      },
    } as unknown as AgentTask;

    const result = readSocialAgentRestorableResult({
      task,
      latestRun: null,
      events: [],
      visibleStepLabel: (_, label) => label,
    });

    expect(result).toMatchObject({
      taskId: 101,
      assistantMessage: '我找到了一个合适候选人',
      debugReasons: null,
      candidates: [expect.objectContaining({ targetUserId: 22 })],
    });
    expect(JSON.stringify(result)).not.toContain('filteredByBoundary');
  });

  it('restores an unpublished social request draft as an actionable OpportunityCard from latest run results', () => {
    const task = {
      id: 202,
      status: AgentTaskStatus.AwaitingConfirmation,
      result: {},
      memory: {},
    } as unknown as AgentTask;

    const result = readSocialAgentRestorableResult({
      task,
      latestRun: {
        taskId: 202,
        runId: 'sar_publish_restore',
        status: 'completed',
        phase: 'completed',
        message: '约练卡已生成',
        visibleSteps: [],
        queuedAt: '2026-06-05T00:00:00.000Z',
        startedAt: '2026-06-05T00:01:00.000Z',
        updatedAt: '2026-06-05T00:03:00.000Z',
        completedAt: '2026-06-05T00:03:00.000Z',
        failedAt: null,
        pollAfterMs: 1500,
        error: null,
        replan: null,
        result: {
          taskId: 202,
          status: AgentTaskStatus.AwaitingConfirmation,
          visibleSteps: [],
          assistantMessage: '约练卡已生成',
          socialRequestDraft: {
            agentTaskId: 202,
            mode: 'draft',
            type: 'city_walk',
            title: '今晚青岛大学散步搭子',
            description: '今晚在青岛大学附近散步，只公开模糊地点。',
            city: '青岛',
            activityType: '散步',
            timePreference: '今晚',
            locationPreference: '青岛大学附近',
            socialRequestId: 88,
            visibilityConsent: false,
            autoPublished: false,
            publicIntentId: null,
            discoverHref: null,
            publishPolicy: 'requires_confirmation_sensitive_content',
          } as never,
          candidates: [],
          approvalRequiredActions: [],
          events: [],
        },
      },
      events: [],
      visibleStepLabel: (_, label) => label,
    });

    expect(result?.cards?.[0]).toMatchObject({
      type: 'activity_plan',
      schemaType: 'social_match.activity',
      status: 'waiting_confirmation',
      title: '今晚青岛大学散步搭子',
      actions: expect.arrayContaining([
        expect.objectContaining({
          label: '发布到发现',
          schemaAction: 'publish_to_discover',
          requiresConfirmation: true,
          payload: expect.objectContaining({
            taskId: 202,
            socialRequestId: 88,
            approvalRequired: true,
            socialRequestDraft: expect.objectContaining({
              title: '今晚青岛大学散步搭子',
            }),
          }),
        }),
        expect.objectContaining({
          label: '暂不发布',
          schemaAction: 'activity.skip_publish',
        }),
      ]),
    });
  });

  it('restores an unpublished social request draft as an actionable OpportunityCard from task memory', () => {
    const task = {
      id: 203,
      status: AgentTaskStatus.AwaitingConfirmation,
      result: {
        chatRun: {
          message: '约练卡已生成',
          socialRequestDraft: {
            type: 'fitness',
            title: '今晚青岛大学健身约练',
            description: '今晚在青岛大学附近健身，只公开模糊地点。',
            city: '青岛',
            activityType: '健身',
            timePreference: '今晚',
            locationPreference: '青岛大学附近',
            socialRequestId: 99,
            visibilityConsent: false,
            autoPublished: false,
            publicIntentId: null,
            discoverHref: null,
          },
        },
      },
      memory: {},
    } as unknown as AgentTask;

    const result = readSocialAgentRestorableResult({
      task,
      latestRun: null,
      events: [],
      visibleStepLabel: (_, label) => label,
    });

    expect(result?.cards?.[0]).toMatchObject({
      id: 'activity_plan:203:99',
      schemaType: 'social_match.activity',
      data: expect.objectContaining({
        opportunityCard: true,
        socialRequestId: 99,
        publishStatus: 'draft_requires_confirmation',
        opportunity: expect.objectContaining({
          title: '今晚青岛大学健身约练',
          time: '今晚',
          location: '青岛大学附近',
        }),
      }),
      actions: expect.arrayContaining([
        expect.objectContaining({
          schemaAction: 'publish_to_discover',
          payload: expect.objectContaining({
            taskId: 203,
            socialRequestId: 99,
          }),
        }),
      ]),
    });
  });
});
