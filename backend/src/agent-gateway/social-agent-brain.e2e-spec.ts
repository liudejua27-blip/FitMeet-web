import { UserSocialProfile } from '../users/user-social-profile.entity';
import { CandidateExplanationService } from './candidate-explanation.service';
import { SceneRiskPolicyService } from './scene-risk-policy.service';
import { LifeGraphAuditLog } from '../life-graph/entities/life-graph-audit-log.entity';
import { LifeGraphField } from '../life-graph/entities/life-graph-field.entity';
import { LifeGraphProfile } from '../life-graph/entities/life-graph-profile.entity';
import { LifeGraphProposal } from '../life-graph/entities/life-graph-proposal.entity';
import { LifeGraphExtractionService } from '../life-graph/life-graph-extraction.service';
import { LifeGraphService } from '../life-graph/life-graph.service';
import {
  LifeGraphFieldCategory,
  LifeGraphFieldSource,
} from '../life-graph/life-graph.enums';

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
    find: jest.fn(async ({ where }: { where?: Record<string, unknown> } = {}) =>
      rows.filter((row) =>
        Object.entries(where ?? {}).every(
          ([key, value]) => (row as Record<string, unknown>)[key] === value,
        ),
      ),
    ),
    update: jest.fn(
      async (where: Record<string, unknown>, patch: Partial<T>) => {
        for (const row of rows) {
          const matches = Object.entries(where).every(
            ([key, value]) => (row as Record<string, unknown>)[key] === value,
          );
          if (matches) Object.assign(row, patch, { updatedAt: now });
        }
        return { affected: 1 };
      },
    ),
  };
}

function makeLifeGraph() {
  const profiles = repo<LifeGraphProfile & Record<string, unknown>>();
  const fields = repo<LifeGraphField & Record<string, unknown>>();
  const auditLogs = repo<LifeGraphAuditLog & Record<string, unknown>>();
  const proposals = repo<LifeGraphProposal & Record<string, unknown>>();
  const socialProfiles = repo<UserSocialProfile & Record<string, unknown>>();
  const service = new LifeGraphService(
    profiles as never,
    fields as never,
    auditLogs as never,
    proposals as never,
    socialProfiles as never,
    new LifeGraphExtractionService(),
  );
  return { service, fields, proposals };
}

describe('Social Agent Brain Life Graph e2e contract', () => {
  it('returns a proposal for profile enrichment instead of silently saving', async () => {
    const { service, fields, proposals } = makeLifeGraph();

    const proposal = await service.extractFromChat(7, {
      message: '我周末下午一般有空，想找附近跑步搭子。',
      taskId: 101,
    });

    expect(proposal.proposedFields.length).toBeGreaterThan(0);
    expect(proposals.rows[0]).toMatchObject({ status: 'proposed' });
    expect(fields.rows).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: LifeGraphFieldSource.AiInferred }),
      ]),
    );
  });

  it('uses confirmed Life Graph fields in later match signals', async () => {
    const { service } = makeLifeGraph();
    const proposal = await service.extractFromChat(7, {
      message: '我周末下午一般有空，想找附近跑步搭子。',
    });

    await service.confirmUpdate(7, { proposalId: proposal.proposalId });
    const signals = await service.getUnifiedMatchSignals(7);

    expect(signals.lifestyleSignals.availableTimes).toEqual(['周末下午']);
    expect(signals.fitnessSignals.sportsPreferences).toEqual(['跑步']);
  });

  it('exposes missing critical fields so the Agent can ask before blind search', async () => {
    const { service } = makeLifeGraph();

    const signals = await service.getUnifiedMatchSignals(7);

    expect(signals.missingCriticalFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldKey: 'availableTimes' }),
        expect.objectContaining({ fieldKey: 'publicPlaceOnly' }),
      ]),
    );
  });

  it('does not reference revoked fields in later match signals', async () => {
    const { service } = makeLifeGraph();
    await service.updateLifeGraph(7, {
      fields: [
        {
          category: LifeGraphFieldCategory.Lifestyle,
          fieldKey: 'availableTimes',
          fieldValue: ['周末下午'],
        },
      ],
    });

    await service.revokeField(7, {
      category: LifeGraphFieldCategory.Lifestyle,
      fieldKey: 'availableTimes',
    });
    const signals = await service.getUnifiedMatchSignals(7);

    expect(signals.lifestyleSignals.availableTimes).toBeUndefined();
  });

  it('adds public place safety guidance to candidate explanation', () => {
    const explanation = new CandidateExplanationService(
      new SceneRiskPolicyService(),
    ).explain({
      candidate: {
        displayName: '小林',
        city: '青岛',
        commonTags: ['跑步'],
      },
      userRequest: '帮我找附近跑步搭子',
      matchScore: 88,
      matchReasons: ['运动偏好相似'],
      lifeGraphSignals: {
        identitySignals: { nearbyArea: '青岛大学附近', city: '青岛' },
        lifestyleSignals: { availableTimes: ['周末下午'] },
        fitnessSignals: { sportsPreferences: ['跑步'] },
        socialIntentSignals: { preferredSocialStyle: '先聊天后见面' },
        safetySignals: { publicPlaceOnly: true },
        missingCriticalFields: [],
      },
    });

    expect(explanation.lifeGraphExplanation?.boundaryNotes).toEqual(
      expect.arrayContaining([expect.stringContaining('公共场所')]),
    );
  });

  it('blocks precise location sharing when Life Graph disallows it', () => {
    const policy = new SceneRiskPolicyService().evaluate({
      sceneType: 'fitness',
      actionType: 'share_location',
      text: '把我的精确定位发给对方',
      safetySignals: { locationSharingAllowed: false },
    });

    expect(policy.riskLevel).toBe('critical');
    expect(policy.blockedActions).toEqual(
      expect.arrayContaining(['auto_execute', 'precise_location']),
    );
  });
});
