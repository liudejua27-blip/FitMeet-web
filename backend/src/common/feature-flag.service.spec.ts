import { FeatureFlagService } from './feature-flag.service';
import { ServiceUnavailableException } from '@nestjs/common';

describe('FeatureFlagService', () => {
  const originalEnv = process.env;
  let service: FeatureFlagService;

  beforeEach(() => {
    process.env = { ...originalEnv };
    service = new FeatureFlagService();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('enables social features by default', () => {
    expect(service.evaluate('agent_publish', { userId: 7 }).enabled).toBe(true);
  });

  it('honors the global kill switch', () => {
    process.env.FITMEET_SOCIAL_LOOP_KILL_SWITCH = '1';

    const decision = service.evaluate('message_send', { userId: 7 });

    expect(decision).toMatchObject({
      enabled: false,
      reason: 'global_kill_switch',
      envKey: 'FITMEET_SOCIAL_LOOP_KILL_SWITCH',
    });
  });

  it('honors feature-specific legacy kill switches', () => {
    process.env.FITMEET_MATCHING_JOB_WORKER_ENABLED = '0';

    const decision = service.evaluate('matching_worker');

    expect(decision).toMatchObject({
      enabled: false,
      reason: 'feature_disabled',
      envKey: 'FITMEET_MATCHING_JOB_WORKER_ENABLED',
    });
  });

  it('limits a feature by user allowlist', () => {
    process.env.FITMEET_FEATURE_AGENT_PUBLISH_ENABLED_USER_ALLOWLIST = '7,9';

    expect(service.evaluate('agent_publish', { userId: 7 }).enabled).toBe(true);
    expect(service.evaluate('agent_publish', { userId: 8 })).toMatchObject({
      enabled: false,
      reason: 'user_not_allowlisted',
    });
  });

  it('limits a feature by city allowlist', () => {
    process.env.FITMEET_FEATURE_DISCOVER_PUBLIC_INTENT_ENABLED_CITY_ALLOWLIST =
      '青岛,beijing';

    expect(
      service.evaluate('discover_public_intent', { city: '青岛' }).enabled,
    ).toBe(true);
    expect(
      service.evaluate('discover_public_intent', { city: '上海' }),
    ).toMatchObject({
      enabled: false,
      reason: 'city_not_allowlisted',
    });
  });

  it('can disable a feature by risk level', () => {
    process.env.FITMEET_FEATURE_AUTOMATIC_CANDIDATE_SEARCH_ENABLED_DISABLED_RISK_LEVELS =
      'high,blocked';

    expect(
      service.evaluate('automatic_candidate_search', { riskLevel: 'high' }),
    ).toMatchObject({
      enabled: false,
      reason: 'risk_level_disabled',
    });
  });

  it('throws a service unavailable error when a required feature is disabled', () => {
    process.env.FITMEET_FEATURE_MESSAGE_SEND_ENABLED = 'false';

    try {
      service.assertEnabled('message_send');
      throw new Error('Expected feature flag assertion to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(
        (error as ServiceUnavailableException).getResponse(),
      ).toMatchObject({
        code: 'FEATURE_DISABLED',
        feature: 'message_send',
        reason: 'feature_disabled',
      });
    }
  });
});
