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
});
