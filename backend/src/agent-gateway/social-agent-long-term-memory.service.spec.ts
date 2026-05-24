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
