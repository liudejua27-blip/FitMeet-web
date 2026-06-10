import { SocialAgentChatRunFacadeService } from './social-agent-chat-run-facade.service';

describe('SocialAgentChatRunFacadeService', () => {
  it('delegates direct and streaming runs to the orchestrator', async () => {
    const runOrchestrator = {
      run: jest.fn().mockResolvedValue({ taskId: 101, candidates: [] }),
    };
    const service = new SocialAgentChatRunFacadeService(
      { runQueued: jest.fn() } as never,
      runOrchestrator as never,
    );
    const body = { goal: '今晚青岛跑步' };
    const emit = jest.fn();

    await expect(service.run(7, body as never)).resolves.toMatchObject({
      taskId: 101,
    });
    await expect(
      service.runStream(7, body as never, emit),
    ).resolves.toMatchObject({
      taskId: 101,
    });

    expect(runOrchestrator.run).toHaveBeenNthCalledWith(1, 7, body);
    expect(runOrchestrator.run).toHaveBeenNthCalledWith(2, 7, body, emit, {});
  });

  it('wires queued runs to the orchestrator and user-facing step labels', async () => {
    const queuedRun = { taskId: 101, runId: 'sar_queued_1' };
    const queuedRuns = {
      runQueued: jest.fn().mockResolvedValue(queuedRun),
    };
    const runOrchestrator = {
      run: jest.fn().mockResolvedValue({ taskId: 101, candidates: [] }),
    };
    const tonePolicy = {
      userStatus: jest.fn((id: string, label: string) => `${id}:${label}:用户`),
    };
    const service = new SocialAgentChatRunFacadeService(
      queuedRuns as never,
      runOrchestrator as never,
      tonePolicy as never,
    );
    const body = { goal: '今晚青岛跑步' };

    await expect(service.runQueued(7, body as never)).resolves.toBe(queuedRun);

    const queuedInput = queuedRuns.runQueued.mock.calls[0]?.[0] as {
      ownerUserId: number;
      body: unknown;
      visibleStepLabel: (id: string, label: string) => string;
      executeRun: (body: unknown, emit: unknown) => Promise<unknown>;
    };
    expect(queuedInput).toMatchObject({ ownerUserId: 7, body });
    expect(queuedInput.visibleStepLabel('search', '正在搜索')).toBe(
      'search:正在搜索:用户',
    );

    const emit = jest.fn();
    await queuedInput.executeRun({ goal: '后台标准化目标' }, emit);

    expect(runOrchestrator.run).toHaveBeenCalledWith(
      7,
      { goal: '后台标准化目标' },
      emit,
    );
    expect(tonePolicy.userStatus).toHaveBeenCalledWith('search', '正在搜索');
  });
});
