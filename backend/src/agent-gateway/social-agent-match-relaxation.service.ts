import { Injectable, Optional } from '@nestjs/common';

import { cleanDisplayText } from '../common/display-text.util';
import { UserSocialRequest } from '../social-requests/social-request.entity';
import { CandidateSearchIndexService } from './candidate-search-index.service';
import { PublicSocialIntent } from './entities/public-social-intent.entity';
import type { CandidatePoolResolvedQuery } from './social-agent-candidate-pool-query';
import type {
  SocialAgentMatchingFallback,
  SocialAgentRelaxationStrategy,
} from './social-agent-match-relaxation.types';

const FALLBACK_VERSION: SocialAgentMatchingFallback['version'] =
  'fitmeet.matching-fallback.v1';

@Injectable()
export class SocialAgentMatchRelaxationService {
  constructor(
    @Optional()
    private readonly candidateSearchIndex?: CandidateSearchIndexService,
  ) {}

  async buildFallback(input: {
    ownerUserId: number;
    query: CandidatePoolResolvedQuery;
    socialRequest: UserSocialRequest;
    publicIntent: PublicSocialIntent;
  }): Promise<SocialAgentMatchingFallback> {
    const originalConstraints = this.originalConstraints(input);
    const strategies = await Promise.all([
      this.expandDistance(input, originalConstraints),
      this.expandTime(input, originalConstraints),
      this.relaxTags(input, originalConstraints),
    ]);
    return {
      version: FALLBACK_VERSION,
      generatedAt: new Date().toISOString(),
      originalConstraints,
      strategies,
      recommendedStrategyId: this.recommended(strategies),
    };
  }

  private async expandDistance(
    input: {
      ownerUserId: number;
      query: CandidatePoolResolvedQuery;
      socialRequest: UserSocialRequest;
      publicIntent: PublicSocialIntent;
    },
    originalConstraints: Record<string, unknown>,
  ): Promise<SocialAgentRelaxationStrategy> {
    const currentRadius = this.positiveInt(
      input.publicIntent.radiusKm || input.socialRequest.radiusKm,
      5,
    );
    const nextRadius = Math.min(Math.max(currentRadius * 3, 10), 25);
    const count = await this.shadowCount(input, {
      useCity: true,
      useActivity: true,
      useTags: true,
      useTime: true,
    });
    return {
      id: 'expand_distance',
      label: '扩大距离',
      changedConstraints: {
        ...originalConstraints,
        radiusKm: nextRadius,
        relaxation: 'expand_distance',
      },
      candidateCount: count,
      previewText:
        count > 0
          ? `把范围扩大到 ${nextRadius}km 后，可能多看到 ${count} 个真实候选。`
          : `把范围扩大到 ${nextRadius}km 后，我会继续按同城公开候选重新找。`,
      action: 'matching.relax_distance',
    };
  }

  private async expandTime(
    input: {
      ownerUserId: number;
      query: CandidatePoolResolvedQuery;
      socialRequest: UserSocialRequest;
      publicIntent: PublicSocialIntent;
    },
    originalConstraints: Record<string, unknown>,
  ): Promise<SocialAgentRelaxationStrategy> {
    const count = await this.shadowCount(input, {
      useCity: true,
      useActivity: true,
      useTags: true,
      useTime: false,
    });
    return {
      id: 'expand_time',
      label: '放宽时间',
      changedConstraints: {
        ...originalConstraints,
        timePreference: this.relaxedTimeLabel(
          input.publicIntent.timePreference || input.query.timePreference,
        ),
        relaxation: 'expand_time',
      },
      candidateCount: count,
      previewText:
        count > 0
          ? `如果把时间放宽到同日相邻时段或最近 7 天，可能有 ${count} 个候选。`
          : '我可以把精确时间改成最近 7 天的相近时段，再试一次。',
      action: 'matching.relax_time',
    };
  }

  private async relaxTags(
    input: {
      ownerUserId: number;
      query: CandidatePoolResolvedQuery;
      socialRequest: UserSocialRequest;
      publicIntent: PublicSocialIntent;
    },
    originalConstraints: Record<string, unknown>,
  ): Promise<SocialAgentRelaxationStrategy> {
    const count = await this.shadowCount(input, {
      useCity: true,
      useActivity: true,
      useTags: false,
      useTime: true,
    });
    return {
      id: 'relax_tags',
      label: '减少偏好限制',
      changedConstraints: {
        ...originalConstraints,
        interestTags: [this.activityType(input)].filter(Boolean),
        relaxation: 'relax_tags',
      },
      candidateCount: count,
      previewText:
        count > 0
          ? `保留活动和安全边界、减少风格偏好后，可能有 ${count} 个候选。`
          : '我可以先保留活动和安全边界，减少非核心兴趣限制后重新匹配。',
      action: 'matching.relax_tags',
    };
  }

  private async shadowCount(
    input: {
      ownerUserId: number;
      query: CandidatePoolResolvedQuery;
      publicIntent: PublicSocialIntent;
      socialRequest: UserSocialRequest;
    },
    flags: {
      useCity: boolean;
      useActivity: boolean;
      useTags: boolean;
      useTime: boolean;
    },
  ): Promise<number> {
    if (!this.candidateSearchIndex) return 0;
    const rows = await this.candidateSearchIndex.search({
      ownerUserId: input.ownerUserId,
      city: flags.useCity ? this.city(input) : '',
      activityTypes: flags.useActivity ? [this.activityType(input)] : [],
      interestTags: flags.useTags ? this.interestTags(input) : [],
      timeBuckets: flags.useTime ? [this.timePreference(input)] : [],
      includeProfiles: true,
      includePublicIntents: true,
      limit: 25,
    });
    return rows.length;
  }

  private originalConstraints(input: {
    query: CandidatePoolResolvedQuery;
    socialRequest: UserSocialRequest;
    publicIntent: PublicSocialIntent;
  }): Record<string, unknown> {
    return {
      city: this.city(input),
      activityType: this.activityType(input),
      timePreference: this.timePreference(input),
      locationPreference:
        input.publicIntent.locationPreference ||
        input.query.locationPreference ||
        input.socialRequest.metadata?.locationPreference ||
        '',
      radiusKm:
        input.publicIntent.radiusKm || input.socialRequest.radiusKm || null,
      interestTags: this.interestTags(input),
      safetyBoundary: this.safetyBoundary(input),
    };
  }

  private recommended(
    strategies: SocialAgentRelaxationStrategy[],
  ): SocialAgentMatchingFallback['recommendedStrategyId'] {
    const [best] = [...strategies].sort((left, right) => {
      if (right.candidateCount !== left.candidateCount) {
        return right.candidateCount - left.candidateCount;
      }
      return strategyPriority(left.id) - strategyPriority(right.id);
    });
    return best?.id ?? 'relax_tags';
  }

  private city(input: {
    query: CandidatePoolResolvedQuery;
    socialRequest: UserSocialRequest;
    publicIntent: PublicSocialIntent;
  }): string {
    return cleanDisplayText(
      input.publicIntent.city || input.query.city || input.socialRequest.city,
      '',
    );
  }

  private activityType(input: {
    query: CandidatePoolResolvedQuery;
    socialRequest: UserSocialRequest;
    publicIntent: PublicSocialIntent;
  }): string {
    return cleanDisplayText(
      input.publicIntent.requestType ||
        input.query.activityType ||
        input.socialRequest.activityType,
      '',
    );
  }

  private timePreference(input: {
    query: CandidatePoolResolvedQuery;
    publicIntent: PublicSocialIntent;
  }): string {
    return cleanDisplayText(
      input.publicIntent.timePreference || input.query.timePreference,
      '',
    );
  }

  private interestTags(input: {
    query: CandidatePoolResolvedQuery;
    socialRequest: UserSocialRequest;
    publicIntent: PublicSocialIntent;
  }): string[] {
    return uniqueStrings([
      ...input.query.interestTags,
      ...arrayFrom(input.socialRequest.interestTags),
      ...arrayFrom(input.publicIntent.interestTags),
      this.activityType(input),
    ]);
  }

  private safetyBoundary(input: {
    socialRequest: UserSocialRequest;
    publicIntent: PublicSocialIntent;
  }): string {
    return cleanDisplayText(
      input.publicIntent.filters?.safetyBoundary ??
        input.publicIntent.filters?.safety ??
        input.socialRequest.metadata?.safetyBoundary ??
        input.socialRequest.safetyRequirement,
      '',
    );
  }

  private relaxedTimeLabel(value: unknown): string {
    const text = cleanDisplayText(value, '');
    if (/周末|周六|周日|星期六|星期日/.test(text)) return '整个周末';
    if (/今晚|明天|今天|下午|晚上|上午|中午/.test(text)) {
      return `${text || '原时间'}附近或最近 7 天相近时段`;
    }
    return '最近 7 天相近时段';
  }

  private positiveInt(value: unknown, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.round(parsed);
  }
}

function strategyPriority(
  strategy: SocialAgentRelaxationStrategy['id'],
): number {
  if (strategy === 'expand_distance') return 0;
  if (strategy === 'expand_time') return 1;
  return 2;
}

function uniqueStrings(values: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = cleanDisplayText(value, '');
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function arrayFrom(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === 'string') return value.split(/[、,，;；|]/u);
  return [];
}
