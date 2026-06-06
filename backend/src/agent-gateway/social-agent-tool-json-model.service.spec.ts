import { SocialAgentToolJsonModelService } from './social-agent-tool-json-model.service';

function makeConfig(values: Record<string, string | undefined>) {
  return {
    get: jest.fn((key: string) => values[key]),
  };
}

describe('SocialAgentToolJsonModelService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('uses fallback without a DeepSeek API key', async () => {
    const service = new SocialAgentToolJsonModelService(
      makeConfig({}) as never,
    );
    const logger = (
      service as unknown as { logger: { warn: (message: string) => void } }
    ).logger;
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    global.fetch = jest.fn() as never;

    const result = await service.callJson({
      purpose: 'summarize_reply',
      prompt: 'summarize',
      fallback: () => ({ source: 'fallback', summary: 'ok' }),
      taskId: 10,
    });

    expect(result).toEqual({ source: 'fallback', summary: 'ok' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('requests json_object responses and annotates parsed output', async () => {
    const config = makeConfig({
      DEEPSEEK_API_KEY: 'test-key',
      DEEPSEEK_BASE_URL: 'https://deepseek.test/',
      AGENT_CARD_MODEL: 'card-model',
    });
    const service = new SocialAgentToolJsonModelService(config as never);
    const logger = (
      service as unknown as { logger: { log: (message: string) => void } }
    ).logger;
    jest.spyOn(logger, 'log').mockImplementation(() => undefined);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => ({
        choices: [{ message: { content: '{"summary":"works"}' } }],
      }),
    }) as never;

    const result = await service.callJson({
      purpose: 'social_request_card',
      prompt: 'draft card',
      fallback: () => ({ source: 'fallback' }),
      taskId: 12,
    });

    expect(result).toEqual({
      summary: 'works',
      source: 'deepseek',
      purpose: 'social_request_card',
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://deepseek.test/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer test-key',
          'content-type': 'application/json',
        }),
      }),
    );
    const request = (global.fetch as jest.Mock).mock.calls[0]?.[1] as {
      body?: string;
    };
    expect(JSON.parse(request.body ?? '{}')).toMatchObject({
      model: 'card-model',
      response_format: { type: 'json_object' },
      messages: expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: 'draft card' }),
      ]),
    });
  });
});
