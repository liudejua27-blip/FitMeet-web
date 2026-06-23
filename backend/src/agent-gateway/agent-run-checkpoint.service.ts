import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  cleanDisplayText,
  sanitizeForDisplay,
} from '../common/display-text.util';
import { AgentApprovalRequest } from './entities/agent-approval-request.entity';
import {
  AgentRunCheckpoint,
  AgentRunCheckpointStatus,
  AgentRunCheckpointType,
} from './entities/agent-run-checkpoint.entity';
import {
  AgentTask,
  AgentTaskEvent,
  AgentTaskEventActor,
  AgentTaskEventType,
} from './entities/agent-task.entity';
import type {
  SocialAgentChatRunResult,
  SocialAgentVisibleStep,
} from './social-agent-chat.types';
import type { SocialAgentEventV2 } from './social-agent-event-v2.types';

export type AgentRunCheckpointAction = 'resume' | 'retry' | 'replay' | 'fork';

export type AgentRunInterruptPayload = {
  protocol: 'fitmeet.agent.interrupt.v1';
  kind: 'approval_required';
  threadId: string;
  checkpointId: number;
  taskId: number;
  runId: string | null;
  traceId: string | null;
  interruptId: string;
  resumable: true;
  resumeAction: 'resume';
  resumeEndpoint: string;
  approvalEndpoint: string;
  rejectionEndpoint: string;
  idempotencyKey: string;
  payload: {
    approvalIds: number[];
    approvalRequestId: number;
    actionType: string | null;
    schemaAction?: string | null;
    sideEffect?: string | null;
    idempotencyKey?: string | null;
    resumeMode?: string | null;
    checkpointRequired?: boolean;
    targetUserId?: number | null;
    candidateUserId?: number | null;
    candidateRecordId?: number | null;
    socialRequestId?: number | null;
    riskReasons?: string[];
    auditEvent?: string | null;
    riskLevel: string | null;
    summary: string | null;
    requiredConfirmations: string[];
  };
  rules: {
    payload: 'json_serializable_only';
    checkpointer: 'database_durable';
    sideEffectsBeforeInterrupt: 'idempotent_only';
    resumeCursor: 'thread_id_and_checkpoint_id';
  };
  recoveryActions: Array<{
    action: 'resume' | 'retry' | 'replay' | 'fork';
    label: string;
    method: 'POST';
    endpoint: string;
    idempotencyKey: string;
    requiresApprovalDecision?: boolean;
  }>;
  stepActions: Array<{
    stepId: string;
    action: 'retry' | 'replay' | 'fork';
    label: string;
    method: 'POST';
    endpoint: string;
    idempotencyKey: string;
  }>;
};

export type AgentRunCheckpointResumePlan = {
  checkpointId: number;
  parentCheckpointId: number | null;
  taskId: number;
  action: AgentRunCheckpointAction;
  resumePrompt: string;
  threadId: string;
  resumeCursor: {
    threadId: string;
    checkpointId: number;
    parentCheckpointId: number | null;
    action: AgentRunCheckpointAction;
    stepId: string | null;
  };
  sourceStep: {
    stepId: string;
    label: string | null;
    toolName: string | null;
  } | null;
  stepScope: {
    mode: 'full_checkpoint' | 'through_step';
    stepCount: number;
    sourceCheckpointId: number | null;
  };
  sideEffectPolicy: {
    idempotencyKey: string;
    sideEffectsBeforeResume: 'idempotent_only';
    duplicatePolicy: 'reuse_idempotency_key';
  };
  idempotencyKey: string;
  interrupt: AgentRunInterruptPayload | null;
  traceId: string | null;
  runId: string | null;
};

@Injectable()
export class AgentRunCheckpointService {
  constructor(
    @InjectRepository(AgentRunCheckpoint)
    private readonly repo: Repository<AgentRunCheckpoint>,
    @InjectRepository(AgentTaskEvent)
    private readonly eventRepo: Repository<AgentTaskEvent>,
  ) {}

  async saveStep(input: {
    ownerUserId: number;
    task: AgentTask;
    goal: string;
    step: SocialAgentVisibleStep;
    steps: SocialAgentVisibleStep[];
    runId?: string | null;
    traceId?: string | null;
  }): Promise<AgentRunCheckpoint> {
    return this.repo.save(
      this.repo.create({
        ownerUserId: input.ownerUserId,
        agentTaskId: input.task.id,
        type: AgentRunCheckpointType.Step,
        status: AgentRunCheckpointStatus.Active,
        runId: input.runId ?? null,
        traceId: input.traceId ?? null,
        phase: input.step.status === 'done' ? 'observe' : 'tool',
        toolName: this.toolNameFromStep(input.step),
        stepId: input.step.id,
        resumePrompt: this.buildResumePrompt({
          action: 'resume',
          goal: input.goal,
          step: input.step,
        }),
        state: {
          checkpointProtocol: 'fitmeet.agent.checkpoint.v1',
          threadId: this.threadIdForTask(input.task.id),
          goal: input.goal,
          taskStatus: input.task.status,
          taskType: input.task.taskType,
          checkpointReason: 'step_snapshot',
          durableCheckpointer: 'postgres_typeorm',
        },
        steps: input.steps.map((step) => ({ ...step })),
        result: {},
        events: [],
      }),
    );
  }

  async saveResult(input: {
    ownerUserId: number;
    task: AgentTask;
    goal: string;
    result: SocialAgentChatRunResult;
    steps: SocialAgentVisibleStep[];
  }): Promise<AgentRunCheckpoint | null> {
    const approvalIds = this.approvalIdsFromResult(input.result);
    const type =
      approvalIds.length > 0
        ? AgentRunCheckpointType.Interrupt
        : AgentRunCheckpointType.Result;
    const latestEvents = await this.latestEvents(input.task.id);
    const saved = await this.repo.save(
      this.repo.create({
        ownerUserId: input.ownerUserId,
        agentTaskId: input.task.id,
        approvalRequestId: approvalIds[0] ?? null,
        type,
        status: AgentRunCheckpointStatus.Active,
        runId: this.stringOrNull(input.result.agentLoop?.runId),
        traceId: this.stringOrNull(input.result.traceId),
        phase: approvalIds.length > 0 ? 'approval' : 'answer',
        toolName: approvalIds.length > 0 ? 'approval_gate' : null,
        stepId: approvalIds.length > 0 ? `approval-${approvalIds[0]}` : null,
        resumePrompt: this.buildResumePrompt({
          action: 'resume',
          goal: input.goal,
          approvalRequired: approvalIds.length > 0,
        }),
        state: {
          checkpointProtocol: 'fitmeet.agent.checkpoint.v1',
          threadId: this.threadIdForTask(input.task.id),
          goal: input.goal,
          taskStatus: input.task.status,
          permissionMode: input.task.permissionMode,
          checkpointReason:
            approvalIds.length > 0
              ? 'interrupt_approval_required'
              : 'result_snapshot',
          durableCheckpointer: 'postgres_typeorm',
          approvalIds,
        },
        steps: input.steps.map((step) => ({ ...step })),
        result: input.result as unknown as Record<string, unknown>,
        events: latestEvents,
      }),
    );

    if (approvalIds.length > 0) {
      saved.state = {
        ...saved.state,
        interrupt: this.buildApprovalInterruptPayload({
          checkpoint: saved,
          result: input.result,
          approvalIds,
        }),
      };
      await this.repo.save(saved);
    }

    if (approvalIds.length <= 1) return saved;
    for (const approvalId of approvalIds.slice(1)) {
      const sibling = await this.repo.save(
        this.repo.create({
          ...saved,
          id: undefined,
          approvalRequestId: approvalId,
          stepId: `approval-${approvalId}`,
          parentCheckpointId: saved.id,
        }),
      );
      sibling.state = {
        ...sibling.state,
        interrupt: this.buildApprovalInterruptPayload({
          checkpoint: sibling,
          result: input.result,
          approvalIds,
        }),
      };
      await this.repo.save(sibling);
    }
    return saved;
  }

  async markDecision(
    approval: AgentApprovalRequest,
    decision: 'approved' | 'rejected',
  ): Promise<AgentRunCheckpointResumePlan | null> {
    const checkpoint = await this.repo.findOne({
      where: {
        ownerUserId: approval.userId,
        approvalRequestId: approval.id,
        status: AgentRunCheckpointStatus.Active,
      },
      order: { createdAt: 'DESC' },
    });
    if (!checkpoint) return null;
    checkpoint.status = AgentRunCheckpointStatus.Resumed;
    checkpoint.resumeCount += 1;
    checkpoint.resumedAt = new Date();
    checkpoint.resumePrompt =
      decision === 'rejected'
        ? this.buildApprovalRejectedResumePrompt(
            this.stringOrNull(checkpoint.state.goal) ?? checkpoint.resumePrompt,
          )
        : checkpoint.resumePrompt;
    checkpoint.state = {
      ...checkpoint.state,
      approvalDecision: decision,
      approvalId: approval.id,
      approvalStatus: approval.status,
      decidedAt: checkpoint.resumedAt.toISOString(),
      resume: {
        protocol: 'fitmeet.agent.resume.v1',
        threadId: this.threadIdForTask(checkpoint.agentTaskId),
        checkpointId: checkpoint.id,
        approvalId: approval.id,
        decision,
        idempotencyKey: this.idempotencyKeyFor(checkpoint, 'resume'),
      },
    };
    const saved = await this.repo.save(checkpoint);
    await this.appendApprovalResolvedEvent(saved, approval, decision);
    return this.toResumePlan(saved, 'resume');
  }

  async prepareAction(input: {
    ownerUserId: number;
    checkpointId: number;
    action: AgentRunCheckpointAction;
  }): Promise<AgentRunCheckpointResumePlan> {
    const checkpoint = await this.findOwned(
      input.ownerUserId,
      input.checkpointId,
    );
    if (input.action === 'resume') {
      if (
        checkpoint.status === AgentRunCheckpointStatus.Resumed &&
        this.hasResumeState(checkpoint.state)
      ) {
        return this.toResumePlan(checkpoint, 'resume');
      }
      checkpoint.status = AgentRunCheckpointStatus.Resumed;
      checkpoint.resumeCount += 1;
      checkpoint.resumedAt = new Date();
      const saved = await this.repo.save(checkpoint);
      return this.toResumePlan(saved, 'resume');
    }

    const child = await this.repo.save(
      this.repo.create({
        ownerUserId: checkpoint.ownerUserId,
        agentTaskId: checkpoint.agentTaskId,
        approvalRequestId: checkpoint.approvalRequestId,
        parentCheckpointId: checkpoint.id,
        type: this.childTypeForAction(input.action),
        status: AgentRunCheckpointStatus.Active,
        runId: checkpoint.runId,
        traceId: checkpoint.traceId,
        phase: checkpoint.phase,
        toolName: checkpoint.toolName,
        stepId: checkpoint.stepId,
        resumePrompt: this.buildResumePrompt({
          action: input.action,
          goal:
            this.stringOrNull(checkpoint.state.goal) ?? checkpoint.resumePrompt,
          step: checkpoint.steps.at(-1) as SocialAgentVisibleStep | undefined,
        }),
        state: {
          ...checkpoint.state,
          checkpointReason: `${input.action}_from_checkpoint`,
          sourceCheckpointId: checkpoint.id,
          resume: this.resumeStateForChild(checkpoint, input.action),
        },
        steps: checkpoint.steps,
        result: checkpoint.result,
        events: checkpoint.events,
      }),
    );
    child.state = {
      ...child.state,
      resume: this.resumeStateForChild(
        checkpoint,
        input.action,
        checkpoint.stepId ?? undefined,
        child,
      ),
    };
    await this.repo.save(child);
    this.markParentForChildAction(checkpoint, input.action);
    await this.repo.save(checkpoint);
    return this.toResumePlan(child, input.action);
  }

  async prepareStepAction(input: {
    ownerUserId: number;
    checkpointId: number;
    stepId: string;
    action: Exclude<AgentRunCheckpointAction, 'resume'>;
  }): Promise<AgentRunCheckpointResumePlan> {
    const checkpoint = await this.findOwned(
      input.ownerUserId,
      input.checkpointId,
    );
    const targetStep = this.findStep(checkpoint, input.stepId);
    const targetIndex = checkpoint.steps.findIndex(
      (step) => this.stringOrNull(step.id) === targetStep.id,
    );
    const scopedSteps =
      targetIndex >= 0
        ? checkpoint.steps.slice(0, targetIndex + 1)
        : checkpoint.steps;
    const child = await this.repo.save(
      this.repo.create({
        ownerUserId: checkpoint.ownerUserId,
        agentTaskId: checkpoint.agentTaskId,
        approvalRequestId: checkpoint.approvalRequestId,
        parentCheckpointId: checkpoint.id,
        type: this.childTypeForAction(input.action),
        status: AgentRunCheckpointStatus.Active,
        runId: checkpoint.runId,
        traceId: checkpoint.traceId,
        phase: input.action === 'fork' ? 'fork' : 'tool',
        toolName: this.toolNameFromStep(targetStep),
        stepId: targetStep.id,
        resumePrompt: this.buildResumePrompt({
          action: input.action,
          goal:
            this.stringOrNull(checkpoint.state.goal) ?? checkpoint.resumePrompt,
          step: targetStep,
        }),
        state: {
          ...checkpoint.state,
          checkpointReason: `${input.action}_from_tool_step`,
          sourceCheckpointId: checkpoint.id,
          sourceStepId: targetStep.id,
          sourceToolName: this.toolNameFromStep(targetStep),
          stepAction: input.action,
          resume: this.resumeStateForChild(
            checkpoint,
            input.action,
            targetStep.id,
          ),
        },
        steps: scopedSteps,
        result: checkpoint.result,
        events: checkpoint.events,
      }),
    );
    child.state = {
      ...child.state,
      resume: this.resumeStateForChild(
        checkpoint,
        input.action,
        targetStep.id,
        child,
      ),
    };
    await this.repo.save(child);
    this.markParentForChildAction(checkpoint, input.action);
    await this.repo.save(checkpoint);
    return this.toResumePlan(child, input.action);
  }

  async latestForTask(
    ownerUserId: number,
    taskId: number,
  ): Promise<AgentRunCheckpoint | null> {
    return this.repo.findOne({
      where: { ownerUserId, agentTaskId: taskId },
      order: { createdAt: 'DESC' },
    });
  }

  private async findOwned(ownerUserId: number, checkpointId: number) {
    const checkpoint = await this.repo.findOne({
      where: { id: checkpointId, ownerUserId },
    });
    if (!checkpoint) throw new NotFoundException('Checkpoint not found');
    return checkpoint;
  }

  private childTypeForAction(
    action: Exclude<AgentRunCheckpointAction, 'resume'>,
  ): AgentRunCheckpointType {
    if (action === 'retry') return AgentRunCheckpointType.Retry;
    if (action === 'fork') return AgentRunCheckpointType.Fork;
    return AgentRunCheckpointType.Replay;
  }

  private markParentForChildAction(
    checkpoint: AgentRunCheckpoint,
    action: Exclude<AgentRunCheckpointAction, 'resume'>,
  ) {
    if (action === 'retry') {
      checkpoint.retryCount += 1;
      checkpoint.status = AgentRunCheckpointStatus.Retried;
      return;
    }
    if (action === 'fork') {
      checkpoint.forkCount += 1;
      checkpoint.status = AgentRunCheckpointStatus.Forked;
      return;
    }
    checkpoint.replayCount += 1;
    checkpoint.status = AgentRunCheckpointStatus.Replayed;
  }

  private toResumePlan(
    checkpoint: AgentRunCheckpoint,
    action: AgentRunCheckpointAction,
  ): AgentRunCheckpointResumePlan {
    const idempotencyKey = this.idempotencyKeyFor(checkpoint, action);
    const sourceStep = this.sourceStepForPlan(checkpoint);
    const stepScope = this.stepScopeForPlan(checkpoint);
    return {
      checkpointId: checkpoint.id,
      parentCheckpointId: checkpoint.parentCheckpointId ?? null,
      taskId: checkpoint.agentTaskId,
      action,
      resumePrompt:
        cleanDisplayText(checkpoint.resumePrompt, '').trim() ||
        '继续刚才保存的 Agent 步骤。',
      threadId: this.threadIdForTask(checkpoint.agentTaskId),
      resumeCursor: {
        threadId: this.threadIdForTask(checkpoint.agentTaskId),
        checkpointId: checkpoint.id,
        parentCheckpointId: checkpoint.parentCheckpointId ?? null,
        action,
        stepId:
          checkpoint.stepId ?? this.stringOrNull(checkpoint.state.sourceStepId),
      },
      sourceStep,
      stepScope,
      sideEffectPolicy: {
        idempotencyKey,
        sideEffectsBeforeResume: 'idempotent_only',
        duplicatePolicy: 'reuse_idempotency_key',
      },
      idempotencyKey,
      interrupt: this.interruptFromState(checkpoint.state),
      traceId: checkpoint.traceId,
      runId: checkpoint.runId,
    };
  }

  private async latestEvents(taskId: number) {
    const events = await this.eventRepo.find({
      where: { taskId },
      order: { createdAt: 'DESC' },
      take: 20,
    });
    return events.reverse().map((event) => ({
      id: event.id,
      eventType: event.eventType,
      summary: event.summary,
      payload: event.payload,
      stepId: event.stepId,
      toolCallId: event.toolCallId,
      createdAt: event.createdAt.toISOString(),
    }));
  }

  private async appendApprovalResolvedEvent(
    checkpoint: AgentRunCheckpoint,
    approval: AgentApprovalRequest,
    decision: 'approved' | 'rejected',
  ): Promise<void> {
    const runId = checkpoint.runId || `approval:${approval.id}`;
    const latest = await this.latestEvents(checkpoint.agentTaskId);
    const latestSeq = latest
      .map((event) => this.socialCodexEventFromEventPayload(event.payload))
      .filter((event): event is SocialAgentEventV2 =>
        Boolean(event && event.runId === runId),
      )
      .reduce((max, event) => Math.max(max, event.seq), 0);
    const seq = latestSeq + 1;
    const resolved: SocialAgentEventV2 = {
      type: 'approval.resolved',
      eventId: `${runId}:${seq}`,
      seq,
      createdAt: new Date().toISOString(),
      userId: String(approval.userId),
      threadId: this.threadIdForTask(checkpoint.agentTaskId),
      taskId: checkpoint.agentTaskId,
      runId,
      stage: 'approval',
      visibility: 'user_visible',
      display: {
        title: decision === 'approved' ? '已确认' : '已取消',
        detail:
          decision === 'approved'
            ? '我会从同一个任务继续处理，不会重新询问已确认的信息。'
            : '已取消这次高风险动作，我不会执行发送、连接或发布。',
        state: 'done',
      },
      payload: {
        approvalId: approval.id,
        decision,
        actionType: approval.actionType ?? null,
        riskLevel: approval.riskLevel ?? null,
        checkpointId: checkpoint.id,
        resumeCursor: {
          threadId: this.threadIdForTask(checkpoint.agentTaskId),
          checkpointId: checkpoint.id,
          action: 'resume',
          stepId: checkpoint.stepId ?? null,
        },
      },
    };
    await this.eventRepo.save(
      this.eventRepo.create({
        taskId: checkpoint.agentTaskId,
        ownerUserId: approval.userId,
        eventType: AgentTaskEventType.ConfirmationReceived,
        actor: AgentTaskEventActor.User,
        summary: resolved.display?.title ?? '审批已处理',
        payload: sanitizeForDisplay({
          socialAgentEventV2: resolved,
        }) as Record<string, unknown>,
        stepId: checkpoint.stepId ?? null,
      }),
    );
  }

  private socialCodexEventFromEventPayload(
    payload: unknown,
  ): SocialAgentEventV2 | null {
    const root = this.recordOrEmpty(payload);
    const event = root.socialAgentEventV2;
    const record = this.recordOrEmpty(event);
    return typeof record.type === 'string' &&
      typeof record.runId === 'string' &&
      typeof record.seq === 'number'
      ? (record as unknown as SocialAgentEventV2)
      : null;
  }

  private approvalIdsFromResult(result: SocialAgentChatRunResult): number[] {
    return result.approvalRequiredActions
      .map((item) => Number(item.id ?? item.approvalId))
      .filter((id) => Number.isFinite(id) && id > 0);
  }

  private buildApprovalInterruptPayload(input: {
    checkpoint: AgentRunCheckpoint;
    result: SocialAgentChatRunResult;
    approvalIds: number[];
  }): AgentRunInterruptPayload {
    const approvalId =
      input.checkpoint.approvalRequestId ?? input.approvalIds[0] ?? 0;
    const approval = input.result.approvalRequiredActions.find((item) => {
      const itemId = Number(item.id ?? item.approvalId);
      return Number.isFinite(itemId) && itemId === approvalId;
    });
    const approvalPayload = this.recordOrEmpty(approval?.payload);
    const payload: AgentRunInterruptPayload = {
      protocol: 'fitmeet.agent.interrupt.v1',
      kind: 'approval_required',
      threadId: this.threadIdForTask(input.checkpoint.agentTaskId),
      checkpointId: input.checkpoint.id,
      taskId: input.checkpoint.agentTaskId,
      runId: input.checkpoint.runId,
      traceId: input.checkpoint.traceId,
      interruptId: `approval:${approvalId}:checkpoint:${input.checkpoint.id}`,
      resumable: true,
      resumeAction: 'resume',
      resumeEndpoint: `/api/social-agent/chat/checkpoints/${input.checkpoint.id}/resume/stream`,
      approvalEndpoint: `/api/agent/approvals/${approvalId}/approve`,
      rejectionEndpoint: `/api/agent/approvals/${approvalId}/reject`,
      idempotencyKey: this.idempotencyKeyFor(input.checkpoint, 'resume'),
      payload: {
        approvalIds: input.approvalIds,
        approvalRequestId: approvalId,
        actionType: this.stringOrNull(approval?.actionType),
        schemaAction: this.stringOrNull(approvalPayload.schemaAction),
        sideEffect: this.stringOrNull(approvalPayload.sideEffect),
        idempotencyKey: this.stringOrNull(approvalPayload.idempotencyKey),
        resumeMode: this.stringOrNull(approvalPayload.resumeMode),
        checkpointRequired: approvalPayload.checkpointRequired === true,
        targetUserId: this.numberOrNull(approvalPayload.targetUserId),
        candidateUserId: this.numberOrNull(approvalPayload.candidateUserId),
        candidateRecordId: this.numberOrNull(approvalPayload.candidateRecordId),
        socialRequestId: this.numberOrNull(approvalPayload.socialRequestId),
        riskReasons: Array.isArray(approvalPayload.riskReasons)
          ? approvalPayload.riskReasons
              .map((item) => this.stringOrNull(item))
              .filter((item): item is string => Boolean(item))
          : [],
        auditEvent: this.stringOrNull(approvalPayload.auditEvent),
        riskLevel: this.stringOrNull(approval?.riskLevel),
        summary: this.stringOrNull(approval?.summary),
        requiredConfirmations: Array.isArray(
          input.result.safety?.requiredConfirmations,
        )
          ? input.result.safety.requiredConfirmations
              .map((item) => this.stringOrNull(item))
              .filter((item): item is string => Boolean(item))
          : [],
      },
      rules: {
        payload: 'json_serializable_only',
        checkpointer: 'database_durable',
        sideEffectsBeforeInterrupt: 'idempotent_only',
        resumeCursor: 'thread_id_and_checkpoint_id',
      },
      recoveryActions: this.recoveryActionsForInterrupt(input.checkpoint),
      stepActions: this.stepActionsForInterrupt(input.checkpoint),
    };
    return this.jsonSerializable(payload);
  }

  private recoveryActionsForInterrupt(checkpoint: AgentRunCheckpoint) {
    return (['resume', 'retry', 'replay', 'fork'] as const).map((action) => ({
      action,
      label: this.recoveryActionLabel(action),
      method: 'POST' as const,
      endpoint: `/api/social-agent/chat/checkpoints/${checkpoint.id}/${action}/stream`,
      idempotencyKey: this.idempotencyKeyFor(checkpoint, action),
      requiresApprovalDecision: action === 'resume' ? true : undefined,
    }));
  }

  private stepActionsForInterrupt(checkpoint: AgentRunCheckpoint) {
    return checkpoint.steps.flatMap((step) => {
      const stepId = this.stringOrNull(step.id);
      if (!stepId) return [];
      return (['retry', 'replay', 'fork'] as const).map((action) => ({
        stepId,
        action,
        label: this.recoveryActionLabel(action),
        method: 'POST' as const,
        endpoint: `/api/social-agent/chat/checkpoints/${checkpoint.id}/steps/${encodeURIComponent(stepId)}/${action}/stream`,
        idempotencyKey: [
          'agent-checkpoint',
          action,
          this.threadIdForTask(checkpoint.agentTaskId),
          `checkpoint:${checkpoint.id}`,
          `step:${stepId}`,
          checkpoint.approvalRequestId
            ? `approval:${checkpoint.approvalRequestId}`
            : null,
        ]
          .filter(Boolean)
          .join(':')
          .slice(0, 240),
      }));
    });
  }

  private recoveryActionLabel(action: AgentRunCheckpointAction) {
    if (action === 'resume') return '继续处理';
    if (action === 'retry') return '继续处理';
    if (action === 'replay') return '重新整理';
    return '换一种方案';
  }

  private resumeStateForChild(
    checkpoint: AgentRunCheckpoint,
    action: AgentRunCheckpointAction,
    stepId?: string,
    resumeCheckpoint: AgentRunCheckpoint = checkpoint,
  ) {
    return this.jsonSerializable({
      protocol: 'fitmeet.agent.resume.v1',
      threadId: this.threadIdForTask(checkpoint.agentTaskId),
      checkpointId: resumeCheckpoint.id,
      parentCheckpointId:
        resumeCheckpoint.parentCheckpointId ?? checkpoint.id ?? null,
      sourceCheckpointId: checkpoint.id,
      sourceStepId: stepId ?? checkpoint.stepId ?? null,
      action,
      idempotencyKey: this.idempotencyKeyFor(resumeCheckpoint, action),
      sideEffectsBeforeResume: 'idempotent_only',
    });
  }

  private interruptFromState(
    state: Record<string, unknown>,
  ): AgentRunInterruptPayload | null {
    const interrupt = state.interrupt;
    if (!interrupt || typeof interrupt !== 'object') return null;
    const candidate = interrupt as AgentRunInterruptPayload;
    return candidate.protocol === 'fitmeet.agent.interrupt.v1'
      ? candidate
      : null;
  }

  private hasResumeState(state: Record<string, unknown>): boolean {
    const resume = state.resume;
    if (!resume || typeof resume !== 'object') return false;
    return (
      (resume as { protocol?: unknown }).protocol === 'fitmeet.agent.resume.v1'
    );
  }

  private sourceStepForPlan(checkpoint: AgentRunCheckpoint): {
    stepId: string;
    label: string | null;
    toolName: string | null;
  } | null {
    const stepId =
      this.stringOrNull(checkpoint.state.sourceStepId) ??
      this.stringOrNull(checkpoint.stepId);
    if (!stepId) return null;
    const step = checkpoint.steps.find(
      (item) => this.stringOrNull(item.id) === stepId,
    );
    return {
      stepId,
      label: this.stringOrNull(step?.label) ?? null,
      toolName:
        this.stringOrNull(checkpoint.state.sourceToolName) ??
        this.stringOrNull(checkpoint.toolName) ??
        (step ? this.toolNameFromStoredStep(step) : null),
    };
  }

  private stepScopeForPlan(checkpoint: AgentRunCheckpoint): {
    mode: 'full_checkpoint' | 'through_step';
    stepCount: number;
    sourceCheckpointId: number | null;
  } {
    const reason = this.stringOrNull(checkpoint.state.checkpointReason);
    const mode =
      reason?.endsWith('_from_tool_step') ||
      Boolean(this.stringOrNull(checkpoint.state.sourceStepId))
        ? 'through_step'
        : 'full_checkpoint';
    return {
      mode,
      stepCount: Array.isArray(checkpoint.steps) ? checkpoint.steps.length : 0,
      sourceCheckpointId: this.numberOrNull(
        checkpoint.state.sourceCheckpointId,
      ),
    };
  }

  private recordOrEmpty(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private numberOrNull(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private idempotencyKeyFor(
    checkpoint: AgentRunCheckpoint,
    action: AgentRunCheckpointAction,
  ): string {
    const base = [
      'agent-checkpoint',
      action,
      this.threadIdForTask(checkpoint.agentTaskId),
      `checkpoint:${checkpoint.id}`,
      checkpoint.stepId ? `step:${checkpoint.stepId}` : null,
      checkpoint.approvalRequestId
        ? `approval:${checkpoint.approvalRequestId}`
        : null,
    ]
      .filter(Boolean)
      .join(':');
    return base.slice(0, 240);
  }

  private threadIdForTask(taskId: number): string {
    return `agent-task:${taskId}`;
  }

  private jsonSerializable<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private buildResumePrompt(input: {
    action: AgentRunCheckpointAction;
    goal: string;
    step?: SocialAgentVisibleStep;
    approvalRequired?: boolean;
  }): string {
    if (input.action === 'retry') {
      return input.step
        ? `只重试已保存的工具步骤：${input.step.label}。保持同一任务上下文和已确认边界，避免重复执行无关步骤。`
        : '只重试刚才失败的工具步骤。保持同一任务上下文和已确认边界，避免重复执行无关步骤。';
    }
    if (input.action === 'fork') {
      return input.step
        ? `从已保存的工具步骤创建一条新分支继续：${input.step.label}。`
        : '从已保存的 Agent 状态创建一条新分支继续。';
    }
    if (input.action === 'replay') {
      return input.step
        ? `回放已保存的工具步骤：${input.step.label}，并基于最新状态重新整理回复。`
        : '回放已保存的 Agent 步骤，并基于最新状态重新整理回复。';
    }
    if (input.approvalRequired) {
      return '用户已经确认刚才中断的高风险步骤。请从同一个任务的已保存中断点继续，不要重新询问已确认内容。';
    }
    if (input.step) {
      return `从已保存的步骤继续：${input.step.label}。`;
    }
    return '继续刚才保存的 Agent 步骤。';
  }

  private buildApprovalRejectedResumePrompt(goal: string): string {
    const goalContext = goal ? `原任务目标：${goal}。` : '';
    return `${goalContext}用户已经拒绝刚才中断的高风险步骤。请从同一个任务的已保存中断点继续，但不要执行被拒绝的动作，不要发送消息、连接候选人或创建活动。请自然说明已取消，并给出低风险替代方案。`;
  }

  private toolNameFromStep(step: SocialAgentVisibleStep): string | null {
    if (step.toolName) return step.toolName;
    const text = `${step.id} ${step.label}`.toLowerCase();
    if (/life|graph|profile|画像/.test(text)) return 'life_graph';
    if (/candidate|match|search|筛选|候选|匹配/.test(text)) {
      return 'social_match';
    }
    if (/activity|meet|invite|约练|活动|邀约/.test(text)) return 'meet_loop';
    if (/approval|confirm|risk|安全|确认|审批/.test(text))
      return 'approval_gate';
    return null;
  }

  private findStep(
    checkpoint: AgentRunCheckpoint,
    stepId: string,
  ): SocialAgentVisibleStep {
    const normalizedStepId = stepId.trim();
    const step = checkpoint.steps.find(
      (item) => this.stringOrNull(item.id) === normalizedStepId,
    );
    if (!step) {
      throw new NotFoundException('Checkpoint step not found');
    }
    return {
      id: this.stringOrNull(step.id) ?? normalizedStepId,
      label: this.stringOrNull(step.label) ?? '已保存的工具步骤',
      status: this.stringOrNull(step.status) ?? 'pending',
      detail: this.stringOrNull(step.detail) ?? undefined,
      kind: this.stringOrNull(step.kind) ?? undefined,
      agentName: this.stringOrNull(step.agentName) ?? undefined,
      toolName: this.stringOrNull(step.toolName) ?? undefined,
    } as SocialAgentVisibleStep;
  }

  private stringOrNull(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private toolNameFromStoredStep(step: Record<string, unknown>): string | null {
    const normalized = {
      id: this.stringOrNull(step.id) ?? '',
      label: this.stringOrNull(step.label) ?? '',
      status: this.stringOrNull(step.status) ?? 'pending',
      detail: this.stringOrNull(step.detail) ?? undefined,
      kind: this.stringOrNull(step.kind) ?? undefined,
      agentName: this.stringOrNull(step.agentName) ?? undefined,
      toolName: this.stringOrNull(step.toolName) ?? undefined,
    } as SocialAgentVisibleStep;
    return this.toolNameFromStep(normalized);
  }
}
