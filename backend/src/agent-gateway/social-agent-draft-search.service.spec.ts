import {
  SocialRequestSafety,
  SocialRequestType,
} from '../social-requests/social-request.entity';
import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { SocialAgentDraftSearchService } from './social-agent-draft-search.service';
import type { SocialAgentRequestDraft } from './social-agent-chat.types';
import { SocialAgentToolName } from './social-agent-tool-executor.service';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 101,
    ownerUserId: 7,
    taskType: 'social_agent_chat',
    title: 'FitMeet Social Agent 聊天任务',
    goal: '今晚青岛轻松跑步',
    result: {},
    memory: {},
    status: AgentTaskStatus.Pending,
    permissionMode: AgentTaskPermissionMode.Confirm,
    ...overrides,
  } as AgentTask;
}

function makeTaskWithCompletedSlots(
  overrides: Partial<AgentTask> = {},
): AgentTask {
  return makeTask({
    goal: '今晚青岛大学附近散步，最好找公开资料里有舞蹈相关标签的人',
    memory: {
      taskSlots: {
        activity: {
          value: '散步',
          state: 'completed',
          source: 'user_message',
        },
        time_window: {
          value: '今天晚上',
          state: 'completed',
          source: 'user_message',
        },
        location_text: {
          value: '青岛大学附近',
          state: 'completed',
          source: 'user_message',
        },
        geo_area: {
          value: '崂山区',
          state: 'inferred',
          source: 'location_parser',
        },
        intensity: {
          value: '低强度',
          state: 'inferred',
          source: 'activity_parser',
        },
        candidate_preference: {
          value: '公开资料里有舞蹈相关标签的人优先',
          state: 'answered',
          source: 'user_message',
        },
      },
      taskSlotSummary: {
        activity: '散步',
        time_window: '今天晚上',
        location_text: '青岛大学附近',
        candidate_preference: '公开资料里有舞蹈相关标签的人优先',
      },
    },
    ...overrides,
  });
}

function makeTaskWithRestoredTaskMemorySlots(
  overrides: Partial<AgentTask> = {},
): AgentTask {
  return makeTask({
    goal: '今晚青岛大学附近散步，最好找公开资料里有舞蹈相关标签的人',
    memory: {
      taskMemory: {
        taskSlots: {
          activity: {
            value: '散步',
            state: 'completed',
            source: 'user_message',
          },
          time_window: {
            value: '今天晚上',
            state: 'completed',
            source: 'user_message',
          },
          location_text: {
            value: '青岛大学附近',
            state: 'completed',
            source: 'user_message',
          },
          geo_area: {
            value: '崂山区',
            state: 'inferred',
            source: 'location_parser',
          },
          candidate_preference: {
            value: '公开资料里有舞蹈相关标签的人优先',
            state: 'answered',
            source: 'user_message',
          },
        },
        taskSlotSummary: {
          activity: '散步',
          time_window: '今天晚上',
          location_text: '青岛大学附近',
          candidate_preference: '公开资料里有舞蹈相关标签的人优先',
        },
      },
    },
    ...overrides,
  });
}

function makeDraft(
  overrides: Partial<SocialAgentRequestDraft> = {},
): SocialAgentRequestDraft {
  return {
    agentTaskId: 101,
    type: SocialRequestType.RunningPartner,
    rawText: '今晚青岛轻松跑步',
    title: '今晚青岛轻松跑步',
    description: '公开地点，低压力，一起轻松跑。',
    city: '青岛',
    activityType: 'running',
    interestTags: ['跑步', '低压力'],
    radiusKm: 5,
    safetyRequirement: SocialRequestSafety.LowRiskOnly,
    socialRequestId: 301,
    metadata: { source: 'test' },
    ...overrides,
  } as SocialAgentRequestDraft;
}

function makeHarness() {
  const executor = {
    executeToolAction: jest.fn(
      (
        _taskId: number,
        toolName: SocialAgentToolName,
        input: Record<string, unknown>,
      ) => {
        if (
          toolName === SocialAgentToolName.CreateSocialRequest &&
          input.mode === 'ai_draft'
        ) {
          return Promise.resolve({
            id: 'action_create_social_request_draft_1',
            toolName,
            status: 'succeeded',
            output: {
              draft: {
                type: SocialRequestType.RunningPartner,
                rawText: input.rawText,
                title: '今晚青岛轻松跑步',
                city: '青岛',
              },
              card: { title: '今晚青岛轻松跑步' },
              profileUsed: { city: '青岛' },
            },
            error: null,
          });
        }
        if (
          toolName === SocialAgentToolName.CreateSocialRequest &&
          input.mode === 'private_draft'
        ) {
          return Promise.resolve({
            id: 'action_create_social_request_private_1',
            toolName,
            status: 'succeeded',
            output: { id: 301, socialRequestId: 301 },
            error: null,
          });
        }
        if (
          toolName === SocialAgentToolName.CreateSocialRequest &&
          input.mode === 'publish'
        ) {
          return Promise.resolve({
            id: 'action_create_social_request_publish_1',
            toolName,
            status: 'succeeded',
            output: { publicIntentId: 'pub_301', synced: true },
            error: null,
          });
        }
        if (toolName === SocialAgentToolName.SearchMatches) {
          return Promise.resolve({
            id: 'action_search_matches_1',
            toolName,
            status: 'succeeded',
            output: {
              socialRequestId: 301,
              candidates: [
                {
                  userId: 22,
                  candidateRecordId: 501,
                  nickname: '小林',
                  score: 87.4,
                  reasons: ['距离近', '都喜欢夜跑'],
                },
              ],
              message: '找到 1 位候选人',
              debugReasons: { accepted: 1 },
            },
            error: null,
          });
        }
        return Promise.resolve({
          id: 'unsupported',
          toolName,
          status: 'failed',
          output: null,
          error: { message: 'unsupported tool' },
        });
      },
    ),
  };
  return {
    executor,
    service: new SocialAgentDraftSearchService(executor as never),
  };
}

describe('SocialAgentDraftSearchService', () => {
  it('refreshes a draft and candidates while reloading the task between tool calls', async () => {
    const { executor, service } = makeHarness();
    const initialTask = makeTask({ id: 101 });
    const refreshedTasks = [
      makeTask({ id: 102, ownerUserId: 7 }),
      makeTask({ id: 103, ownerUserId: 7 }),
      makeTask({ id: 104, ownerUserId: 7 }),
    ];
    const refreshTask = jest
      .fn()
      .mockResolvedValueOnce(refreshedTasks[0])
      .mockResolvedValueOnce(refreshedTasks[1])
      .mockResolvedValueOnce(refreshedTasks[2]);

    const result = await service.refreshDraftAndCandidates({
      task: initialTask,
      goal: '今晚青岛轻松跑步',
      refreshTask,
    });

    expect(refreshTask).toHaveBeenCalledTimes(3);
    expect(result.task.id).toBe(104);
    expect(result.draft).toMatchObject({
      agentTaskId: 102,
      socialRequestId: 301,
      title: '今晚青岛轻松跑步',
      mode: 'draft',
    });
    expect(result.searchResult).toMatchObject({
      message: '找到 1 位候选人',
      candidates: [
        expect.objectContaining({
          agentTaskId: 102,
          socialRequestId: 301,
          userId: 22,
        }),
      ],
    });
    expect(result.candidates).toBe(result.searchResult.candidates);
    expect(executor.executeToolAction).toHaveBeenNthCalledWith(
      1,
      101,
      SocialAgentToolName.CreateSocialRequest,
      expect.objectContaining({ mode: 'ai_draft' }),
      7,
      { signal: null },
    );
    expect(executor.executeToolAction).toHaveBeenNthCalledWith(
      2,
      102,
      SocialAgentToolName.CreateSocialRequest,
      expect.objectContaining({ mode: 'private_draft' }),
      7,
      { signal: null },
    );
    expect(executor.executeToolAction).toHaveBeenNthCalledWith(
      3,
      103,
      SocialAgentToolName.SearchMatches,
      expect.objectContaining({
        socialRequestId: 301,
        safetyPolicy: expect.objectContaining({
          policyVersion: 'fitmeet.candidate-search.v1',
          sideEffectPolicy: 'search_only_no_contact_without_approval',
        }),
      }),
      7,
      { signal: null },
    );
  });

  it('generates a social request draft through the AI draft tool', async () => {
    const { executor, service } = makeHarness();
    const task = makeTaskWithCompletedSlots();

    const result = await service.generateDraftWithTool(
      task,
      '今晚青岛轻松跑步',
    );

    expect(executor.executeToolAction).toHaveBeenCalledWith(
      101,
      SocialAgentToolName.CreateSocialRequest,
      expect.objectContaining({
        mode: 'ai_draft',
        rawText: '今晚青岛轻松跑步',
        goal: '今晚青岛轻松跑步',
        taskId: 101,
        taskContext: expect.objectContaining({
          knownSlotsAreHardConstraints: true,
          doNotRepeatQuestionsForSlots: expect.arrayContaining([
            'activity',
            'time_window',
            'location_text',
            'candidate_preference',
          ]),
          candidatePreference: '公开资料里有舞蹈相关标签的人优先',
          candidatePreferencePolicy:
            'public_discoverable_profiles_and_user_consented_public_tags_only',
          taskSlots: expect.objectContaining({
            activity: expect.objectContaining({ value: '散步' }),
            time_window: expect.objectContaining({ value: '今天晚上' }),
            location_text: expect.objectContaining({ value: '青岛大学附近' }),
            candidate_preference: expect.objectContaining({
              value: '公开资料里有舞蹈相关标签的人优先',
            }),
          }),
        }),
        metadata: expect.objectContaining({
          agentTaskId: 101,
          source: 'social_agent_chat',
          candidatePreferencePolicy:
            'public_discoverable_profiles_and_user_consented_public_tags_only',
        }),
      }),
      7,
      { signal: null },
    );
    const taskContext = (
      executor.executeToolAction.mock.calls[0]?.[2] as Record<string, unknown>
    )?.taskContext as {
      knownTaskSlotConstraints?: {
        knownSlots?: Array<{ key: string; confirmation: string }>;
        doNotAskAgainFor?: string[];
      };
      knownContextSlots?: string[];
      doNotRepeatQuestionsForSlots?: string[];
    };
    expect(taskContext.knownTaskSlotConstraints).toMatchObject({
      knownSlots: expect.arrayContaining([
        expect.objectContaining({
          key: 'geo_area',
          confirmation: 'inferred_context',
        }),
        expect.objectContaining({
          key: 'intensity',
          confirmation: 'inferred_context',
        }),
      ]),
      doNotAskAgainFor: expect.arrayContaining([
        'activity',
        'time_window',
        'location_text',
        'candidate_preference',
      ]),
    });
    expect(taskContext.knownContextSlots).toEqual(
      expect.arrayContaining(['geo_area', 'intensity']),
    );
    expect(taskContext.doNotRepeatQuestionsForSlots).toEqual(
      expect.not.arrayContaining(['geo_area', 'intensity']),
    );
    expect(result).toMatchObject({
      draft: {
        title: '今晚青岛轻松跑步',
        city: '青岛',
        activityType: '散步',
        interestTags: expect.arrayContaining(['散步']),
        metadata: expect.objectContaining({
          timePreference: '今天晚上',
          locationPreference: '青岛大学附近',
          nearbyArea: '崂山区',
          intensity: '低强度',
          candidatePreference: '公开资料里有舞蹈相关标签的人优先',
          knownSlotsAreHardConstraints: true,
        }),
      },
      card: { title: '今晚青岛轻松跑步' },
      profileUsed: { city: '青岛' },
    });
  });

  it('enriches AI draft output from restored taskMemory slots', async () => {
    const { executor, service } = makeHarness();
    const task = makeTaskWithRestoredTaskMemorySlots();

    const result = await service.generateDraftWithTool(
      task,
      '可以，继续帮我找人',
    );

    expect(executor.executeToolAction).toHaveBeenCalledWith(
      101,
      SocialAgentToolName.CreateSocialRequest,
      expect.objectContaining({
        taskContext: expect.objectContaining({
          taskSlots: expect.objectContaining({
            activity: expect.objectContaining({ value: '散步' }),
            time_window: expect.objectContaining({ value: '今天晚上' }),
            location_text: expect.objectContaining({ value: '青岛大学附近' }),
            candidate_preference: expect.objectContaining({
              value: '公开资料里有舞蹈相关标签的人优先',
            }),
          }),
          knownSlotsAreHardConstraints: true,
          doNotRepeatQuestionsForSlots: expect.arrayContaining([
            'activity',
            'time_window',
            'location_text',
            'candidate_preference',
          ]),
        }),
      }),
      7,
      { signal: null },
    );
    expect(result.draft).toMatchObject({
      city: '青岛',
      activityType: '散步',
      interestTags: expect.arrayContaining(['散步']),
      metadata: expect.objectContaining({
        timePreference: '今天晚上',
        locationPreference: '青岛大学附近',
        nearbyArea: '崂山区',
        candidatePreference: '公开资料里有舞蹈相关标签的人优先',
        candidatePreferencePolicy:
          'public_discoverable_profiles_and_user_consented_public_tags_only',
        knownSlotsAreHardConstraints: true,
      }),
    });
  });

  it('creates a private draft that requires publish confirmation', async () => {
    const { executor, service } = makeHarness();
    const task = makeTask();

    const socialRequestId = await service.createPrivateDraftRequest(
      task,
      makeDraft(),
    );

    expect(socialRequestId).toBe(301);
    expect(executor.executeToolAction).toHaveBeenCalledWith(
      101,
      SocialAgentToolName.CreateSocialRequest,
      expect.objectContaining({
        mode: 'private_draft',
        metadata: expect.objectContaining({
          agentTaskId: 101,
          source: 'social_agent_chat',
          publishPolicy: 'requires_user_confirmation',
        }),
      }),
      7,
      { signal: null },
    );
  });

  it('blocks auto publish when task memory says not to publish to Discover', async () => {
    const { executor, service } = makeHarness();
    const task = makeTask({
      memory: {
        taskMemory: {
          boundaries: {
            publicActivityAllowed: false,
          },
        },
      },
    });

    const result = await service.autoPublishDraftIfAllowed(
      task,
      makeDraft({
        metadata: {
          visibilityConsent: true,
          publicActivityAllowed: true,
        },
      }),
    );

    expect(result).toMatchObject({
      autoPublished: false,
      synced: false,
      publicIntentId: null,
      discoverHref: null,
      publishPolicy: 'requires_user_confirmation',
      blockedReason: 'public_visibility_denied_in_task_memory',
    });
    expect(executor.executeToolAction).not.toHaveBeenCalledWith(
      expect.any(Number),
      SocialAgentToolName.CreateSocialRequest,
      expect.objectContaining({ mode: 'publish' }),
      expect.any(Number),
      expect.any(Object),
    );
  });

  it('allows auto publish when task memory has explicit public authorization', async () => {
    const { executor, service } = makeHarness();
    const task = makeTask({
      memory: {
        taskMemory: {
          boundaries: {
            publicActivityAllowed: true,
          },
        },
      },
    });

    const result = await service.autoPublishDraftIfAllowed(
      task,
      makeDraft({
        metadata: {},
      }),
    );

    expect(result).toMatchObject({
      autoPublished: true,
      synced: true,
      publicIntentId: 'pub_301',
      discoverHref: '/public-intent/pub_301',
      publishPolicy: 'auto_after_first_public_authorization',
      blockedReason: null,
    });
    expect(executor.executeToolAction).toHaveBeenCalledWith(
      101,
      SocialAgentToolName.CreateSocialRequest,
      expect.objectContaining({
        mode: 'publish',
        metadata: expect.objectContaining({
          visibilityConsent: true,
          autoPublished: true,
          publishPolicy: 'auto_after_first_public_authorization',
        }),
      }),
      7,
      { signal: null },
    );
  });

  it('searches persisted social request candidates and normalizes matches', async () => {
    const { executor, service } = makeHarness();
    const task = makeTaskWithCompletedSlots();

    const result = await service.searchCandidates(task, makeDraft());

    expect(executor.executeToolAction).toHaveBeenCalledWith(
      101,
      SocialAgentToolName.SearchMatches,
      expect.objectContaining({
        taskId: 101,
        socialRequestId: 301,
        rawText: '今晚青岛轻松跑步',
        limit: 10,
        taskContext: expect.objectContaining({
          knownSlotsAreHardConstraints: true,
          knownTaskSlotConstraints: expect.objectContaining({
            knownSlots: expect.arrayContaining([
              expect.objectContaining({
                key: 'geo_area',
                confirmation: 'inferred_context',
              }),
              expect.objectContaining({
                key: 'intensity',
                confirmation: 'inferred_context',
              }),
            ]),
          }),
          knownContextSlots: expect.arrayContaining(['geo_area', 'intensity']),
          doNotRepeatQuestionsForSlots: expect.arrayContaining([
            'activity',
            'time_window',
            'location_text',
            'candidate_preference',
          ]),
          candidatePreference: '公开资料里有舞蹈相关标签的人优先',
          candidatePreferencePolicy:
            'public_discoverable_profiles_and_user_consented_public_tags_only',
        }),
        candidatePreference: '公开资料里有舞蹈相关标签的人优先',
        candidatePreferencePolicy:
          'public_discoverable_profiles_and_user_consented_public_tags_only',
        safetyPolicy: expect.objectContaining({
          policyVersion: 'fitmeet.candidate-search.v1',
          source: 'social_agent_chat',
          taskId: 101,
          socialRequestId: 301,
          candidateEligibility: expect.objectContaining({
            profileDiscoverable: true,
            agentCanRecommendMe: true,
            publicOrAuthorizedSourceOnly: true,
            excludeBlockedUsers: true,
            excludeComplaintRisk: true,
            excludeUnsafeMeetRisk: true,
          }),
          privacy: expect.objectContaining({
            redactPreciseLocation: true,
            redactContactInfo: true,
            exposeOnlyPublicProfileFields: true,
            noPrivateLifeGraphLeakage: true,
          }),
          rankingSignals: expect.arrayContaining([
            'city_or_distance',
            'interests',
            'time_overlap',
            'social_boundary',
            'activity_intensity',
            'relationship_goal',
            'public_life_graph_preferences',
          ]),
          sideEffectPolicy: 'search_only_no_contact_without_approval',
          approvalPolicy:
            'send_message_add_friend_connect_create_activity_publish_require_checkpoint',
        }),
      }),
      7,
      { signal: null },
    );
    expect(result).toMatchObject({
      message: '找到 1 位候选人',
      debugReasons: { accepted: 1 },
      candidates: [
        expect.objectContaining({
          userId: 22,
          candidateUserId: 22,
          candidateRecordId: 501,
          socialRequestId: 301,
          nickname: '小林',
        }),
      ],
    });
  });

  it('passes restored taskMemory slots into the real candidate search tool input', async () => {
    const { executor, service } = makeHarness();
    const task = makeTaskWithRestoredTaskMemorySlots();

    await service.searchCandidates(task, makeDraft());

    expect(executor.executeToolAction).toHaveBeenCalledWith(
      101,
      SocialAgentToolName.SearchMatches,
      expect.objectContaining({
        taskContext: expect.objectContaining({
          taskSlots: expect.objectContaining({
            activity: expect.objectContaining({ value: '散步' }),
            time_window: expect.objectContaining({ value: '今天晚上' }),
            location_text: expect.objectContaining({ value: '青岛大学附近' }),
            candidate_preference: expect.objectContaining({
              value: '公开资料里有舞蹈相关标签的人优先',
            }),
          }),
          candidatePreference: '公开资料里有舞蹈相关标签的人优先',
          doNotRepeatQuestionsForSlots: expect.arrayContaining([
            'activity',
            'time_window',
            'location_text',
            'candidate_preference',
          ]),
        }),
        candidatePreference: '公开资料里有舞蹈相关标签的人优先',
        candidatePreferencePolicy:
          'public_discoverable_profiles_and_user_consented_public_tags_only',
      }),
      7,
      { signal: null },
    );
  });

  it('searches draft criteria when no persisted request exists', async () => {
    const { executor, service } = makeHarness();
    const task = makeTaskWithCompletedSlots();

    await service.searchCandidates(
      task,
      makeDraft({ socialRequestId: null, radiusKm: undefined }),
    );

    expect(executor.executeToolAction).toHaveBeenCalledWith(
      101,
      SocialAgentToolName.SearchMatches,
      expect.objectContaining({
        taskId: 101,
        city: '青岛',
        activityType: 'running',
        interestTags: ['跑步', '低压力'],
        radiusKm: 5,
        rawText: '今晚青岛轻松跑步',
        limit: 10,
        taskContext: expect.objectContaining({
          candidatePreference: '公开资料里有舞蹈相关标签的人优先',
          privacyPolicy:
            'do_not_use_private_life_graph_or_hidden_profile_fields_for_candidate_search',
        }),
        candidatePreference: '公开资料里有舞蹈相关标签的人优先',
        candidatePreferencePolicy:
          'public_discoverable_profiles_and_user_consented_public_tags_only',
        safetyPolicy: expect.objectContaining({
          candidateEligibility: expect.objectContaining({
            profileDiscoverable: true,
            agentCanRecommendMe: true,
            excludeBlockedUsers: true,
            excludeComplaintRisk: true,
          }),
          privacy: expect.objectContaining({
            redactPreciseLocation: true,
            redactContactInfo: true,
            noPrivateLifeGraphLeakage: true,
          }),
          rankingSignals: expect.arrayContaining([
            'city_or_distance',
            'interests',
            'time_overlap',
            'social_boundary',
            'activity_intensity',
            'relationship_goal',
          ]),
        }),
      }),
      7,
      { signal: null },
    );
  });

  it('surfaces draft generation tool failures', async () => {
    const { executor, service } = makeHarness();
    executor.executeToolAction.mockResolvedValueOnce({
      id: 'action_create_social_request_draft_1',
      toolName: SocialAgentToolName.CreateSocialRequest,
      status: 'failed',
      output: null,
      error: { message: 'draft model unavailable' },
    } as never);

    await expect(
      service.generateDraftWithTool(makeTask(), '今晚青岛轻松跑步'),
    ).rejects.toThrow('draft model unavailable');
  });
});
