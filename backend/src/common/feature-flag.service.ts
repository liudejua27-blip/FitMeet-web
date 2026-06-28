import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export type FitMeetFeatureKey =
  | 'agent_publish'
  | 'discover_public_intent'
  | 'matching_worker'
  | 'automatic_candidate_search'
  | 'message_send'
  | 'connect_candidate'
  | 'activity_create';

export type FeatureFlagContext = {
  userId?: number | null;
  city?: string | null;
  riskLevel?: string | null;
};

export type FeatureFlagDecision = {
  enabled: boolean;
  feature: FitMeetFeatureKey;
  reason: string;
  envKey?: string;
  metadata?: Record<string, unknown>;
};

const FEATURE_ENV: Record<
  FitMeetFeatureKey,
  { enabled: string; legacy?: string[] }
> = {
  agent_publish: {
    enabled: 'FITMEET_FEATURE_AGENT_PUBLISH_ENABLED',
    legacy: ['FITMEET_AGENT_PUBLISH_ENABLED'],
  },
  discover_public_intent: {
    enabled: 'FITMEET_FEATURE_DISCOVER_PUBLIC_INTENT_ENABLED',
  },
  matching_worker: {
    enabled: 'FITMEET_FEATURE_MATCHING_WORKER_ENABLED',
    legacy: ['FITMEET_MATCHING_JOB_WORKER_ENABLED'],
  },
  automatic_candidate_search: {
    enabled: 'FITMEET_FEATURE_AUTOMATIC_CANDIDATE_SEARCH_ENABLED',
  },
  message_send: {
    enabled: 'FITMEET_FEATURE_MESSAGE_SEND_ENABLED',
    legacy: ['FITMEET_AGENT_MESSAGE_SEND_ENABLED'],
  },
  connect_candidate: {
    enabled: 'FITMEET_FEATURE_CONNECT_CANDIDATE_ENABLED',
  },
  activity_create: {
    enabled: 'FITMEET_FEATURE_ACTIVITY_CREATE_ENABLED',
  },
};

const GLOBAL_KILL_SWITCHES = [
  'FITMEET_SOCIAL_LOOP_KILL_SWITCH',
  'FITMEET_AGENT_KILL_SWITCH',
];

@Injectable()
export class FeatureFlagService {
  isEnabled(
    feature: FitMeetFeatureKey,
    context: FeatureFlagContext = {},
  ): boolean {
    return this.evaluate(feature, context).enabled;
  }

  evaluate(
    feature: FitMeetFeatureKey,
    context: FeatureFlagContext = {},
  ): FeatureFlagDecision {
    for (const key of GLOBAL_KILL_SWITCHES) {
      if (isTruthy(process.env[key])) {
        return {
          enabled: false,
          feature,
          reason: 'global_kill_switch',
          envKey: key,
        };
      }
    }

    const config = FEATURE_ENV[feature];
    const explicit = this.readFirstEnv([
      config.enabled,
      ...(config.legacy ?? []),
    ]);
    if (explicit && isFalsey(explicit.value)) {
      return {
        enabled: false,
        feature,
        reason: 'feature_disabled',
        envKey: explicit.key,
      };
    }
    if (
      explicit &&
      isTruthy(explicit.value) === false &&
      explicit.value.trim()
    ) {
      return {
        enabled: false,
        feature,
        reason: 'feature_disabled',
        envKey: explicit.key,
      };
    }

    const userAllowlist = this.csv(`${config.enabled}_USER_ALLOWLIST`);
    if (
      userAllowlist.length > 0 &&
      !userAllowlist.includes(String(context.userId ?? ''))
    ) {
      return {
        enabled: false,
        feature,
        reason: 'user_not_allowlisted',
        envKey: `${config.enabled}_USER_ALLOWLIST`,
        metadata: { userId: context.userId ?? null },
      };
    }

    const cityAllowlist = this.csv(`${config.enabled}_CITY_ALLOWLIST`).map(
      normalizeToken,
    );
    if (
      cityAllowlist.length > 0 &&
      !cityAllowlist.includes(normalizeToken(context.city ?? ''))
    ) {
      return {
        enabled: false,
        feature,
        reason: 'city_not_allowlisted',
        envKey: `${config.enabled}_CITY_ALLOWLIST`,
        metadata: { city: context.city ?? null },
      };
    }

    const disabledRiskLevels = this.csv(
      `${config.enabled}_DISABLED_RISK_LEVELS`,
    ).map(normalizeToken);
    if (
      disabledRiskLevels.length > 0 &&
      disabledRiskLevels.includes(normalizeToken(context.riskLevel ?? ''))
    ) {
      return {
        enabled: false,
        feature,
        reason: 'risk_level_disabled',
        envKey: `${config.enabled}_DISABLED_RISK_LEVELS`,
        metadata: { riskLevel: context.riskLevel ?? null },
      };
    }

    return { enabled: true, feature, reason: 'enabled' };
  }

  assertEnabled(
    feature: FitMeetFeatureKey,
    context: FeatureFlagContext = {},
  ): void {
    const decision = this.evaluate(feature, context);
    if (decision.enabled) return;
    throw new ServiceUnavailableException({
      code: 'FEATURE_DISABLED',
      feature,
      reason: decision.reason,
      envKey: decision.envKey,
      metadata: decision.metadata,
      message: 'This social capability is currently disabled.',
    });
  }

  private readFirstEnv(keys: string[]) {
    for (const key of keys) {
      const value = process.env[key];
      if (value !== undefined) return { key, value };
    }
    return null;
  }

  private csv(key: string): string[] {
    return String(process.env[key] ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function isTruthy(value: string | undefined) {
  return ['1', 'true', 'yes', 'on'].includes(
    String(value ?? '')
      .trim()
      .toLowerCase(),
  );
}

function isFalsey(value: string | undefined) {
  return ['0', 'false', 'no', 'off'].includes(
    String(value ?? '')
      .trim()
      .toLowerCase(),
  );
}

function normalizeToken(value: string | number | null | undefined) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}
