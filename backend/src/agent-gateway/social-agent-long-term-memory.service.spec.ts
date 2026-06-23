import { SocialAgentLongTermMemoryService } from './social-agent-long-term-memory.service';
import { SocialAgentLongTermMemory } from './entities/social-agent-long-term-memory.entity';
import { AgentTask, AgentTaskStatus } from './entities/agent-task.entity';
import {
  readSocialAgentTaskMemory,
  writeSocialAgentTaskMemory,
  SocialAgentTaskMemory,
} from './social-agent-memory.util';

type Row = SocialAgentLongTermMemory;

function makeRepo() {
  const store = new Map<number, Row>();
  return {
    store,
    findOne: jest.fn(({ where }: { where: { userId: number } }) =>
      Promise.resolve(store.get(where.userId) ?? null),
    ),
    create: jest.fn((data: Partial<Row>) => ({ ...data }) as Row),
    save: jest.fn((row: Row) => {
      if (!row.id) row.id = store.size + 1;
      row.updatedAt = new Date();
      store.set(row.userId, row);
      return Promise.resolve(row);
    }),
  };
}

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  const task = {
    id: 1,
    ownerUserId: 42,
    goal: '在上海找跑步搭子',
    status: AgentTaskStatus.Succeeded,
    memory: {},
    result: {},
  } as unknown as AgentTask;
  Object.assign(task, overrides);
  return task;
}

function seedTaskMemory(
  task: AgentTask,
  patch: Partial<SocialAgentTaskMemory>,
): void {
  const memory = readSocialAgentTaskMemory(task);
  writeSocialAgentTaskMemory(task, {
    ...memory,
    ...patch,
  } as SocialAgentTaskMemory);
}

describe('SocialAgentLongTermMemoryService', () => {
  it('creates a new row on first summarizeTask call', async () => {
    const repo = makeRepo();
    const service = new SocialAgentLongTermMemoryService(repo as never);

    const task = makeTask();
    seedTaskMemory(task, {
      preferences: {
        interests: ['跑步', '咖啡'],
        socialStyle: 'casual',
        communicationStyle: '',
        preferredTraits: [],
      },
      activeEntities: {
        city: '上海',
        activityType: '跑步',
        targetGender: '',
        timePreference: '',
        locationPreference: '',
      },
    });

    const snapshot = await service.summarizeTask(task);

    expect(snapshot).not.toBeNull();
    expect(snapshot!.preferences.interests).toEqual(['跑步', '咖啡']);
    expect(snapshot!.preferences.socialStyle).toBe('casual');
    expect(snapshot!.activityPreferences.favoriteCities).toContain('上海');
    expect(snapshot!.activityPreferences.favoriteActivityTypes).toContain(
      '跑步',
    );
    expect(snapshot!.taskCount).toBe(1);
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('merges preferences across multiple tasks using union with cap', async () => {
    const repo = makeRepo();
    const service = new SocialAgentLongTermMemoryService(repo as never);

    const taskA = makeTask({ id: 1 });
    seedTaskMemory(taskA, {
      preferences: {
        interests: ['跑步'],
        socialStyle: '',
        communicationStyle: '',
        preferredTraits: [],
      },
    });
    await service.summarizeTask(taskA);

    const taskB = makeTask({ id: 2 });
    seedTaskMemory(taskB, {
      preferences: {
        interests: ['咖啡', '跑步'],
        socialStyle: '',
        communicationStyle: '',
        preferredTraits: [],
      },
    });
    const snapshot = await service.summarizeTask(taskB);

    expect(snapshot!.preferences.interests).toEqual(['跑步', '咖啡']);
    expect(snapshot!.taskCount).toBe(2);
  });

  it('keeps boundaries sticky-true once set', async () => {
    const repo = makeRepo();
    const service = new SocialAgentLongTermMemoryService(repo as never);

    const taskA = makeTask({ id: 1 });
    seedTaskMemory(taskA, {
      boundaries: {
        excludedGenders: [],
        acceptsStrangers: null,
        publicActivityAllowed: null,
        noNightMeet: true,
        publicPlaceOnly: false,
        noAutoMessage: false,
        noContactExchange: false,
      },
    });
    await service.summarizeTask(taskA);

    const taskB = makeTask({ id: 2 });
    const snapshot = await service.summarizeTask(taskB);

    expect(snapshot!.boundaries.noNightMeet).toBe(true);
  });

  it('persists stable profile facts, social goals and availability into long-term memory', async () => {
    const repo = makeRepo();
    const service = new SocialAgentLongTermMemoryService(repo as never);

    const task = makeTask();
    seedTaskMemory(task, {
      stableProfileFacts: {
        city: '青岛',
        nearbyArea: '崂山区青岛大学',
        mbti: 'INFP',
        targetPreference: '同校女生',
        socialGoal: '认识同校女生',
        availableTimes: ['周末下午'],
      },
    });

    const snapshot = await service.summarizeTask(task);

    expect(snapshot!.profileFacts).toMatchObject({
      city: '青岛',
      nearbyArea: '崂山区青岛大学',
      mbti: 'INFP',
    });
    expect(snapshot!.socialGoals).toContain('认识同校女生');
    expect(snapshot!.availability).toContain('周末下午');
    expect(snapshot!.activityPreferences.favoriteCities).toContain('青岛');
    expect(snapshot!.activityPreferences.favoriteLocationPreferences).toContain(
      '崂山区青岛大学',
    );
  });

  it('keeps preference history instead of only overwriting current hints', async () => {
    const repo = makeRepo();
    const service = new SocialAgentLongTermMemoryService(repo as never);

    const taskA = makeTask({ id: 1 });
    seedTaskMemory(taskA, {
      preferences: {
        interests: ['羽毛球'],
        socialStyle: '慢热',
        communicationStyle: '',
        preferredTraits: ['同校'],
      },
      stableProfileFacts: {
        availableTimes: ['工作日晚上'],
        socialGoal: '认识同校朋友',
      },
    });
    await service.summarizeTask(taskA);

    const taskB = makeTask({ id: 2 });
    seedTaskMemory(taskB, {
      preferences: {
        interests: ['徒步'],
        socialStyle: '',
        communicationStyle: '先线上聊熟',
        preferredTraits: ['户外'],
      },
      stableProfileFacts: {
        availableTimes: ['周末下午'],
        targetPreference: '户外搭子',
      },
    });
    const snapshot = await service.summarizeTask(taskB);

    expect(snapshot!.preferences.interests).toEqual(['羽毛球', '徒步']);
    expect(snapshot!.availability).toEqual(['工作日晚上', '周末下午']);
    expect(snapshot!.preferences.preferenceHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'interest',
          value: '羽毛球',
          source: 'task_memory',
          taskId: 1,
          confirmed: true,
        }),
        expect.objectContaining({
          field: 'availability',
          value: '周末下午',
          source: 'stable_profile_fact',
          taskId: 2,
          confirmed: true,
        }),
        expect.objectContaining({
          field: 'preferredTrait',
          value: '户外搭子',
          source: 'stable_profile_fact',
          taskId: 2,
        }),
      ]),
    );
  });

  it('preserves older confirmed preference history when a newer task changes the current preference', async () => {
    const repo = makeRepo();
    const service = new SocialAgentLongTermMemoryService(repo as never);

    const slowWarmTask = makeTask({
      id: 11,
      goal: '先低压力认识羽毛球搭子',
      status: AgentTaskStatus.Succeeded,
    });
    seedTaskMemory(slowWarmTask, {
      preferences: {
        interests: ['羽毛球'],
        socialStyle: '慢热',
        communicationStyle: '先线上聊熟',
        preferredTraits: ['同城周末有空'],
      },
      stableProfileFacts: {
        availableTimes: ['周末下午'],
        targetPreference: '低压力运动搭子',
      },
    });
    await service.summarizeTask(slowWarmTask);

    const outgoingTask = makeTask({
      id: 12,
      goal: '尝试参加户外活动认识新朋友',
      status: AgentTaskStatus.Succeeded,
    });
    seedTaskMemory(outgoingTask, {
      preferences: {
        interests: ['徒步'],
        socialStyle: '更外向',
        communicationStyle: '可以先参加小活动',
        preferredTraits: ['户外活动搭子'],
      },
      stableProfileFacts: {
        availableTimes: ['周六上午'],
        targetPreference: '户外新朋友',
      },
    });

    const snapshot = await service.summarizeTask(outgoingTask);
    const history = snapshot!.preferences.preferenceHistory;

    expect(snapshot!.preferences.socialStyle).toBe('更外向');
    expect(snapshot!.preferences.communicationStyle).toBe('可以先参加小活动');
    expect(snapshot!.preferences.interests).toEqual(['羽毛球', '徒步']);
    expect(snapshot!.availability).toEqual(['周末下午', '周六上午']);
    expect(history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'socialStyle',
          value: '慢热',
          taskId: 11,
          confirmed: true,
        }),
        expect.objectContaining({
          field: 'socialStyle',
          value: '更外向',
          taskId: 12,
          confirmed: true,
        }),
        expect.objectContaining({
          field: 'preferredTrait',
          value: '低压力运动搭子',
          source: 'stable_profile_fact',
          taskId: 11,
        }),
        expect.objectContaining({
          field: 'preferredTrait',
          value: '户外新朋友',
          source: 'stable_profile_fact',
          taskId: 12,
        }),
      ]),
    );
  });

  it('records failed task preferences as unconfirmed history without promoting them to current memory', async () => {
    const repo = makeRepo();
    const service = new SocialAgentLongTermMemoryService(repo as never);

    const confirmedTask = makeTask({
      id: 21,
      status: AgentTaskStatus.Succeeded,
    });
    seedTaskMemory(confirmedTask, {
      preferences: {
        interests: ['羽毛球'],
        socialStyle: '慢热',
        communicationStyle: '先线上聊熟',
        preferredTraits: ['低压力'],
      },
      stableProfileFacts: {
        city: '青岛',
        availableTimes: ['周末下午'],
        targetPreference: '运动搭子',
      },
      activeEntities: {
        city: '青岛',
        activityType: '羽毛球',
        targetGender: '',
        timePreference: '周末下午',
        locationPreference: '市南区',
      },
    });
    await service.summarizeTask(confirmedTask);

    const failedTask = makeTask({
      id: 22,
      goal: '失败的临时测试偏好',
      status: AgentTaskStatus.Failed,
    });
    seedTaskMemory(failedTask, {
      preferences: {
        interests: ['夜跑'],
        socialStyle: '外向',
        communicationStyle: '直接邀约',
        preferredTraits: ['陌生人越多越好'],
      },
      stableProfileFacts: {
        city: '北京',
        availableTimes: ['凌晨'],
        targetPreference: '临时陌生人',
      },
      activeEntities: {
        city: '北京',
        activityType: '夜跑',
        targetGender: '',
        timePreference: '凌晨',
        locationPreference: '未知地点',
      },
    });

    const snapshot = await service.summarizeTask(failedTask);

    expect(snapshot!.preferences.interests).toEqual(['羽毛球']);
    expect(snapshot!.preferences.socialStyle).toBe('慢热');
    expect(snapshot!.preferences.communicationStyle).toBe('先线上聊熟');
    expect(snapshot!.preferences.preferredTraits).toEqual([
      '低压力',
      '运动搭子',
    ]);
    expect(snapshot!.profileFacts).toMatchObject({
      city: '青岛',
      availableTimes: ['周末下午'],
      targetPreference: '运动搭子',
    });
    expect(snapshot!.availability).toEqual(['周末下午']);
    expect(snapshot!.activityPreferences.favoriteCities).toEqual(['青岛']);
    expect(snapshot!.activityPreferences.favoriteActivityTypes).toEqual([
      '羽毛球',
    ]);
    expect(snapshot!.activityPreferences.favoriteTimePreferences).toEqual([
      '周末下午',
    ]);
    expect(snapshot!.activityPreferences.favoriteLocationPreferences).toEqual([
      '市南区',
    ]);
    expect(snapshot!.preferences.preferenceHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'interest',
          value: '夜跑',
          taskId: 22,
          outcome: 'failed',
          confirmed: false,
        }),
        expect.objectContaining({
          field: 'availability',
          value: '凌晨',
          taskId: 22,
          outcome: 'failed',
          confirmed: false,
        }),
      ]),
    );
  });

  it('normalizes inconsistent stored history so failed outcomes cannot remain confirmed', async () => {
    const repo = makeRepo();
    const service = new SocialAgentLongTermMemoryService(repo as never);
    repo.store.set(42, {
      id: 1,
      userId: 42,
      preferences: {
        preferenceHistory: [
          {
            field: 'interest',
            value: '深夜陌生人局',
            source: 'task_memory',
            taskId: 99,
            outcome: 'failed',
            confirmed: true,
            at: '2026-06-01T00:00:00.000Z',
          },
          {
            field: 'interest',
            value: '羽毛球',
            source: 'task_memory',
            taskId: 100,
            outcome: 'succeeded',
            confirmed: true,
            at: '2026-06-02T00:00:00.000Z',
          },
        ],
      },
      boundaries: {},
      activityPreferences: {},
      matchSignals: {},
      taskSummaries: [],
      taskCount: 2,
      user: null,
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      updatedAt: new Date('2026-06-02T00:00:00.000Z'),
    } as unknown as Row);

    const snapshot = await service.readSnapshot(42);

    expect(snapshot.preferences.preferenceHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'interest',
          value: '深夜陌生人局',
          outcome: 'failed',
          confirmed: false,
        }),
        expect.objectContaining({
          field: 'interest',
          value: '羽毛球',
          outcome: 'succeeded',
          confirmed: true,
        }),
      ]),
    );
  });

  it('filters polluted current preferences with confirmed history when reading snapshots', async () => {
    const repo = makeRepo();
    const service = new SocialAgentLongTermMemoryService(repo as never);
    repo.store.set(42, {
      id: 1,
      userId: 42,
      preferences: {
        interests: ['羽毛球', '深夜陌生人局'],
        socialStyle: '高压社交',
        communicationStyle: '直接邀约',
        preferredTraits: ['低压力', '陌生人越多越好'],
        socialGoals: ['认识运动搭子', '临时陌生人'],
        availability: ['周末下午', '凌晨'],
        preferenceHistory: [
          {
            field: 'interest',
            value: '深夜陌生人局',
            source: 'task_memory',
            taskId: 99,
            outcome: 'failed',
            confirmed: true,
            at: '2026-06-01T00:00:00.000Z',
          },
          {
            field: 'interest',
            value: '羽毛球',
            source: 'task_memory',
            taskId: 100,
            outcome: 'succeeded',
            confirmed: true,
            at: '2026-06-02T00:00:00.000Z',
          },
          {
            field: 'availability',
            value: '凌晨',
            source: 'stable_profile_fact',
            taskId: 99,
            outcome: 'failed',
            confirmed: true,
            at: '2026-06-01T00:00:00.000Z',
          },
          {
            field: 'availability',
            value: '周末下午',
            source: 'stable_profile_fact',
            taskId: 100,
            outcome: 'succeeded',
            confirmed: true,
            at: '2026-06-02T00:00:00.000Z',
          },
          {
            field: 'socialStyle',
            value: '高压社交',
            source: 'task_memory',
            taskId: 99,
            outcome: 'failed',
            confirmed: true,
            at: '2026-06-01T00:00:00.000Z',
          },
          {
            field: 'communicationStyle',
            value: '直接邀约',
            source: 'task_memory',
            taskId: 99,
            outcome: 'failed',
            confirmed: true,
            at: '2026-06-01T00:00:00.000Z',
          },
          {
            field: 'preferredTrait',
            value: '低压力',
            source: 'task_memory',
            taskId: 100,
            outcome: 'succeeded',
            confirmed: true,
            at: '2026-06-02T00:00:00.000Z',
          },
          {
            field: 'socialGoal',
            value: '认识运动搭子',
            source: 'stable_profile_fact',
            taskId: 100,
            outcome: 'succeeded',
            confirmed: true,
            at: '2026-06-02T00:00:00.000Z',
          },
        ],
      },
      boundaries: {},
      activityPreferences: {
        favoriteActivityTypes: ['羽毛球', '深夜陌生人局'],
        favoriteTimePreferences: ['周末下午', '凌晨'],
      },
      matchSignals: {},
      taskSummaries: [],
      taskCount: 2,
      user: null,
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      updatedAt: new Date('2026-06-02T00:00:00.000Z'),
    } as unknown as Row);

    const snapshot = await service.readSnapshot(42);

    expect(snapshot.preferences.interests).toEqual(['羽毛球']);
    expect(snapshot.preferences.socialStyle).toBe('');
    expect(snapshot.preferences.communicationStyle).toBe('');
    expect(snapshot.preferences.preferredTraits).toEqual(['低压力']);
    expect(snapshot.socialGoals).toEqual(['认识运动搭子']);
    expect(snapshot.availability).toEqual(['周末下午']);
    expect(snapshot.activityPreferences.favoriteActivityTypes).toEqual([
      '羽毛球',
    ]);
    expect(snapshot.activityPreferences.favoriteTimePreferences).toEqual([
      '周末下午',
    ]);
    expect(
      JSON.stringify({
        preferences: {
          interests: snapshot.preferences.interests,
          socialStyle: snapshot.preferences.socialStyle,
          communicationStyle: snapshot.preferences.communicationStyle,
          preferredTraits: snapshot.preferences.preferredTraits,
        },
        socialGoals: snapshot.socialGoals,
        availability: snapshot.availability,
        activityPreferences: snapshot.activityPreferences,
      }),
    ).not.toMatch(/深夜陌生人局|凌晨|高压社交|直接邀约/);
    expect(snapshot.preferences.preferenceHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: '深夜陌生人局',
          outcome: 'failed',
          confirmed: false,
        }),
        expect.objectContaining({
          value: '凌晨',
          outcome: 'failed',
          confirmed: false,
        }),
      ]),
    );
  });

  it('captures rejected candidates as failedMatches signals', async () => {
    const repo = makeRepo();
    const service = new SocialAgentLongTermMemoryService(repo as never);

    const task = makeTask();
    seedTaskMemory(task, {
      candidateState: {
        recommendedIds: [],
        savedIds: [7],
        messagedIds: [],
        rejectedIds: [9, 10],
      },
    });

    const snapshot = await service.summarizeTask(task);
    expect(
      snapshot!.matchSignals.successfulMatches.map((s) => s.candidateUserId),
    ).toContain(7);
    expect(
      snapshot!.matchSignals.failedMatches.map((s) => s.candidateUserId),
    ).toEqual(expect.arrayContaining([9, 10]));
  });

  it('readSnapshot returns an empty snapshot when no row exists', async () => {
    const repo = makeRepo();
    const service = new SocialAgentLongTermMemoryService(repo as never);

    const snapshot = await service.readSnapshot(999);
    expect(snapshot.userId).toBe(999);
    expect(snapshot.taskCount).toBe(0);
    expect(snapshot.preferences.interests).toEqual([]);
  });
});
