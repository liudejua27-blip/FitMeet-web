import type {
  CandidatePoolDebugReasons,
  CandidatePoolDebugSnapshot,
} from './social-agent-candidate-pool-debug';
import { toCandidatePoolDebugReasons } from './social-agent-candidate-pool-debug';
import type { CandidatePoolResolvedQuery } from './social-agent-candidate-pool-query';

export const EMPTY_CANDIDATE_MESSAGE =
  '当前没有找到符合条件的真实用户，我可以帮你发布一个约练需求，或者你可以放宽城市、时间、兴趣条件。';

export const EMPTY_ACTIVITY_MESSAGE =
  '当前没有找到符合条件的真实活动或公开约练卡片，可以换个城市、时间或活动类型再试。';

type EmptyReason = 'no_real_candidates' | null;

export type CandidatePoolSearchEnvelope<TCandidate> = {
  ownerUserId: number;
  query: CandidatePoolResolvedQuery;
  candidates: TCandidate[];
  emptyReason: EmptyReason;
  message: string;
  debugReasons: CandidatePoolDebugReasons;
  debug: CandidatePoolDebugSnapshot;
};

export type CandidatePoolActivitySearchEnvelope<TActivityResult> = {
  ownerUserId: number;
  query: CandidatePoolResolvedQuery;
  activityResults: TActivityResult[];
  emptyReason: EmptyReason;
  message: string;
  debugReasons: CandidatePoolDebugReasons;
  debug: CandidatePoolDebugSnapshot;
};

export function buildCandidatePoolSearchResult<TCandidate>(input: {
  ownerUserId: number;
  query: CandidatePoolResolvedQuery;
  candidates: TCandidate[];
  debug: CandidatePoolDebugSnapshot;
}): CandidatePoolSearchEnvelope<TCandidate> {
  return {
    ownerUserId: input.ownerUserId,
    query: input.query,
    candidates: input.candidates,
    emptyReason: input.candidates.length === 0 ? 'no_real_candidates' : null,
    message: input.candidates.length === 0 ? EMPTY_CANDIDATE_MESSAGE : '',
    debugReasons: toCandidatePoolDebugReasons(input.debug),
    debug: input.debug,
  };
}

export function buildCandidatePoolActivitySearchResult<TActivityResult>(input: {
  ownerUserId: number;
  query: CandidatePoolResolvedQuery;
  activityResults: TActivityResult[];
  debug: CandidatePoolDebugSnapshot;
}): CandidatePoolActivitySearchEnvelope<TActivityResult> {
  return {
    ownerUserId: input.ownerUserId,
    query: input.query,
    activityResults: input.activityResults,
    emptyReason:
      input.activityResults.length === 0 ? 'no_real_candidates' : null,
    message: input.activityResults.length === 0 ? EMPTY_ACTIVITY_MESSAGE : '',
    debugReasons: toCandidatePoolDebugReasons(input.debug),
    debug: input.debug,
  };
}
