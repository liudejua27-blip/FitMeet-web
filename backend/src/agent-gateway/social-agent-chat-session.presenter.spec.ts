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
          label: '确认发布',
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

  it('restores a published social request from task memory instead of a stale latest run draft', () => {
    const task = {
      id: 205,
      status: AgentTaskStatus.WaitingResult,
      updatedAt: new Date('2026-06-05T00:08:00.000Z'),
      result: {
        chatRun: {
          message: '已发布到发现页，正在为你匹配候选。',
          socialRequestDraft: {
            type: 'fitness',
            title: '今晚青岛大学健身约练',
            description: '今晚在青岛大学附近健身，只公开模糊地点。',
            city: '青岛',
            activityType: '健身',
            timePreference: '今晚',
            locationPreference: '青岛大学附近',
            socialRequestId: 99,
            publicIntentId: 'social_request_99',
            discoverHref: '/discover?publicIntentId=social_request_99',
            publishStatus: 'published',
            visibility: 'public',
            matchingJobId: 9001,
            matchingJobStatus: 'queued',
          },
        },
      },
      memory: {},
    } as unknown as AgentTask;

    const result = readSocialAgentRestorableResult({
      task,
      latestRun: {
        taskId: 205,
        runId: 'sar_stale_draft',
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
          taskId: 205,
          status: AgentTaskStatus.AwaitingConfirmation,
          visibleSteps: [],
          assistantMessage: '约练卡已生成',
          socialRequestDraft: {
            title: '今晚青岛大学健身约练',
            city: '青岛',
            activityType: '健身',
            timePreference: '今晚',
            locationPreference: '青岛大学附近',
            socialRequestId: 99,
            autoPublished: false,
            publicIntentId: null,
            discoverHref: null,
          } as never,
          candidates: [],
          approvalRequiredActions: [],
          events: [],
        },
      },
      events: [],
      visibleStepLabel: (_, label) => label,
    });

    expect(result?.assistantMessage).toBe('已发布到发现页，正在为你匹配候选。');
    expect(result?.cards?.[0]).toMatchObject({
      schemaType: 'social_match.activity',
      status: 'completed',
      title: '已发布到发现',
      data: expect.objectContaining({
        publicIntentId: 'social_request_99',
        discoverHref: '/discover?publicIntentId=social_request_99',
        publishStatus: 'published',
        matchingJobId: 9001,
        matchingJobStatus: 'queued',
      }),
      actions: [
        expect.objectContaining({
          schemaAction: 'activity.view_detail',
          requiresConfirmation: false,
        }),
      ],
    });
    expect(result?.cards?.[0]?.actions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ schemaAction: 'publish_to_discover' }),
      ]),
    );
  });

  it('restores async matching candidates from task memory over a stale latest run', () => {
    const candidateCard = {
      id: 'candidate_card:206:22',
      type: 'candidate_card',
      title: '小林',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'social_match.candidate',
      status: 'ready',
      data: {
        schemaType: 'social_match.candidate',
        taskId: 206,
        targetUserId: 22,
        candidateUserId: 22,
        socialRequestId: 100,
        publicIntentId: 'social_request_100',
        matchingJobId: 9002,
        matchingJobStatus: 'candidates_ready',
      },
      actions: [],
    };
    const task = {
      id: 206,
      status: AgentTaskStatus.AwaitingConfirmation,
      updatedAt: new Date('2026-06-05T00:09:00.000Z'),
      result: {
        chatRun: {
          message: '已找到候选，等待你确认下一步。',
          socialRequestDraft: {
            title: '今晚青岛大学跑步约练',
            city: '青岛',
            activityType: '跑步',
            timePreference: '今晚',
            locationPreference: '青岛大学附近',
            socialRequestId: 100,
            publicIntentId: 'social_request_100',
            discoverHref: '/discover?publicIntentId=social_request_100',
            publishStatus: 'published',
            visibility: 'public',
            matchingJobId: 9002,
            matchingJobStatus: 'candidates_ready',
          },
          cards: [candidateCard],
        },
      },
      memory: {
        socialAgentChat: {
          candidates: [
            {
              userId: 22,
              candidateUserId: 22,
              socialRequestId: 100,
              candidateRecordId: 7001,
              score: 0.86,
            },
          ],
        },
      },
    } as unknown as AgentTask;

    const result = readSocialAgentRestorableResult({
      task,
      latestRun: {
        taskId: 206,
        runId: 'sar_matching_queued_stale',
        status: 'completed',
        phase: 'completed',
        message: '已发布到发现页，正在为你匹配候选。',
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
          taskId: 206,
          status: AgentTaskStatus.WaitingResult,
          visibleSteps: [],
          assistantMessage: '已发布到发现页，正在为你匹配候选。',
          socialRequestDraft: {
            title: '今晚青岛大学跑步约练',
            socialRequestId: 100,
            publicIntentId: 'social_request_100',
            discoverHref: '/discover?publicIntentId=social_request_100',
            publishStatus: 'published',
            visibility: 'public',
            matchingJobStatus: 'queued',
          } as never,
          candidates: [],
          approvalRequiredActions: [],
          events: [],
        },
      },
      events: [],
      visibleStepLabel: (_, label) => label,
    });

    expect(result?.assistantMessage).toBe('已找到候选，等待你确认下一步。');
    expect(result?.candidates).toEqual([
      expect.objectContaining({ candidateUserId: 22 }),
    ]);
    expect(result?.cards ?? []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          schemaType: 'social_match.candidate',
          data: expect.objectContaining({
            targetUserId: 22,
            matchingJobStatus: 'candidates_ready',
          }),
        }),
      ]),
    );
  });

  it('does not restore an opportunity card after the draft was cancelled', () => {
    const task = {
      id: 204,
      status: AgentTaskStatus.AwaitingConfirmation,
      result: {
        chatRun: {
          message: '约练卡已生成',
          publishStatus: 'cancelled',
          socialRequestDraft: null,
        },
        activityDraft: {
          title: '今晚青岛大学散步搭子',
          visibility: 'hidden',
          dismissed: true,
          publishStatus: 'cancelled',
          status: 'draft_cancelled',
        },
      },
      memory: {
        socialAgentChat: {
          publishStatus: 'cancelled',
          socialRequestDraft: null,
        },
        shortTerm: {
          publishStatus: 'cancelled',
          socialRequestDraft: null,
        },
      },
    } as unknown as AgentTask;

    const result = readSocialAgentRestorableResult({
      task,
      latestRun: {
        taskId: 204,
        runId: 'sar_publish_restore_stale',
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
          taskId: 204,
          status: AgentTaskStatus.AwaitingConfirmation,
          visibleSteps: [],
          assistantMessage: '约练卡已生成',
          socialRequestDraft: {
            agentTaskId: 204,
            mode: 'draft',
            type: 'city_walk',
            title: '今晚青岛大学散步搭子',
            description: '今晚在青岛大学附近散步，只公开模糊地点。',
            city: '青岛',
            activityType: '散步',
            timePreference: '今晚',
            locationPreference: '青岛大学附近',
            autoPublished: false,
            publicIntentId: null,
            discoverHref: null,
          } as never,
          cards: [
            {
              id: 'activity_plan:204:draft',
              type: 'activity_plan',
              title: '今晚青岛大学散步搭子',
              schemaType: 'social_match.activity',
              status: 'waiting_confirmation',
              data: { schemaType: 'social_match.activity' },
              actions: [],
            },
          ],
          candidates: [],
          approvalRequiredActions: [],
          events: [],
        },
      },
      events: [],
      visibleStepLabel: (_, label) => label,
    });

    expect(result?.assistantMessage).toContain('已取消发布');
    expect(result?.socialRequestDraft).toBeNull();
    expect(result?.cards ?? []).toEqual([]);
  });
});
