import { SocialAgentPreferenceGeneralizationService } from './social-agent-preference-generalization.service';
import { AgentFeedbackEvent } from './entities/agent-feedback-event.entity';
import { UserSocialProfile } from '../users/user-social-profile.entity';

function makeRepo(profile: UserSocialProfile | null = null) {
  const repo = {
    findOne: jest.fn(async () => profile),
    create: jest.fn((value: Partial<UserSocialProfile>) => ({
      userId: value.userId,
      defaultMatchRadiusKm: 20,
      matchSignals: {},
      ...value,
    })),
    save: jest.fn(async (value: UserSocialProfile) => {
      profile = value;
      return value;
    }),
  };
  return repo;
}

function feedback(
  reasonCode: AgentFeedbackEvent['reasonCode'],
  overrides: Partial<AgentFeedbackEvent> = {},
): AgentFeedbackEvent {
  return {
    id: 10,
    userId: 1,
    taskId: 20,
    publicIntentId: 'intent_1',
    matchingJobId: 30,
    candidateId: 2,
    candidateRecordId: 40,
    feedbackType: 'candidate_quality',
    reasonCode,
    freeText: null,
    correctionType: null,
    oldValue: null,
    newValue: null,
    appliesToCurrentTask: true,
    appliesToFutureProfile: true,
    source: 'agent_web',
    metadata: {},
    createdAt: new Date('2026-06-27T08:00:00.000Z'),
    ...overrides,
  } as AgentFeedbackEvent;
}

describe('SocialAgentPreferenceGeneralizationService', () => {
  it('generalizes too_far into a smaller preferred radius and area penalty', async () => {
    const repo = makeRepo({
      userId: 1,
      defaultMatchRadiusKm: 10,
      matchSignals: {},
    } as UserSocialProfile);
    const service = new SocialAgentPreferenceGeneralizationService(
      repo as never,
    );

    const result = await service.recordFeedback(
      feedback('too_far', {
        metadata: {
          locationText: '崂山区',
          radiusKm: 10,
        },
      }),
    );

    expect(result).toMatchObject({
      preferredRadiusKm: 8,
      areaWeights: [
        expect.objectContaining({
          tag: '崂山区',
          weight: -3,
        }),
      ],
    });
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        matchSignals: expect.objectContaining({
          preferenceGeneralization: expect.objectContaining({
            preferredRadiusKm: 8,
          }),
        }),
      }),
    );
  });

  it('generalizes time and style mismatch into bucket and style weights', async () => {
    const repo = makeRepo({
      userId: 1,
      defaultMatchRadiusKm: 20,
      matchSignals: {},
    } as UserSocialProfile);
    const service = new SocialAgentPreferenceGeneralizationService(
      repo as never,
    );

    await service.recordFeedback(
      feedback('time_mismatch', {
        metadata: { timeWindow: '工作日晚上' },
      }),
    );
    const result = await service.recordFeedback(
      feedback('style_mismatch', {
        freeText: '对方太竞技、高强度了，我想轻松一点',
        metadata: { tags: ['羽毛球', '竞技', '高强度'] },
      }),
    );

    expect(result?.timeBucketWeights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tag: '工作日晚上', weight: -5 }),
      ]),
    );
    expect(result?.styleWeights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tag: '竞技', weight: -5 }),
        expect.objectContaining({ tag: '低压力', weight: 3 }),
      ]),
    );
  });

  it('generalizes bad and positive feedback into target and tag weights', async () => {
    const repo = makeRepo({
      userId: 1,
      defaultMatchRadiusKm: 20,
      matchSignals: {},
    } as UserSocialProfile);
    const service = new SocialAgentPreferenceGeneralizationService(
      repo as never,
    );

    await service.recordFeedback(
      feedback('bad_fit', {
        candidateId: 8,
        metadata: { interestTags: ['竞技跑步'], city: '青岛' },
      }),
    );
    const result = await service.recordFeedback(
      feedback('save_candidate', {
        candidateId: 9,
        metadata: { interestTags: ['散步', '低压力'], city: '青岛' },
      }),
    );

    expect(result?.targetUserWeights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: 8, weight: -30 }),
        expect.objectContaining({ userId: 9, weight: 14 }),
      ]),
    );
    expect(result?.activityTagWeights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tag: '竞技跑步', weight: -2 }),
        expect.objectContaining({ tag: '散步', weight: 3 }),
      ]),
    );
  });
});
