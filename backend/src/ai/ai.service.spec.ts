import { ConfigService } from '@nestjs/config';
import { AIService } from './ai.service';

describe('AIService profile builder fallback', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('keeps sensitive wealth tags private in match signals', async () => {
    const config = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;
    const service = new AIService(config);

    const card = await service.generateProfileBuilderCard({
      answers: [
        {
          question: 'What kind of person do you want to meet?',
          answer:
            'I want to meet someone rich, entrepreneurial, and into running.',
        },
      ],
      source: 'test',
    });

    expect(card.matchSignals.publicTags).not.toContain('rich');
    expect(card.matchSignals.sensitivePrivateTags).toContain('rich');
    expect(card.matchSignals.matchKeywords).toContain('rich');
  });

  it('returns polished Chinese candidate content without DeepSeek', async () => {
    const config = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;
    const service = new AIService(config);

    const content = await service.generateCandidateMatchContent({
      request: {
        title: '今晚青岛轻松跑步',
        city: '青岛',
        activityType: '跑步',
        interestTags: ['跑步', '低压力'],
      },
      candidate: {
        nickname: '小林',
        city: '青岛',
        commonTags: ['跑步', '低压力'],
        distanceKm: 2.4,
        verified: false,
      },
      score: 82,
      riskWarnings: ['Candidate is not verified.'],
    });

    expect(content.source).toBe('fallback');
    expect(content.recommendationReasons.join('')).toContain('共同兴趣');
    expect(content.icebreakerMessage).toContain('小林 你好');
    expect(content.icebreakerMessage).toContain('FitMeet');
    expect(content.riskWarnings.join('')).toContain('尚未完成认证');
  });

  it('falls back when DeepSeek candidate content leaks direct contact details', async () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'DEEPSEEK_API_KEY') return 'test-key';
        return undefined;
      }),
    } as unknown as ConfigService;
    const service = new AIService(config);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                recommendationReasons: [
                  '都喜欢轻松跑步',
                  '邮箱: runner@example.com',
                ],
                icebreakerMessage: '你好，电话: 13800138000，今晚一起跑步吗？',
                riskWarnings: ['手机号: 13800138000'],
              }),
            },
          },
        ],
      }),
    } as Response);

    const content = await service.generateCandidateMatchContent({
      request: { title: '今晚青岛轻松跑步', city: '青岛' },
      candidate: { nickname: '小林', city: '青岛' },
    });

    expect(content.source).toBe('fallback');
    const serialized = JSON.stringify(content);
    expect(serialized).not.toContain('13800138000');
    expect(serialized).not.toContain('runner@example.com');
    expect(serialized).not.toContain('[已隐藏]');
  });

  it('rejects state-fact claims in structured social request parsing', async () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'DEEPSEEK_API_KEY') return 'test-key';
        return undefined;
      }),
    } as unknown as ConfigService;
    const service = new AIService(config);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                goal: '已发布到发现页，正在匹配',
                interestTags: ['散步'],
                locationPreference: '青岛',
                personalityPreference: '轻松',
                suggestedTitle: '青岛散步',
              }),
            },
          },
        ],
      }),
    } as Response);

    const result = await service.parseSocialRequest('想今晚在青岛散步');

    expect(result.goal).toContain('想今晚在青岛散步');
    expect(JSON.stringify(result)).not.toContain('已发布');
  });

  it('does not let DeepSeek change profile visibility permissions', async () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'DEEPSEEK_API_KEY') return 'test-key';
        return undefined;
      }),
    } as unknown as ConfigService;
    const service = new AIService(config);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                basic: {
                  nickname: '',
                  city: '青岛',
                  ageRange: '',
                  gender: '',
                  zodiac: '',
                },
                personality: {
                  mbti: '',
                  traits: ['自律'],
                  socialStyle: '自然相处型',
                  communicationStyle: '真诚、尊重边界',
                },
                interests: {
                  sports: ['跑步'],
                  lifestyle: ['读书'],
                  socialScenes: ['同城约练'],
                },
                preferences: {
                  wantToMeet: ['运动搭子'],
                  preferredTraits: ['真诚'],
                  avoid: ['骚扰'],
                },
                relationshipIntent: {
                  goals: ['找搭子'],
                  openness: 'medium',
                },
                availability: {
                  weekdays: '晚上',
                  weekends: '下午',
                },
                visibility: {
                  profileDiscoverable: false,
                  agentCanRecommendMe: false,
                  agentCanStartChatAfterApproval: false,
                },
                matchSignals: {
                  publicTags: ['跑步'],
                  privatePreferenceTags: ['运动搭子'],
                  sensitivePrivateTags: [],
                  matchKeywords: ['跑步', '运动搭子'],
                  confidence: 0.8,
                  source: 'deepseek',
                },
                summary: '适合同城运动匹配。',
              }),
            },
          },
        ],
      }),
    } as Response);

    const card = await service.generateProfileBuilderCard({
      answers: [{ question: '城市和活动？', answer: '青岛，喜欢跑步' }],
    });

    expect(card.visibility).toEqual({
      profileDiscoverable: true,
      agentCanRecommendMe: true,
      agentCanStartChatAfterApproval: true,
    });
  });

  it('uses the quality chat model instead of legacy DEEPSEEK_MODEL for tool text generation', async () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'DEEPSEEK_API_KEY') return 'test-key';
        if (key === 'DEEPSEEK_CHAT_MODEL') return 'deepseek-v4-pro';
        if (key === 'DEEPSEEK_MODEL') return 'deepseek-v4-flash';
        return undefined;
      }),
    } as unknown as ConfigService;
    const service = new AIService(config);
    const requestBodies: Array<Record<string, unknown>> = [];
    global.fetch = jest.fn((_url, init: RequestInit = {}) => {
      if (typeof init.body === 'string') {
        requestBodies.push(JSON.parse(init.body) as Record<string, unknown>);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '你好，想先站内聊聊吗？' } }],
        }),
      } as Response);
    }) as jest.MockedFunction<typeof fetch>;

    const message = await service.generateInviteMessage(
      { title: '青岛大学散步', activityType: '散步' },
      { nickname: '小林', commonTags: ['散步'] },
    );

    expect(message).toContain('站内聊聊');
    expect(requestBodies[0]?.model).toBe('deepseek-v4-pro');
  });

  it('does not let a fast DEEPSEEK_MODEL downgrade tool text generation', async () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'DEEPSEEK_API_KEY') return 'test-key';
        if (key === 'DEEPSEEK_MODEL') return 'deepseek-v4-flash';
        return undefined;
      }),
    } as unknown as ConfigService;
    const service = new AIService(config);
    const requestBodies: Array<Record<string, unknown>> = [];
    global.fetch = jest.fn((_url, init: RequestInit = {}) => {
      if (typeof init.body === 'string') {
        requestBodies.push(JSON.parse(init.body) as Record<string, unknown>);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '你好，想先站内聊聊吗？' } }],
        }),
      } as Response);
    }) as jest.MockedFunction<typeof fetch>;

    await service.generateInviteMessage(
      { title: '青岛大学散步', activityType: '散步' },
      { nickname: '小林', commonTags: ['散步'] },
    );

    expect(requestBodies[0]?.model).toBe('deepseek-v4-pro');
  });

  it('does not convert client cancellation into candidate content fallback', async () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'DEEPSEEK_API_KEY') return 'test-key';
        return undefined;
      }),
    } as unknown as ConfigService;
    const service = new AIService(config);
    const controller = new AbortController();
    controller.abort();
    global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

    await expect(
      service.generateCandidateMatchContent(
        {
          request: { title: '今晚青岛散步', city: '青岛' },
          candidate: { nickname: '小林', city: '青岛' },
        },
        { signal: controller.signal },
      ),
    ).rejects.toThrow('client_aborted');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('retries a stale-timeout DeepSeek attempt before candidate fallback', async () => {
    jest.useFakeTimers();
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'DEEPSEEK_API_KEY') return 'test-key';
        if (key === 'AI_DEEPSEEK_RETRY_ATTEMPTS') return '2';
        if (key === 'DEEPSEEK_TIMEOUT_MS') return '2500';
        return undefined;
      }),
    } as unknown as ConfigService;
    const service = new AIService(config);
    let calls = 0;
    global.fetch = jest.fn((_url, init: RequestInit = {}) => {
      calls += 1;
      if (calls === 1) {
        return new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  recommendationReasons: ['你们都适合低强度散步。'],
                  icebreakerMessage: '你好，可以先站内聊聊散步安排吗？',
                  riskWarnings: ['先使用站内消息沟通。'],
                }),
              },
            },
          ],
        }),
      } as Response);
    }) as jest.MockedFunction<typeof fetch>;

    let settled = false;
    const resultPromise = service
      .generateCandidateMatchContent({
        request: { title: '今晚青岛散步', city: '青岛' },
        candidate: { nickname: '小林', city: '青岛' },
      })
      .then((result) => {
        settled = true;
        return result;
      });

    await jest.advanceTimersByTimeAsync(24_999);
    expect(settled).toBe(false);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    const result = await resultPromise;
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result.source).toBe('deepseek');
    expect(settled).toBe(true);
  });

  it('retries transient DeepSeek HTTP failures before candidate fallback', async () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'DEEPSEEK_API_KEY') return 'test-key';
        if (key === 'AI_DEEPSEEK_RETRY_ATTEMPTS') return '2';
        return undefined;
      }),
    } as unknown as ConfigService;
    const service = new AIService(config);
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  recommendationReasons: ['你们都喜欢低强度散步。'],
                  icebreakerMessage: '你好，可以先站内聊聊散步安排吗？',
                  riskWarnings: ['先使用站内消息沟通。'],
                }),
              },
            },
          ],
        }),
      } as Response) as jest.MockedFunction<typeof fetch>;

    const result = await service.generateCandidateMatchContent({
      request: { title: '青岛大学散步', city: '青岛' },
      candidate: { nickname: '小林', city: '青岛' },
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      source: 'deepseek',
      icebreakerMessage: '你好，可以先站内聊聊散步安排吗？',
    });
  });
});
