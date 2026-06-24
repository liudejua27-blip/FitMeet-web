import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { SocialAgentMemoryContextService } from './social-agent-memory-context.service';
import {
  mergeSocialAgentStableProfileFacts,
  rememberSocialAgentCurrentTask,
} from './social-agent-memory.util';

function makeTask(): AgentTask {
  return {
    id: 1,
    ownerUserId: 7,
    agentConnectionId: null,
    taskType: 'social_agent_chat',
    title: 'chat',
    goal: 'complete profile',
    input: {},
    plan: [],
    toolCalls: [],
    result: {},
    memory: {
      conversationBrain: {
        conversationMode: 'profile_correction',
        notes: ['user_repair_detected'],
        lastToolResult: {
          name: 'update_profile_from_agent_context',
          status: 'succeeded',
        },
      },
      shortTerm: {
        candidates: [{ candidateUserId: 2 }],
      },
    },
    status: AgentTaskStatus.Pending,
    permissionMode: AgentTaskPermissionMode.Confirm,
    riskLevel: 'low' as never,
    idempotencyKey: null,
    statusReason: null,
    error: null,
    startedAt: null,
    awaitingConfirmationAt: null,
    completedAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  } as unknown as AgentTask;
}

describe('SocialAgentMemoryContextService', () => {
  it('builds layered memory context from short term, task and long term memory', () => {
    const service = new SocialAgentMemoryContextService();
    const task = makeTask();
    rememberSocialAgentCurrentTask(task, {
      objective: 'profile_enrichment',
      nextStep: 'ask availability and boundaries',
      shouldSearchNow: false,
    });
    mergeSocialAgentStableProfileFacts(task, {
      city: 'Qingdao',
      nearbyArea: 'Qingdao University',
      mbti: 'INFP',
    });

    const context = service.build({
      task,
      conversationHistory: [
        { role: 'user', text: 'I am in Qingdao University' },
        { role: 'user', text: '不是不是，上面是我的画像' },
      ],
      longTermSnapshot: {
        userId: 7,
        profileFacts: {
          city: 'Qingdao',
          nearbyArea: 'Qingdao University',
          mbti: 'INFP',
        },
        preferences: {
          interests: ['running'],
          socialStyle: '',
          communicationStyle: '',
          preferredTraits: [],
          preferenceHistory: [
            {
              field: 'interest',
              value: 'running',
              source: 'task_memory',
              taskId: 3,
              outcome: 'succeeded',
              confirmed: true,
              at: '2026-05-24T00:00:00.000Z',
            },
          ],
        },
        boundaries: {
          excludedGenders: [],
          noNightMeet: true,
          publicPlaceOnly: true,
          noAutoMessage: false,
          noContactExchange: false,
        },
        socialGoals: ['same-school women'],
        availability: ['weekend afternoon'],
        activityPreferences: {
          favoriteCities: ['Qingdao'],
          favoriteActivityTypes: [],
          favoriteTimePreferences: [],
          favoriteLocationPreferences: [],
        },
        matchSignals: {
          successfulMatches: [],
          failedMatches: [],
        },
        taskCount: 3,
        updatedAt: '2026-05-25T00:00:00.000Z',
      },
    });

    expect(context.shortTerm.correctionActive).toBe(true);
    expect(context.shortTerm.candidateCount).toBe(1);
    expect(context.shortTerm.misunderstandingDetected).toBe(true);
    expect(context.shortTerm.lastToolResult).toMatchObject({
      name: 'update_profile_from_agent_context',
    });
    expect(context.taskMemory.currentTask).toMatchObject({
      objective: 'profile_enrichment',
      shouldSearchNow: false,
    });
    expect(context.taskMemory.state).toBe('idle');
    expect(context.taskMemory.stableProfileFacts).toMatchObject({
      city: 'Qingdao',
      nearbyArea: 'Qingdao University',
    });
    expect(context.longTerm?.boundaries).toMatchObject({
      noNightMeet: true,
      publicPlaceOnly: true,
    });
    expect(context.longTerm?.profileFacts).toMatchObject({
      city: 'Qingdao',
      mbti: 'INFP',
    });
    expect(context.longTerm?.socialGoals).toContain('same-school women');
    expect(context.longTerm?.availability).toContain('weekend afternoon');
    expect(context.longTerm?.recentPreferenceHistory).toEqual([
      expect.objectContaining({
        field: '兴趣',
        value: 'running',
        source: '任务记忆',
      }),
    ]);
    expect(context.retrievalHints.shouldRecallConversation).toBe(true);
    expect(context.retrievalHints.shouldAvoidImmediateSearch).toBe(true);
    expect(context.retrievalHints.missingProfileFields).toEqual(
      expect.arrayContaining(['availableTimes', 'privacyBoundary']),
    );
  });

  it('merges stored short-term turns with hydrated history using the unified context limit', () => {
    const service = new SocialAgentMemoryContextService({
      get: (key: string) =>
        key === 'SOCIAL_AGENT_CONTEXT_TURN_LIMIT' ? '40' : undefined,
    } as never);
    const task = makeTask();
    task.memory = {
      ...task.memory,
      shortTerm: {
        recentTurns: Array.from({ length: 88 }, (_, index) => ({
          role: 'user',
          text: `stored-turn-${index + 1}`,
        })),
      },
    };

    const context = service.build({
      task,
      conversationHistory: Array.from({ length: 88 }, (_, index) => ({
        role: 'user',
        text: `history-turn-${index + 1}`,
      })),
      longTermSnapshot: {
        userId: 7,
        profileFacts: {},
        preferences: {
          interests: [],
          socialStyle: '',
          communicationStyle: '',
          preferredTraits: [],
          preferenceHistory: Array.from({ length: 88 }, (_, index) => ({
            field: 'interest' as const,
            value: `preference-${index + 1}`,
            source: 'task_memory' as const,
            taskId: index + 1,
            outcome: 'succeeded' as const,
            confirmed: true,
            at: `2026-06-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
          })),
        },
        boundaries: {
          excludedGenders: [],
          noNightMeet: false,
          publicPlaceOnly: false,
          noAutoMessage: false,
          noContactExchange: false,
        },
        socialGoals: [],
        availability: [],
        activityPreferences: {
          favoriteCities: [],
          favoriteActivityTypes: [],
          favoriteTimePreferences: [],
          favoriteLocationPreferences: [],
        },
        matchSignals: {
          successfulMatches: [],
          failedMatches: [],
        },
        taskCount: 48,
        updatedAt: '2026-06-18T00:00:00.000Z',
      },
    });

    expect(context.shortTerm.recentTurns).toHaveLength(80);
    expect(context.shortTerm.recentTurns[0]).toMatchObject({
      text: 'history-turn-9',
    });
    expect(context.shortTerm.recentTurns.at(-1)).toMatchObject({
      text: 'history-turn-88',
    });
    expect(context.longTerm?.recentPreferenceHistory).toHaveLength(80);
    expect(context.longTerm?.recentPreferenceHistory[0]).toMatchObject({
      value: 'preference-9',
    });
  });

  it('hydrates empty candidate search state for the next planner turn', () => {
    const service = new SocialAgentMemoryContextService();
    const task = makeTask();
    task.memory = {
      ...task.memory,
      shortTerm: {
        hasSearched: true,
        lastSearchAt: '2026-06-18T10:00:00.000Z',
        lastSearchIntent: 'social_search',
        lastSearchCandidateCount: 0,
        lastSearchEmptyReason: 'no_real_candidates',
        lastSearchNextStep: '放宽条件、换时间范围，或确认发布约练卡到发现',
        displayedCandidates: [],
      },
    };

    const context = service.build({
      task,
      conversationHistory: [],
      longTermSnapshot: null,
    });

    expect(context.shortTerm.lastSearch).toMatchObject({
      intent: 'social_search',
      candidateCount: 0,
      emptyReason: 'no_real_candidates',
      nextStep: '放宽条件、换时间范围，或确认发布约练卡到发现',
    });
    expect(context.shortTerm.candidateCount).toBe(0);
  });

  it('exposes canonical approval and candidate action aliases to every planner context', () => {
    const service = new SocialAgentMemoryContextService();
    const task = makeTask();
    task.memory = {
      taskMemory: {
        currentGoal: 'find a weekend walking partner',
        candidateActions: {
          recommendedIds: [20],
          savedIds: [22],
          messagedIds: [24],
          rejectedIds: [23],
        },
        pendingApprovals: [
          {
            id: 91,
            type: 'send_invite',
            actionType: 'send_invite',
            summary: 'Send a walking invite to candidate 22',
            riskLevel: 'medium',
            at: '2026-06-18T00:00:00.000Z',
          },
        ],
      },
    };

    const context = service.build({
      task,
      conversationHistory: [],
      longTermSnapshot: null,
    });

    expect(context.taskMemory.candidateState).toMatchObject({
      savedIds: [22],
      rejectedIds: [23],
      messagedIds: [24],
    });
    expect(context.taskMemory.candidateActions).toMatchObject(
      context.taskMemory.candidateState,
    );
    expect(context.taskMemory.pendingActions).toEqual([
      expect.objectContaining({
        id: 91,
        actionType: 'send_invite',
      }),
    ]);
    expect(context.taskMemory.pendingApprovals).toEqual(
      context.taskMemory.pendingActions,
    );
  });

  it('does not let stale short-term cache hide the latest user correction from DeepSeek context', () => {
    const service = new SocialAgentMemoryContextService();
    const task = makeTask();
    task.memory = {
      ...task.memory,
      taskSlots: {
        time_window: { value: '今天晚上', state: 'completed' },
        location_text: { value: '青岛大学附近', state: 'completed' },
        activity: { value: '散步', state: 'completed' },
        candidate_preference: {
          value: '公开资料带舞蹈相关标签的人优先',
          state: 'answered',
        },
      },
      shortTerm: {
        recentTurns: [
          { role: 'user', text: '旧问题：周末找跑步搭子' },
          { role: 'assistant', text: '我先问你时间。' },
        ],
      },
    };

    const context = service.build({
      task,
      conversationHistory: [
        {
          role: 'user',
          text: '今天晚上，青岛大学，散步，找舞蹈相关公开标签的人',
        },
        { role: 'assistant', text: '我已记录今晚、青岛大学附近、散步。' },
        { role: 'user', text: '不是周末，我刚才说的是今天晚上' },
      ],
      longTermSnapshot: null,
    });

    expect(context.shortTerm.recentTurns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: '不是周末，我刚才说的是今天晚上',
        }),
      ]),
    );
    expect(context.retrievalHints.shouldRecallConversation).toBe(true);
    expect(context.taskMemory.knownTaskSlotConstraints).toEqual(
      expect.objectContaining({
        treatAsHardConstraints: true,
        doNotAskAgainFor: expect.arrayContaining([
          'time_window',
          'location_text',
          'activity',
          'candidate_preference',
        ]),
        candidatePreferencePolicy: expect.stringContaining('公开可发现资料'),
      }),
    );
  });

  it('preserves repeated short follow-up turns when they happened at different times', () => {
    const service = new SocialAgentMemoryContextService();
    const task = makeTask();
    task.memory = {
      ...task.memory,
      shortTerm: {
        recentTurns: [
          {
            role: 'user',
            text: '可以，继续',
            at: '2026-06-18T10:00:00.000Z',
          },
        ],
      },
    };

    const context = service.build({
      task,
      conversationHistory: [
        {
          role: 'user',
          text: '可以，继续',
          at: '2026-06-18T10:05:00.000Z',
        },
      ],
      longTermSnapshot: null,
    });

    expect(
      context.shortTerm.recentTurns.filter(
        (turn) => turn.text === '可以，继续',
      ),
    ).toHaveLength(2);
  });
});
