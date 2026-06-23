import { SocialCodexLifeGraphGovernanceService } from './social-codex-life-graph-governance.service';
import type { SocialAgentTaskSlots } from './social-agent-task-memory-state-machine.service';

describe('SocialCodexLifeGraphGovernanceService', () => {
  const service = new SocialCodexLifeGraphGovernanceService();
  const now = new Date('2026-06-17T00:00:00.000Z').toISOString();

  it('proposes governed stable facts with evidence and expiry', () => {
    const slots: SocialAgentTaskSlots = {
      activity: {
        key: 'activity',
        value: '散步',
        state: 'completed',
        source: 'user_message',
        updatedAt: now,
      },
      time_window: {
        key: 'time_window',
        value: '周末下午',
        state: 'answered',
        source: 'user_message',
        updatedAt: now,
      },
      safety_boundary: {
        key: 'safety_boundary',
        value: '首次见面优先公共场所，先在平台内沟通',
        state: 'completed',
        source: 'user_message',
        updatedAt: now,
      },
    };

    const facts = service.proposeStableFactsFromSlots(slots);

    expect(facts.map((fact) => fact.key)).toEqual(
      expect.arrayContaining([
        'preferred_activity',
        'preferred_time_window',
        'first_meet_safety_boundary',
      ]),
    );
    expect(
      facts.find((fact) => fact.key === 'preferred_time_window'),
    ).toMatchObject({
      sensitivity: 'private',
      writePolicy: 'user_confirmation_required',
      retention: {
        sourceUpdatedAt: now,
        ttlDays: 120,
        basis: 'slot_updated_at',
      },
    });
    expect(
      facts.find((fact) => fact.key === 'preferred_time_window')?.expiresAt,
    ).toBe('2026-10-15T00:00:00.000Z');
    expect(facts.every((fact) => fact.evidence.length > 0)).toBe(true);
    expect(facts.every((fact) => service.shouldWriteFact(fact))).toBe(true);
    expect(service.summarizeFactProposals(facts)).toMatchObject({
      total: 3,
      autoSaveCount: 2,
      confirmationRequiredCount: 1,
      blockedCount: 0,
      sensitiveCount: 0,
      expiringFactKeys: expect.arrayContaining([
        'preferred_activity',
        'preferred_time_window',
      ]),
    });
    expect(service.toUserVisibleFactSummaries(facts)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'preferred_activity',
          displayValue: '散步',
          evidenceCount: 1,
          writePolicy: 'low_risk_auto_save',
        }),
        expect.objectContaining({
          key: 'preferred_time_window',
          displayValue: '周末下午',
          writePolicy: 'user_confirmation_required',
        }),
      ]),
    );
  });

  it('does not write precise contact or address noise into Life Graph', () => {
    const slots: SocialAgentTaskSlots = {
      location_text: {
        key: 'location_text',
        value: '青岛大学 3 号宿舍 401',
        state: 'answered',
        source: 'user_message',
        updatedAt: now,
      },
      invite_tone: {
        key: 'invite_tone',
        value: '可以',
        state: 'answered',
        source: 'user_message',
        updatedAt: now,
      },
    };

    const facts = service.proposeStableFactsFromSlots(slots);

    const blockedAddressFact = facts.find((fact) =>
      fact.value.includes('宿舍'),
    );

    expect(blockedAddressFact).toMatchObject({
      key: 'preferred_geo_area',
      sensitivity: 'sensitive',
      writePolicy: 'do_not_write',
    });
    expect(service.shouldWriteFact(blockedAddressFact!)).toBe(false);
    expect(service.summarizeFactProposals(facts)).toMatchObject({
      blockedCount: 1,
      sensitiveCount: 1,
    });
    expect(
      JSON.stringify(service.toUserVisibleFactSummaries(facts)),
    ).not.toContain('宿舍');
    expect(
      JSON.stringify(service.toUserVisibleFactSummaries(facts)),
    ).not.toContain('401');
    expect(facts.find((fact) => fact.value === '可以')).toBeUndefined();
  });

  it('keeps direct contact and precise address out of user visible memory summaries', () => {
    const slots: SocialAgentTaskSlots = {
      geo_area: {
        key: 'geo_area',
        value: '青岛大学附近，手机号 13812345678，微信 fitmeet-test',
        state: 'completed',
        source: 'user_message',
        updatedAt: now,
      },
      safety_boundary: {
        key: 'safety_boundary',
        value: '第一次见面只接受公共场所',
        state: 'completed',
        source: 'user_message',
        updatedAt: now,
      },
    };

    const facts = service.proposeStableFactsFromSlots(slots);
    const visible = service.toUserVisibleFactSummaries(facts);
    const serialized = JSON.stringify(visible);

    expect(serialized).not.toContain('13812345678');
    expect(serialized).not.toContain('fitmeet-test');
    expect(visible).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'first_meet_safety_boundary',
          displayValue: '第一次见面只接受公共场所',
        }),
      ]),
    );
  });

  it('treats exact coordinates and map links as sensitive location facts', () => {
    const slots: SocialAgentTaskSlots = {
      geo_area: {
        key: 'geo_area',
        value:
          '青岛大学附近，坐标 36.062123,120.389456，高德地图链接 amap://poi',
        state: 'completed',
        source: 'user_message',
        updatedAt: now,
      },
      activity: {
        key: 'activity',
        value: '散步',
        state: 'completed',
        source: 'user_message',
        updatedAt: now,
      },
    };

    const facts = service.proposeStableFactsFromSlots(slots);
    const locationFact = facts.find(
      (fact) => fact.key === 'preferred_geo_area',
    );

    expect(locationFact).toMatchObject({
      sensitivity: 'sensitive',
      writePolicy: 'do_not_write',
    });
    expect(service.shouldWriteFact(locationFact!)).toBe(false);
    expect(service.summarizeFactProposals(facts)).toMatchObject({
      blockedCount: 1,
      sensitiveCount: 1,
    });
    const visible = JSON.stringify(service.toUserVisibleFactSummaries(facts));
    expect(visible).not.toContain('36.062123');
    expect(visible).not.toContain('120.389456');
    expect(visible).not.toContain('amap');
    expect(visible).toContain('散步');
  });
});
