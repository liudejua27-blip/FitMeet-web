import { AgentTask, AgentTaskStatus } from './entities/agent-task.entity';
import { SocialAgentContextHydratorService } from './social-agent-context-hydrator.service';
import { SocialAgentTaskMemoryStateMachineService } from './social-agent-task-memory-state-machine.service';
import { SocialCodexLifeGraphGovernanceService } from './social-codex-life-graph-governance.service';

function makeTask(): AgentTask {
  return {
    id: 44,
    ownerUserId: 7,
    agentConnectionId: null,
    taskType: 'social_goal',
    title: '周末青岛大学散步搭子',
    goal: '周末下午，散步，崂山区青岛大学',
    input: {},
    plan: [],
    toolCalls: [],
    result: {},
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
          value: '周末下午',
          state: 'completed',
          source: 'user_message',
          updatedAt: '2026-06-17T00:00:00.000Z',
          completedAt: '2026-06-17T00:00:00.000Z',
        },
      },
    },
    status: AgentTaskStatus.Pending,
    permissionMode: 'confirm',
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

function makeRichMemoryTask(): AgentTask {
  const task = makeTask();
  task.memory = {
    socialAgentConversation: {
      turns: Array.from({ length: 48 }, (_, index) => ({
        role: index % 2 === 0 ? 'user' : 'assistant',
        text:
          index === 47
            ? '我的电话是15253005312，微信是 wxid_secret，地点 36.123456,120.654321'
            : `第 ${index + 1} 条上下文`,
        at: `2026-06-17T00:${String(index).padStart(2, '0')}:00.000Z`,
      })),
    },
    taskSlots: {
      activity: {
        key: 'activity',
        value: '散步',
        state: 'completed',
        source: 'user_message',
        updatedAt: '2026-06-17T00:00:00.000Z',
        completedAt: '2026-06-17T00:00:00.000Z',
      },
      location_text: {
        key: 'location_text',
        value: '青岛大学宿舍3号楼门口',
        state: 'answered',
        source: 'user_message',
        updatedAt: '2026-06-17T00:00:00.000Z',
      },
    },
    taskMemory: {
      currentGoal: '周末下午散步',
      activeEntities: {
        city: '青岛',
        activityType: '散步',
        targetGender: '',
        timePreference: '周末下午',
        locationPreference: '青岛大学宿舍3号楼门口',
      },
      candidateState: {
        recommendedIds: [1, 2, 3],
        savedIds: [2],
        messagedIds: [],
        rejectedIds: [3],
      },
      pendingActions: [
        {
          id: 8,
          type: 'approval',
          actionType: 'send_invite',
          summary: '给对方发送邀请，联系方式 15253005312',
          riskLevel: 'high',
          at: '2026-06-17T00:00:00.000Z',
          payload: {
            phone: '15253005312',
            exactLocation: '青岛大学宿舍3号楼门口',
            message: '微信 wxid_secret',
          },
        },
      ],
      lastUserMessages: [
        {
          text: '我一般在青岛大学宿舍3号楼附近散步',
          intent: 'social',
          at: '2026-06-17T00:00:00.000Z',
        },
      ],
      stableProfileFacts: {
        contact: '15253005312',
        preferredArea: '青岛大学附近',
      },
    },
  };
  return task;
}

describe('SocialAgentContextHydratorService', () => {
  it('hydrates task slots and governed Life Graph fact proposals', async () => {
    const task = makeTask();
    const service = new SocialAgentContextHydratorService(
      {
        assertTaskOwner: jest.fn().mockResolvedValue(task),
      } as never,
      new SocialAgentTaskMemoryStateMachineService(),
      undefined,
      new SocialCodexLifeGraphGovernanceService(),
    );

    const context = await service.hydrateContext({
      userId: 7,
      taskId: 44,
      threadId: 44,
    });

    expect(context.taskSlots.activity?.value).toBe('散步');
    expect(context.lifeGraphFactProposals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'preferred_activity',
          value: '散步',
          evidence: expect.arrayContaining([
            expect.objectContaining({ slotKey: 'activity' }),
          ]),
        }),
        expect.objectContaining({
          key: 'preferred_time_window',
          value: '周末下午',
          writePolicy: 'user_confirmation_required',
        }),
      ]),
    );
    expect(context.lifeGraphGovernanceSummary).toMatchObject({
      total: 2,
      autoSaveCount: 1,
      confirmationRequiredCount: 1,
      blockedCount: 0,
      sensitiveCount: 0,
    });
    expect(context.lifeGraphFactDisplaySummaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'preferred_activity',
          displayValue: '散步',
          evidenceCount: 1,
        }),
      ]),
    );
  });

  it('hydrates task memory from checkpoint-style thread ids', async () => {
    const task = makeTask();
    const assertTaskOwner = jest.fn().mockResolvedValue(task);
    const service = new SocialAgentContextHydratorService(
      {
        assertTaskOwner,
      } as never,
      new SocialAgentTaskMemoryStateMachineService(),
      undefined,
      new SocialCodexLifeGraphGovernanceService(),
    );

    const context = await service.hydrateContext({
      userId: 7,
      threadId: 'agent-task:44',
    });

    expect(assertTaskOwner).toHaveBeenCalledWith(44, 7);
    expect(context.taskId).toBe(44);
    expect(context.taskSlots.activity?.value).toBe('散步');
  });

  it('hydrates 20 rounds of context while redacting contact and precise location data', async () => {
    const task = makeRichMemoryTask();
    const service = new SocialAgentContextHydratorService(
      {
        assertTaskOwner: jest.fn().mockResolvedValue(task),
      } as never,
      new SocialAgentTaskMemoryStateMachineService(),
      {
        readSnapshot: jest.fn().mockResolvedValue({
          userId: 7,
          profileFacts: {
            contact: '15253005312',
            preferredArea: '青岛大学附近',
          },
          preferences: {
            interests: ['散步'],
            socialStyle: '',
            communicationStyle: '',
            preferredTraits: [],
            preferenceHistory: [],
          },
          boundaries: {
            excludedGenders: [],
            noNightMeet: false,
            publicPlaceOnly: true,
            noAutoMessage: true,
            noContactExchange: true,
          },
          socialGoals: [],
          availability: [],
          activityPreferences: {
            favoriteCities: ['青岛'],
            favoriteActivityTypes: ['散步'],
            favoriteTimePreferences: ['周末下午'],
            favoriteLocationPreferences: ['青岛大学宿舍3号楼门口'],
          },
          matchSignals: {
            successfulMatches: [],
            failedMatches: [],
          },
          taskCount: 1,
          updatedAt: '2026-06-17T00:00:00.000Z',
        }),
      } as never,
      new SocialCodexLifeGraphGovernanceService(),
    );

    const context = await service.hydrateContext({
      userId: 7,
      taskId: 44,
      threadId: 'agent-task:44',
    });

    expect(context.recentMessages).toHaveLength(40);
    expect(context.recentMessages[0]).toMatchObject({
      text: '第 9 条上下文',
    });

    const serialized = JSON.stringify(context);
    expect(serialized).not.toContain('15253005312');
    expect(serialized).not.toContain('wxid_secret');
    expect(serialized).not.toContain('36.123456');
    expect(serialized).not.toContain('青岛大学宿舍3号楼');
    expect(serialized).toContain('青岛大学附近');
    expect(serialized).toContain('[REDACTED');
  });
});
