import { FeatureFlagService } from '../common/feature-flag.service';
import { AgentLoopRuntimeHealthService } from './agent-loop-runtime-health.service';

describe('AgentLoopRuntimeHealthService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('reports ok when agent-loop dependencies and matching worker role are configured', () => {
    process.env.DEEPSEEK_API_KEY = 'deepseek-key';
    process.env.FITMEET_AMAP_WEB_SERVICE_KEY = 'amap-key';
    process.env.FITMEET_PROCESS_ROLE = 'worker-matching';
    process.env.ENABLE_SCHEDULER = 'true';

    const snapshot = service().snapshot();

    expect(snapshot).toMatchObject({
      status: 'ok',
      warnings: [],
      dependencies: {
        deepseek: { configured: true },
        amap: { configured: true },
        matchingWorker: {
          enabled: true,
          processRole: 'worker-matching',
          schedulerEnabled: true,
        },
      },
    });
    expect(snapshot.dependencies.features.agent_publish.enabled).toBe(true);
    expect(snapshot.dependencies.features.matching_worker.enabled).toBe(true);
  });

  it('reports warnings without failing readiness for missing optional agent dependencies', () => {
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.FITMEET_AMAP_WEB_SERVICE_KEY;
    delete process.env.AMAP_WEB_SERVICE_KEY;
    delete process.env.FITMEET_PROCESS_ROLE;
    delete process.env.ENABLE_SCHEDULER;

    const snapshot = service().snapshot();

    expect(snapshot.status).toBe('warning');
    expect(snapshot.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining([
        'deepseek_api_key_missing',
        'amap_key_missing',
        'matching_worker_not_running',
      ]),
    );
    expect(snapshot.dependencies.matchingWorker).toMatchObject({
      enabled: false,
      processRole: 'api',
      schedulerEnabled: true,
    });
  });

  it('surfaces explicit feature flag and scheduler disables as deployment warnings', () => {
    process.env.DEEPSEEK_API_KEY = 'deepseek-key';
    process.env.AMAP_WEB_SERVICE_KEY = 'amap-key';
    process.env.FITMEET_FEATURE_MATCHING_WORKER_ENABLED = 'false';
    process.env.ENABLE_SCHEDULER = 'false';
    process.env.FITMEET_PROCESS_ROLE = 'worker-matching';

    const snapshot = service().snapshot();

    expect(snapshot.status).toBe('warning');
    expect(snapshot.dependencies.features.matching_worker).toMatchObject({
      enabled: false,
      reason: 'feature_disabled',
      envKey: 'FITMEET_FEATURE_MATCHING_WORKER_ENABLED',
    });
    expect(snapshot.dependencies.matchingWorker).toMatchObject({
      enabled: false,
      processRole: 'worker-matching',
      schedulerEnabled: false,
    });
    expect(snapshot.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'feature_disabled',
          feature: 'matching_worker',
        }),
        expect.objectContaining({
          code: 'matching_worker_not_running',
          envKey: 'ENABLE_SCHEDULER',
        }),
      ]),
    );
  });
});

function service() {
  return new AgentLoopRuntimeHealthService(new FeatureFlagService());
}
