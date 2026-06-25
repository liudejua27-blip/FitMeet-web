import {
  SocialRequestVisibility,
  UserSocialRequestStatus,
} from '../social-requests/social-request.entity';
import {
  AgentTaskEventActor,
  AgentTaskEventType,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { MatchingJobStatus } from './entities/matching-job.entity';
import {
  SocialRequestRiskLevel,
  SocialRequestStatus,
} from './entities/social-request.entity';
import { SocialAgentMatchingJobProcessorService } from './social-agent-matching-job-processor.service';

describe('SocialAgentMatchingJobProcessorService', () => {
  it('marks the job candidates_ready only when candidates exist', async () => {
    const harness = makeHarness({
      candidates: [makeCandidate()],
    });

    await expect(harness.service.processClaimedJob(makeJob())).resolves.toBe(
      MatchingJobStatus.CandidatesReady,
    );

    expect(harness.matchingJobs.markCompleted).toHaveBeenCalledWith(
      9001,
      1,
      expect.objectContaining({
        candidateCount: 1,
        publicIntentId: 'social_request_301',
        socialRequestId: 301,
      }),
      'worker-a',
    );
    expect(harness.taskRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: AgentTaskStatus.AwaitingConfirmation,
        statusReason: 'matching_job_candidates_ready',
      }),
    );
    expect(harness.eventRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: AgentTaskEventActor.Agent,
        eventType: AgentTaskEventType.SocialAgentCandidatesReturned,
      }),
    );
  });

  it('marks a completed search with zero candidates as no_candidates', async () => {
    const harness = makeHarness({ candidates: [] });

    await expect(harness.service.processClaimedJob(makeJob())).resolves.toBe(
      MatchingJobStatus.NoCandidates,
    );

    expect(harness.matchingJobs.markCompleted).toHaveBeenCalledWith(
      9001,
      0,
      expect.objectContaining({
        candidateCount: 0,
      }),
      'worker-a',
    );
    expect(harness.taskRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: AgentTaskStatus.WaitingResult,
        statusReason: 'matching_job_no_candidates',
      }),
    );
  });

  it('cancels the job when the public intent has been tombstoned', async () => {
    const harness = makeHarness({
      publicIntent: makePublicIntent({
        status: SocialRequestStatus.Inactive,
        metadata: { sourceVersion: 'source-v1', tombstoned: true },
      }),
    });

    await expect(harness.service.processClaimedJob(makeJob())).resolves.toBe(
      MatchingJobStatus.Cancelled,
    );

    expect(harness.candidatePool.searchSocial).not.toHaveBeenCalled();
    expect(harness.matchingJobs.cancelClaimed).toHaveBeenCalledWith(
      9001,
      'worker-a',
      'matching_job_public_intent_cancelled',
    );
  });
});

function makeHarness(
  options: {
    candidates?: unknown[];
    publicIntent?: Record<string, unknown>;
  } = {},
) {
  const publicIntent = options.publicIntent ?? makePublicIntent();
  const matchingJobs = {
    markCompleted: jest.fn(async (id, count) => ({
      ...makeJob(),
      id,
      status:
        count > 0
          ? MatchingJobStatus.CandidatesReady
          : MatchingJobStatus.NoCandidates,
      candidateCount: count,
    })),
    markFailed: jest.fn(async () => ({
      ...makeJob(),
      status: MatchingJobStatus.FailedRetryable,
    })),
    cancelClaimed: jest.fn(async () => ({
      ...makeJob(),
      status: MatchingJobStatus.Cancelled,
    })),
  };
  const candidatePool = {
    searchSocial: jest.fn(async () => ({
      ownerUserId: 7,
      query: {},
      candidates: options.candidates ?? [],
      emptyReason:
        options.candidates && options.candidates.length > 0
          ? null
          : 'no_real_candidates',
      message:
        options.candidates && options.candidates.length > 0
          ? '找到候选'
          : '暂无候选',
      debugReasons: null,
      debug: {},
    })),
  };
  const task = {
    id: 101,
    ownerUserId: 7,
    status: AgentTaskStatus.WaitingResult,
    result: {
      publishSocialRequest: {
        publicIntentId: 'social_request_301',
        socialRequestId: 301,
        sourceVersion: 'source-v1',
      },
    },
    memory: {},
  };
  const taskRepo = {
    findOne: jest.fn(async () => task),
    save: jest.fn(async (value) => value),
  };
  const eventRepo = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  };
  const publicIntentRepo = {
    findOne: jest.fn(async () => publicIntent),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () =>
        publicIntent.status === SocialRequestStatus.Inactive
          ? null
          : publicIntent,
      ),
    })),
  };
  const userSocialRequestRepo = {
    findOne: jest.fn(async () => ({
      id: 301,
      userId: 7,
      title: '青岛羽毛球',
      description: '周末下午公开场所',
      rawText: '周末下午找羽毛球搭子',
      city: '青岛',
      activityType: 'badminton',
      interestTags: ['羽毛球'],
      status: UserSocialRequestStatus.Matching,
      visibility: SocialRequestVisibility.Public,
      metadata: {},
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    })),
  };
  return {
    candidatePool,
    eventRepo,
    matchingJobs,
    publicIntentRepo,
    service: new SocialAgentMatchingJobProcessorService(
      matchingJobs as never,
      candidatePool as never,
      taskRepo as never,
      eventRepo as never,
      publicIntentRepo as never,
      userSocialRequestRepo as never,
    ),
    taskRepo,
  };
}

function makeJob() {
  return {
    id: 9001,
    publicIntentId: 'social_request_301',
    ownerUserId: 7,
    linkedSocialRequestId: 301,
    sourceVersion: 'source-v1',
    idempotencyKey: 'matching-job:social_request_301:source-v1',
    status: MatchingJobStatus.Running,
    attemptCount: 1,
    candidateCount: 0,
    errorMessage: '',
    leaseOwner: 'worker-a',
    leaseExpiresAt: new Date(Date.now() + 60_000),
    lastHeartbeatAt: new Date(),
    result: {},
    metadata: { taskId: 101 },
    nextRunAt: null,
    startedAt: new Date(),
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makePublicIntent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'social_request_301',
    userId: 7,
    linkedSocialRequestId: 301,
    source: 'publish_to_discover',
    mode: 'public',
    requestType: 'badminton',
    title: '青岛羽毛球',
    description: '周末下午公开场所',
    interestTags: ['羽毛球'],
    city: '青岛',
    loc: '五四广场',
    lat: null,
    lng: null,
    radiusKm: 5,
    timePreference: '周末下午',
    locationPreference: '公开场所',
    socialGoal: '找羽毛球搭子',
    riskLevel: SocialRequestRiskLevel.Low,
    requiresUserConfirmation: true,
    filters: {},
    candidateUserIds: [],
    matchedCount: 0,
    status: SocialRequestStatus.Searching,
    metadata: { sourceVersion: 'source-v1' },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeCandidate() {
  return {
    source: 'profile_candidate',
    isRealData: true,
    targetUserId: 8,
    candidateUserId: 8,
    userId: 8,
    publicIntentId: null,
    socialRequestId: 301,
    activityId: null,
    displayName: '候选用户',
    nickname: '候选用户',
    avatar: '',
    color: '#202124',
    city: '青岛',
    interestTags: ['羽毛球'],
    profileCompleteness: 80,
    dataQuality: 'complete',
    matchScore: 88,
    score: 88,
    level: 'high',
    matchReasons: ['都想打羽毛球'],
    reasons: ['都想打羽毛球'],
    riskWarnings: [],
    risk: { level: 'low', warnings: [] },
    suggestedOpener: '周末下午一起打羽毛球吗？',
    suggestedMessage: '周末下午一起打羽毛球吗？',
    commonTags: ['羽毛球'],
    distanceKm: null,
    matchedSignals: [],
    publicReason: '兴趣一致',
    privateReason: '兴趣一致',
    riskWarning: '',
    nextAction: '确认后发送开场白',
    recommendationConsent: {
      profileDiscoverable: true,
      agentCanRecommendMe: true,
      sourceLabel: '公开资料',
      privacyLabel: '公开',
      strangerPolicyLabel: '可推荐',
    },
    relationshipGoal: null,
    idealType: null,
    invitePolicy: 'confirm_first',
    coldStartSignals: [],
    whyYouMayLike: '兴趣一致',
    whyNow: '时间匹配',
    matchPoints: ['羽毛球'],
    boundaryNotes: [],
    openerStrategy: '轻量开场',
    dynamicSignalReasons: [],
    preferenceHistorySignals: [],
    continuousFilterHints: [],
    candidateExplanation: {
      fitReasons: ['兴趣一致'],
      suggestedOpener: '周末下午一起打羽毛球吗？',
      awkwardPoints: [],
      safeFirstStep: '公开场所见面',
      nextActionSuggestion: '确认后发送轻量开场',
      requiresConfirmation: true,
    },
    emotionalInsight: {
      fitReason: '兴趣一致',
      openerAdvice: '轻量开场',
      possibleAwkwardness: '',
      safeFirstStep: '公开场所见面',
    },
    updatedAt: new Date().toISOString(),
  };
}
