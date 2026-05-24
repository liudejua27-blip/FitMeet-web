import { describe, it, expect } from 'vitest';
import { cn, formatCount, getInitials } from '../lib/utils';
import { messageUrlWithSocialAgentReturn } from '../lib/socialAgentReturnUrl';
import { isPublicHallIntent } from '../lib/hallPublicIntent';
import type { PublicSocialIntent } from '../types';

describe('cn (className merge)', () => {
  it('merges class names', () => {
    expect(cn('px-2', 'py-1')).toBe('px-2 py-1');
  });

  it('resolves Tailwind conflicts (last wins)', () => {
    const result = cn('px-2', 'px-4');
    expect(result).toBe('px-4');
  });

  it('handles conditional values', () => {
    const conditional = false as boolean;
    expect(cn('base', conditional && 'hidden', 'extra')).toBe('base extra');
  });
});

describe('formatCount', () => {
  it('returns plain number under 1000', () => {
    expect(formatCount(999)).toBe('999');
  });

  it('formats 1000+ as K', () => {
    expect(formatCount(1000)).toBe('1.0K');
    expect(formatCount(15600)).toBe('15.6K');
  });

  it('formats 1000000+ as M', () => {
    expect(formatCount(1000000)).toBe('1.0M');
    expect(formatCount(2500000)).toBe('2.5M');
  });
});

describe('getInitials', () => {
  it('returns first char', () => {
    expect(getInitials('Alice')).toBe('A');
    expect(getInitials('张三')).toBe('张');
  });

  it('handles empty string', () => {
    expect(getInitials('')).toBe('');
  });
});

describe('messageUrlWithSocialAgentReturn', () => {
  it('preserves the target conversation and social agent task context', () => {
    expect(messageUrlWithSocialAgentReturn('conv-22', 101)).toBe(
      '/messages?conversationId=conv-22&from=social-agent&agentTaskId=101',
    );
  });

  it('omits only the task id when the caller has no task context', () => {
    expect(messageUrlWithSocialAgentReturn('conv-22', null)).toBe(
      '/messages?conversationId=conv-22&from=social-agent',
    );
  });
});

describe('isPublicHallIntent', () => {
  function makeIntent(overrides: Partial<PublicSocialIntent> = {}): PublicSocialIntent {
    return {
      id: 'intent_1',
      userId: 2,
      linkedSocialRequestId: 10,
      source: 'public_social_skills',
      mode: 'public',
      requestType: 'fitness_partner',
      title: '今晚一起跑步',
      description: '公开地点轻松跑',
      interestTags: ['跑步'],
      city: '青岛',
      loc: '五四广场',
      lat: null,
      lng: null,
      radiusKm: 5,
      timePreference: '今晚',
      riskLevel: 'low',
      requiresUserConfirmation: true,
      filters: {},
      candidateUserIds: [],
      matchedCount: 0,
      status: 'active',
      createdAt: '2026-05-24T00:00:00.000Z',
      updatedAt: '2026-05-24T00:00:00.000Z',
      ...overrides,
    };
  }

  it('accepts only active public intents for the hall feed', () => {
    expect(isPublicHallIntent(makeIntent())).toBe(true);
    expect(isPublicHallIntent(makeIntent({ mode: 'private_draft' }))).toBe(false);
    expect(isPublicHallIntent(makeIntent({ status: 'inactive' }))).toBe(false);
  });
});
