import {
  CandidateMatchLevel,
  CandidateRiskLevel,
  SocialRequestCandidate,
  SocialRequestCandidateStatus,
} from '../match/social-request-candidate.entity';
import { MatchingJob, MatchingJobStatus } from './entities/matching-job.entity';
import { SocialCandidateEvent } from './entities/social-candidate-event.entity';
import { SocialCandidateSnapshot } from './entities/social-candidate-snapshot.entity';
import { SocialAgentMatchHistoryService } from './social-agent-match-history.service';
import { UserSocialRequest } from '../social-requests/social-request.entity';

describe('SocialAgentMatchHistoryService', () => {
  it('aggregates candidate snapshots, candidate rows, events, and matching jobs', async () => {
    const snapshot = makeSnapshot({
      id: 11,
      ownerUserId: 7,
      taskId: 101,
      socialRequestId: 301,
      publicIntentId: 'social_request_301',
      matchingJobId: 9001,
      candidateCount: 1,
      constraints: { city: '青岛', time: '周末下午' },
      candidates: [
        {
          candidateUserId: 88,
          displayName: '慢跑搭子',
          commonTags: ['跑步'],
          whyYouMayLike: '你们都偏好低压力慢跑。',
        },
      ],
    });
    const event = makeEvent({
      id: 21,
      ownerUserId: 7,
      taskId: 101,
      snapshotId: 11,
      candidateUserId: 88,
      candidateRecordId: 501,
      eventType: 'candidate_saved',
      payload: { summary: '已收藏候选人' },
    });
    const candidate = makeCandidate({
      id: 501,
      socialRequestId: 301,
      candidateUserId: 88,
      status: SocialRequestCandidateStatus.Messaged,
      rankPosition: 1,
      publicIntentId: 'social_request_301',
      reasons: ['同城', '时间一致'],
      commonTags: ['跑步', '低压力'],
      userAction: 'message_sent',
      explanation: { whyYouMayLike: '都喜欢周末慢跑。' },
    });
    const job = makeJob({
      id: 9001,
      status: MatchingJobStatus.CandidatesReady,
    });
    const audit = {
      listRecentSnapshots: jest.fn().mockResolvedValue([snapshot]),
      listRecentEvents: jest.fn().mockResolvedValue([event]),
    };
    const candidateRepo = { find: jest.fn().mockResolvedValue([candidate]) };
    const matchingJobRepo = { find: jest.fn().mockResolvedValue([job]) };
    const socialRequestRepo = { find: jest.fn() };
    const service = new SocialAgentMatchHistoryService(
      audit as never,
      candidateRepo as never,
      matchingJobRepo as never,
      socialRequestRepo as never,
    );

    const result = await service.viewMatchHistory({
      ownerUserId: 7,
      taskId: 101,
      limit: 3,
    });

    expect(audit.listRecentSnapshots).toHaveBeenCalledWith({
      ownerUserId: 7,
      taskId: 101,
      limit: 3,
    });
    expect(audit.listRecentEvents).toHaveBeenCalledWith({
      ownerUserId: 7,
      taskId: 101,
      limit: 60,
    });
    expect(result).toMatchObject({
      source: 'candidate_snapshots',
      total: 1,
      matches: [
        {
          snapshotId: 11,
          taskId: 101,
          socialRequestId: 301,
          publicIntentId: 'social_request_301',
          matchingJobId: 9001,
          matchingJobStatus: MatchingJobStatus.CandidatesReady,
          candidateCount: 1,
          constraintsSummary: ['city: 青岛', 'time: 周末下午'],
          candidates: [
            {
              candidateUserId: 88,
              candidateRecordId: 501,
              status: SocialRequestCandidateStatus.Messaged,
              reasons: ['同城', '时间一致'],
              commonTags: ['跑步', '低压力'],
              whyYouMayLike: '都喜欢周末慢跑。',
              latestAction: 'message_sent',
            },
          ],
          recentEvents: [
            {
              id: 21,
              eventType: 'candidate_saved',
              candidateUserId: 88,
              candidateRecordId: 501,
              summary: '已收藏候选人',
            },
          ],
          feedbackSummary: {
            saved: 1,
            skipped: 0,
            openerPreviewed: 0,
            inviteSent: 0,
            connected: 0,
            activityCompleted: 0,
            reviewSubmitted: 0,
          },
        },
      ],
    });
  });

  it('falls back to recent candidate rows when no snapshots exist', async () => {
    const audit = {
      listRecentSnapshots: jest.fn().mockResolvedValue([]),
      listRecentEvents: jest.fn(),
    };
    const candidateRepo = {
      find: jest.fn().mockResolvedValue([
        makeCandidate({
          id: 501,
          socialRequestId: 301,
          candidateUserId: 88,
          publicIntentId: 'social_request_301',
          updatedAt: new Date('2026-06-01T00:00:00.000Z'),
        }),
      ]),
    };
    const socialRequestRepo = {
      find: jest.fn().mockResolvedValue([
        makeSocialRequest({
          id: 301,
          userId: 7,
          updatedAt: new Date('2026-06-02T00:00:00.000Z'),
        }),
      ]),
    };
    const service = new SocialAgentMatchHistoryService(
      audit as never,
      candidateRepo as never,
      { find: jest.fn() } as never,
      socialRequestRepo as never,
    );

    const result = await service.viewMatchHistory({
      ownerUserId: 7,
      limit: 100,
    });

    expect(socialRequestRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 7 },
        take: 150,
      }),
    );
    expect(candidateRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { socialRequestId: expect.any(Object) },
        take: 50,
      }),
    );
    expect(audit.listRecentEvents).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      source: 'candidate_rows',
      total: 1,
      matches: [
        {
          socialRequestId: 301,
          publicIntentId: 'social_request_301',
          candidateCount: 1,
          createdAt: '2026-06-01T00:00:00.000Z',
        },
      ],
    });
  });

  it('does not expose candidate rows when the owner has no social requests', async () => {
    const audit = {
      listRecentSnapshots: jest.fn().mockResolvedValue([]),
      listRecentEvents: jest.fn(),
    };
    const candidateRepo = { find: jest.fn() };
    const socialRequestRepo = { find: jest.fn().mockResolvedValue([]) };
    const service = new SocialAgentMatchHistoryService(
      audit as never,
      candidateRepo as never,
      { find: jest.fn() } as never,
      socialRequestRepo as never,
    );

    const result = await service.viewMatchHistory({
      ownerUserId: 7,
      limit: 5,
    });

    expect(candidateRepo.find).not.toHaveBeenCalled();
    expect(result).toEqual({
      matches: [],
      total: 0,
      source: 'candidate_rows',
    });
  });
});

function makeSnapshot(
  overrides: Partial<SocialCandidateSnapshot>,
): SocialCandidateSnapshot {
  return {
    id: 1,
    ownerUserId: 7,
    taskId: null,
    socialRequestId: null,
    publicIntentId: null,
    matchingJobId: null,
    snapshotType: 'matching_job_result',
    sourceVersion: 'source-v1',
    scoreVersion: 'score-v1',
    candidateCount: 0,
    query: {},
    constraints: {},
    candidates: [],
    debug: {},
    metadata: {},
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  } as SocialCandidateSnapshot;
}

function makeEvent(
  overrides: Partial<SocialCandidateEvent>,
): SocialCandidateEvent {
  return {
    id: 1,
    ownerUserId: 7,
    taskId: null,
    snapshotId: null,
    socialRequestId: null,
    publicIntentId: null,
    matchingJobId: null,
    candidateUserId: null,
    candidateRecordId: null,
    eventType: 'candidate_impression',
    idempotencyKey: null,
    source: 'agent',
    payload: {},
    metadata: {},
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  } as SocialCandidateEvent;
}

function makeCandidate(
  overrides: Partial<SocialRequestCandidate>,
): SocialRequestCandidate {
  return {
    id: 1,
    socialRequestId: 301,
    candidateUserId: 88,
    score: 87,
    level: CandidateMatchLevel.High,
    scoreBreakdown: {},
    sourceType: 'profile',
    sourceId: '',
    publicIntentId: null,
    activityId: null,
    rankPosition: null,
    scoreVersion: 'fitmeet_match_v1',
    explanation: {},
    relationshipState: {},
    exposureReason: '',
    userAction: '',
    userActionAt: null,
    reasons: [],
    commonTags: [],
    distanceKm: null,
    riskLevel: CandidateRiskLevel.Low,
    riskWarnings: [],
    suggestedMessage: '',
    status: SocialRequestCandidateStatus.Suggested,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  } as SocialRequestCandidate;
}

function makeJob(overrides: Partial<MatchingJob>): MatchingJob {
  return {
    id: 9001,
    publicIntentId: 'social_request_301',
    ownerUserId: 7,
    linkedSocialRequestId: 301,
    sourceVersion: 'source-v1',
    idempotencyKey: 'job-key',
    status: MatchingJobStatus.Queued,
    attemptCount: 0,
    candidateCount: 0,
    errorMessage: '',
    leaseOwner: null,
    leaseExpiresAt: null,
    lastHeartbeatAt: null,
    result: {},
    metadata: {},
    nextRunAt: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  } as MatchingJob;
}

function makeSocialRequest(
  overrides: Partial<UserSocialRequest>,
): UserSocialRequest {
  return {
    id: 301,
    userId: 7,
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  } as UserSocialRequest;
}
