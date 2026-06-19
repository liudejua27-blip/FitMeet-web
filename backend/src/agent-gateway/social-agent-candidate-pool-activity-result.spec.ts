import { SocialActivityStatus } from '../activities/entities/activity.entity';
import { ActivityType } from '../activities/entities/activity-template.entity';
import { SocialRequestStatus } from './entities/social-request.entity';
import {
  buildCandidatePoolActivityReasons,
  buildCandidatePoolActivityResult,
  buildCandidatePoolPublicIntentActivityResult,
} from './social-agent-candidate-pool-activity-result';
import type { CandidatePoolResolvedQuery } from './social-agent-candidate-pool-query';

const query: CandidatePoolResolvedQuery = {
  city: '青岛',
  intent: 'social_search',
  activityType: 'coffee_chat',
  interestTags: ['咖啡', '拍照'],
  timePreference: '周末',
  locationPreference: '',
  rawText: '周末找人喝咖啡拍照',
  socialRequestId: 50,
  acceptsStrangers: null,
};

const explanation = {
  fitReasons: ['活动匹配'],
  awkwardPoints: [],
  riskWarnings: [],
  suggestedOpener: '要不要一起去？',
  safeFirstStep: '先确认公共地点',
  requiresConfirmation: false,
  nextActionSuggestion: 'send_message',
  lifeGraphExplanation: {
    usedSignals: [],
    missingSignals: [],
    boundaryNotes: [],
    confidenceLevel: 'low' as const,
  },
};

describe('social-agent-candidate-pool-activity-result', () => {
  it('builds stable real activity result fields', () => {
    const explain = jest.fn(() => explanation);

    const result = buildCandidatePoolActivityResult({
      activity: {
        id: 7,
        creatorId: 2,
        type: ActivityType.Custom,
        title: ' 周末咖啡拍照 ',
        description: '一起喝咖啡，也可以拍照',
        locationName: '海边咖啡店',
        city: '青岛',
        startTime: new Date('2026-06-08T08:00:00.000Z'),
        status: SocialActivityStatus.Confirmed,
        createdAt: new Date('2026-06-07T00:00:00.000Z'),
        updatedAt: new Date('2026-06-07T00:00:00.000Z'),
      },
      query,
      explain,
    });

    expect(result).toMatchObject({
      id: '7',
      source: 'activity',
      isRealData: true,
      targetUserId: 2,
      candidateUserId: 2,
      activityId: 7,
      publicIntentId: null,
      title: '周末咖啡拍照',
      city: '青岛',
      loc: '海边咖啡店',
      ownerUserId: 2,
      status: SocialActivityStatus.Confirmed,
      createdAt: '2026-06-07T00:00:00.000Z',
      timePreference: '2026-06-08T08:00:00.000Z',
      candidateExplanation: explanation,
    });
    expect(result.matchScore).toBeGreaterThan(0);
    expect(result.matchReasons).toEqual(
      expect.arrayContaining([
        '来自真实活动或公开约练卡片。',
        '城市匹配：青岛。',
      ]),
    );
    expect(explain).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '周末咖啡拍照',
        city: '青岛',
        query,
        matchScore: result.matchScore,
        matchReasons: result.matchReasons,
      }),
    );
  });

  it('builds stable public intent activity result fields', () => {
    const result = buildCandidatePoolPublicIntentActivityResult({
      intent: {
        id: 'intent_1',
        userId: 3,
        requestType: 'coffee_chat',
        title: '',
        description: '周末咖啡拍照',
        interestTags: ['咖啡'],
        city: '青岛',
        loc: '',
        timePreference: '周末',
        status: SocialRequestStatus.Searching,
        createdAt: new Date('2026-06-07T00:00:00.000Z'),
        updatedAt: new Date('2026-06-07T00:00:00.000Z'),
      },
      query,
      explain: () => explanation,
    });

    expect(result).toMatchObject({
      id: 'intent_1',
      source: 'public_intent',
      targetUserId: 3,
      activityId: null,
      publicIntentId: 'intent_1',
      title: '公开约练卡片',
      requestType: 'coffee_chat',
      timePreference: '周末',
      status: SocialRequestStatus.Searching,
    });
    expect(result.interestTags).toEqual(
      expect.arrayContaining(['咖啡', 'coffee_chat']),
    );
  });

  it('keeps activity reason text compact and deterministic', () => {
    expect(
      buildCandidatePoolActivityReasons(query, '青岛', [
        '咖啡',
        '拍照',
        '周末',
        '散步',
      ]),
    ).toEqual([
      '来自真实活动或公开约练卡片。',
      '城市匹配：青岛。',
      '标签匹配：咖啡、拍照、周末。',
    ]);
  });
});
