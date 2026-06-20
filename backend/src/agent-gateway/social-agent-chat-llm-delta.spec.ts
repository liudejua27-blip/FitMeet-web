import {
  createTrackedSocialAgentDeltaHandler,
  socialAgentAnswerSource,
} from './social-agent-chat-llm-delta';

describe('social-agent-chat-llm-delta', () => {
  it('does not mark whitespace-only chunks as model output', async () => {
    const handler = jest.fn();
    const tracked = createTrackedSocialAgentDeltaHandler(handler);

    await tracked.onDelta?.('   \n\t  ');

    expect(handler).toHaveBeenCalledWith('   \n\t  ');
    expect(tracked.emittedDelta()).toBe(false);
    expect(
      socialAgentAnswerSource('我先记录你的需求。', '我先记录你的需求。', tracked.emittedDelta()),
    ).toBe('fallback');
  });

  it('marks visible chunks as model output even if the final text matches fallback copy', async () => {
    const handler = jest.fn();
    const tracked = createTrackedSocialAgentDeltaHandler(handler);

    await tracked.onDelta?.('我先记录');

    expect(handler).toHaveBeenCalledWith('我先记录');
    expect(tracked.emittedDelta()).toBe(true);
    expect(
      socialAgentAnswerSource('我先记录你的需求。', '我先记录你的需求。', tracked.emittedDelta()),
    ).toBe('llm');
  });
});
