import { CandidateMatchLevel } from '../match/social-request-candidate.entity';
import {
  candidateCityMatches,
  candidateClampScore,
  candidateCommonTags,
  candidateMatchLevel,
  candidateRecentScore,
  candidateTotalScore,
} from './social-agent-candidate-scoring';

describe('social agent candidate scoring primitives', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-06T08:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('matches cities with the existing empty-query and sanitized-city rules', () => {
    expect(candidateCityMatches('', '')).toBe(true);
    expect(candidateCityMatches('青岛', '青岛市')).toBe(true);
    expect(candidateCityMatches('青岛市南', '青岛')).toBe(true);
    expect(candidateCityMatches('北京', '')).toBe(false);
    expect(candidateCityMatches('北京', '青岛')).toBe(false);
  });

  it('deduplicates common tags using exact and contains matching', () => {
    expect(
      candidateCommonTags(
        ['咖啡', '跑步', '低压力跑步', '咖啡'],
        ['周末咖啡', '跑步'],
      ),
    ).toEqual(['咖啡', '跑步', '低压力跑步']);
  });

  it('keeps recent score buckets and total score clamp stable', () => {
    expect(candidateRecentScore(new Date('2026-06-01T08:00:00.000Z'), 15)).toBe(
      15,
    );
    expect(candidateRecentScore(new Date('2026-05-20T08:00:00.000Z'), 15)).toBe(
      11,
    );
    expect(candidateRecentScore(new Date('2026-04-01T08:00:00.000Z'), 15)).toBe(
      5,
    );
    expect(candidateRecentScore(new Date('2026-01-01T08:00:00.000Z'), 15)).toBe(
      0,
    );
    expect(candidateClampScore(105.4)).toBe(100);
    expect(candidateClampScore(-4)).toBe(0);
    expect(candidateTotalScore({ distance: 14.2, tags: 10.6 })).toBe(25);
  });

  it('maps candidate match levels from clamped score thresholds', () => {
    expect(candidateMatchLevel(75)).toBe(CandidateMatchLevel.High);
    expect(candidateMatchLevel(45)).toBe(CandidateMatchLevel.Medium);
    expect(candidateMatchLevel(44)).toBe(CandidateMatchLevel.Low);
  });
});
