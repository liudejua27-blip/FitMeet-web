import { AgentControlController } from './agent-control.controller';
import {
  AgentApprovalRequest,
  ApprovalRiskLevel,
  ApprovalStatus,
  ApprovalType,
} from './entities/agent-approval-request.entity';

function approval(
  overrides: Partial<AgentApprovalRequest> = {},
): AgentApprovalRequest {
  return {
    id: 88,
    userId: 7,
    agentTaskId: 42,
    agentConnectionId: null,
    type: ApprovalType.SendMessage,
    actionType: 'send_message',
    skillName: 'send_candidate_message',
    payload: {
      targetUserId: 22,
      message: '周末方便一起慢跑吗？',
      schemaAction: 'candidate.connect',
      sideEffect: 'send_message_or_connect',
      idempotencyKey: 'candidate-connect:42:22',
      resumeMode: 'resume_after_approval',
      checkpointRequired: true,
      sourceStepId: 'approval-88',
    },
    summary: '发送开场白给小林',
    reason: '',
    createdBy: 'agent',
    relatedSocialRequestId: 301,
    relatedCandidateId: 501,
    relatedActivityId: null,
    riskLevel: ApprovalRiskLevel.Medium,
    status: ApprovalStatus.Approved,
    agentRationale: '',
    expiresAt: new Date('2026-06-15T00:00:00.000Z'),
    respondedAt: new Date('2026-06-14T00:00:00.000Z'),
    createdAt: new Date('2026-06-14T00:00:00.000Z'),
    updatedAt: new Date('2026-06-14T00:00:00.000Z'),
    ...overrides,
  } as AgentApprovalRequest;
}

function makeController(
  options: {
    approval?: AgentApprovalRequest;
    dispatchResult?: Record<string, unknown>;
    resume?: Record<string, unknown> | null;
  } = {},
) {
  const row = options.approval ?? approval();
  const settings = {
    getEffective: jest.fn(),
    getOrCreate: jest.fn(),
    update: jest.fn(),
  };
  const dispatcher = {
    dispatch: jest
      .fn()
      .mockResolvedValue(options.dispatchResult ?? { ok: true, result: {} }),
  };
  const approvals = {
    getPending: jest.fn(),
    getById: jest.fn(),
    classify: jest.fn(),
    create: jest.fn(),
    approve: jest.fn(async (_id: number, _userId: number, cb) => {
      const dispatchResult = await cb(row);
      return { approval: row, dispatchResult };
    }),
    reject: jest.fn().mockResolvedValue({
      ...row,
      status: ApprovalStatus.Rejected,
    }),
  };
  const actionLogs = {
    logAgentAction: jest.fn().mockResolvedValue(undefined),
  };
  const checkpoints = {
    markDecision: jest.fn().mockResolvedValue(options.resume ?? null),
    latestForTask: jest.fn().mockResolvedValue(null),
    prepareAction: jest.fn(({ checkpointId, action }) =>
      Promise.resolve({
        checkpointId: checkpointId + 1,
        parentCheckpointId: checkpointId,
        taskId: 42,
        action,
        threadId: 'agent-task:42',
        resumePrompt: `checkpoint ${action}`,
        resumeCursor: {
          threadId: 'agent-task:42',
          checkpointId: checkpointId + 1,
          parentCheckpointId: checkpointId,
          action,
          stepId: null,
        },
        idempotencyKey: `agent-checkpoint:${action}:agent-task:42:checkpoint:${checkpointId + 1}`,
        interrupt: null,
        traceId: 'trace-1',
        runId: 'run-1',
      }),
    ),
    prepareStepAction: jest.fn(({ checkpointId, stepId, action }) =>
      Promise.resolve({
        checkpointId: checkpointId + 1,
        parentCheckpointId: checkpointId,
        taskId: 42,
        action,
        threadId: 'agent-task:42',
        resumePrompt: `step ${action}: ${stepId}`,
        resumeCursor: {
          threadId: 'agent-task:42',
          checkpointId: checkpointId + 1,
          parentCheckpointId: checkpointId,
          action,
          stepId,
        },
        idempotencyKey: `agent-checkpoint:${action}:agent-task:42:checkpoint:${checkpointId + 1}:step:${stepId}`,
        interrupt: null,
        traceId: 'trace-1',
        runId: 'run-1',
      }),
    ),
  };
  const controller = new AgentControlController(
    settings as never,
    approvals as never,
    dispatcher as never,
    actionLogs as never,
    checkpoints as never,
  );
  return { actionLogs, approvals, checkpoints, controller, dispatcher, row };
}

describe('AgentControlController approval resume contract', () => {
  it('returns checkpoint resume plan after approving a high-risk action', async () => {
    const resume = {
      checkpointId: 123,
      taskId: 42,
      action: 'resume',
      threadId: 'agent-task:42',
      resumeCursor: {
        threadId: 'agent-task:42',
        checkpointId: 123,
        parentCheckpointId: null,
        action: 'resume',
        stepId: 'approval-88',
      },
      idempotencyKey:
        'agent-checkpoint:resume:agent-task:42:checkpoint:123:step:approval-88:approval:88',
    };
    const { actionLogs, approvals, checkpoints, controller, dispatcher, row } =
      makeController({ resume });

    const result = await controller.approve({ user: { id: 7 } }, 88);

    expect(approvals.approve).toHaveBeenCalledWith(88, 7, expect.any(Function));
    expect(dispatcher.dispatch).toHaveBeenCalledWith(row);
    expect(checkpoints.markDecision).toHaveBeenCalledWith(row, 'approved');
    expect(actionLogs.logAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        agentTaskId: 42,
        targetUserId: 22,
        relatedSocialRequestId: 301,
        relatedCandidateId: 501,
        outputSummary: 'approved_and_dispatched',
        payload: expect.objectContaining({
          approvalId: 88,
          dispatched: true,
          schemaAction: 'candidate.connect',
          sideEffect: 'send_message_or_connect',
          idempotencyKey: 'candidate-connect:42:22',
          resumeMode: 'resume_after_approval',
          checkpointRequired: true,
          sourceStepId: 'approval-88',
          resumeCheckpointId: 123,
          resumeIdempotencyKey:
            'agent-checkpoint:resume:agent-task:42:checkpoint:123:step:approval-88:approval:88',
          resumeCursor: expect.objectContaining({
            checkpointId: 123,
            action: 'resume',
            stepId: 'approval-88',
          }),
        }),
        reason: 'user_approved_pending_action',
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      approvalId: 88,
      status: ApprovalStatus.Approved,
      dispatched: true,
      resume,
    });
  });

  it('returns checkpoint resume plan after rejection and records a rejected audit action', async () => {
    const resume = {
      checkpointId: 123,
      taskId: 42,
      action: 'resume',
      threadId: 'agent-task:42',
      idempotencyKey:
        'agent-checkpoint:resume:agent-task:42:checkpoint:123:step:approval-88:approval:88',
    };
    const { actionLogs, approvals, checkpoints, controller, dispatcher, row } =
      makeController({
        resume,
      });

    const result = await controller.reject({ user: { id: 7 } }, 88);

    expect(approvals.reject).toHaveBeenCalledWith(88, 7);
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
    expect(checkpoints.markDecision).toHaveBeenCalledWith(
      expect.objectContaining({ id: row.id, status: ApprovalStatus.Rejected }),
      'rejected',
    );
    expect(actionLogs.logAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        agentTaskId: 42,
        targetUserId: 22,
        relatedSocialRequestId: 301,
        relatedCandidateId: 501,
        outputSummary: 'rejected_by_user',
        reason: 'user_rejected_pending_action',
        payload: expect.objectContaining({
          approvalId: 88,
          resumeCheckpointId: resume.checkpointId,
          resumeIdempotencyKey: resume.idempotencyKey,
        }),
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      approvalId: 88,
      status: ApprovalStatus.Rejected,
      resume,
    });
  });

  it('returns checkpoint errors after rejection without failing the rejection response', async () => {
    const { actionLogs, approvals, checkpoints, controller, dispatcher, row } =
      makeController();
    checkpoints.markDecision.mockRejectedValueOnce(
      new Error('checkpoint write failed trace-secret'),
    );

    const result = await controller.reject({ user: { id: 7 } }, 88);

    expect(approvals.reject).toHaveBeenCalledWith(88, 7);
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
    expect(checkpoints.markDecision).toHaveBeenCalledWith(
      expect.objectContaining({ id: row.id, status: ApprovalStatus.Rejected }),
      'rejected',
    );
    expect(actionLogs.logAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        outputSummary: 'rejected_by_user',
        payload: expect.objectContaining({
          approvalId: 88,
          resumeCheckpointId: null,
          resumeIdempotencyKey: null,
          checkpointError: 'checkpoint write failed trace-secret',
        }),
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      approvalId: 88,
      status: ApprovalStatus.Rejected,
      resume: null,
      checkpointError: 'checkpoint write failed trace-secret',
    });
  });

  it('returns the latest checkpoint for a task owned by the actor', async () => {
    const { checkpoints, controller } = makeController();
    checkpoints.latestForTask.mockResolvedValue({
      id: 123,
      agentTaskId: 42,
      type: 'step',
      status: 'active',
      phase: 'tool',
      toolName: 'search_matches',
      stepId: 'search',
      approvalRequestId: null,
      parentCheckpointId: null,
      retryCount: 1,
      replayCount: 0,
      forkCount: 0,
      resumeCount: 0,
      traceId: 'trace-secret',
      state: { planner: 'hidden' },
      steps: [
        {
          id: 'profile',
          label: '正在结合上下文',
          status: 'done',
          toolName: 'life_graph',
          traceId: 'hidden-step-trace',
        },
        {
          id: 'search',
          label: '正在筛选合适的人',
          status: 'failed',
          toolName: 'social_match',
          rawJson: { hidden: true },
        },
      ],
      result: { raw: true },
      events: [{ raw: true }],
      createdAt: new Date('2026-06-14T00:00:00.000Z'),
      updatedAt: new Date('2026-06-14T00:01:00.000Z'),
    });

    const result = await controller.latestCheckpointForTask(
      { user: { id: 7 } },
      42,
    );

    expect(checkpoints.latestForTask).toHaveBeenCalledWith(7, 42);
    expect(result).toEqual({
      checkpoint: {
        id: 123,
        agentTaskId: 42,
        type: 'step',
        status: 'active',
        phase: 'tool',
        toolName: 'search_matches',
        stepId: 'search',
        approvalRequestId: null,
        parentCheckpointId: null,
        retryCount: 1,
        replayCount: 0,
        forkCount: 0,
        resumeCount: 0,
        resumable: true,
        canRetry: true,
        canReplay: true,
        canFork: true,
        threadId: 'agent-task:42',
        sourceStep: {
          stepId: 'search',
          label: '正在筛选合适的人',
          toolName: 'search_matches',
        },
        steps: [
          {
            stepId: 'profile',
            label: '正在结合上下文',
            status: 'done',
            toolName: 'life_graph',
            retryable: true,
            replayable: true,
            forkable: true,
          },
          {
            stepId: 'search',
            label: '正在筛选合适的人',
            status: 'failed',
            toolName: 'social_match',
            retryable: true,
            replayable: true,
            forkable: true,
          },
        ],
        createdAt: '2026-06-14T00:00:00.000Z',
        updatedAt: '2026-06-14T00:01:00.000Z',
      },
    });
    expect(JSON.stringify(result)).not.toContain('trace-secret');
    expect(JSON.stringify(result)).not.toContain('hidden-step-trace');
    expect(JSON.stringify(result)).not.toContain('planner');
    expect(JSON.stringify(result)).not.toContain('raw');
  });

  it('prepares checkpoint retry/replay/fork plans for owner-facing Tool UI', async () => {
    const { checkpoints, controller } = makeController();

    const retry = await controller.retryCheckpoint({ user: { id: 7 } }, 101);
    const replay = await controller.replayCheckpoint({ user: { id: 7 } }, 101);
    const fork = await controller.forkCheckpoint({ user: { id: 7 } }, 101);

    expect(checkpoints.prepareAction).toHaveBeenNthCalledWith(1, {
      ownerUserId: 7,
      checkpointId: 101,
      action: 'retry',
    });
    expect(checkpoints.prepareAction).toHaveBeenNthCalledWith(2, {
      ownerUserId: 7,
      checkpointId: 101,
      action: 'replay',
    });
    expect(checkpoints.prepareAction).toHaveBeenNthCalledWith(3, {
      ownerUserId: 7,
      checkpointId: 101,
      action: 'fork',
    });
    expect(retry).toMatchObject({
      streamEndpoint: '/api/social-agent/chat/checkpoints/101/retry/stream',
      plan: { action: 'retry', parentCheckpointId: 101 },
    });
    expect(replay).toMatchObject({
      streamEndpoint: '/api/social-agent/chat/checkpoints/101/replay/stream',
      plan: { action: 'replay', parentCheckpointId: 101 },
    });
    expect(fork).toMatchObject({
      streamEndpoint: '/api/social-agent/chat/checkpoints/101/fork/stream',
      plan: { action: 'fork', parentCheckpointId: 101 },
    });
  });

  it('prepares step-level retry/replay/fork plans for saved tool steps', async () => {
    const { checkpoints, controller } = makeController();

    const retry = await controller.retryCheckpointStep(
      { user: { id: 7 } },
      101,
      ' search ',
    );
    const replay = await controller.replayCheckpointStep(
      { user: { id: 7 } },
      101,
      'rank',
    );
    const fork = await controller.forkCheckpointStep(
      { user: { id: 7 } },
      101,
      'approval-88',
    );

    expect(checkpoints.prepareStepAction).toHaveBeenNthCalledWith(1, {
      ownerUserId: 7,
      checkpointId: 101,
      stepId: 'search',
      action: 'retry',
    });
    expect(checkpoints.prepareStepAction).toHaveBeenNthCalledWith(2, {
      ownerUserId: 7,
      checkpointId: 101,
      stepId: 'rank',
      action: 'replay',
    });
    expect(checkpoints.prepareStepAction).toHaveBeenNthCalledWith(3, {
      ownerUserId: 7,
      checkpointId: 101,
      stepId: 'approval-88',
      action: 'fork',
    });
    expect(retry).toMatchObject({
      streamEndpoint:
        '/api/social-agent/chat/checkpoints/101/steps/search/retry/stream',
      plan: {
        action: 'retry',
        resumeCursor: { stepId: 'search' },
      },
    });
    expect(replay).toMatchObject({
      streamEndpoint:
        '/api/social-agent/chat/checkpoints/101/steps/rank/replay/stream',
      plan: {
        action: 'replay',
        resumeCursor: { stepId: 'rank' },
      },
    });
    expect(fork).toMatchObject({
      streamEndpoint:
        '/api/social-agent/chat/checkpoints/101/steps/approval-88/fork/stream',
      plan: {
        action: 'fork',
        resumeCursor: { stepId: 'approval-88' },
      },
    });
  });

  it('keeps complex step ids stable when preparing step-level stream endpoints', async () => {
    const { checkpoints, controller } = makeController();

    const stepId = ' social/match rank #1 ';
    const result = await controller.replayCheckpointStep(
      { user: { id: 7 } },
      101,
      stepId,
    );

    expect(checkpoints.prepareStepAction).toHaveBeenCalledWith({
      ownerUserId: 7,
      checkpointId: 101,
      stepId: 'social/match rank #1',
      action: 'replay',
    });
    expect(result).toMatchObject({
      streamEndpoint:
        '/api/social-agent/chat/checkpoints/101/steps/social%2Fmatch%20rank%20%231/replay/stream',
      plan: {
        action: 'replay',
        resumeCursor: { stepId: 'social/match rank #1' },
      },
    });
  });

  it('rejects empty step-level checkpoint actions', async () => {
    const { controller } = makeController();

    await expect(
      controller.retryCheckpointStep({ user: { id: 7 } }, 101, '   '),
    ).rejects.toThrow('stepId is required');
  });
});
