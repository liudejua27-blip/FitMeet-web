import { Injectable, Optional } from '@nestjs/common';

import { CandidateFeatureService } from './candidate-feature.service';
import { CandidateSearchIndexService } from './candidate-search-index.service';
import {
  CandidateSearchIndex,
  CandidateSearchIndexSourceType,
} from './entities/candidate-search-index.entity';
import type { CandidatePoolResolvedQuery } from './social-agent-candidate-pool-query';

export type CandidateRecallIndexResult = {
  used: boolean;
  source: 'candidate_search_index';
  rowCount: number;
  candidateUserIds: number[];
  publicIntentIds: string[];
  rows: CandidateSearchIndex[];
  features: ReturnType<CandidateFeatureService['summarizeRecallRows']>;
};

@Injectable()
export class CandidateRecallIndexService {
  constructor(
    private readonly candidateSearchIndex: CandidateSearchIndexService,
    @Optional() private readonly candidateFeatures?: CandidateFeatureService,
  ) {}

  async recallForCandidatePool(
    query: CandidatePoolResolvedQuery,
    input: { ownerUserId: number; limit?: number | null },
  ): Promise<CandidateRecallIndexResult> {
    if (query.candidateUserIds.length > 0 || query.publicIntentIds.length > 0) {
      return this.empty();
    }
    const rows = await this.candidateSearchIndex.search({
      ownerUserId: input.ownerUserId,
      city: query.city,
      activityTypes: [query.activityType].filter(Boolean),
      interestTags: query.interestTags,
      timeBuckets: [query.timePreference].filter(Boolean),
      includeProfiles: true,
      includePublicIntents: true,
      limit: Math.max(20, Math.min(200, Number(input.limit ?? 50) * 4)),
    });
    const candidateUserIds = rowsToCandidateUserIds(rows);
    const publicIntentIds = rowsToPublicIntentIds(rows);
    return {
      used: candidateUserIds.length > 0 || publicIntentIds.length > 0,
      source: 'candidate_search_index',
      rowCount: rows.length,
      candidateUserIds,
      publicIntentIds,
      rows,
      features:
        this.candidateFeatures?.summarizeRecallRows(rows) ??
        emptyFeatureSummary(rows.length),
    };
  }

  private empty(): CandidateRecallIndexResult {
    return {
      used: false,
      source: 'candidate_search_index',
      rowCount: 0,
      candidateUserIds: [],
      publicIntentIds: [],
      rows: [],
      features: emptyFeatureSummary(0),
    };
  }
}

function rowsToCandidateUserIds(rows: CandidateSearchIndex[]): number[] {
  const ids = new Set<number>();
  for (const row of rows) {
    if (typeof row.userId === 'number' && row.userId > 0) {
      ids.add(row.userId);
    }
  }
  return [...ids];
}

function rowsToPublicIntentIds(rows: CandidateSearchIndex[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    if (
      row.sourceType === CandidateSearchIndexSourceType.PublicIntent &&
      row.publicIntentId
    ) {
      ids.add(row.publicIntentId);
    }
  }
  return [...ids];
}

function emptyFeatureSummary(rowCount: number) {
  return {
    rowCount,
    profileRows: 0,
    publicIntentRows: 0,
    cities: [],
    activityTypes: [],
    interestTags: [],
  };
}
