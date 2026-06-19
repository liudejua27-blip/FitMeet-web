import { SocialAgentStreamingResponseService } from './social-agent-streaming-response.service';

describe('SocialAgentStreamingResponseService', () => {
  it('streams fallback assistant text as delta chunks followed by done', async () => {
    const service = new SocialAgentStreamingResponseService();
    const events: Array<Record<string, unknown>> = [];

    await service.streamAssistantText({
      emit: (event) => {
        events.push(event);
      },
      messageId: 'agent-message:1',
      text: '我会先确认你的边界，再帮你找低压力跑步搭子。',
    });

    expect(events.length).toBeGreaterThan(2);
    expect(events.at(-1)).toEqual({
      type: 'assistant_done',
      messageId: 'agent-message:1',
      source: 'fallback',
    });
    expect(events.filter((event) => event.type === 'assistant_delta')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ messageId: 'agent-message:1' }),
      ]),
    );
  });
});
