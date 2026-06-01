import { UserSocialProfile } from '../users/user-social-profile.entity';
import { LifeGraphAuditLog } from './entities/life-graph-audit-log.entity';
import { LifeGraphField } from './entities/life-graph-field.entity';
import { LifeGraphProfile } from './entities/life-graph-profile.entity';
import { LifeGraphProposal } from './entities/life-graph-proposal.entity';
import { LifeGraphExtractionService } from './life-graph-extraction.service';
import {
  LifeGraphAuditAction,
  LifeGraphFieldCategory,
  LifeGraphFieldSource,
} from './life-graph.enums';
import { LifeGraphService } from './life-graph.service';

const now = new Date('2026-05-26T01:00:00.000Z');

function repo<T extends Record<string, unknown>>(initialRows: T[] = []) {
  const rows = [...initialRows];
  let nextId = 1;
  return {
    rows,
    create: jest.fn((value: Partial<T>) => ({
      id: nextId++,
      createdAt: now,
      updatedAt: now,
      ...value,
    })),
    save: jest.fn(async (value: T) => {
      const existingIndex = rows.findIndex((row) => row.id === value.id);
      const saved = {
        ...value,
        id: value.id ?? nextId++,
        createdAt: value.createdAt ?? now,
        updatedAt: now,
      } as T;
      if (existingIndex >= 0) rows[existingIndex] = saved;
      else rows.push(saved);
      return saved;
    }),
    findOne: jest.fn(
      async ({ where }: { where?: Record<string, unknown> } = {}) =>
        rows.find((row) =>
          Object.entries(where ?? {}).every(
            ([key, value]) => (row as Record<string, unknown>)[key] === value,
          ),
        ) ?? null,
    ),
    find: jest.fn(
      async ({
        where,
        take,
      }: {
        where?: Record<string, unknown>;
        order?: Record<string, string>;
        take?: number;
      } = {}) =>
        rows.filter((row) =>
          Object.entries(where ?? {}).every(
            ([key, value]) => (row as Record<string, unknown>)[key] === value,
          ),
        ).slice(0, take),
    ),
    update: jest.fn(
      async (
        where: Record<string, unknown>,
        patch: Partial<T>,
      ): Promise<{ affected: number }> => {
        let affected = 0;
        for (const row of rows) {
          const matches = Object.entries(where).every(
            ([key, value]) => (row as Record<string, unknown>)[key] === value,
          );
          if (!matches) continue;
          Object.assign(row, patch, { updatedAt: now });
          affected += 1;
        }
        return { affected };
      },
    ),
  };
}

function socialProfile(overrides: Partial<UserSocialProfile> = {}) {
  return {
    userId: 1,
    gender: '男',
    nickname: '青大跑步者',
    ageRange: '18-24',
    city: '青岛',
    zodiac: '',
    mbti: '',
    traits: [],
    socialStyle: '慢热',
    communicationStyle: '温和直接',
    nearbyArea: '青岛大学',
    fitnessGoals: ['减脂'],
    interestTags: ['跑步', '健身'],
    lifestyleTags: ['早睡'],
    socialScenes: [],
    wantToMeet: ['跑步搭子'],
    preferredTraits: ['守时'],
    avoidTraits: ['临时爽约'],
    relationshipGoals: ['找搭子'],
    openness: '',
    availableTimes: ['周末下午'],
    weekdayAvailability: '',
    weekendAvailability: '周末下午',
    socialPreference: '',
    rejectRules: '不接受夜间私人场所约见',
    privacyBoundary: '不公开手机号',
    profileDiscoverable: true,
    agentCanRecommendMe: true,
    agentCanStartChatAfterApproval: true,
    hideSensitiveTags: true,
    aiSummary: '喜欢公开、安全的运动约练。',
    aiProfileCard: {},
    matchSignals: {},
    sensitiveTagDecisions: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as UserSocialProfile;
}

function makeService(initialSocialProfile: UserSocialProfile | null = socialProfile()) {
  const profiles = repo<LifeGraphProfile & Record<string, unknown>>();
  const fields = repo<LifeGraphField & Record<string, unknown>>();
  const auditLogs = repo<LifeGraphAuditLog & Record<string, unknown>>();
  const proposals = repo<LifeGraphProposal & Record<string, unknown>>();
  const socialProfiles = repo<UserSocialProfile & Record<string, unknown>>(
    initialSocialProfile ? [initialSocialProfile as never] : [],
  );
  const service = new LifeGraphService(
    profiles as never,
    fields as never,
    auditLogs as never,
    proposals as never,
    socialProfiles as never,
    new LifeGraphExtractionService(),
  );
  return { service, profiles, fields, auditLogs, proposals };
}

describe('LifeGraphService', () => {
  it('creates a life graph and imports existing user_social_profiles fields', async () => {
    const { service, fields, auditLogs } = makeService();

    const result = await service.getLifeGraph(1);

    expect(result.profile.city).toBe('青岛');
    expect(result.profile.aiSummary).toBe('喜欢公开、安全的运动约练。');
    expect(result.fields.identity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldKey: 'nickname',
          source: LifeGraphFieldSource.ImportedFromSocialProfile,
          confirmedByUser: true,
          revoked: false,
        }),
      ]),
    );
    expect(fields.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: LifeGraphFieldCategory.FitnessActivity,
          fieldKey: 'sportsPreferences',
          fieldValue: ['跑步', '健身'],
        }),
      ]),
    );
    expect(auditLogs.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: LifeGraphAuditAction.Created,
          source: LifeGraphFieldSource.ImportedFromSocialProfile,
        }),
      ]),
    );
  });

  it('updates manual fields and writes audit logs', async () => {
    const { service, fields, auditLogs } = makeService(null);

    await service.updateLifeGraph(1, {
      city: '青岛',
      currentSocialGoal: '找周末跑步搭子',
      fields: [
        {
          category: LifeGraphFieldCategory.Lifestyle,
          fieldKey: 'availableTimes',
          fieldValue: ['周末下午'],
          reason: '用户编辑可约时间',
        },
      ],
    });

    expect(fields.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: LifeGraphFieldCategory.Lifestyle,
          fieldKey: 'availableTimes',
          source: LifeGraphFieldSource.Manual,
          confidence: 1,
          confirmedByUser: true,
        }),
      ]),
    );
    expect(auditLogs.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldKey: 'availableTimes',
          action: LifeGraphAuditAction.Created,
          reason: '用户编辑可约时间',
        }),
      ]),
    );
  });

  it('returns completeness, missing fields, and structured match signals', async () => {
    const { service } = makeService();

    const completeness = await service.getCompleteness(1);
    const signals = await service.getMatchSignals(1);

    expect(completeness.completenessScore).toBeGreaterThan(0);
    expect(completeness.missingFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: LifeGraphFieldCategory.TrustSafety,
          fieldKey: 'realNameVerified',
        }),
      ]),
    );
    expect(signals.socialIntent.relationshipGoal).toMatchObject({
      value: ['找搭子'],
      source: LifeGraphFieldSource.ImportedFromSocialProfile,
      confirmedByUser: true,
    });
    expect(signals.trustSafety.requiresStrictConfirmation).toMatchObject({
      value: true,
    });
  });

  it('extracts Life Graph proposals from natural language without writing official fields', async () => {
    const { service, fields, proposals, auditLogs } = makeService(null);

    const proposal = await service.extractFromChat(1, {
      message:
        '我在青岛大学附近，周末下午比较有空，想找一个跑步搭子，最好先聊聊再约，不太想晚上见面。',
      taskId: 88,
    });

    expect(proposal.proposedFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: LifeGraphFieldCategory.Identity,
          fieldKey: 'city',
          fieldValue: '青岛',
          source: LifeGraphFieldSource.AiInferred,
          requiresUserConfirmation: true,
        }),
        expect.objectContaining({
          category: LifeGraphFieldCategory.Identity,
          fieldKey: 'nearbyArea',
          fieldValue: '青岛大学附近',
        }),
        expect.objectContaining({
          category: LifeGraphFieldCategory.Lifestyle,
          fieldKey: 'availableTimes',
          fieldValue: ['周末下午'],
        }),
        expect.objectContaining({
          category: LifeGraphFieldCategory.FitnessActivity,
          fieldKey: 'sportsPreferences',
          fieldValue: ['跑步'],
        }),
        expect.objectContaining({
          category: LifeGraphFieldCategory.SocialIntent,
          fieldKey: 'currentSocialGoal',
        }),
      ]),
    );
    expect(proposals.rows[0]).toMatchObject({ status: 'proposed' });
    expect(fields.rows).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: LifeGraphFieldSource.AiInferred,
          fieldKey: 'sportsPreferences',
        }),
      ]),
    );
    expect(auditLogs.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: LifeGraphAuditAction.AiProposed,
          fieldKey: 'sportsPreferences',
          confidence: expect.any(Number),
        }),
      ]),
    );
  });

  it('confirms, rejects, and revokes proposed fields with audit logs', async () => {
    const { service, fields, auditLogs } = makeService(null);
    const proposal = await service.extractFromChat(1, {
      message: '我周末下午一般有空，想找附近跑步搭子。',
    });

    await service.confirmUpdate(1, {
      proposalId: proposal.proposalId,
      fieldIds: [proposal.proposedFields.find((field) => field.fieldKey === 'sportsPreferences')!.proposalFieldId],
    });
    await service.rejectUpdate(1, {
      proposalId: proposal.proposalId,
      fieldIds: [proposal.proposedFields.find((field) => field.fieldKey === 'availableTimes')!.proposalFieldId],
      reason: '暂时不保存时间',
    });

    expect(fields.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldKey: 'sportsPreferences',
          source: LifeGraphFieldSource.AiInferred,
          confirmedByUser: true,
          revoked: false,
        }),
      ]),
    );
    expect(fields.rows).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldKey: 'availableTimes',
          source: LifeGraphFieldSource.AiInferred,
        }),
      ]),
    );

    await service.revokeField(1, {
      category: LifeGraphFieldCategory.FitnessActivity,
      fieldKey: 'sportsPreferences',
      reason: '不再使用跑步偏好',
    });
    const signals = await service.getMatchSignals(1);
    expect(signals.fitnessActivity.sportsPreferences).toBeUndefined();
    expect(auditLogs.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: LifeGraphAuditAction.Confirmed }),
        expect.objectContaining({ action: LifeGraphAuditAction.Rejected }),
        expect.objectContaining({ action: LifeGraphAuditAction.Revoked }),
      ]),
    );
  });

  it('does not let AI proposals silently overwrite manual or revoked fields', async () => {
    const { service, fields, auditLogs } = makeService(null);
    await service.updateLifeGraph(1, {
      fields: [
        {
          category: LifeGraphFieldCategory.Lifestyle,
          fieldKey: 'availableTimes',
          fieldValue: ['工作日晚上'],
        },
      ],
    });

    const proposal = await service.extractFromChat(1, {
      message: '我周末下午一般有空，想找跑步搭子。',
    });

    expect(proposal.proposedFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldKey: 'availableTimes',
          status: 'conflict',
          oldValue: ['工作日晚上'],
        }),
      ]),
    );
    expect(fields.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldKey: 'availableTimes',
          fieldValue: ['工作日晚上'],
          source: LifeGraphFieldSource.Manual,
        }),
      ]),
    );
    expect(auditLogs.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldKey: 'availableTimes',
          action: LifeGraphAuditAction.ConflictDetected,
        }),
      ]),
    );

    await service.revokeField(1, {
      category: LifeGraphFieldCategory.Lifestyle,
      fieldKey: 'availableTimes',
    });
    const revokedProposal = await service.extractFromChat(1, {
      message: '我周末下午一般有空。',
    });
    expect(revokedProposal.proposedFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldKey: 'availableTimes',
          status: 'revoked_conflict',
        }),
      ]),
    );
    const signals = await service.getMatchSignals(1);
    expect(signals.lifestyle.availableTimes).toBeUndefined();
  });

  it('does not create Trust Safety fields from ordinary chat extraction', async () => {
    const { service } = makeService(null);

    const proposal = await service.extractFromChat(1, {
      message: '我希望严格确认，周末下午找跑步搭子。',
    });

    expect(proposal.proposedFields).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: LifeGraphFieldCategory.TrustSafety,
        }),
      ]),
    );
  });

  it('returns unified match signals without revoked fields and with confidence weighting', async () => {
    const { service, fields } = makeService(null);
    await service.updateLifeGraph(1, {
      fields: [
        {
          category: LifeGraphFieldCategory.Identity,
          fieldKey: 'city',
          fieldValue: '青岛',
        },
        {
          category: LifeGraphFieldCategory.Lifestyle,
          fieldKey: 'availableTimes',
          fieldValue: ['周末下午'],
        },
      ],
    });
    fields.rows.push({
      id: 999,
      userId: 1,
      category: LifeGraphFieldCategory.FitnessActivity,
      fieldKey: 'sportsPreferences',
      fieldValue: ['跑步'],
      source: LifeGraphFieldSource.AiInferred,
      confidence: 0.9,
      confirmedByUser: false,
      editable: true,
      revoked: false,
      revokedAt: null,
      lastInferredAt: now,
      createdAt: now,
      updatedAt: now,
    } as never);

    const beforeRevoke = await service.getUnifiedMatchSignals(1);
    await service.revokeField(1, {
      category: LifeGraphFieldCategory.Lifestyle,
      fieldKey: 'availableTimes',
    });
    const afterRevoke = await service.getUnifiedMatchSignals(1);

    expect(beforeRevoke.identitySignals.city).toBe('青岛');
    expect(beforeRevoke.fitnessSignals.sportsPreferences).toEqual(['跑步']);
    expect(
      beforeRevoke.confidence.byField['identity.city'],
    ).toBeGreaterThan(
      beforeRevoke.confidence.byField['fitness_activity.sportsPreferences'],
    );
    expect(afterRevoke.lifestyleSignals.availableTimes).toBeUndefined();
  });

  it('builds dynamic life understanding from rhythm, boundaries and completion signals', async () => {
    const { service } = makeService(null);
    await service.updateLifeGraph(1, {
      city: '青岛',
      currentSocialGoal: '找低压力跑步搭子',
      fields: [
        {
          category: LifeGraphFieldCategory.Identity,
          fieldKey: 'nearbyArea',
          fieldValue: '青岛大学',
        },
        {
          category: LifeGraphFieldCategory.Lifestyle,
          fieldKey: 'availableTimes',
          fieldValue: ['周末下午'],
        },
        {
          category: LifeGraphFieldCategory.Lifestyle,
          fieldKey: 'acceptsNightMeet',
          fieldValue: false,
        },
        {
          category: LifeGraphFieldCategory.FitnessActivity,
          fieldKey: 'sportsPreferences',
          fieldValue: ['跑步', '散步'],
        },
        {
          category: LifeGraphFieldCategory.FitnessActivity,
          fieldKey: 'publicPlaceOnly',
          fieldValue: true,
        },
        {
          category: LifeGraphFieldCategory.SocialIntent,
          fieldKey: 'preferredSocialStyle',
          fieldValue: '低压力、先聊聊',
        },
        {
          category: LifeGraphFieldCategory.InteractionMemory,
          fieldKey: 'completedActivities',
          fieldValue: 4,
        },
      ],
    });

    const graph = await service.getLifeGraph(1);
    const signals = await service.getUnifiedMatchSignals(1);

    expect(graph.dynamicInsights).toMatchObject({
      socialEnergy: 'sports',
      pressurePreference: 'low',
      nightBoundary: 'avoids_late_private',
      locationPreference: 'same_school_or_area',
      completionTrend: 'reliable',
    });
    expect(graph.dynamicInsights?.summary).toContain('我对你的了解');
    expect(signals.behaviorSignals.scores.lowPressureFit).toBeGreaterThan(80);
    expect(signals.behaviorSignals.insights.join('')).toContain('公共场所');
  });

  it('stores entertainment signal metadata and excludes disabled signals from matching', async () => {
    const { service, fields } = makeService(null);

    await service.updateLifeGraph(1, {
      fields: [
        {
          category: LifeGraphFieldCategory.Identity,
          fieldKey: 'zodiacSign',
          fieldValue: 'Aries',
        },
        {
          category: LifeGraphFieldCategory.Identity,
          fieldKey: 'mbti',
          fieldValue: 'INFP',
          enabledForMatching: false,
        },
        {
          category: LifeGraphFieldCategory.PrivacyBoundary,
          fieldKey: 'preciseLocationSharing',
          fieldValue: false,
        },
      ],
    });

    expect(fields.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldKey: 'zodiacSign',
          signalType: 'entertainment_signal',
          visibleInRecommendationReason: false,
          userCanDisableForMatching: true,
          enabledForMatching: true,
        }),
        expect.objectContaining({
          fieldKey: 'mbti',
          signalType: 'weak_signal',
          visibleInRecommendationReason: false,
          userCanDisableForMatching: true,
          enabledForMatching: false,
        }),
        expect.objectContaining({
          fieldKey: 'preciseLocationSharing',
          signalType: 'sensitive_signal',
          visibleInRecommendationReason: false,
          enabledForMatching: false,
        }),
      ]),
    );

    const signals = await service.getMatchSignals(1);
    expect(signals.identity.zodiacSign).toEqual(
      expect.objectContaining({
        signalType: 'entertainment_signal',
        visibleInRecommendationReason: false,
      }),
    );
    expect(signals.identity.mbti).toBeUndefined();
    expect(signals.privacyBoundary.preciseLocationSharing).toBeUndefined();
  });

  it('does not duplicate imported fields when an old user opens Life Graph repeatedly', async () => {
    const { service, fields, auditLogs } = makeService();

    await service.getLifeGraph(1);
    const fieldCountAfterFirstLoad = fields.rows.length;
    const auditCountAfterFirstLoad = auditLogs.rows.length;
    await service.getLifeGraph(1);

    expect(fields.rows).toHaveLength(fieldCountAfterFirstLoad);
    expect(auditLogs.rows).toHaveLength(auditCountAfterFirstLoad);
  });

  it('updates completenessScore as fields change', async () => {
    const { service } = makeService(null);

    const before = await service.getCompleteness(1);
    await service.updateLifeGraph(1, {
      city: '青岛',
      currentSocialGoal: '找跑步搭子',
      fields: [
        {
          category: LifeGraphFieldCategory.Lifestyle,
          fieldKey: 'availableTimes',
          fieldValue: ['周末下午'],
        },
        {
          category: LifeGraphFieldCategory.FitnessActivity,
          fieldKey: 'sportsPreferences',
          fieldValue: ['跑步'],
        },
        {
          category: LifeGraphFieldCategory.FitnessActivity,
          fieldKey: 'publicPlaceOnly',
          fieldValue: true,
        },
      ],
    });
    const after = await service.getCompleteness(1);

    expect(after.completenessScore).toBeGreaterThan(before.completenessScore);
  });

  it('paginates audit logs and never returns unbounded history', async () => {
    const { service, auditLogs } = makeService(null);
    for (let index = 0; index < 120; index += 1) {
      auditLogs.rows.push({
        id: index + 1,
        userId: 1,
        category: LifeGraphFieldCategory.Identity,
        fieldKey: `field_${index}`,
        oldValue: null,
        newValue: 'redacted',
        source: LifeGraphFieldSource.Manual,
        confidence: 1,
        action: LifeGraphAuditAction.Updated,
        reason: 'test',
        taskId: null,
        messageId: null,
        createdAt: now,
      } as never);
    }

    const defaultLogs = await service.getAuditLogs(1);
    const limitedLogs = await service.getAuditLogs(1, { limit: 10 });
    const cappedLogs = await service.getAuditLogs(1, { limit: 500 });

    expect(defaultLogs).toHaveLength(50);
    expect(limitedLogs).toHaveLength(10);
    expect(cappedLogs).toHaveLength(100);
  });

  it('logs audit write failures without leaking field values', async () => {
    const { service, auditLogs } = makeService(null);
    const logger = jest
      .spyOn((service as never as { logger: { error: (message: string) => void } }).logger, 'error')
      .mockImplementation(() => undefined);
    auditLogs.save.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(
      service.updateLifeGraph(1, {
        fields: [
          {
            category: LifeGraphFieldCategory.Identity,
            fieldKey: 'nearbyArea',
            fieldValue: '青岛大学宿舍楼',
          },
        ],
      }),
    ).rejects.toThrow('database unavailable');

    const logged = logger.mock.calls.map((call) => String(call[0])).join('\n');
    expect(logged).toContain('life_graph.audit_write_failed');
    expect(logged).toContain('nearbyArea');
    expect(logged).not.toContain('青岛大学宿舍楼');
    logger.mockRestore();
  });
});
