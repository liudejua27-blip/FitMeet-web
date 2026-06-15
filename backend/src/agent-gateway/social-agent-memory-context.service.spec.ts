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
});
