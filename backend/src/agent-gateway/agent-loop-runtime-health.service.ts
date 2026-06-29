import { Injectable } from '@nestjs/common';
import {
  FeatureFlagService,
  type FitMeetFeatureKey,
} from '../common/feature-flag.service';
import {
  fitMeetProcessRole,
  shouldRunWorkerRole,
} from '../common/process-role.util';

export type AgentLoopRuntimeHealthStatus = 'ok' | 'warning';

export type AgentLoopRuntimeHealthWarning = {
  code:
    | 'deepseek_api_key_missing'
    | 'amap_key_missing'
    | 'feature_disabled'
    | 'matching_worker_not_running';
  message: string;
  envKey?: string;
  feature?: FitMeetFeatureKey;
  reason?: string;
};

export type AgentLoopRuntimeHealth = {
  status: AgentLoopRuntimeHealthStatus;
  warnings: AgentLoopRuntimeHealthWarning[];
  dependencies: {
    deepseek: { configured: boolean; envKey: 'DEEPSEEK_API_KEY' };
    amap: {
      configured: boolean;
      envKeys: ['FITMEET_AMAP_WEB_SERVICE_KEY', 'AMAP_WEB_SERVICE_KEY'];
    };
    features: Record<
      FitMeetFeatureKey,
      {
        enabled: boolean;
        reason: string;
        envKey?: string;
      }
    >;
    matchingWorker: {
      enabled: boolean;
      processRole: string;
      schedulerEnabled: boolean;
      requiredRoles: ['worker', 'all', 'worker-matching'];
    };
  };
};

const LOOP_CRITICAL_FEATURES: FitMeetFeatureKey[] = [
  'agent_publish',
  'discover_public_intent',
  'matching_worker',
  'automatic_candidate_search',
  'message_send',
];

@Injectable()
export class AgentLoopRuntimeHealthService {
  constructor(private readonly featureFlags: FeatureFlagService) {}

  snapshot(): AgentLoopRuntimeHealth {
    const warnings: AgentLoopRuntimeHealthWarning[] = [];
    const deepseekConfigured = this.hasEnv('DEEPSEEK_API_KEY');
    const amapConfigured =
      this.hasEnv('FITMEET_AMAP_WEB_SERVICE_KEY') ||
      this.hasEnv('AMAP_WEB_SERVICE_KEY');

    if (!deepseekConfigured) {
      warnings.push({
        code: 'deepseek_api_key_missing',
        envKey: 'DEEPSEEK_API_KEY',
        message:
          'DeepSeek is not configured; workout understanding and opener drafting will use deterministic fallbacks.',
      });
    }

    if (!amapConfigured) {
      warnings.push({
        code: 'amap_key_missing',
        envKey: 'FITMEET_AMAP_WEB_SERVICE_KEY',
        message:
          'AMap is not configured; nationwide POI/location resolution will fall back to local text parsing.',
      });
    }

    const features = LOOP_CRITICAL_FEATURES.reduce(
      (acc, feature) => {
        const decision = this.featureFlags.evaluate(feature);
        acc[feature] = {
          enabled: decision.enabled,
          reason: decision.reason,
          ...(decision.envKey ? { envKey: decision.envKey } : {}),
        };
        if (!decision.enabled) {
          warnings.push({
            code: 'feature_disabled',
            feature,
            reason: decision.reason,
            envKey: decision.envKey,
            message: `${feature} is disabled; the agent loop may stop before publish, matching, candidate search, or message send.`,
          });
        }
        return acc;
      },
      {} as AgentLoopRuntimeHealth['dependencies']['features'],
    );

    const processRole = fitMeetProcessRole();
    const schedulerEnabled = this.schedulerEnabled();
    const matchingWorkerEnabled = shouldRunWorkerRole('worker-matching');
    if (!matchingWorkerEnabled) {
      warnings.push({
        code: 'matching_worker_not_running',
        envKey:
          schedulerEnabled === false
            ? 'ENABLE_SCHEDULER'
            : 'FITMEET_PROCESS_ROLE',
        message:
          'Matching worker is not active in this process; queued public/private matches require a worker, all, or worker-matching process.',
      });
    }

    return {
      status: warnings.length > 0 ? 'warning' : 'ok',
      warnings,
      dependencies: {
        deepseek: {
          configured: deepseekConfigured,
          envKey: 'DEEPSEEK_API_KEY',
        },
        amap: {
          configured: amapConfigured,
          envKeys: ['FITMEET_AMAP_WEB_SERVICE_KEY', 'AMAP_WEB_SERVICE_KEY'],
        },
        features,
        matchingWorker: {
          enabled: matchingWorkerEnabled,
          processRole,
          schedulerEnabled,
          requiredRoles: ['worker', 'all', 'worker-matching'],
        },
      },
    };
  }

  private hasEnv(key: string): boolean {
    return String(process.env[key] ?? '').trim().length > 0;
  }

  private schedulerEnabled(): boolean {
    const scheduler = process.env.ENABLE_SCHEDULER;
    if (scheduler === undefined) return true;
    return ['true', '1', 'yes', 'on'].includes(scheduler.trim().toLowerCase());
  }
}
