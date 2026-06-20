import { SocialAgentStreamingResponseService } from './social-agent-streaming-response.service';
import { shouldStreamFallbackAssistantText } from './social-agent-chat-stream.presenter';

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

  it('does not treat generic recovery copy as streamable assistant content', () => {
    expect(
      shouldStreamFallbackAssistantText(
        'FitMeet Agent 暂时没有顺利完成。我已经保留当前对话，请稍后再试。',
      ),
    ).toBe(false);
    expect(
      shouldStreamFallbackAssistantText(
        '这次处理时间有点久。我已经保留当前对话，你可以稍后再试。',
      ),
    ).toBe(false);
    expect(
      shouldStreamFallbackAssistantText(
        '从已保存的步骤继续：正在等待你确认。原始目标：你有什么功能',
      ),
    ).toBe(false);
    expect(
      shouldStreamFallbackAssistantText('我已经恢复了这段约练任务。'),
    ).toBe(false);
    expect(
      shouldStreamFallbackAssistantText('已从刚才的确认点继续处理。'),
    ).toBe(false);
    expect(
      shouldStreamFallbackAssistantText('我已经保留当前方向，等连接恢复后可以继续。'),
    ).toBe(false);
    expect(
      shouldStreamFallbackAssistantText(
        '我会先确认你的边界，再帮你找低压力跑步搭子。',
      ),
    ).toBe(true);
  });
});
