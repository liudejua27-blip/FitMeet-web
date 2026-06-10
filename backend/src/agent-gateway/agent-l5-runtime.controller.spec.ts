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
        subagentWorkerJobs: 0,
      }),
      workerJobs: [],
    });
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
  );
}
