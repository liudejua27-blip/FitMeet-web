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
      turns: Array.from({ length: 88 }, (_, index) => ({
        role: index % 2 === 0 ? 'user' : 'assistant',
        text:
          index === 47
            ? '我的电话是15253005312，微信是 wxid_secret，地点 36.123456,120.654321'
            : `第 ${index + 1} 条上下文`,
        at: `2026-06-17T00:${String(index % 60).padStart(2, '0')}:00.000Z`,
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
      mode: 'life_graph',
    });

    expect(context.taskSlots.activity?.value).toBe('散步');
    expect(context.taskSlotSummary).toMatchObject({
      活动: '散步',
      时间: '周末下午',
    });
    expect(context.knownTaskSlotConstraints).toEqual(
      expect.objectContaining({
        treatAsHardConstraints: true,
        doNotAskAgainFor: expect.arrayContaining(['activity', 'time_window']),
        userVisibleSummary: expect.stringContaining('活动：散步'),
        instruction: expect.stringContaining('不得重复询问'),
      }),
    );
    expect(context.taskMemory?.taskSlots).toMatchObject(context.taskSlots);
    expect(context.taskMemory?.taskSlotSummary).toMatchObject(
      context.taskSlotSummary,
    );
    expect(context.taskMemory?.knownTaskSlotConstraints).toEqual(
      context.knownTaskSlotConstraints,
    );
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
    expect(context.threadId).toBe('agent-task:44');
    expect(context.taskSlots.activity?.value).toBe('散步');
  });

  it('normalizes numeric task thread ids into the canonical Social Codex shape', async () => {
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
      threadId: 44,
    });

    expect(assertTaskOwner).toHaveBeenCalledWith(44, 7);
    expect(context.taskId).toBe(44);
    expect(context.threadId).toBe('agent-task:44');
  });

  it('falls back to the active conversation thread when no explicit task id is provided', async () => {
    const task = makeRichMemoryTask();
    task.id = 88;
    task.taskType = 'social_agent_chat';
    const findActiveConversationTask = jest.fn().mockResolvedValue(task);
    const assertTaskOwner = jest.fn();
    const service = new SocialAgentContextHydratorService(
      {
        assertTaskOwner,
        findActiveConversationTask,
      } as never,
      new SocialAgentTaskMemoryStateMachineService(),
      undefined,
      new SocialCodexLifeGraphGovernanceService(),
    );

    const context = await service.hydrateContext({
      userId: 7,
    });

    expect(context.taskId).toBe(88);
    expect(context.threadId).toBe('agent-task:88');

    expect(findActiveConversationTask).toHaveBeenCalledWith(7);
    expect(assertTaskOwner).not.toHaveBeenCalled();
    expect(context.recentMessages).toHaveLength(4);
    expect(context.taskSlots.activity?.value).toBe('散步');
    expect(context.knownTaskSlotConstraints).toEqual(
      expect.objectContaining({
        doNotAskAgainFor: expect.arrayContaining(['activity', 'location_text']),
      }),
    );
    expect(context.taskMemory?.taskSlots).toMatchObject(context.taskSlots);
    expect(context.taskMemory?.taskSlotSummary).toMatchObject(
      context.taskSlotSummary,
    );
    expect(context.taskMemory?.knownTaskSlotConstraints).toEqual(
      context.knownTaskSlotConstraints,
    );
    expect(context.candidateActions).toMatchObject({
      actionCount: 4,
    });
  });

  it('hydrates detailed candidate actions and pending approvals without degrading to ids only', async () => {
    const task = makeRichMemoryTask();
    task.memory = {
      ...(task.memory as Record<string, unknown>),
      shortTerm: {
        candidateActions: {
          '42': {
            status: 'saved',
            targetUserId: 42,
            reason: '用户想先保留这位候选人',
          },
          '43': {
            status: 'skipped',
            targetUserId: 43,
            reason: '用户不想重复看到这个候选人',
          },
        },
      },
      taskMemory: {
        ...((task.memory as Record<string, unknown>).taskMemory as Record<
          string,
          unknown
        >),
        pendingApprovals: [
          {
            id: 88,
            type: 'approval_required',
            actionType: 'send_invite',
            summary: '给候选人发送今晚青岛大学散步邀请',
            riskLevel: 'medium',
            at: '2026-06-17T00:00:00.000Z',
          },
        ],
      },
    };
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
      threadId: 'agent-task:44',
      mode: 'match',
    });

    expect(context.candidateActions).toMatchObject({
      '42': {
        status: 'saved',
        targetUserId: 42,
        reason: '用户想先保留这位候选人',
      },
      '43': {
        status: 'skipped',
        targetUserId: 43,
      },
    });
    expect(context.taskMemory).toMatchObject({
      candidateActions: expect.objectContaining({
        '42': expect.objectContaining({ status: 'saved' }),
      }),
      pendingApprovals: [
        expect.objectContaining({
          id: 88,
          actionType: 'send_invite',
        }),
      ],
    });
    expect(context.pendingApprovals).toEqual([
      expect.objectContaining({
        id: 88,
        actionType: 'send_invite',
      }),
    ]);
  });

  it('does not let empty pending or candidate containers erase stored task state', async () => {
    const task = makeRichMemoryTask();
    task.memory = {
      ...(task.memory as Record<string, unknown>),
      shortTerm: {
        candidateActions: {},
        pendingApprovals: [],
      },
      candidateActions: {},
      pendingApprovals: [],
      taskMemory: {
        ...((task.memory as Record<string, unknown>).taskMemory as Record<
          string,
          unknown
        >),
        candidateActions: {},
        pendingApprovals: [],
      },
    };
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
      threadId: 'agent-task:44',
      mode: 'match',
    });

    expect(context.candidateActions).toMatchObject({
      recommendedIds: [1, 2, 3],
      savedIds: [2],
      rejectedIds: [3],
    });
    expect(context.pendingApprovals).toEqual([
      expect.objectContaining({
        id: 8,
        actionType: 'send_invite',
        riskLevel: 'high',
      }),
    ]);
    expect(context.taskMemory).toMatchObject({
      candidateActions: expect.objectContaining({
        recommendedIds: [1, 2, 3],
        savedIds: [2],
      }),
      pendingApprovals: [
        expect.objectContaining({
          id: 8,
          actionType: 'send_invite',
        }),
      ],
    });
  });

  it('hydrates compact router context while redacting contact and precise location data', async () => {
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

    expect(context.recentMessages).toHaveLength(4);
    expect(context.recentMessages[0]).toMatchObject({
      text: '第 85 条上下文',
    });

    const serialized = JSON.stringify(context);
    expect(serialized).not.toContain('15253005312');
    expect(serialized).not.toContain('wxid_secret');
    expect(serialized).not.toContain('36.123456');
    expect(serialized).not.toContain('青岛大学宿舍3号楼');
    expect(serialized).not.toContain('青岛大学附近');
    expect(serialized).toContain('[REDACTED');
    expect(context.lifeGraphSummary).toBeNull();
  });

  it('uses mode-specific context windows for matching and configured LLM overrides', async () => {
    const task = makeRichMemoryTask();
    const service = new SocialAgentContextHydratorService(
      {
        assertTaskOwner: jest.fn().mockResolvedValue(task),
      } as never,
      new SocialAgentTaskMemoryStateMachineService(),
      undefined,
      new SocialCodexLifeGraphGovernanceService(),
      {
        get: jest.fn((key: string) =>
          key === 'SOCIAL_AGENT_LLM_CONTEXT_TURN_LIMIT' ? '16' : undefined,
        ),
      } as never,
    );

    const context = await service.hydrateContext({
      userId: 7,
      taskId: 44,
      threadId: 'agent-task:44',
      mode: 'match',
    });

    expect(context.recentMessages).toHaveLength(16);
    expect(context.recentMessages[0]).toMatchObject({
      text: '第 73 条上下文',
    });
    expect(context.lifeGraphSummary).toBeNull();
    expect(context.candidateActions).toMatchObject({
      recommendedIds: [1, 2, 3],
    });
  });
});
