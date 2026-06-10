import { AgentObservabilityAlertSinkService } from './agent-observability-alert-sink.service';

describe('AgentObservabilityAlertSinkService', () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.AGENT_OBSERVABILITY_ALERT_WEBHOOK_URL;
  const originalToken = process.env.AGENT_OBSERVABILITY_ALERT_WEBHOOK_TOKEN;
  const originalCooldown = process.env.AGENT_OBSERVABILITY_ALERT_COOLDOWN_MS;

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalUrl === undefined) {
      delete process.env.AGENT_OBSERVABILITY_ALERT_WEBHOOK_URL;
    } else {
      process.env.AGENT_OBSERVABILITY_ALERT_WEBHOOK_URL = originalUrl;
    }
    if (originalToken === undefined) {
      delete process.env.AGENT_OBSERVABILITY_ALERT_WEBHOOK_TOKEN;
    } else {
      process.env.AGENT_OBSERVABILITY_ALERT_WEBHOOK_TOKEN = originalToken;
    }
    if (originalCooldown === undefined) {
      delete process.env.AGENT_OBSERVABILITY_ALERT_COOLDOWN_MS;
    } else {
      process.env.AGENT_OBSERVABILITY_ALERT_COOLDOWN_MS = originalCooldown;
    }
    jest.restoreAllMocks();
  });

  it('posts redacted alerts to the configured webhook and deduplicates within cooldown', async () => {
    process.env.AGENT_OBSERVABILITY_ALERT_WEBHOOK_URL =
      'https://alerts.example.test/hook';
    process.env.AGENT_OBSERVABILITY_ALERT_WEBHOOK_TOKEN = 'secret-token';
    process.env.AGENT_OBSERVABILITY_ALERT_COOLDOWN_MS = '60000';
    const fetchMock = jest.fn(() => Promise.resolve({ ok: true, status: 200 }));
    global.fetch = fetchMock as never;
    const service = new AgentObservabilityAlertSinkService();

    await service.publishAlerts(
      [
        {
          code: 'llm_failure_rate_high',
          severity: 'critical',
          message: 'LLM failed for phone 15253005312',
          value: 0.2,
          threshold: 0.08,
        },
      ],
      { privateMessage: '联系我 15253005312' },
    );
    await service.publishAlerts([
      {
        code: 'llm_failure_rate_high',
        severity: 'critical',
        message: 'LLM failed again',
        value: 0.3,
        threshold: 0.08,
      },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calls = fetchMock.mock.calls as unknown as Array<
      [string, { headers: Record<string, string>; body: string }]
    >;
    const [, request] = calls[0];
    expect(request.headers.authorization).toBe('Bearer secret-token');
    const body = JSON.stringify(JSON.parse(request.body));
    expect(body).not.toContain('15253005312');
    expect(body).toContain('[REDACTED_PHONE]');
    expect(service.status()).toMatchObject({
      configured: true,
      target: 'webhook',
      lastDeliveryStatus: 'sent',
    });
  });
});
