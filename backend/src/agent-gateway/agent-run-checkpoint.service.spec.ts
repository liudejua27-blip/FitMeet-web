import { AgentRunCheckpointService } from './agent-run-checkpoint.service';
import {
  AgentRunCheckpointStatus,
  AgentRunCheckpointType,
} from './entities/agent-run-checkpoint.entity';
import type { AgentApprovalRequest } from './entities/agent-approval-request.entity';
import type { AgentTask } from './entities/agent-task.entity';
import type { SocialAgentChatRunResult } from './social-agent-chat.types';

describe('AgentRunCheckpointService', () => {
  let rows: Array<Record<string, unknown>>;
  let nextId: number;
  let service: AgentRunCheckpointService;

  beforeEach(() => {
    rows = [];
    nextId = 1;
    const repo = {
      create: jest.fn((input) => ({ ...input })),
      save: jest.fn((input) => {
        const row = {
          ...input,
          id: input.id ?? nextId++,
          resumeCount: input.resumeCount ?? 0,
          replayCount: input.replayCount ?? 0,
          retryCount: input.retryCount ?? 0,
          forkCount: input.forkCount ?? 0,
          createdAt: input.createdAt ?? new Date('2026-06-12T00:00:00.000Z'),
          updatedAt: new Date('2026-06-12T00:00:00.000Z'),
        };
        const index = rows.findIndex((item) => item.id === row.id);
        if (index >= 0) rows[index] = row;
        else rows.push(row);
        return Promise.resolve(row);
      }),
      findOne: jest.fn(({ where }) => {
        const entries = Object.entries(where ?? {});
        return Promise.resolve(
          rows
            .slice()
            .reverse()
            .find((row) =>
              entries.every(([key, value]) => row[key] === value),
            ) ?? null,
        );
      }),
      find: jest.fn(),
    };
    const eventRepo = {
      find: jest.fn().mockResolvedValue([]),
    };
    service = new AgentRunCheckpointService(repo as never, eventRepo as never);
  });

  it('saves an approval interrupt checkpoint with the original task state', async () => {
    const checkpoint = await service.saveResult({
      ownerUserId: 7,
      task: task(),
      goal: '帮我连接候选人',
      result: approvalResult(),
      steps: [
        {
          id: 'approval',
          label: '确认连接候选人',
          status: 'pending',
        },
      ],
    });

    expect(checkpoint).toMatchObject({
      id: 1,
      ownerUserId: 7,
      agentTaskId: 42,
      approvalRequestId: 88,
      type: AgentRunCheckpointType.Interrupt,
      status: AgentRunCheckpointStatus.Active,
      phase: 'approval',
      toolName: 'approval_gate',
      stepId: 'approval-88',
      runId: 'run-1',
      traceId: 'trace-1',
    });
    expect(checkpoint?.state).toMatchObject({
      checkpointProtocol: 'fitmeet.agent.checkpoint.v1',
      threadId: 'agent-task:42',
      goal: '帮我连接候选人',
      taskStatus: 'running',
      permissionMode: 'limited_auto',
      checkpointReason: 'interrupt_approval_required',
      durableCheckpointer: 'postgres_typeorm',
      approvalIds: [88],
      interrupt: {
        protocol: 'fitmeet.agent.interrupt.v1',
        kind: 'approval_required',
        threadId: 'agent-task:42',
        checkpointId: 1,
        taskId: 42,
        runId: 'run-1',
        traceId: 'trace-1',
        interruptId: 'approval:88:checkpoint:1',
        resumable: true,
        resumeAction: 'resume',
        resumeEndpoint: '/api/social-agent/chat/checkpoints/1/resume/stream',
        approvalEndpoint: '/api/agent/approvals/88/approve',
        rejectionEndpoint: '/api/agent/approvals/88/reject',
        idempotencyKey:
          'agent-checkpoint:resume:agent-task:42:checkpoint:1:step:approval-88:approval:88',
        payload: {
          approvalIds: [88],
          approvalRequestId: 88,
          actionType: 'connect_candidate',
          schemaAction: 'candidate.connect',
          sideEffect: 'send_message_or_connect',
          idempotencyKey: 'candidate-connect:42:22',
          resumeMode: 'resume_after_approval',
          checkpointRequired: true,
          targetUserId: 22,
          candidateUserId: 22,
          candidateRecordId: 501,
          socialRequestId: 301,
          riskReasons: ['这一步会联系真实用户', '发送邀请前必须由你确认'],
          auditEvent: 'social_agent.candidate.connect.approval_required',
          riskLevel: 'high',
          summary: '连接候选人之前先确认。',
          requiredConfirmations: ['连接候选人之前先确认。'],
        },
        rules: {
          payload: 'json_serializable_only',
          checkpointer: 'database_durable',
          sideEffectsBeforeInterrupt: 'idempotent_only',
          resumeCursor: 'thread_id_and_checkpoint_id',
        },
        recoveryActions: expect.arrayContaining([
          {
            action: 'resume',
            label: '继续执行',
            method: 'POST',
            endpoint: '/api/social-agent/chat/checkpoints/1/resume/stream',
            idempotencyKey:
              'agent-checkpoint:resume:agent-task:42:checkpoint:1:step:approval-88:approval:88',
            requiresApprovalDecision: true,
          },
          {
            action: 'retry',
            label: '重试这一步',
            method: 'POST',
            endpoint: '/api/social-agent/chat/checkpoints/1/retry/stream',
            idempotencyKey:
              'agent-checkpoint:retry:agent-task:42:checkpoint:1:step:approval-88:approval:88',
          },
          {
            action: 'replay',
            label: '回放过程',
            method: 'POST',
            endpoint: '/api/social-agent/chat/checkpoints/1/replay/stream',
            idempotencyKey:
              'agent-checkpoint:replay:agent-task:42:checkpoint:1:step:approval-88:approval:88',
          },
          {
            action: 'fork',
            label: '创建分支',
            method: 'POST',
            endpoint: '/api/social-agent/chat/checkpoints/1/fork/stream',
            idempotencyKey:
              'agent-checkpoint:fork:agent-task:42:checkpoint:1:step:approval-88:approval:88',
          },
        ]),
        stepActions: expect.arrayContaining([
          {
            stepId: 'approval',
            action: 'retry',
            label: '重试这一步',
            method: 'POST',
            endpoint:
              '/api/social-agent/chat/checkpoints/1/steps/approval/retry/stream',
            idempotencyKey:
              'agent-checkpoint:retry:agent-task:42:checkpoint:1:step:approval:approval:88',
          },
          {
            stepId: 'approval',
            action: 'replay',
            label: '回放过程',
            method: 'POST',
            endpoint:
              '/api/social-agent/chat/checkpoints/1/steps/approval/replay/stream',
            idempotencyKey:
              'agent-checkpoint:replay:agent-task:42:checkpoint:1:step:approval:approval:88',
          },
          {
            stepId: 'approval',
            action: 'fork',
            label: '创建分支',
            method: 'POST',
            endpoint:
              '/api/social-agent/chat/checkpoints/1/steps/approval/fork/stream',
            idempotencyKey:
              'agent-checkpoint:fork:agent-task:42:checkpoint:1:step:approval:approval:88',
          },
        ]),
      },
    });
    expect(() => JSON.stringify(checkpoint?.state.interrupt)).not.toThrow();
    expect(checkpoint?.resumePrompt).toContain(
      '用户已经确认刚才中断的高风险步骤',
    );
    expect(checkpoint?.resumePrompt).not.toContain('原始目标');
  });

  it('returns a resume plan for the same checkpoint after approval', async () => {
    await service.saveResult({
      ownerUserId: 7,
      task: task(),
      goal: '帮我连接候选人',
      result: approvalResult(),
      steps: [],
    });

    const plan = await service.markDecision(approval(), 'approved');

    expect(plan).toMatchObject({
      checkpointId: 1,
      parentCheckpointId: null,
      taskId: 42,
      action: 'resume',
      threadId: 'agent-task:42',
      resumeCursor: {
        threadId: 'agent-task:42',
        checkpointId: 1,
        parentCheckpointId: null,
        action: 'resume',
        stepId: 'approval-88',
      },
      sourceStep: {
        stepId: 'approval-88',
        label: null,
        toolName: 'approval_gate',
      },
      stepScope: {
        mode: 'full_checkpoint',
        stepCount: 0,
        sourceCheckpointId: null,
      },
      sideEffectPolicy: {
        idempotencyKey:
          'agent-checkpoint:resume:agent-task:42:checkpoint:1:step:approval-88:approval:88',
        sideEffectsBeforeResume: 'idempotent_only',
        duplicatePolicy: 'reuse_idempotency_key',
      },
      idempotencyKey:
        'agent-checkpoint:resume:agent-task:42:checkpoint:1:step:approval-88:approval:88',
      interrupt: expect.objectContaining({
        protocol: 'fitmeet.agent.interrupt.v1',
        checkpointId: 1,
      }),
      runId: 'run-1',
      traceId: 'trace-1',
      resumePrompt: expect.stringContaining('不要重新询问已确认内容'),
    });
    expect(rows[0]).toMatchObject({
      status: AgentRunCheckpointStatus.Resumed,
      resumeCount: 1,
    });
  });

  it('does not double-count an already resumed approval checkpoint', async () => {
    await service.saveResult({
      ownerUserId: 7,
      task: task(),
      goal: '帮我连接候选人',
      result: approvalResult(),
      steps: [],
    });

    const approvedPlan = await service.markDecision(approval(), 'approved');
    const streamPlan = await service.prepareAction({
      ownerUserId: 7,
      checkpointId: approvedPlan?.checkpointId ?? 0,
      action: 'resume',
    });

    expect(streamPlan).toMatchObject({
      checkpointId: 1,
      action: 'resume',
      idempotencyKey:
        'agent-checkpoint:resume:agent-task:42:checkpoint:1:step:approval-88:approval:88',
      resumeCursor: {
        checkpointId: 1,
        action: 'resume',
        stepId: 'approval-88',
      },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: AgentRunCheckpointStatus.Resumed,
      resumeCount: 1,
    });
  });

  it('preserves the approval interrupt and side-effect idempotency key across disconnect resume', async () => {
    await service.saveResult({
      ownerUserId: 7,
      task: task(),
      goal: '帮我连接候选人',
      result: approvalResult(),
      steps: [],
    });

    const approvedPlan = await service.markDecision(approval(), 'approved');
    const restoredPlan = await service.prepareAction({
      ownerUserId: 7,
      checkpointId: approvedPlan?.checkpointId ?? 0,
      action: 'resume',
    });

    expect(restoredPlan).toMatchObject({
      checkpointId: 1,
      action: 'resume',
      resumeCursor: {
        threadId: 'agent-task:42',
        checkpointId: 1,
        action: 'resume',
        stepId: 'approval-88',
      },
      idempotencyKey:
        'agent-checkpoint:resume:agent-task:42:checkpoint:1:step:approval-88:approval:88',
      interrupt: {
        protocol: 'fitmeet.agent.interrupt.v1',
        kind: 'approval_required',
        checkpointId: 1,
        payload: expect.objectContaining({
          approvalRequestId: 88,
          schemaAction: 'candidate.connect',
          sideEffect: 'send_message_or_connect',
          idempotencyKey: 'candidate-connect:42:22',
          resumeMode: 'resume_after_approval',
          checkpointRequired: true,
          targetUserId: 22,
          riskReasons: ['这一步会联系真实用户', '发送邀请前必须由你确认'],
        }),
        rules: {
          payload: 'json_serializable_only',
          checkpointer: 'database_durable',
          sideEffectsBeforeInterrupt: 'idempotent_only',
          resumeCursor: 'thread_id_and_checkpoint_id',
        },
      },
    });
    expect(restoredPlan.interrupt?.idempotencyKey).toBe(
      restoredPlan.idempotencyKey,
    );
    expect(() => JSON.stringify(restoredPlan.interrupt)).not.toThrow();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: AgentRunCheckpointStatus.Resumed,
      resumeCount: 1,
    });
  });

  it('returns a rejected resume plan without allowing the side effect after rejection', async () => {
    await service.saveResult({
      ownerUserId: 7,
      task: task(),
      goal: '帮我连接候选人',
      result: approvalResult(),
      steps: [],
    });

    const plan = await service.markDecision(
      {
        ...approval(),
        status: 'rejected',
      } as AgentApprovalRequest,
      'rejected',
    );

    expect(plan).toMatchObject({
      checkpointId: 1,
      parentCheckpointId: null,
      taskId: 42,
      action: 'resume',
      threadId: 'agent-task:42',
      resumeCursor: {
        threadId: 'agent-task:42',
        checkpointId: 1,
        parentCheckpointId: null,
        action: 'resume',
        stepId: 'approval-88',
      },
      idempotencyKey:
        'agent-checkpoint:resume:agent-task:42:checkpoint:1:step:approval-88:approval:88',
      interrupt: expect.objectContaining({
        protocol: 'fitmeet.agent.interrupt.v1',
        checkpointId: 1,
      }),
      runId: 'run-1',
      traceId: 'trace-1',
      resumePrompt: expect.stringContaining('用户已经拒绝刚才中断的高风险步骤'),
    });
    expect(plan?.resumePrompt).toContain('不要发送消息、连接候选人或创建活动');
    expect(rows[0]).toMatchObject({
      status: AgentRunCheckpointStatus.Resumed,
      resumeCount: 1,
    });
    expect(rows[0]?.state).toMatchObject({
      approvalDecision: 'rejected',
      approvalId: 88,
      approvalStatus: 'rejected',
      resume: {
        protocol: 'fitmeet.agent.resume.v1',
        threadId: 'agent-task:42',
        checkpointId: 1,
        approvalId: 88,
        decision: 'rejected',
        idempotencyKey:
          'agent-checkpoint:resume:agent-task:42:checkpoint:1:step:approval-88:approval:88',
      },
    });
  });

  it('creates replay and fork child checkpoints from a saved state', async () => {
    await service.saveResult({
      ownerUserId: 7,
      task: task(),
      goal: '重新整理推荐',
      result: approvalResult(),
      steps: [],
    });

    const replay = await service.prepareAction({
      ownerUserId: 7,
      checkpointId: 1,
      action: 'replay',
    });
    const fork = await service.prepareAction({
      ownerUserId: 7,
      checkpointId: 2,
      action: 'fork',
    });

    expect(replay).toMatchObject({
      checkpointId: 2,
      parentCheckpointId: 1,
      taskId: 42,
      action: 'replay',
    });
    expect(fork).toMatchObject({
      checkpointId: 3,
      parentCheckpointId: 2,
      taskId: 42,
      action: 'fork',
    });
    expect(rows[1]).toMatchObject({
      id: 2,
      type: AgentRunCheckpointType.Replay,
      parentCheckpointId: 1,
      status: AgentRunCheckpointStatus.Forked,
      forkCount: 1,
    });
    expect(rows[2]).toMatchObject({
      id: 3,
      type: AgentRunCheckpointType.Fork,
      parentCheckpointId: 2,
      status: AgentRunCheckpointStatus.Active,
    });
  });

  it('creates a retry child checkpoint for a single saved tool step', async () => {
    await service.saveStep({
      ownerUserId: 7,
      task: task(),
      goal: '重新整理推荐',
      runId: 'run-step',
      traceId: 'trace-step',
      step: {
        id: 'search',
        label: '正在筛选合适的人',
        status: 'failed',
      },
      steps: [
        {
          id: 'profile',
          label: '正在结合上下文',
          status: 'done',
        },
        {
          id: 'search',
          label: '正在筛选合适的人',
          status: 'failed',
        },
      ],
    });

    const retry = await service.prepareStepAction({
      ownerUserId: 7,
      checkpointId: 1,
      stepId: 'search',
      action: 'retry',
    });

    expect(retry).toMatchObject({
      checkpointId: 2,
      parentCheckpointId: 1,
      taskId: 42,
      action: 'retry',
      runId: 'run-step',
      traceId: 'trace-step',
      resumePrompt: expect.stringContaining('只重试已保存的工具步骤'),
      threadId: 'agent-task:42',
      resumeCursor: {
        threadId: 'agent-task:42',
        checkpointId: 2,
        parentCheckpointId: 1,
        action: 'retry',
        stepId: 'search',
      },
      sourceStep: {
        stepId: 'search',
        label: '正在筛选合适的人',
        toolName: 'social_match',
      },
      stepScope: {
        mode: 'through_step',
        stepCount: 2,
        sourceCheckpointId: 1,
      },
      sideEffectPolicy: {
        idempotencyKey:
          'agent-checkpoint:retry:agent-task:42:checkpoint:2:step:search',
        sideEffectsBeforeResume: 'idempotent_only',
        duplicatePolicy: 'reuse_idempotency_key',
      },
      idempotencyKey:
        'agent-checkpoint:retry:agent-task:42:checkpoint:2:step:search',
    });
    expect(retry?.resumePrompt).not.toContain('原始目标');
    expect(rows[1]).toMatchObject({
      id: 2,
      type: AgentRunCheckpointType.Retry,
      parentCheckpointId: 1,
      status: AgentRunCheckpointStatus.Active,
      stepId: 'search',
      toolName: 'social_match',
      state: expect.objectContaining({
        checkpointReason: 'retry_from_tool_step',
        sourceCheckpointId: 1,
        sourceStepId: 'search',
        sourceToolName: 'social_match',
        stepAction: 'retry',
        resume: {
          protocol: 'fitmeet.agent.resume.v1',
          threadId: 'agent-task:42',
          checkpointId: 2,
          parentCheckpointId: 1,
          sourceCheckpointId: 1,
          sourceStepId: 'search',
          action: 'retry',
          idempotencyKey:
            'agent-checkpoint:retry:agent-task:42:checkpoint:2:step:search',
          sideEffectsBeforeResume: 'idempotent_only',
        },
      }),
    });
    expect(rows[0]).toMatchObject({
      status: AgentRunCheckpointStatus.Retried,
      retryCount: 1,
      replayCount: 0,
    });
  });

  it('creates replay and fork child checkpoints for a single saved tool step', async () => {
    await service.saveStep({
      ownerUserId: 7,
      task: task(),
      goal: '重新解释候选排序',
      runId: 'run-step',
      traceId: 'trace-step',
      step: {
        id: 'rank',
        label: '正在排序候选人',
        status: 'done',
      },
      steps: [
        {
          id: 'profile',
          label: '正在结合上下文',
          status: 'done',
        },
        {
          id: 'search',
          label: '正在筛选合适的人',
          status: 'done',
        },
        {
          id: 'rank',
          label: '正在排序候选人',
          status: 'done',
        },
        {
          id: 'answer',
          label: '正在整理回复',
          status: 'pending',
        },
      ],
    });

    const replay = await service.prepareStepAction({
      ownerUserId: 7,
      checkpointId: 1,
      stepId: 'rank',
      action: 'replay',
    });

    expect(replay).toMatchObject({
      checkpointId: 2,
      parentCheckpointId: 1,
      taskId: 42,
      action: 'replay',
      runId: 'run-step',
      traceId: 'trace-step',
      resumeCursor: {
        threadId: 'agent-task:42',
        checkpointId: 2,
        parentCheckpointId: 1,
        action: 'replay',
        stepId: 'rank',
      },
      sourceStep: {
        stepId: 'rank',
        label: '正在排序候选人',
        toolName: 'social_match',
      },
      stepScope: {
        mode: 'through_step',
        stepCount: 3,
        sourceCheckpointId: 1,
      },
      sideEffectPolicy: {
        idempotencyKey:
          'agent-checkpoint:replay:agent-task:42:checkpoint:2:step:rank',
        sideEffectsBeforeResume: 'idempotent_only',
        duplicatePolicy: 'reuse_idempotency_key',
      },
      idempotencyKey:
        'agent-checkpoint:replay:agent-task:42:checkpoint:2:step:rank',
    });
    expect(rows[1]).toMatchObject({
      id: 2,
      type: AgentRunCheckpointType.Replay,
      parentCheckpointId: 1,
      status: AgentRunCheckpointStatus.Active,
      phase: 'tool',
      stepId: 'rank',
      toolName: 'social_match',
      state: expect.objectContaining({
        checkpointReason: 'replay_from_tool_step',
        sourceCheckpointId: 1,
        sourceStepId: 'rank',
        sourceToolName: 'social_match',
        stepAction: 'replay',
        resume: {
          protocol: 'fitmeet.agent.resume.v1',
          threadId: 'agent-task:42',
          checkpointId: 2,
          parentCheckpointId: 1,
          sourceCheckpointId: 1,
          sourceStepId: 'rank',
          action: 'replay',
          idempotencyKey:
            'agent-checkpoint:replay:agent-task:42:checkpoint:2:step:rank',
          sideEffectsBeforeResume: 'idempotent_only',
        },
      }),
    });
    expect(rows[1]?.steps).toHaveLength(3);
    expect(() => JSON.stringify(rows[1]?.state)).not.toThrow();
    expect(rows[0]).toMatchObject({
      status: AgentRunCheckpointStatus.Replayed,
      replayCount: 1,
      forkCount: 0,
    });

    const fork = await service.prepareStepAction({
      ownerUserId: 7,
      checkpointId: 2,
      stepId: 'rank',
      action: 'fork',
    });

    expect(fork).toMatchObject({
      checkpointId: 3,
      parentCheckpointId: 2,
      taskId: 42,
      action: 'fork',
      resumeCursor: {
        threadId: 'agent-task:42',
        checkpointId: 3,
        parentCheckpointId: 2,
        action: 'fork',
        stepId: 'rank',
      },
      sourceStep: {
        stepId: 'rank',
        label: '正在排序候选人',
        toolName: 'social_match',
      },
      stepScope: {
        mode: 'through_step',
        stepCount: 3,
        sourceCheckpointId: 2,
      },
      sideEffectPolicy: {
        idempotencyKey:
          'agent-checkpoint:fork:agent-task:42:checkpoint:3:step:rank',
        sideEffectsBeforeResume: 'idempotent_only',
        duplicatePolicy: 'reuse_idempotency_key',
      },
      idempotencyKey:
        'agent-checkpoint:fork:agent-task:42:checkpoint:3:step:rank',
    });
    expect(rows[2]).toMatchObject({
      id: 3,
      type: AgentRunCheckpointType.Fork,
      parentCheckpointId: 2,
      status: AgentRunCheckpointStatus.Active,
      phase: 'fork',
      stepId: 'rank',
      toolName: 'social_match',
      state: expect.objectContaining({
        checkpointReason: 'fork_from_tool_step',
        sourceCheckpointId: 2,
        sourceStepId: 'rank',
        sourceToolName: 'social_match',
        stepAction: 'fork',
        resume: {
          protocol: 'fitmeet.agent.resume.v1',
          threadId: 'agent-task:42',
          checkpointId: 3,
          parentCheckpointId: 2,
          sourceCheckpointId: 2,
          sourceStepId: 'rank',
          action: 'fork',
          idempotencyKey:
            'agent-checkpoint:fork:agent-task:42:checkpoint:3:step:rank',
          sideEffectsBeforeResume: 'idempotent_only',
        },
      }),
    });
    expect(rows[2]?.steps).toHaveLength(3);
    expect(() => JSON.stringify(rows[2]?.state)).not.toThrow();
    expect(rows[1]).toMatchObject({
      status: AgentRunCheckpointStatus.Forked,
      forkCount: 1,
    });
  });
});

function task(): AgentTask {
  return {
    id: 42,
    status: 'running',
    taskType: 'social',
    permissionMode: 'limited_auto',
  } as unknown as AgentTask;
}

function approval(): AgentApprovalRequest {
  return {
    id: 88,
    userId: 7,
    status: 'approved',
  } as AgentApprovalRequest;
}

function approvalResult(): SocialAgentChatRunResult {
  return {
    taskId: 42,
    status: 'waiting_approval',
    traceId: 'trace-1',
    agentLoop: { runId: 'run-1', steps: [] },
    assistantMessage: '这一步需要你确认。',
    cards: [],
    visibleSteps: [],
    safety: {
      blocked: false,
      level: 'high',
      reasons: [],
      boundaryNotes: [],
      requiredConfirmations: ['连接候选人之前先确认。'],
    },
    approvalRequiredActions: [
      {
        id: 88,
        approvalId: 88,
        type: 'action',
        actionType: 'connect_candidate',
        summary: '连接候选人之前先确认。',
        riskLevel: 'high',
        payload: {
          schemaAction: 'candidate.connect',
          actionType: 'send_invite',
          sideEffect: 'send_message_or_connect',
          approvalRequired: true,
          checkpointRequired: true,
          resumeMode: 'resume_after_approval',
          idempotencyKey: 'candidate-connect:42:22',
          targetUserId: 22,
          candidateUserId: 22,
          candidateRecordId: 501,
          socialRequestId: 301,
          riskReasons: ['这一步会联系真实用户', '发送邀请前必须由你确认'],
          auditEvent: 'social_agent.candidate.connect.approval_required',
        },
        expiresAt: null,
      },
    ],
  } as unknown as SocialAgentChatRunResult;
}
