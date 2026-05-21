import { ConfigService } from '@nestjs/config';
import { AIService } from './ai.service';

describe('AIService profile builder fallback', () => {
  it('keeps sensitive wealth tags private in match signals', async () => {
    const config = { get: jest.fn().mockReturnValue(undefined) } as unknown as
      ConfigService;
    const service = new AIService(config);

    const card = await service.generateProfileBuilderCard({
      answers: [
        {
          question: 'What kind of person do you want to meet?',
          answer: 'I want to meet someone rich, entrepreneurial, and into running.',
        },
      ],
      source: 'test',
    });

    expect(card.matchSignals.publicTags).not.toContain('rich');
    expect(card.matchSignals.sensitivePrivateTags).toContain('rich');
    expect(card.matchSignals.matchKeywords).toContain('rich');
  });

  it('returns polished Chinese candidate content without DeepSeek', async () => {
    const config = { get: jest.fn().mockReturnValue(undefined) } as unknown as
      ConfigService;
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

  it('normalizes DeepSeek candidate content into safe structured fields', async () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'DEEPSEEK_API_KEY') return 'test-key';
        return undefined;
      }),
    } as unknown as ConfigService;
    const service = new AIService(config);
    const originalFetch = global.fetch;
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
                icebreakerMessage:
                  '你好，电话: 13800138000，今晚一起跑步吗？',
                riskWarnings: ['手机号: 13800138000'],
              }),
            },
          },
        ],
      }),
    } as Response);

    try {
      const content = await service.generateCandidateMatchContent({
        request: { title: '今晚青岛轻松跑步', city: '青岛' },
        candidate: { nickname: '小林', city: '青岛' },
      });

      expect(content.source).toBe('deepseek');
      const serialized = JSON.stringify(content);
      expect(serialized).not.toContain('13800138000');
      expect(serialized).not.toContain('runner@example.com');
      expect(serialized).toContain('[已隐藏]');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
