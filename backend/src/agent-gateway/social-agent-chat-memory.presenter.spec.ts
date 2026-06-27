import type { AgentTask } from './entities/agent-task.entity';
import {
  appendSocialAgentConversationTurn,
  buildSocialAgentLlmConversationHistory,
  readSocialAgentConversationHistory,
  summarizeSocialAgentTaskMemoryForLlm,
} from './social-agent-chat-memory.presenter';

function task(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 101,
    goal: '帮我找青岛跑步搭子',
    memory: {},
    ...overrides,
  } as AgentTask;
}

describe('social-agent-chat-memory.presenter', () => {
  it('appends conversation turns with duplicate suppression and max history', () => {
    const agentTask = task();

    appendSocialAgentConversationTurn(agentTask, {
      role: 'user',
      text: '你好',
      at: '2026-06-05T00:00:00.000Z',
    });
    appendSocialAgentConversationTurn(agentTask, {
      role: 'user',
      text: '你好',
      at: '2026-06-05T00:01:00.000Z',
    });
    appendSocialAgentConversationTurn(
      agentTask,
      {
        role: 'assistant',
        text: '我在',
        at: '2026-06-05T00:02:00.000Z',
      },
      2,
    );
    appendSocialAgentConversationTurn(
      agentTask,
      {
        role: 'user',
        text: '帮我找人',
        at: '2026-06-05T00:03:00.000Z',
      },
      2,
    );

    expect(readSocialAgentConversationHistory(agentTask)).toEqual([
      {
        role: 'assistant',
        text: '我在',
        at: '2026-06-05T00:02:00.000Z',
      },
      {
        role: 'user',
        text: '帮我找人',
        at: '2026-06-05T00:03:00.000Z',
      },
    ]);
  });

  it('builds a compact LLM-safe history from text or content fields', () => {
    const agentTask = task({
      memory: {
        socialAgentConversation: {
          turns: [
            { role: 'user', content: '  我想找跑步搭子  ' },
            { role: 'assistant', text: '可以，在哪个城市？' },
          ],
        },
      },
    });

    expect(buildSocialAgentLlmConversationHistory(agentTask)).toEqual([
      { role: 'user', text: '我想找跑步搭子' },
      { role: 'assistant', text: '可以，在哪个城市？' },
    ]);
  });

  it('keeps the default stored history window for restore and audit callers', () => {
    const agentTask = task({
      memory: {
        socialAgentConversation: {
          turns: Array.from({ length: 85 }, (_, index) => ({
            role: index % 2 === 0 ? 'user' : 'assistant',
            text: `第 ${index + 1} 条`,
          })),
        },
      },
    });

    const history = buildSocialAgentLlmConversationHistory(agentTask);

    expect(history).toHaveLength(80);
    expect(history[0]).toEqual({ role: 'assistant', text: '第 6 条' });
    expect(history.at(-1)).toEqual({ role: 'user', text: '第 85 条' });
  });

  it('allows explicit compact LLM history limits for prompt callers', () => {
    const agentTask = task({
      memory: {
        socialAgentConversation: {
          turns: Array.from({ length: 85 }, (_, index) => ({
            role: index % 2 === 0 ? 'user' : 'assistant',
            text: `第 ${index + 1} 条`,
          })),
        },
      },
    });

    const history = buildSocialAgentLlmConversationHistory(agentTask, 8);

    expect(history).toHaveLength(8);
    expect(history[0]).toEqual({ role: 'assistant', text: '第 78 条' });
    expect(history.at(-1)).toEqual({ role: 'user', text: '第 85 条' });
  });

  it('keeps enough stored turns for configured larger context windows', () => {
    const agentTask = task();

    for (let index = 1; index <= 130; index += 1) {
      appendSocialAgentConversationTurn(agentTask, {
        role: index % 2 === 0 ? 'assistant' : 'user',
        text: `第 ${index} 条`,
        at: `2026-06-05T00:${String(index % 60).padStart(2, '0')}:00.000Z`,
      });
    }

    const stored = readSocialAgentConversationHistory(agentTask, 120);

    expect(stored).toHaveLength(120);
    expect(stored[0]).toMatchObject({ text: '第 11 条' });
    expect(stored.at(-1)).toMatchObject({ text: '第 130 条' });
  });

  it('summarizes task memory for final response context', () => {
    const agentTask = task({
      memory: {
        taskSlots: {
          activity: {
            key: 'activity',
            value: '散步',
            state: 'completed',
            source: 'user_message',
            updatedAt: '2026-06-17T00:00:00.000Z',
            completedAt: '2026-06-17T00:00:00.000Z',
          },
          time_window: {
            key: 'time_window',
            value: '今天晚上',
            state: 'completed',
            source: 'user_message',
            updatedAt: '2026-06-17T00:00:00.000Z',
            completedAt: '2026-06-17T00:00:00.000Z',
          },
          location_text: {
            key: 'location_text',
            value: '青岛大学附近',
            state: 'completed',
            source: 'user_message',
            updatedAt: '2026-06-17T00:00:00.000Z',
            completedAt: '2026-06-17T00:00:00.000Z',
          },
          candidate_preference: {
            key: 'candidate_preference',
            value: '舞蹈相关公开标签优先',
            state: 'answered',
            source: 'user_message',
            updatedAt: '2026-06-17T00:00:00.000Z',
          },
        },
        taskSlotSummary: {
          活动: '散步',
          时间: '今天晚上',
          地点: '青岛大学附近',
          候选偏好: '舞蹈相关公开标签优先',
        },
        taskMemory: {
          currentGoal: '今晚青岛大学附近散步',
          preferences: { interests: ['跑步'] },
          boundaries: { publicPlaceOnly: true },
          activeEntities: { city: '青岛' },
          candidateState: { savedIds: [2], rejectedIds: [3] },
          pendingActions: [
            {
              id: 9,
              type: 'approval',
              actionType: 'send_invite',
              summary: '发送邀请前确认',
              riskLevel: 'medium',
              at: '2026-06-17T00:00:00.000Z',
            },
          ],
          stableProfileFacts: {
            preferredArea: '青岛大学附近',
          },
          currentTask: {
            state: 'searching_candidates',
            objective: 'social_match',
            nextStep: 'search_candidates',
            shouldSearchNow: true,
            clarificationAskedFields: ['activity', 'time_window'],
          },
          lastUserMessages: [
            {
              text: '今晚青岛大学附近散步，最好舞蹈生',
              intent: 'social_match',
              at: '2026-06-17T00:00:00.000Z',
            },
          ],
        },
        shortTerm: {
          candidates: [{ userId: 2 }, { userId: 3 }],
        },
      },
    });

    expect(summarizeSocialAgentTaskMemoryForLlm(agentTask)).toMatchObject({
      goal: '帮我找青岛跑步搭子',
      currentGoal: '今晚青岛大学附近散步',
      currentTask: expect.objectContaining({
        state: 'searching_candidates',
        objective: 'social_match',
        nextStep: 'search_candidates',
        shouldSearchNow: true,
        clarificationAskedFields: ['activity', 'time_window'],
      }),
      taskSlots: expect.objectContaining({
        activity: expect.objectContaining({
          value: '散步',
          state: 'completed',
        }),
        time_window: expect.objectContaining({
          value: '今天晚上',
          state: 'completed',
        }),
        location_text: expect.objectContaining({
          value: '青岛大学附近',
          state: 'completed',
        }),
        candidate_preference: expect.objectContaining({
          value: '舞蹈相关公开标签优先',
          state: 'answered',
        }),
      }),
      taskSlotSummary: {
        活动: '散步',
        时间: '今天晚上',
        地点: '青岛大学附近',
        候选偏好: '舞蹈相关公开标签优先',
      },
      preferences: { interests: ['跑步'] },
      legacyPreferences: { interests: ['跑步'] },
      boundaries: { publicPlaceOnly: true },
      legacyBoundaries: { publicPlaceOnly: true },
      activeEntities: { city: '青岛' },
      candidateState: expect.objectContaining({
        savedIds: [2],
        rejectedIds: [3],
      }),
      activityState: expect.objectContaining({
        recommendedIds: [],
      }),
      pendingActions: [
        expect.objectContaining({
          actionType: 'send_invite',
          summary: '发送邀请前确认',
        }),
      ],
      stableProfileFacts: {
        preferredArea: '青岛大学附近',
      },
      lastUserMessages: [
        expect.objectContaining({
          text: '今晚青岛大学附近散步，最好舞蹈生',
        }),
      ],
      candidateCount: 2,
    });
  });

  it('summarizes restored taskMemory slots when top-level slots are absent', () => {
    const agentTask = task({
      memory: {
        taskMemory: {
          currentGoal: '今晚青岛大学附近散步，优先舞蹈相关标签',
          taskSlots: {
            activity: {
              key: 'activity',
              value: '散步',
              state: 'completed',
              source: 'user_message',
            },
            time_window: {
              key: 'time_window',
              value: '今天晚上',
              state: 'completed',
              source: 'user_message',
            },
            location_text: {
              key: 'location_text',
              value: '青岛大学附近',
              state: 'completed',
              source: 'user_message',
            },
            candidate_preference: {
              key: 'candidate_preference',
              value: '舞蹈相关公开标签优先',
              state: 'answered',
              source: 'user_message',
            },
          },
          taskSlotSummary: {
            活动: '散步',
            时间: '今天晚上',
            地点: '青岛大学附近',
            候选偏好: '舞蹈相关公开标签优先',
          },
        },
      },
    });

    expect(summarizeSocialAgentTaskMemoryForLlm(agentTask)).toMatchObject({
      currentGoal: '今晚青岛大学附近散步，优先舞蹈相关标签',
      taskSlots: expect.objectContaining({
        activity: expect.objectContaining({ value: '散步' }),
        time_window: expect.objectContaining({ value: '今天晚上' }),
        location_text: expect.objectContaining({ value: '青岛大学附近' }),
        candidate_preference: expect.objectContaining({
          value: '舞蹈相关公开标签优先',
        }),
      }),
      taskSlotSummary: {
        活动: '散步',
        时间: '今天晚上',
        地点: '青岛大学附近',
        候选偏好: '舞蹈相关公开标签优先',
      },
    });
  });

  it('summarizes empty search memory so the next LLM turn does not start from scratch', () => {
    const agentTask = task({
      memory: {
        shortTerm: {
          hasSearched: true,
          lastSearchAt: '2026-06-18T10:00:00.000Z',
          lastSearchIntent: 'social_search',
          lastSearchCandidateCount: 0,
          lastSearchEmptyReason: 'no_real_candidates',
          lastSearchNextStep: '放宽条件、换时间范围，或确认发布约练卡到发现',
          candidates: [],
        },
      },
    });

    expect(summarizeSocialAgentTaskMemoryForLlm(agentTask)).toMatchObject({
      lastSearch: {
        intent: 'social_search',
        at: '2026-06-18T10:00:00.000Z',
        candidateCount: 0,
        emptyReason: 'no_real_candidates',
        nextStep: '放宽条件、换时间范围，或确认发布约练卡到发现',
      },
      candidateCount: 0,
    });
  });
});
