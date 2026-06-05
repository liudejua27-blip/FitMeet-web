import { Repository } from 'typeorm';
import { ActivitiesService } from './activities.service';
import {
  ActivityProofPolicy,
  ActivitySafetyLevel,
  ActivityTemplate,
  ActivityType,
} from './entities/activity-template.entity';
import { ActivityProof } from './entities/activity-proof.entity';
import {
  SocialActivity,
  SocialActivityStatus,
} from './entities/activity.entity';
import { AIService } from '../ai/ai.service';
import { PublicSocialIntent } from '../agent-gateway/entities/public-social-intent.entity';
import { LifeGraphBehaviorEventType } from '../life-graph/life-graph.enums';
import { LifeGraphService } from '../life-graph/life-graph.service';
import { MeetsService } from '../meets/meets.service';
import { ModerationService } from '../moderation/moderation.service';
import { RealtimeEventService } from '../realtime/realtime-event.service';
import { UserSocialRequest } from '../social-requests/social-request.entity';
import { User } from '../users/user.entity';

type MockRepo<T extends object> = Pick<
  Repository<T>,
  'create' | 'find' | 'findOne' | 'query' | 'save' | 'update'
>;

function repo<T extends object>(): jest.Mocked<MockRepo<T>> {
  return {
    create: jest.fn((value: unknown) => value as T),
    find: jest.fn(() => Promise.resolve([])),
    findOne: jest.fn(() => Promise.resolve(null)),
    query: jest.fn(() => Promise.resolve(undefined)),
    save: jest.fn((value: unknown) => Promise.resolve(value as T)),
    update: jest.fn(() =>
      Promise.resolve({ affected: 0, raw: [], generatedMaps: [] }),
    ),
  };
}

const now = new Date('2026-06-06T07:00:00.000Z');

function buildActivity(patch: Partial<SocialActivity> = {}): SocialActivity {
  return {
    id: 42,
    creator: {} as User,
    creatorId: 1,
    participantIds: [1, 2],
    socialRequestId: null,
    meetId: null,
    matchedCandidateId: null,
    type: ActivityType.Running,
    title: '周末慢跑',
    description: '',
    locationName: '青岛大学操场',
    city: '青岛',
    lat: null,
    lng: null,
    startTime: now,
    endTime: new Date(now.getTime() + 45 * 60_000),
    status: SocialActivityStatus.Confirmed,
    icebreakerTasks: [],
    safetyTips: [],
    proofRequired: false,
    proofPolicy: ActivityProofPolicy.MutualConfirm,
    safetyLevel: ActivitySafetyLevel.Low,
    checkinByUserId: {},
    confirmByUserId: {
      '1': '2026-06-06T06:50:00.000Z',
      '2': '2026-06-06T06:51:00.000Z',
    },
    reviewByUserId: {},
    recap: null,
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}

describe('ActivitiesService Life Graph behavior events', () => {
  let activityRepo: jest.Mocked<MockRepo<SocialActivity>>;
  let proofRepo: jest.Mocked<MockRepo<ActivityProof>>;
  let userRepo: jest.Mocked<MockRepo<User>>;
  let service: ActivitiesService;
  let lifeGraph: jest.Mocked<Pick<LifeGraphService, 'recordBehaviorEvent'>>;

  beforeEach(() => {
    const templateRepo = repo<ActivityTemplate>();
    activityRepo = repo<SocialActivity>();
    proofRepo = repo<ActivityProof>();
    userRepo = repo<User>();
    const socialRequestRepo = repo<UserSocialRequest>();
    const publicIntentRepo = repo<PublicSocialIntent>();
    const moderation = {} as ModerationService;
    const meetsService = {
      markCompletedFromActivity: jest.fn(() => Promise.resolve(undefined)),
    } as unknown as MeetsService;
    const ai = {
      generateActivityReviewSummary: jest.fn(() =>
        Promise.resolve('这次活动已完成，整体节奏轻松。'),
      ),
    } as unknown as AIService;
    const realtime = {
      emitToUser: jest.fn(),
    } as unknown as RealtimeEventService;
    lifeGraph = {
      recordBehaviorEvent: jest.fn(() =>
        Promise.resolve({
          id: 1,
          userId: 1,
          eventType: LifeGraphBehaviorEventType.ActivityCompleted,
          source: 'activity_completed',
          taskId: null,
          activityId: 42,
          candidateUserId: null,
          metadata: {},
          naturalSummary: '你完成了一次周末慢跑活动。',
          weight: 1,
          createdAt: now.toISOString(),
        }),
      ),
    };

    service = new ActivitiesService(
      templateRepo as Repository<ActivityTemplate>,
      activityRepo as Repository<SocialActivity>,
      proofRepo as Repository<ActivityProof>,
      userRepo as Repository<User>,
      socialRequestRepo as Repository<UserSocialRequest>,
      publicIntentRepo as Repository<PublicSocialIntent>,
      moderation,
      meetsService,
      ai,
      realtime,
      lifeGraph as unknown as LifeGraphService,
    );
  });

  it('records completion events for all participants', async () => {
    const activity = buildActivity();
    activityRepo.findOne.mockResolvedValue(activity);
    activityRepo.save.mockImplementation((value) => Promise.resolve(value));

    await service.complete(activity.id, 1);

    expect(lifeGraph.recordBehaviorEvent).toHaveBeenCalledTimes(2);
    expect(lifeGraph.recordBehaviorEvent).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        activityId: activity.id,
        eventType: LifeGraphBehaviorEventType.ActivityCompleted,
        source: 'activity_completed',
      }),
    );
    expect(lifeGraph.recordBehaviorEvent).toHaveBeenCalledWith(
      2,
      expect.objectContaining({
        activityId: activity.id,
        eventType: LifeGraphBehaviorEventType.ActivityCompleted,
        source: 'activity_completed',
      }),
    );
    expect(userRepo.query).toHaveBeenCalledTimes(2);
    expect(userRepo.query).toHaveBeenCalledWith(
      expect.stringContaining('"trustScore" = "trustScore" + 2'),
      [1],
    );
    expect(userRepo.query).toHaveBeenCalledWith(
      expect.stringContaining('"socialTrustCount" = "socialTrustCount" + 1'),
      [2],
    );
  });

  it('records cancellation only for the actor who cancelled', async () => {
    const activity = buildActivity({ creatorId: 1 });
    activityRepo.findOne.mockResolvedValue(activity);
    activityRepo.save.mockImplementation((value) => Promise.resolve(value));

    await service.cancel(activity.id, 1);

    expect(lifeGraph.recordBehaviorEvent).toHaveBeenCalledTimes(1);
    expect(lifeGraph.recordBehaviorEvent).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        activityId: activity.id,
        eventType: LifeGraphBehaviorEventType.ActivityCancelled,
        source: 'activity_cancelled',
      }),
    );
  });

  it('records a positive review as reviewer preference feedback', async () => {
    const activity = buildActivity({ status: SocialActivityStatus.Completed });
    activityRepo.findOne.mockResolvedValue(activity);
    activityRepo.save.mockImplementation((value) => Promise.resolve(value));

    await service.review(activity.id, 1, 5, '对方很守时，节奏也舒服');

    expect(lifeGraph.recordBehaviorEvent).toHaveBeenCalledTimes(1);
    expect(lifeGraph.recordBehaviorEvent).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        activityId: activity.id,
        candidateUserId: 2,
        eventType: LifeGraphBehaviorEventType.ActivityReviewedPositive,
        source: 'activity_reviewed',
        metadata: expect.objectContaining({
          rating: 5,
          targetUserId: 2,
        }),
      }),
    );
    expect(userRepo.query).toHaveBeenCalledWith(
      expect.stringContaining('"trustScore" = "trustScore" + 1'),
      [2],
    );
  });

  it('records a negative review as reviewer preference feedback', async () => {
    const activity = buildActivity({ status: SocialActivityStatus.Completed });
    activityRepo.findOne.mockResolvedValue(activity);
    activityRepo.save.mockImplementation((value) => Promise.resolve(value));

    await service.review(activity.id, 1, 2, '时间不太合适');

    expect(lifeGraph.recordBehaviorEvent).toHaveBeenCalledTimes(1);
    expect(lifeGraph.recordBehaviorEvent).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        activityId: activity.id,
        candidateUserId: 2,
        eventType: LifeGraphBehaviorEventType.ActivityReviewedNegative,
        source: 'activity_reviewed',
      }),
    );
  });

  it('does not block completion when Life Graph recording fails', async () => {
    const activity = buildActivity();
    activityRepo.findOne.mockResolvedValue(activity);
    activityRepo.save.mockImplementation((value) => Promise.resolve(value));
    lifeGraph.recordBehaviorEvent.mockRejectedValueOnce(
      new Error('life graph unavailable'),
    );

    await expect(service.complete(activity.id, 1)).resolves.toMatchObject({
      id: activity.id,
      status: SocialActivityStatus.Completed,
    });
  });
});
