import { MatchReasonerService } from './match-reasoner.service';
import { UserSocialProfile } from '../users/user-social-profile.entity';
import type { ConfigService } from '@nestjs/config';
import { SOCIAL_AGENT_QUALITY_TOOL_TIMEOUT_MS } from './social-agent-model-router.service';

function profile(over: Partial<UserSocialProfile> = {}): UserSocialProfile {
  return {
    userId: 1,
    nickname: 'Alex',
    gender: '',
    ageRange: '25-30',
    city: '北京',
    nearbyArea: '',
    mbti: 'INFJ',
    zodiac: '处女座',
    fitnessGoals: [],
    traits: ['温和', '理性'],
    socialStyle: '',
    communicationStyle: '',
    interestTags: ['爬山', '咖啡'],
    availableTimes: [],
    socialPreference: '',
    lifestyleTags: ['露营'],
    socialScenes: ['周末'],
    wantToMeet: [],
    preferredTraits: [],
    avoidTraits: [],
    relationshipGoals: [],
    openness: '',
    rejectRules: '',
    weekdayAvailability: '',
    weekendAvailability: '',
    privacyBoundary: '',
    profileDiscoverable: true,
    agentCanRecommendMe: true,
    agentCanStartChatAfterApproval: true,
    aiSummary: '',
    aiProfileCard: {},
    matchSignals: {},
    sensitiveTagDecisions: {},
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...over,
  } as UserSocialProfile;
}

describe('MatchReasonerService', () => {
  const reasoner = new MatchReasonerService();
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('does not downgrade match reasoning to the fast model when config is missing', () => {
    const model = (
      reasoner as unknown as {
        deepseekModel: () => string;
      }
    ).deepseekModel();

    expect(model).toBe('deepseek-v4-pro');
  });

  it('produces a structured explanation with all required fields', async () => {
    const out = await reasoner.explain({
      ownerProfile: profile({ userId: 1, nickname: '我' }),
      candidateProfile: profile({ userId: 2, nickname: 'Lee' }),
      publicTags: {
        owner: ['爬山', '咖啡'],
        candidate: ['爬山', '骑行'],
        shared: ['爬山'],
      },
      privatePreferenceSignals: ['想认识事业型朋友'],
      avoidSignals: ['频繁酒局'],
      scoreBreakdown: {
        score: 72,
        cityMatch: true,
        mbtiMatch: true,
        traitOverlap: ['理性'],
      },
    });

    expect(out.publicReason).toMatch(/爬山/);
    expect(out.sharedPoints.length).toBeGreaterThan(0);
    expect(out.suggestedOpener).toMatch(/Lee/);
    expect(out.riskWarnings.length).toBeGreaterThan(0);
    expect(out.requiresUserConfirmation).toBe(true);
    expect(out.confidence).toBeGreaterThan(0);
    expect(out.confidence).toBeLessThanOrEqual(1);
    expect(out.source).toBe('fallback');
    expect(out.fallbackReason).toBe('config_unavailable');
    expect(out.nextAction).toBeTruthy();
  });

  it('marks deterministic fallback reason when DeepSeek is not configured', async () => {
    const out = await new MatchReasonerService(makeConfig({})).explain({
      ownerProfile: profile({ userId: 1 }),
      candidateProfile: profile({ userId: 2 }),
      publicTags: { owner: ['散步'], candidate: ['散步'], shared: ['散步'] },
      scoreBreakdown: { score: 60 },
    });

    expect(out.source).toBe('fallback');
    expect(out.fallbackReason).toBe('DEEPSEEK_API_KEY missing');
    expect(out.degraded).toBeUndefined();
  });

  it('marks deterministic fallback reason when match reasoner LLM is disabled', async () => {
    global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;
    const out = await new MatchReasonerService(
      makeConfig({
        DEEPSEEK_API_KEY: 'test-key',
        ENABLE_MATCH_REASONER_LLM: 'false',
      }),
    ).explain({
      ownerProfile: profile({ userId: 1 }),
      candidateProfile: profile({ userId: 2 }),
      publicTags: { owner: ['散步'], candidate: ['散步'], shared: ['散步'] },
      scoreBreakdown: { score: 60 },
    });

    expect(out.source).toBe('fallback');
    expect(out.fallbackReason).toBe('match_reasoner_llm_disabled');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('reframes wealth/resource preferences without value judgments', async () => {
    const out = await reasoner.explain({
      ownerProfile: profile({ userId: 1 }),
      candidateProfile: profile({ userId: 2 }),
      privatePreferenceSignals: ['事业型', '商业交流'],
      confirmedSensitiveTags: ['高消费生活方式'],
      scoreBreakdown: { score: 60 },
    });
    expect(out.privateReason).toMatch(/创业|商业|生活方式/);
    expect(out.privateReason).not.toMatch(/因为对方有钱/);
    expect(out.publicReason).not.toMatch(/因为.{0,10}有钱/);
  });

  it('redacts contact info, exact amounts and identity-bearing fields', () => {
    const sanitized = reasoner.sanitizeText(
      '加微信13800001111 邮箱abc@x.com 月薪 30000元 单位是字节跳动 住北京海淀区中关村大街1号',
    );
    expect(sanitized).not.toMatch(/13800001111/);
    expect(sanitized).not.toMatch(/abc@x\.com/);
    expect(sanitized).not.toMatch(/30000/);
    expect(sanitized).not.toMatch(/字节跳动/);
    expect(sanitized).not.toMatch(/中关村大街1号/);
    // labels are kept but the leaky value is replaced
    expect(sanitized).toMatch(/微信已隐藏/);
    expect(sanitized).toMatch(/单位已隐藏/);
  });

  it('warns when data is thin (low score → suggest 先线上了解)', async () => {
    const out = await reasoner.explain({
      ownerProfile: profile({ userId: 1, interestTags: [] }),
      candidateProfile: profile({ userId: 2, interestTags: [] }),
      publicTags: { owner: [], candidate: [], shared: [] },
      scoreBreakdown: { score: 30 },
    });
    expect(
      [out.publicReason, out.nextAction, ...out.riskWarnings].join(' '),
    ).toMatch(/资料|线上|了解/);
  });

  it('every output text passes the redaction guard', async () => {
    const out = await reasoner.explain({
      ownerProfile: profile({
        userId: 1,
        privacyBoundary: '不交换电话13800001111',
      }),
      candidateProfile: profile({
        userId: 2,
        aiSummary: '联系：手机号13900002222',
      }),
      scoreBreakdown: { score: 65, cityMatch: true },
    });
    const blob = [
      out.publicReason,
      out.privateReason,
      out.suggestedOpener,
      out.nextAction,
      ...out.sharedPoints,
      ...out.complementaryPoints,
      ...out.riskWarnings,
    ].join(' ');
    expect(blob).not.toMatch(/13800001111|13900002222/);
  });

  it('uses the quality chat model for DeepSeek match explanations by default', async () => {
    const config = makeConfig({
      DEEPSEEK_API_KEY: 'test-key',
      DEEPSEEK_BASE_URL: 'https://deepseek.test',
      DEEPSEEK_CHAT_MODEL: 'deepseek-v4-pro',
      DEEPSEEK_FAST_MODEL: 'deepseek-v4-flash',
    });
    const captured: { requestBody: Record<string, unknown> | null } = {
      requestBody: null,
    };
    global.fetch = jest.fn((_url, init: RequestInit = {}) => {
      const body = typeof init.body === 'string' ? init.body : '{}';
      captured.requestBody = JSON.parse(body) as Record<string, unknown>;
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    publicReason: '你们都喜欢轻松散步，适合先线上聊聊。',
                    privateReason: '公开兴趣重合，线下邀约前需要确认。',
                    sharedPoints: ['都关注散步'],
                    complementaryPoints: ['节奏接近'],
                    riskWarnings: ['线下见面前请确认公共地点'],
                    suggestedOpener: '你好，看到你也喜欢散步，要不要先聊聊？',
                    nextAction: '先生成开场白，再由用户确认是否发送邀请。',
                    requiresUserConfirmation: true,
                    confidence: 0.72,
                  }),
                },
              },
            ],
          }),
      } as Response);
    }) as jest.MockedFunction<typeof fetch>;

    const out = await new MatchReasonerService(config).explain({
      ownerProfile: profile({ userId: 1 }),
      candidateProfile: profile({ userId: 2 }),
      publicTags: {
        owner: ['散步'],
        candidate: ['散步'],
        shared: ['散步'],
      },
      scoreBreakdown: { score: 70, cityMatch: true },
    });

    expect(captured.requestBody?.model).toBe('deepseek-v4-pro');
    expect(out.source).toBe('deepseek');
    expect(out.requiresUserConfirmation).toBe(true);
  });

  it('uses the shared DeepSeek client for match explanations when available', async () => {
    const config = makeConfig({
      DEEPSEEK_API_KEY: 'test-key',
    });
    global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;
    const deepSeek = {
      complete: jest.fn().mockResolvedValue(
        JSON.stringify({
          publicReason: '你们都喜欢公开场所散步，适合先轻松聊聊。',
          privateReason: '公开兴趣和时间偏好重合，发送邀请前需要确认。',
          sharedPoints: ['散步', '公共场所'],
          complementaryPoints: ['节奏接近'],
          riskWarnings: ['线下见面前请确认公共地点'],
          suggestedOpener: '你好，看到你也喜欢散步，要不要先聊聊？',
          nextAction: '由用户确认后再发送邀请。',
          requiresUserConfirmation: true,
          confidence: 0.8,
        }),
      ),
    };
    const signal = new AbortController().signal;

    const out = await new MatchReasonerService(
      config,
      undefined,
      undefined,
      deepSeek as never,
    ).explain({
      taskId: 123,
      traceId: 'trace_match_reasoner',
      signal,
      ownerProfile: profile({ userId: 1 }),
      candidateProfile: profile({ userId: 2 }),
      publicTags: {
        owner: ['散步'],
        candidate: ['散步'],
        shared: ['散步'],
      },
      scoreBreakdown: { score: 70, cityMatch: true },
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(deepSeek.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        useCase: 'candidate_summary',
        taskId: 123,
        intent: 'match_reasoner',
        fallbackTemperature: 0.5,
        responseFormat: { type: 'json_object' },
        retryAttempts: 1,
        traceId: 'trace_match_reasoner',
        signal,
      }),
    );
    expect(deepSeek.complete.mock.calls[0][0].messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'system' }),
        expect.objectContaining({ role: 'user' }),
      ]),
    );
    expect(out.source).toBe('deepseek');
    expect(out.publicReason).toContain('公开场所散步');
  });

  it('uses the shared DeepSeek client for second-pass match scoring when available', async () => {
    const config = makeConfig({
      DEEPSEEK_API_KEY: 'test-key',
    });
    global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;
    const deepSeek = {
      complete: jest.fn().mockResolvedValue(
        JSON.stringify({
          score: 76,
          confidence: 0.84,
          publicReason: '共同兴趣明确，可以作为低压力候选。',
          privateReason: '二次评分确认安全摘要足够。',
          riskWarnings: ['邀请前仍需用户确认'],
        }),
      ),
    };
    const signal = new AbortController().signal;

    const out = await new MatchReasonerService(
      config,
      undefined,
      undefined,
      deepSeek as never,
    ).adjustScore(
      {
        taskId: 456,
        traceId: 'trace_match_score',
        signal,
        ownerProfile: profile({ userId: 1 }),
        candidateProfile: profile({ userId: 2 }),
        publicTags: {
          owner: ['散步'],
          candidate: ['散步'],
          shared: ['散步'],
        },
        scoreBreakdown: { score: 70, cityMatch: true },
      },
      70,
    );

    expect(global.fetch).not.toHaveBeenCalled();
    expect(deepSeek.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        useCase: 'candidate_summary',
        taskId: 456,
        intent: 'match_reasoner_score',
        fallbackTemperature: 0.25,
        responseFormat: { type: 'json_object' },
        retryAttempts: 1,
        traceId: 'trace_match_score',
        signal,
      }),
    );
    expect(out.source).toBe('deepseek');
    expect(out.score).toBe(76);
    expect(out.publicReason).toContain('共同兴趣明确');
  });

  it('does not convert client cancellations into fallback match explanations', async () => {
    const config = makeConfig({
      DEEPSEEK_API_KEY: 'test-key',
    });
    const deepSeek = {
      complete: jest.fn().mockRejectedValue(new Error('client_aborted')),
    };

    await expect(
      new MatchReasonerService(
        config,
        undefined,
        undefined,
        deepSeek as never,
      ).explain({
        taskId: 789,
        traceId: 'trace_match_cancel',
        signal: new AbortController().signal,
        ownerProfile: profile({ userId: 1 }),
        candidateProfile: profile({ userId: 2 }),
        publicTags: {
          owner: ['散步'],
          candidate: ['散步'],
          shared: ['散步'],
        },
        scoreBreakdown: { score: 70, cityMatch: true },
      }),
    ).rejects.toThrow('client_aborted');
  });

  it('does not convert client cancellations into fallback match scoring', async () => {
    const config = makeConfig({
      DEEPSEEK_API_KEY: 'test-key',
    });
    const deepSeek = {
      complete: jest.fn().mockRejectedValue(new Error('client_aborted')),
    };

    await expect(
      new MatchReasonerService(
        config,
        undefined,
        undefined,
        deepSeek as never,
      ).adjustScore(
        {
          taskId: 790,
          traceId: 'trace_match_score_cancel',
          signal: new AbortController().signal,
          ownerProfile: profile({ userId: 1 }),
          candidateProfile: profile({ userId: 2 }),
          publicTags: {
            owner: ['散步'],
            candidate: ['散步'],
            shared: ['散步'],
          },
          scoreBreakdown: { score: 70, cityMatch: true },
        },
        70,
      ),
    ).rejects.toThrow('client_aborted');
  });

  it('marks model-failure explanation fallback as degraded and retryable', async () => {
    const config = makeConfig({
      DEEPSEEK_API_KEY: 'test-key',
    });
    const deepSeek = {
      complete: jest.fn().mockRejectedValue(new Error('upstream overloaded')),
    };

    const out = await new MatchReasonerService(
      config,
      undefined,
      undefined,
      deepSeek as never,
    ).explain({
      taskId: 791,
      traceId: 'trace_match_reason_degraded',
      ownerProfile: profile({ userId: 1 }),
      candidateProfile: profile({ userId: 2 }),
      publicTags: {
        owner: ['散步'],
        candidate: ['散步'],
        shared: ['散步'],
      },
      matchSignals: { confidence: 0.95 },
      scoreBreakdown: { score: 88, cityMatch: true },
    });

    expect(out.source).toBe('fallback');
    expect(out.fallbackReason).toBe('upstream overloaded');
    expect(out.degraded).toBe(true);
    expect(out.retryable).toBe(true);
    expect(out.confidence).toBeLessThanOrEqual(0.48);
    expect(out.riskWarnings.join(' ')).toMatch(/智能推荐解释暂时不可用/);
    expect(out.nextAction).toMatch(/重试智能解释/);
    expect(out.requiresUserConfirmation).toBe(true);
  });

  it('marks model-failure score fallback as degraded and retryable', async () => {
    const config = makeConfig({
      DEEPSEEK_API_KEY: 'test-key',
    });
    const deepSeek = {
      complete: jest.fn().mockRejectedValue(new Error('upstream overloaded')),
    };

    const out = await new MatchReasonerService(
      config,
      undefined,
      undefined,
      deepSeek as never,
    ).adjustScore(
      {
        taskId: 792,
        traceId: 'trace_match_score_degraded',
        ownerProfile: profile({ userId: 1 }),
        candidateProfile: profile({ userId: 2 }),
        publicTags: {
          owner: ['散步'],
          candidate: ['散步'],
          shared: ['散步'],
        },
        matchSignals: { confidence: 0.95 },
        scoreBreakdown: { score: 88, cityMatch: true },
      },
      88,
    );

    expect(out.source).toBe('fallback');
    expect(out.fallbackReason).toBe('upstream overloaded');
    expect(out.degraded).toBe(true);
    expect(out.retryable).toBe(true);
    expect(out.confidence).toBeLessThanOrEqual(0.45);
    expect(out.publicReason).toMatch(/智能二次评分暂时不可用/);
    expect(out.riskWarnings.join(' ')).toMatch(/再次确认候选资料/);
  });

  it('retries transient DeepSeek match failures before deterministic fallback', async () => {
    const config = makeConfig({
      DEEPSEEK_API_KEY: 'test-key',
      DEEPSEEK_BASE_URL: 'https://deepseek.test',
      DEEPSEEK_CHAT_MODEL: 'deepseek-v4-pro',
      SOCIAL_AGENT_DEEPSEEK_RETRY_ATTEMPTS: '2',
    });
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    publicReason: '你们都喜欢低强度散步，适合先轻松聊聊。',
                    privateReason:
                      '同城且兴趣重合，资料公开范围足够做低风险推荐。',
                    sharedPoints: ['散步'],
                    complementaryPoints: ['都偏低压力社交'],
                    riskWarnings: ['先线上确认时间和公共地点'],
                    suggestedOpener: '你好，看到你也喜欢散步，想轻松聊聊吗？',
                    nextAction: '先保存候选，再确认是否发邀请。',
                    requiresUserConfirmation: true,
                    confidence: 0.82,
                  }),
                },
              },
            ],
          }),
      }) as jest.MockedFunction<typeof fetch>;

    const out = await new MatchReasonerService(config).explain({
      ownerProfile: profile({ userId: 1 }),
      candidateProfile: profile({ userId: 2 }),
      publicTags: {
        owner: ['散步'],
        candidate: ['散步'],
        shared: ['散步'],
      },
      scoreBreakdown: { score: 70, cityMatch: true },
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(out.source).toBe('deepseek');
    expect(out.publicReason).toContain('低强度散步');
  });

  it('does not let stale shared timeout env make match reasoning degrade early', async () => {
    jest.useFakeTimers();
    const config = makeConfig({
      DEEPSEEK_API_KEY: 'test-key',
      DEEPSEEK_BASE_URL: 'https://deepseek.test',
      DEEPSEEK_TIMEOUT_MS: '2500',
      DEEPSEEK_CHAT_MODEL: 'deepseek-v4-pro',
      MATCH_REASONER_RETRY_ATTEMPTS: '1',
    });
    const fetchPromise = new Promise<Response>((_resolve, reject) => {
      global.fetch = jest.fn((_url, init: RequestInit = {}) => {
        init.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
        return fetchPromise;
      }) as jest.MockedFunction<typeof fetch>;
    });

    let settled = false;
    const resultPromise = new MatchReasonerService(config)
      .explain({
        ownerProfile: profile({ userId: 1 }),
        candidateProfile: profile({ userId: 2 }),
        scoreBreakdown: { score: 70, cityMatch: true },
      })
      .then((result) => {
        settled = true;
        return result;
      });

    await jest.advanceTimersByTimeAsync(SOCIAL_AGENT_QUALITY_TOOL_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    const result = await resultPromise;
    expect(result.source).toBe('fallback');
    expect(settled).toBe(true);
  });
});

function makeConfig(env: Record<string, string | undefined>): ConfigService {
  return {
    get: jest.fn((key: string) => env[key]),
  } as unknown as ConfigService;
}
