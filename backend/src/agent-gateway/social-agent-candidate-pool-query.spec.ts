import { UserSocialRequest } from '../social-requests/social-request.entity';
import { AgentTask } from './entities/agent-task.entity';
import {
  buildCandidatePoolResolvedQuery,
  normalizeCandidatePoolArray,
  uniqueCandidatePoolStrings,
} from './social-agent-candidate-pool-query';

describe('buildCandidatePoolResolvedQuery', () => {
  it('prefers explicit tool input over request and task context', () => {
    const query = buildCandidatePoolResolvedQuery({
      query: {
        ownerUserId: 1,
        intent: 'activity_search',
        city: '青岛',
        activityType: '跑步',
        interestTags: ['跑步', '咖啡'],
        timePreference: '周末上午',
        locationPreference: '青岛大学',
        rawText: '青岛周末上午跑步搭子',
      },
      socialRequestId: 301,
      request: {
        city: '北京',
        activityType: '羽毛球',
        interestTags: ['羽毛球'],
        rawText: '北京羽毛球',
        title: '北京约练',
      } as UserSocialRequest,
      task: { goal: '上海咖啡聊天' } as AgentTask,
    });

    expect(query).toEqual({
      city: '青岛',
      intent: 'activity_search',
      interestTags: ['跑步', '咖啡', '羽毛球'],
      candidatePreference: '',
      candidatePreferencePolicy:
        'public_discoverable_profiles_and_user_consented_public_tags_only',
      activityType: '跑步',
      timePreference: '周末上午',
      locationPreference: '青岛大学',
      socialRequestId: 301,
      rawText: '青岛周末上午跑步搭子',
      acceptsStrangers: null,
    });
  });

  it('falls back to social request fields when direct input is omitted', () => {
    const query = buildCandidatePoolResolvedQuery({
      query: {
        ownerUserId: 1,
        city: '',
      },
      socialRequestId: 302,
      request: {
        city: '上海',
        activityType: '咖啡',
        interestTags: ['咖啡', '摄影'],
        rawText: '上海周末咖啡摄影局',
        title: '上海咖啡',
      } as UserSocialRequest,
      task: { goal: '青岛跑步' } as AgentTask,
    });

    expect(query).toMatchObject({
      city: '上海',
      intent: 'social_search',
      activityType: '咖啡',
      timePreference: '周末',
      socialRequestId: 302,
      rawText: '上海周末咖啡摄影局',
      acceptsStrangers: null,
    });
    expect(query.interestTags).toEqual(
      expect.arrayContaining(['咖啡', '摄影', '拍照']),
    );
  });

  it('prefers current task slots over a linked request when resolving card context', () => {
    const query = buildCandidatePoolResolvedQuery({
      query: {
        ownerUserId: 1,
        taskId: 88,
        rawText: '继续帮我找人',
      },
      socialRequestId: 302,
      request: {
        city: '上海',
        activityType: '咖啡',
        interestTags: ['咖啡', 'Citywalk'],
        rawText: '上海周末咖啡局',
        title: '上海咖啡',
      } as UserSocialRequest,
      task: {
        goal: '今天晚上在青岛大学附近散步',
        memory: {
          taskSlots: {
            geo_area: {
              value: '青岛',
              state: 'completed',
              source: 'user_message',
            },
            location_text: {
              value: '青岛大学附近',
              state: 'completed',
              source: 'user_message',
            },
            time_window: {
              value: '今天晚上',
              state: 'completed',
              source: 'user_message',
            },
            activity: {
              value: '散步',
              state: 'completed',
              source: 'user_message',
            },
          },
        },
      } as unknown as AgentTask,
    });

    expect(query).toMatchObject({
      city: '青岛',
      activityType: '散步',
      timePreference: '今天晚上',
      locationPreference: '青岛大学附近',
      rawText: '继续帮我找人',
    });
    expect(query.interestTags).toEqual(expect.arrayContaining(['散步']));
    expect(query.interestTags).not.toEqual(expect.arrayContaining(['咖啡']));
  });

  it('extracts city, activity, tags, and time from task goal raw text', () => {
    const query = buildCandidatePoolResolvedQuery({
      query: { ownerUserId: 1, taskId: 88 },
      socialRequestId: null,
      task: { goal: '想在青岛周末找跑步和咖啡搭子' } as AgentTask,
    });

    expect(query.city).toBe('青岛');
    expect(query.activityType).toBe('咖啡');
    expect(query.timePreference).toBe('周末');
    expect(query.interestTags).toEqual(
      expect.arrayContaining(['跑步', '咖啡']),
    );
    expect(query.acceptsStrangers).toBeNull();
  });

  it('falls back to completed task slots when the current message is only a continuation', () => {
    const query = buildCandidatePoolResolvedQuery({
      query: {
        ownerUserId: 1,
        taskId: 88,
        rawText: '可以，帮我找人',
      },
      socialRequestId: null,
      task: {
        goal: '找散步搭子',
        memory: {
          taskSlots: {
            geo_area: {
              value: '青岛',
              state: 'inferred',
              source: 'inferred',
            },
            location_text: {
              value: '青岛大学附近',
              state: 'completed',
              source: 'user_message',
            },
            time_window: {
              value: '今天晚上',
              state: 'completed',
              source: 'user_message',
            },
            activity: {
              value: '散步',
              state: 'completed',
              source: 'user_message',
            },
            candidate_preference: {
              value: '女生、舞蹈相关',
              state: 'answered',
              source: 'user_message',
            },
          },
        },
      } as unknown as AgentTask,
    });

    expect(query).toMatchObject({
      city: '青岛',
      activityType: '散步',
      timePreference: '今天晚上',
      locationPreference: '青岛大学附近',
      rawText: '可以，帮我找人',
    });
    expect(query.interestTags).toEqual(
      expect.arrayContaining(['散步', 'citywalk', '女生', '舞蹈相关']),
    );
    expect(query.candidatePreference).toBe('女生、舞蹈相关');
    expect(query.candidatePreferencePolicy).toBe(
      'public_discoverable_profiles_and_user_consented_public_tags_only',
    );
  });

  it('falls back to restored taskMemory slots after session restore', () => {
    const query = buildCandidatePoolResolvedQuery({
      query: {
        ownerUserId: 1,
        taskId: 88,
        rawText: '可以，帮我找人',
      },
      socialRequestId: null,
      task: {
        goal: '找散步搭子',
        memory: {
          taskMemory: {
            taskSlots: {
              geo_area: {
                value: '崂山区',
                state: 'inferred',
                source: 'inferred',
              },
              location_text: {
                value: '青岛大学附近',
                state: 'completed',
                source: 'user_message',
              },
              time_window: {
                value: '今天晚上',
                state: 'completed',
                source: 'user_message',
              },
              activity: {
                value: '散步',
                state: 'completed',
                source: 'user_message',
              },
              candidate_preference: {
                value: '公开资料里有舞蹈相关标签的女生',
                state: 'answered',
                source: 'user_message',
              },
            },
          },
        },
      } as unknown as AgentTask,
    });

    expect(query.city).toBe('青岛');
    expect(query.activityType).toBe('散步');
    expect(query.timePreference).toBe('今天晚上');
    expect(query.locationPreference).toBe('青岛大学附近');
    expect(query.candidatePreference).toBe('公开资料里有舞蹈相关标签的女生');
    expect(query.interestTags).toEqual(
      expect.arrayContaining(['散步', 'citywalk', '女生', '舞蹈相关']),
    );
  });

  it('uses known task slot constraints when restored taskMemory has no raw taskSlots', () => {
    const query = buildCandidatePoolResolvedQuery({
      query: {
        ownerUserId: 1,
        taskId: 88,
        rawText: '继续',
      },
      socialRequestId: null,
      task: {
        goal: '今晚青岛大学附近散步',
        memory: {
          taskMemory: {
            knownTaskSlotConstraints: {
              treatAsHardConstraints: true,
              knownSlots: [
                { key: 'geo_area', label: '区域', value: '崂山区' },
                { key: 'location_text', label: '地点', value: '青岛大学附近' },
                { key: 'time_window', label: '时间', value: '今天晚上' },
                { key: 'activity', label: '活动', value: '散步' },
                {
                  key: 'candidate_preference',
                  label: '候选偏好',
                  value: '公开资料里有舞蹈相关标签的女生',
                },
              ],
              doNotAskAgainFor: [
                'geo_area',
                'location_text',
                'time_window',
                'activity',
                'candidate_preference',
              ],
            },
          },
        },
      } as unknown as AgentTask,
    });

    expect(query.city).toBe('青岛');
    expect(query.activityType).toBe('散步');
    expect(query.timePreference).toBe('今天晚上');
    expect(query.locationPreference).toBe('青岛大学附近');
    expect(query.candidatePreference).toBe('公开资料里有舞蹈相关标签的女生');
    expect(query.interestTags).toEqual(
      expect.arrayContaining(['散步', '女生', '舞蹈相关']),
    );
  });

  it('infers the city from Qingdao district and keeps the concrete location preference', () => {
    const query = buildCandidatePoolResolvedQuery({
      query: {
        ownerUserId: 1,
        taskId: 88,
        rawText: '可以，帮我找人',
      },
      socialRequestId: null,
      task: {
        goal: '找散步搭子',
        memory: {
          taskSlots: {
            geo_area: {
              value: '崂山区',
              state: 'inferred',
              source: 'inferred',
            },
            location_text: {
              value: '青岛大学附近',
              state: 'completed',
              source: 'user_message',
            },
            time_window: {
              value: '今天晚上',
              state: 'completed',
              source: 'user_message',
            },
            activity: {
              value: '散步',
              state: 'completed',
              source: 'user_message',
            },
            candidate_preference: {
              value: '女生、舞蹈相关',
              state: 'answered',
              source: 'user_message',
            },
          },
        },
      } as unknown as AgentTask,
    });

    expect(query.city).toBe('青岛');
    expect(query.locationPreference).toBe('青岛大学附近');
    expect(query.activityType).toBe('散步');
    expect(query.timePreference).toBe('今天晚上');
    expect(query.candidatePreference).toBe('女生、舞蹈相关');
    expect(query.interestTags).toEqual(
      expect.arrayContaining(['散步', '女生', '舞蹈相关']),
    );
  });

  it('carries direct candidate preference into public tag matching even before task memory is persisted', () => {
    const query = buildCandidatePoolResolvedQuery({
      query: {
        ownerUserId: 1,
        taskId: 88,
        rawText: '可以，帮我找人',
        candidatePreference: '公开资料里有舞蹈相关标签的女生优先',
        candidatePreferencePolicy:
          'public_discoverable_profiles_and_user_consented_public_tags_only',
      },
      socialRequestId: null,
      task: {
        goal: '今晚青岛大学散步',
        memory: {
          taskSlots: {
            geo_area: {
              value: '青岛',
              state: 'completed',
              source: 'user_message',
            },
            activity: {
              value: '散步',
              state: 'completed',
              source: 'user_message',
            },
          },
        },
      } as unknown as AgentTask,
    });

    expect(query.candidatePreference).toBe(
      '公开资料里有舞蹈相关标签的女生优先',
    );
    expect(query.interestTags).toEqual(
      expect.arrayContaining([
        '散步',
        'citywalk',
        '公开资料里有舞蹈相关标签的女生优先',
        '舞蹈相关',
        '女生',
      ]),
    );
  });

  it('does not promote inferred activity, time, or precise location slots into search filters', () => {
    const query = buildCandidatePoolResolvedQuery({
      query: {
        ownerUserId: 1,
        taskId: 88,
        rawText: '继续',
      },
      socialRequestId: null,
      task: {
        goal: '找搭子',
        memory: {
          taskSlots: {
            geo_area: {
              value: '青岛',
              state: 'inferred',
              source: 'inferred',
            },
            location_text: {
              value: '青岛大学附近',
              state: 'inferred',
              source: 'inferred',
            },
            time_window: {
              value: '今天晚上',
              state: 'inferred',
              source: 'inferred',
            },
            activity: {
              value: '散步',
              state: 'inferred',
              source: 'inferred',
            },
          },
        },
      } as unknown as AgentTask,
    });

    expect(query.city).toBe('青岛');
    expect(query.activityType).toBe('');
    expect(query.timePreference).toBe('');
    expect(query.locationPreference).toBe('');
  });

  it('carries explicit stranger policy into the resolved query', () => {
    expect(
      buildCandidatePoolResolvedQuery({
        query: {
          ownerUserId: 1,
          rawText: '青岛周末跑步，只推荐熟人，不接受陌生人',
        },
        socialRequestId: null,
      }).acceptsStrangers,
    ).toBe(false);

    expect(
      buildCandidatePoolResolvedQuery({
        query: {
          ownerUserId: 1,
          rawText: '青岛周末跑步，接受陌生人，先站内聊',
        },
        socialRequestId: null,
      }).acceptsStrangers,
    ).toBe(true);
  });

  it('carries task memory stranger boundaries into short follow-up queries', () => {
    expect(
      buildCandidatePoolResolvedQuery({
        query: {
          ownerUserId: 1,
          rawText: '继续找',
        },
        socialRequestId: null,
        task: {
          id: 88,
          memory: {
            taskMemory: {
              boundaries: {
                acceptsStrangers: false,
              },
            },
          },
        } as never,
      }).acceptsStrangers,
    ).toBe(false);

    expect(
      buildCandidatePoolResolvedQuery({
        query: {
          ownerUserId: 1,
          rawText: '可以接受陌生人，继续找',
        },
        socialRequestId: null,
        task: {
          id: 89,
          memory: {
            taskMemory: {
              boundaries: {
                acceptsStrangers: false,
              },
            },
          },
        } as never,
      }).acceptsStrangers,
    ).toBe(true);
  });

  it('normalizes candidate pool arrays and unique text consistently', () => {
    expect(normalizeCandidatePoolArray('跑步、咖啡, 跑步；摄影|')).toEqual([
      '跑步',
      '咖啡',
      '摄影',
    ]);
    expect(
      uniqueCandidatePoolStrings([' Qingdao ', 'qingdao', '', '青岛']),
    ).toEqual(['Qingdao', '青岛']);
  });
});
