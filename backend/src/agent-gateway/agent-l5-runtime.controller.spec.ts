import { AgentL5RuntimeController } from './agent-l5-runtime.controller';

describe('AgentL5RuntimeController', () => {
  afterEach(() => jest.restoreAllMocks());

  it('aggregates dashboard data after AdminRbacGuard authorizes the request', async () => {
    const controller = makeController();

    await expect(
      controller.dashboard({ user: { id: 7 } } as never, '10'),
    ).resolves.toMatchObject({
      summary: expect.objectContaining({
        activeAlerts: 0,
        messageFeedback: 0,
        subagentWorkerJobs: 0,
        candidateSnapshots: 0,
        candidateEvents: 0,
        socialLoopTraceLinks: 0,
        socialLoopMissingCriticalIds: 0,
        agentLoopRuntimeHealthStatus: 'warning',
        agentLoopRuntimeHealthWarnings: 1,
      }),
      messageFeedback: [],
      candidateSnapshots: [],
      candidateEvents: [],
      workerJobs: [],
      socialAgentMetrics: expect.objectContaining({
        cacheEfficiencySummary: expect.objectContaining({
          combined: expect.objectContaining({
            hitRate: 0,
            savedApproxPromptChars: 0,
          }),
        }),
        llmOutputCacheSummary: {},
        toolResultCacheSummary: {},
      }),
      socialLoopObservability: expect.objectContaining({
        identifiers: expect.arrayContaining(['taskId', 'matchingJobId']),
        recentTraceLinks: [],
      }),
      agentLoopRuntimeHealth: expect.objectContaining({
        status: 'warning',
        warnings: [expect.objectContaining({ code: 'amap_key_missing' })],
      }),
    });
  });

  it('exposes agent loop runtime health for deployment verification', () => {
    const controller = makeController();

    expect(controller.runtimeHealth()).toEqual(
      expect.objectContaining({
        status: 'warning',
        warnings: [expect.objectContaining({ code: 'amap_key_missing' })],
        dependencies: expect.objectContaining({
          deepseek: expect.objectContaining({ configured: true }),
          amap: expect.objectContaining({ configured: false }),
          matchingWorker: expect.objectContaining({ enabled: true }),
        }),
      }),
    );
  });
});

function makeController() {
  return new AgentL5RuntimeController(
    { dashboard: jest.fn().mockResolvedValue({ summary: {} }) } as never,
    { listAutoRuns: jest.fn().mockResolvedValue([]) } as never,
    { snapshot: jest.fn().mockReturnValue([]) } as never,
    { snapshot: jest.fn().mockReturnValue({ alerts: [] }) } as never,
    {
      listJobs: jest.fn().mockResolvedValue([]),
      listHeartbeats: jest.fn().mockResolvedValue([]),
      listFailures: jest.fn().mockResolvedValue([]),
    } as never,
    {
      listAccessAuditLogs: jest.fn().mockResolvedValue([]),
      retentionPolicy: jest.fn().mockReturnValue({}),
      applyRetentionPolicy: jest.fn().mockResolvedValue({}),
    } as never,
    { listRecent: jest.fn().mockResolvedValue([]) } as never,
    { listRecent: jest.fn().mockResolvedValue([]) } as never,
    {
      snapshot: jest.fn().mockReturnValue({
        cacheEfficiencySummary: {
          toolResult: {
            hits: 0,
            misses: 0,
            total: 0,
            hitRate: 0,
            savedApproxPromptChars: 0,
          },
          llmOutput: {
            hits: 0,
            misses: 0,
            total: 0,
            hitRate: 0,
            savedApproxPromptChars: 0,
          },
          combined: {
            hits: 0,
            misses: 0,
            total: 0,
            hitRate: 0,
            savedApproxPromptChars: 0,
          },
        },
        llmOutputCacheSummary: {},
        toolResultCacheSummary: {},
      }),
    } as never,
    {
      listRecentSnapshots: jest.fn().mockResolvedValue([]),
      listRecentEvents: jest.fn().mockResolvedValue([]),
    } as never,
    {
      snapshot: jest.fn().mockResolvedValue({
        identifiers: ['taskId', 'matchingJobId'],
        recentTraceLinks: [],
      }),
    } as never,
    {
      snapshot: jest.fn().mockReturnValue({
        status: 'warning',
        warnings: [{ code: 'amap_key_missing' }],
        dependencies: {
          deepseek: { configured: true, envKey: 'DEEPSEEK_API_KEY' },
          amap: {
            configured: false,
            envKeys: ['FITMEET_AMAP_WEB_SERVICE_KEY', 'AMAP_WEB_SERVICE_KEY'],
          },
          features: {},
          matchingWorker: {
            enabled: true,
            processRole: 'worker-matching',
            schedulerEnabled: true,
            requiredRoles: ['worker', 'all', 'worker-matching'],
          },
        },
      }),
    } as never,
  );
}
