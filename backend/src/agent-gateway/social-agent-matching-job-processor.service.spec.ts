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

    expect(harness.candidatePool.searchSocial).toHaveBeenCalledWith(
      expect.objectContaining({ persistCandidates: false }),
    );
    expect(harness.candidatePool.persistCandidateRows).toHaveBeenCalledWith(
      301,
      [expect.objectContaining({ candidateUserId: 8 })],
      harness.manager,
    );
    expect(harness.candidateAudit.createSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        taskId: 101,
        socialRequestId: 301,
        publicIntentId: 'social_request_301',
        matchingJobId: 9001,
        snapshotType: 'matching_job_result',
        candidates: [expect.objectContaining({ candidateUserId: 8 })],
      }),
      harness.manager,
    );
    expect(harness.manager.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE "matching_jobs"'),
      expect.arrayContaining([
        MatchingJobStatus.CandidatesReady,
        1,
        expect.stringContaining('"candidateSnapshotId":501'),
      ]),
    );
    expect(harness.taskRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: AgentTaskStatus.AwaitingConfirmation,
        statusReason: 'matching_job_candidates_ready',
        result: expect.objectContaining({
          cards: expect.arrayContaining([
            expect.objectContaining({
              type: 'candidate_card',
              schemaType: 'social_match.candidate',
              data: expect.objectContaining({
                taskId: 101,
                targetUserId: 8,
                socialRequestId: 301,
              }),
              actions: expect.arrayContaining([
                expect.objectContaining({
                  schemaAction: 'candidate.generate_opener',
                  requiresConfirmation: false,
                }),
                expect.objectContaining({
                  schemaAction: 'opener.confirm_send',
                  requiresConfirmation: true,
                  payload: expect.objectContaining({
                    taskId: 101,
                    targetUserId: 8,
                    socialRequestId: 301,
                    approvalRequired: true,
                    checkpointRequired: true,
                    resumeMode: 'resume_after_approval',
                  }),
                }),
              ]),
            }),
          ]),
        }),
      }),
    );
    expect(harness.eventRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: AgentTaskEventActor.Agent,
        eventType: AgentTaskEventType.SocialAgentCandidatesReturned,
      }),
    );
    expect(harness.loopStateEvents.writeTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        task: { id: 101, ownerUserId: 7 },
        fromState: 'IDLE',
        toState: 'CANDIDATES_READY',
        workflowState: 'CANDIDATES_READY',
        publicLoopStage: 'candidates_ready',
        reason: 'candidates_returned',
        payload: expect.objectContaining({
          matchingJobId: 9001,
          publicIntentId: 'social_request_301',
          socialRequestId: 301,
          candidateCount: 1,
        }),
      }),
    );
    expect(harness.realtime.emitAgentEvent).toHaveBeenCalledWith(
      7,
      'agent:candidates',
      expect.objectContaining({
        taskId: 101,
        candidateCount: 1,
        candidateSnapshotId: 501,
        matchingJobStatus: MatchingJobStatus.CandidatesReady,
        publicLoopStage: 'candidates_recommended',
        candidates: expect.arrayContaining([
          expect.objectContaining({
            candidateUserId: 8,
            candidateSnapshotId: 501,
          }),
        ]),
      }),
    );
  });

  it('marks a completed search with zero candidates as no_candidates', async () => {
    const harness = makeHarness({ candidates: [] });

    await expect(harness.service.processClaimedJob(makeJob())).resolves.toBe(
      MatchingJobStatus.NoCandidates,
    );

    expect(harness.manager.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE "matching_jobs"'),
      expect.arrayContaining([MatchingJobStatus.NoCandidates, 0]),
    );
    expect(harness.taskRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: AgentTaskStatus.WaitingResult,
        statusReason: 'matching_job_no_candidates',
        result: expect.objectContaining({
          cards: expect.arrayContaining([
            expect.objectContaining({
              schemaType: 'social_match.no_candidates',
            }),
          ]),
          chatRun: expect.objectContaining({
            matchingFallback: expect.objectContaining({
              version: 'fitmeet.matching-fallback.v1',
            }),
          }),
        }),
      }),
    );
    expect(harness.loopStateEvents.writeTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        task: { id: 101, ownerUserId: 7 },
        fromState: 'IDLE',
        toState: 'NO_CANDIDATES',
        workflowState: 'NO_CANDIDATES',
        publicLoopStage: 'no_candidates',
        reason: 'candidates_returned',
        payload: expect.objectContaining({
          matchingJobId: 9001,
          publicIntentId: 'social_request_301',
          socialRequestId: 301,
          candidateCount: 0,
          noCandidatesFinal: false,
        }),
      }),
    );
    expect(harness.realtime.emitAgentEvent).toHaveBeenCalledWith(
      7,
      'agent:candidates',
      expect.objectContaining({
        taskId: 101,
        candidateCount: 0,
        publicLoopStage: 'no_candidates',
        cards: expect.arrayContaining([
          expect.objectContaining({
            schemaType: 'social_match.no_candidates',
          }),
        ]),
      }),
    );
  });

  it('marks a recovery child search with zero candidates as final no_candidates', async () => {
    const recoveryJob = {
      parentJobId: 44,
      recoveryStrategyId: 'expand_distance',
    };
    const harness = makeHarness({
      candidates: [],
      jobOverrides: recoveryJob,
    });

    await expect(
      harness.service.processClaimedJob(makeJob(recoveryJob)),
    ).resolves.toBe(MatchingJobStatus.NoCandidates);

    expect(harness.taskRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: AgentTaskStatus.WaitingResult,
        statusReason: 'matching_job_no_candidates_final',
        result: expect.objectContaining({
          chatRun: expect.objectContaining({
            noCandidatesFinal: true,
          }),
          cards: expect.arrayContaining([
            expect.objectContaining({
              schemaType: 'social_match.no_candidates',
              data: expect.objectContaining({
                recoveryFinal: true,
              }),
            }),
          ]),
        }),
      }),
    );
    expect(harness.realtime.emitAgentEvent).toHaveBeenCalledWith(
      7,
      'agent:candidates',
      expect.objectContaining({
        taskId: 101,
        candidateCount: 0,
        publicLoopStage: 'no_candidates_final',
      }),
    );
    expect(harness.loopStateEvents.writeTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        task: { id: 101, ownerUserId: 7 },
        fromState: 'IDLE',
        toState: 'NO_CANDIDATES_FINAL',
        workflowState: 'NO_CANDIDATES_FINAL',
        publicLoopStage: 'no_candidates_final',
        reason: 'candidates_returned',
        payload: expect.objectContaining({
          matchingJobId: 9001,
          candidateCount: 0,
          noCandidatesFinal: true,
        }),
      }),
    );
  });

  it('does not fail a completed matching job when loop transition event write fails', async () => {
    const harness = makeHarness({
      candidates: [makeCandidate()],
      loopTransitionError: new Error('loop_transition_write_failed'),
    });

    await expect(harness.service.processClaimedJob(makeJob())).resolves.toBe(
      MatchingJobStatus.CandidatesReady,
    );

    expect(harness.loopStateEvents.writeTransition).toHaveBeenCalled();
    expect(harness.manager.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE "matching_jobs"'),
      expect.arrayContaining([MatchingJobStatus.CandidatesReady, 1]),
    );
    expect(harness.matchingJobs.markFailed).not.toHaveBeenCalled();
  });

  it('does not mark the job completed when task/event writeback fails', async () => {
    const harness = makeHarness({
      candidates: [makeCandidate()],
      eventSaveError: new Error('event_write_failed'),
    });

    await expect(harness.service.processClaimedJob(makeJob())).resolves.toBe(
      MatchingJobStatus.FailedRetryable,
    );

    expect(harness.manager.query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE "matching_jobs"'),
      expect.arrayContaining([MatchingJobStatus.CandidatesReady]),
    );
    expect(harness.matchingJobs.markFailed).toHaveBeenCalledWith(
      9001,
      expect.any(Error),
      true,
      'worker-a',
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

it('uses candidate search index hints before running the candidate pool', async () => {
  const harness = makeHarness({
    candidates: [makeCandidate()],
    indexRows: [
      {
        userId: 8,
        publicIntentId: 'public_candidate_8',
      },
    ],
  });

  await expect(harness.service.processClaimedJob(makeJob())).resolves.toBe(
    MatchingJobStatus.CandidatesReady,
  );

  expect(
    harness.candidateSearchIndex.upsertFromPublicIntent,
  ).toHaveBeenCalledWith('social_request_301');
  expect(harness.candidateSearchIndex.search).toHaveBeenCalledWith(
    expect.objectContaining({
      ownerUserId: 7,
      city: '青岛',
      limit: 80,
    }),
  );
  expect(harness.candidatePool.searchSocial).toHaveBeenCalledWith(
    expect.objectContaining({
      candidateUserIds: [8],
      publicIntentIds: ['public_candidate_8'],
    }),
  );
  expect(harness.manager.query).toHaveBeenCalledWith(
    expect.stringContaining('UPDATE "matching_jobs"'),
    expect.arrayContaining([
      MatchingJobStatus.CandidatesReady,
      1,
      expect.stringContaining('"candidateSearchIndex"'),
    ]),
  );
});

it('syncs the candidate search index and retries when the first search is empty', async () => {
  const harness = makeHarness({
    candidates: [makeCandidate()],
    indexSearchResults: [
      [],
      [
        {
          userId: 8,
          publicIntentId: 'public_candidate_8',
        },
      ],
    ],
  });

  await expect(harness.service.processClaimedJob(makeJob())).resolves.toBe(
    MatchingJobStatus.CandidatesReady,
  );

  expect(harness.candidateSearchIndex.search).toHaveBeenCalledTimes(2);
  expect(harness.candidateSearchIndex.syncActiveProfiles).toHaveBeenCalledWith({
    limit: 500,
  });
  expect(
    harness.candidateSearchIndex.syncActivePublicIntents,
  ).toHaveBeenCalledWith({ limit: 500 });
  expect(harness.candidatePool.searchSocial).toHaveBeenCalledWith(
    expect.objectContaining({
      candidateUserIds: [8],
      publicIntentIds: ['public_candidate_8'],
    }),
  );
});

function makeHarness(
  options: {
    candidates?: unknown[];
    publicIntent?: Record<string, unknown>;
    eventSaveError?: Error;
    loopTransitionError?: Error;
    indexRows?: Array<{
      userId?: number | null;
      publicIntentId?: string | null;
    }>;
    indexSearchResults?: Array<
      Array<{
        userId?: number | null;
        publicIntentId?: string | null;
      }>
    >;
    jobOverrides?: Record<string, unknown>;
  } = {},
) {
  const publicIntent = options.publicIntent ?? makePublicIntent();
  const matchingJobs = {
    extendLease: jest.fn(async () => makeJob()),
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
    persistCandidateRows: jest.fn(async () => undefined),
  };
  const indexSearchResults = [...(options.indexSearchResults ?? [])];
  const candidateSearchIndex = {
    upsertFromPublicIntent: jest.fn(async () => undefined),
    syncActiveProfiles: jest.fn(async () => ({
      scanned: 0,
      active: 0,
      inactive: 0,
      failed: 0,
    })),
    syncActivePublicIntents: jest.fn(async () => ({
      scanned: 0,
      active: 0,
      inactive: 0,
      failed: 0,
    })),
    search: jest.fn(async () =>
      indexSearchResults.length > 0
        ? (indexSearchResults.shift() ?? [])
        : (options.indexRows ?? []),
    ),
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
    manager: {} as Record<string, unknown>,
  };
  const eventRepo = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => {
      if (options.eventSaveError) throw options.eventSaveError;
      return value;
    }),
  };
  const realtime = { emitAgentEvent: jest.fn() };
  const loopStateEvents = {
    writeTransition: jest.fn(async () => {
      if (options.loopTransitionError) throw options.loopTransitionError;
    }),
  };
  const relaxation = {
    buildFallback: jest.fn(async () => ({
      version: 'fitmeet.matching-fallback.v1',
      generatedAt: new Date().toISOString(),
      originalConstraints: {
        city: '青岛',
        activityType: 'badminton',
        timePreference: '周末下午',
        radiusKm: 5,
      },
      strategies: [
        {
          id: 'expand_distance',
          label: '扩大距离',
          changedConstraints: { radiusKm: 15 },
          candidateCount: 2,
          previewText: '扩大到 15km 后可能有 2 个候选。',
          action: 'matching.relax_distance',
        },
        {
          id: 'expand_time',
          label: '放宽时间',
          changedConstraints: { timePreference: '整个周末' },
          candidateCount: 1,
          previewText: '放宽时间后可能有 1 个候选。',
          action: 'matching.relax_time',
        },
        {
          id: 'relax_tags',
          label: '减少偏好限制',
          changedConstraints: { interestTags: ['羽毛球'] },
          candidateCount: 0,
          previewText: '减少偏好限制后重新试。',
          action: 'matching.relax_tags',
        },
      ],
      recommendedStrategyId: 'expand_distance',
    })),
  };
  const candidateAudit = {
    createSnapshot: jest.fn(async () => ({
      id: 501,
      candidateCount: options.candidates?.length ?? 0,
    })),
  };
  const publicIntentSave = jest.fn(async (value) => value);
  const manager = {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      if (/SELECT pg_advisory_xact_lock/.test(sql)) return [];
      if (/FROM "matching_jobs"/.test(sql) && /FOR UPDATE/.test(sql)) {
        return [makeJob(options.jobOverrides)];
      }
      if (/UPDATE "matching_jobs"/.test(sql)) {
        return [
          {
            ...makeJob(options.jobOverrides),
            status: params?.[0] as MatchingJobStatus,
            candidateCount: params?.[1] as number,
            result:
              typeof params?.[2] === 'string' ? JSON.parse(params[2]) : {},
            completedAt: params?.[3] as Date,
            leaseOwner: null,
            leaseExpiresAt: null,
            lastHeartbeatAt: null,
          },
        ];
      }
      return [];
    }),
    getRepository: jest.fn((entity: unknown) => {
      const name = (entity as { name?: string }).name;
      if (name === 'PublicSocialIntent') {
        return {
          save: publicIntentSave,
          createQueryBuilder: jest.fn(() => queryBuilder(publicIntent)),
        };
      }
      if (name === 'UserSocialRequest') {
        return {
          createQueryBuilder: jest.fn(() => queryBuilder(makeSocialRequest())),
        };
      }
      if (name === 'AgentTask') {
        return {
          save: taskRepo.save,
          createQueryBuilder: jest.fn(() => queryBuilder(task)),
        };
      }
      if (name === 'AgentTaskEvent') {
        return eventRepo;
      }
      if (name === 'SocialCandidateSnapshot') {
        return {
          create: jest.fn((value) => value),
          save: jest.fn(async (value) => ({ ...value, id: 501 })),
        };
      }
      return {};
    }),
  };
  taskRepo.manager = {
    transaction: jest.fn(async (run: (manager: unknown) => Promise<unknown>) =>
      run(manager),
    ),
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
      candidateSearchIndex as never,
      realtime as never,
      relaxation as never,
      candidateAudit as never,
      undefined as never,
      loopStateEvents as never,
    ),
    candidateSearchIndex,
    candidateAudit,
    manager,
    taskRepo,
    realtime,
    relaxation,
    loopStateEvents,
  };
}

function queryBuilder(result: unknown) {
  return {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn(async () => result),
  };
}

function makeSocialRequest() {
  return {
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
  };
}

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 9001,
    publicIntentId: 'social_request_301',
    ownerUserId: 7,
    linkedSocialRequestId: 301,
    parentJobId: null,
    recoveryStrategyId: null,
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
    ...overrides,
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
