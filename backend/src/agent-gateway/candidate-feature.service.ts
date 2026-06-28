import { Injectable } from '@nestjs/common';

import {
  CandidateSearchIndex,
  CandidateSearchIndexSourceType,
} from './entities/candidate-search-index.entity';

export type CandidateRecallFeatureSummary = {
  rowCount: number;
  profileRows: number;
  publicIntentRows: number;
  cities: string[];
  activityTypes: string[];
  interestTags: string[];
};

@Injectable()
export class CandidateFeatureService {
  summarizeRecallRows(
    rows: CandidateSearchIndex[],
  ): CandidateRecallFeatureSummary {
    return {
      rowCount: rows.length,
      profileRows: rows.filter(
        (row) => row.sourceType === CandidateSearchIndexSourceType.Profile,
      ).length,
      publicIntentRows: rows.filter(
        (row) => row.sourceType === CandidateSearchIndexSourceType.PublicIntent,
      ).length,
      cities: uniqueStrings(rows.map((row) => row.city)),
      activityTypes: uniqueStrings(rows.flatMap((row) => row.activityTypes)),
      interestTags: uniqueStrings(rows.flatMap((row) => row.interestTags)),
    };
  }
}

function uniqueStrings(values: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const text = value.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out.slice(0, 20);
}
