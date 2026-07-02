import { EntityManager, Repository } from 'typeorm';
import {
  CandidateSearchIndex,
  CandidateSearchIndexStatus,
  CandidateSearchIndexSourceType,
} from '../agent-gateway/entities/candidate-search-index.entity';
import { PublicSocialIntent } from '../agent-gateway/entities/public-social-intent.entity';
import { UserBlock } from '../safety/user-block.entity';
import { DemandCandidate } from './demand-candidate.entity';
import { DemandInvitation } from './demand-invitation.entity';
import {
  Demand,
  DemandStatus,
  DemandType,
  DemandVisibility,
} from './demand.entity';
import { CreateDemandDto } from './demands.dto';
import { DemandsService } from './demands.service';
import { PublicTaskIntent } from './public-task-intent.entity';

class MemoryRepository<T extends object> {
  manager?: EntityManager;
  private nextNumericId = 1;

  constructor(
    private readonly entityFactory: () => T,
    private readonly rows: Map<string, T>,
  ) {}

  create(input: Partial<T>): T {
    return Object.assign(this.entityFactory(), input);
  }

  async save(input: T): Promise<T> {
    const row = input as T & {
      id?: string | number;
      createdAt?: Date;
      updatedAt?: Date;
    };
    row.id ??= this.nextNumericId++;
    row.createdAt ??= new Date('2026-07-01T00:00:00.000Z');
    row.updatedAt = new Date('2026-07-01T00:00:01.000Z');
    this.rows.set(String(row.id), row);
    return row;
  }

  async findOne(options: { where: Partial<T> }): Promise<T | null> {
    return (
      Array.from(this.rows.values()).find((row) =>
        Object.entries(options.where).every(
          ([key, value]) => (row as Record<string, unknown>)[key] === value,
        ),
      ) ?? null
    );
  }

  async find(options?: {
    where?: Partial<T> | Partial<T>[];
    order?: Record<string, 'ASC' | 'DESC'>;
    take?: number;
  }): Promise<T[]> {
    let rows = Array.from(this.rows.values());
    if (options?.where) {
      const clauses = Array.isArray(options.where)
        ? options.where
        : [options.where];
      rows = rows.filter((row) =>
        clauses.some((where) => this.matchesWhere(row, where)),
      );
    }
    if (options?.order) {
      const entries = Object.entries(options.order);
      rows = [...rows].sort((left, right) => {
        for (const [key, direction] of entries) {
          const lValue = (left as Record<string, unknown>)[key];
          const rValue = (right as Record<string, unknown>)[key];
          if (lValue === rValue) continue;
          const result = compareValues(lValue, rValue);
          return direction === 'DESC' ? -result : result;
        }
        return 0;
      });
    }
    if (options?.take) rows = rows.slice(0, options.take);
    return rows;
  }

  private matchesWhere(row: T, where: Partial<T>) {
    return Object.entries(where).every(([key, value]) => {
      const actual = (row as Record<string, unknown>)[key];
      const inValues = inOperatorValues(value);
      if (inValues) return inValues.includes(actual);
      return actual === value;
    });
  }
}

function inOperatorValues(value: unknown): unknown[] | null {
  const record = value as Record<string, unknown> | null;
  if (!record || typeof record !== 'object') return null;
  if (record._type !== 'in') return null;
  return Array.isArray(record._value) ? record._value : null;
}

function compareValues(left: unknown, right: unknown) {
  const lNumber = Number(left);
  const rNumber = Number(right);
  if (Number.isFinite(lNumber) && Number.isFinite(rNumber)) {
    return lNumber > rNumber ? 1 : -1;
  }
  return String(left) > String(right) ? 1 : -1;
}

describe('DemandsService', () => {
  let demandRows: Map<string, Demand>;
  let intentRows: Map<string, PublicSocialIntent>;
  let taskRows: Map<string, PublicTaskIntent>;
  let candidateRows: Map<string, DemandCandidate>;
  let invitationRows: Map<string, DemandInvitation>;
  let blockRows: Map<string, UserBlock>;
  let demandRepo: MemoryRepository<Demand>;
  let intentRepo: MemoryRepository<PublicSocialIntent>;
  let taskRepo: MemoryRepository<PublicTaskIntent>;
  let candidateRepo: MemoryRepository<DemandCandidate>;
  let invitationRepo: MemoryRepository<DemandInvitation>;
  let blockRepo: MemoryRepository<UserBlock>;
  let service: DemandsService;
  let candidateSearchIndex: {
    search: jest.Mock;
  };

  beforeEach(() => {
    demandRows = new Map();
    intentRows = new Map();
    taskRows = new Map();
    candidateRows = new Map();
    invitationRows = new Map();
    blockRows = new Map();
    demandRepo = new MemoryRepository(() => new Demand(), demandRows);
    intentRepo = new MemoryRepository(
      () => new PublicSocialIntent(),
      intentRows,
    );
    taskRepo = new MemoryRepository(() => new PublicTaskIntent(), taskRows);
    candidateRepo = new MemoryRepository(
      () => new DemandCandidate(),
      candidateRows,
    );
    invitationRepo = new MemoryRepository(
      () => new DemandInvitation(),
      invitationRows,
    );
    blockRepo = new MemoryRepository(() => new UserBlock(), blockRows);

    const manager = {
      getRepository: (entity: unknown) => {
        if (entity === Demand) return demandRepo;
        if (entity === PublicSocialIntent) return intentRepo;
        if (entity === PublicTaskIntent) return taskRepo;
        if (entity === DemandCandidate) return candidateRepo;
        if (entity === DemandInvitation) return invitationRepo;
        if (entity === UserBlock) return blockRepo;
        throw new Error('Unexpected repository request');
      },
      transaction: async <T>(operation: (m: EntityManager) => Promise<T>) =>
        operation(manager as unknown as EntityManager),
    };
    demandRepo.manager = manager as unknown as EntityManager;

    const idempotency = {
      run: jest.fn(
        async (
          _ownerUserId: number,
          _scope: string,
          _idempotencyKey: string | undefined,
          _payload: unknown,
          operation: (m: EntityManager) => Promise<Record<string, unknown>>,
        ) => operation(manager as unknown as EntityManager),
      ),
    };
    candidateSearchIndex = {
      search: jest.fn(),
    };
    const contactPolicy = {
      assertSociallyEligible: jest.fn(),
      assertNotBlocked: jest.fn(),
      grantOpenAccess: jest.fn(),
    };
    service = new DemandsService(
      idempotency as never,
      candidateSearchIndex as never,
      contactPolicy as never,
      demandRepo as unknown as Repository<Demand>,
      candidateRepo as unknown as Repository<DemandCandidate>,
      invitationRepo as unknown as Repository<DemandInvitation>,
      blockRepo as unknown as Repository<UserBlock>,
    );
  });

  it('creates a public service demand and discoverable task intent projection', async () => {
    const response = await service.createDemand(
      7,
      createDemandDto(DemandVisibility.Public),
      'idem-public',
    );

    expect(response.status).toBe(DemandStatus.Published);
    expect(response.visibility).toBe(DemandVisibility.Public);
    expect(response.taskIntentId).toEqual(expect.stringMatching(/^task_/));
    expect(response.publicIntentId).toBeNull();

    const task = taskRows.get(String(response.taskIntentId));
    expect(task).toMatchObject({
      userId: 7,
      source: 'demand',
      mode: 'public',
      requestType: 'service',
      category: 'locksmith',
      title: '青岛大学泓园 524 开锁服务',
    });
    expect(task?.metadata).toMatchObject({
      source: 'demand',
      demandId: response.id,
      visibility: 'public',
      tombstoned: false,
    });
  });

  it('creates hidden matching projection without making it public', async () => {
    const response = await service.createDemand(
      7,
      createDemandDto(DemandVisibility.Hidden),
      'idem-hidden',
    );

    expect(response.status).toBe(DemandStatus.Hidden);
    expect(response.publicIntentId).toBeNull();
    expect(response.taskIntentId).toBeNull();
    expect(intentRows.size).toBe(0);
    expect(taskRows.size).toBe(0);
  });

  it('hides and cancels demand projections without leaving public feed data active', async () => {
    const created = await service.createDemand(
      7,
      createDemandDto(DemandVisibility.Public),
      'idem-public',
    );

    const hidden = await service.hideDemand(
      7,
      created.id,
      { visibility: DemandVisibility.Hidden },
      'idem-hide',
    );
    expect(hidden.status).toBe(DemandStatus.Hidden);
    expect(taskRows.get(String(created.taskIntentId))?.status).toBe(
      'cancelled',
    );
    expect(taskRows.get(String(created.taskIntentId))?.metadata).toMatchObject({
      tombstoned: true,
      visibility: DemandVisibility.Hidden,
    });

    const canceled = await service.cancelDemand(
      7,
      created.id,
      { reason: 'user canceled' },
      'idem-cancel',
    );
    const task = taskRows.get(String(canceled.taskIntentId));
    expect(canceled.status).toBe(DemandStatus.Canceled);
    expect(task?.status).toBe('cancelled');
    expect(task?.metadata).toMatchObject({
      tombstoned: true,
      demandStatus: DemandStatus.Canceled,
      cancelReason: 'user canceled',
    });
  });

  it('returns owner-only demand candidates and updates candidate status', async () => {
    const created = await service.createDemand(
      7,
      createDemandDto(DemandVisibility.Public),
      'idem-public',
    );
    candidateSearchIndex.search.mockResolvedValue([
      candidateIndexRow({
        id: 41,
        userId: 12,
        displayName: '小林',
        city: '青岛',
        areaText: '青岛大学附近',
        activityTypes: ['service', '开锁'],
        interestTags: ['开锁', '维修', '同城'],
      }),
      candidateIndexRow({
        id: 42,
        userId: 7,
        displayName: '本人',
        city: '青岛',
      }),
      candidateIndexRow({
        id: 43,
        userId: 13,
        displayName: '已拉黑',
        city: '青岛',
        activityTypes: ['service', '开锁'],
        interestTags: ['开锁'],
      }),
    ]);
    await blockRepo.save(
      Object.assign(new UserBlock(), {
        blockerId: 7,
        blockedId: 13,
      }),
    );

    const page = await service.getDemandCandidates(7, created.id, 10);

    expect(candidateSearchIndex.search).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        city: '青岛',
        includeProfiles: true,
        includePublicIntents: false,
      }),
    );
    expect(page.total).toBe(1);
    expect(page.candidates[0]).toMatchObject({
      source: 'demand',
      userId: 12,
      candidateUserId: 12,
      displayName: '小林',
      publicIntentId: null,
      status: 'recommended',
    });
    expect(page.candidates).toHaveLength(1);
    expect(
      page.candidates.find((candidate) => candidate.userId === 13),
    ).toBeUndefined();
    expect(candidateRows.size).toBe(1);
    expect(page.demand.status).toBe(DemandStatus.HasCandidates);
    expect(page.demand.candidateCount).toBe(1);

    const repeated = await service.getDemandCandidates(7, created.id, 10);
    expect(repeated.total).toBe(1);
    expect(candidateSearchIndex.search).toHaveBeenCalledTimes(1);
    expect(candidateRows.size).toBe(1);
  });
});

function createDemandDto(visibility: DemandVisibility): CreateDemandDto {
  return {
    type: DemandType.Service,
    title: '青岛大学泓园 524 开锁服务',
    summary: '需要附近开锁服务方尽快处理。',
    fields: [
      {
        title: '服务类型',
        value: '开锁',
        systemName: 'key.fill',
      },
      {
        title: '位置',
        value: '青岛大学泓园 524',
        systemName: 'mappin.and.ellipse',
      },
      {
        title: '预算',
        value: '约 100 元',
        systemName: 'yensign.circle',
      },
    ],
    visibility,
    matchingPolicy: {
      city: '青岛',
      radiusKm: 10,
      hardFilters: [],
      softPreferences: ['开锁'],
    },
    safetyFlags: ['serviceContextNotSocialOnboarding'],
  };
}

function candidateIndexRow(
  patch: Partial<CandidateSearchIndex>,
): CandidateSearchIndex {
  return Object.assign(new CandidateSearchIndex(), {
    id: 1,
    sourceType: CandidateSearchIndexSourceType.Profile,
    sourceId: String(patch.userId ?? 12),
    sourceVersion: 'test',
    userId: 12,
    publicIntentId: null,
    linkedSocialRequestId: null,
    isRealUser: true,
    profileDiscoverable: true,
    agentCanRecommendMe: true,
    agentCanStartChatAfterApproval: false,
    status: CandidateSearchIndexStatus.Active,
    displayName: '候选人',
    city: '青岛',
    locale: 'zh-CN',
    countryCode: 'CN',
    timeZone: 'Asia/Shanghai',
    utcOffsetMinutes: 480,
    geoHash: '',
    areaText: '市南区',
    lat: null,
    lng: null,
    radiusKm: 10,
    activityTypes: ['service'],
    interestTags: ['开锁'],
    lifestyleTags: [],
    socialScenes: [],
    relationshipGoals: [],
    timeBuckets: ['今天'],
    publicSummary: '同城服务候选',
    publicSafetyNotes: [],
    safetyFlags: {},
    trustScore: 80,
    profileCompleteness: 92,
    exposureCount: 0,
    lastRecommendedAt: null,
    lastActiveAt: new Date('2026-07-01T00:00:00.000Z'),
    sourceUpdatedAt: new Date('2026-07-01T00:00:00.000Z'),
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    ...patch,
  });
}
