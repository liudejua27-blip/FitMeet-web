import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { AgentApprovalRequest } from './agent-approval-request.entity';
import { AgentConnection } from './agent-connection.entity';

/**
 * @deprecated Legacy fine-grained runtime schema.
 *
 * Canonical Agent Runtime writes now go to `agent_tasks` and
 * `agent_task_events` (`agent-task.entity.ts`). These entities are kept only
 * so old deployments can read historical `agent_runtime_*` rows if needed.
 * Do not inject repositories for these classes into new services, and do not
 * add new write paths against these tables.
 */

export enum AgentRuntimePermissionMode {
  Assist = 'assist',
  Confirm = 'confirm',
  LimitedAuto = 'limited_auto',
}

export enum AgentRuntimeTaskStatus {
  Queued = 'queued',
  Planning = 'planning',
  Running = 'running',
  WaitingConfirmation = 'waiting_confirmation',
  Succeeded = 'succeeded',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

export enum AgentRuntimeRiskLevel {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  Blocked = 'blocked',
}

export enum AgentRuntimeGoalStatus {
  Active = 'active',
  Satisfied = 'satisfied',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

export enum AgentRuntimePlanStatus {
  Draft = 'draft',
  Active = 'active',
  Superseded = 'superseded',
  Completed = 'completed',
  Failed = 'failed',
}

export enum AgentRuntimeStepStatus {
  Planned = 'planned',
  Running = 'running',
  WaitingConfirmation = 'waiting_confirmation',
  Retrying = 'retrying',
  Skipped = 'skipped',
  Succeeded = 'succeeded',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

export enum AgentRuntimeToolCallStatus {
  Planned = 'planned',
  Running = 'running',
  WaitingConfirmation = 'waiting_confirmation',
  Succeeded = 'succeeded',
  Failed = 'failed',
  Blocked = 'blocked',
}

export enum AgentRuntimeResultStatus {
  Pending = 'pending',
  Succeeded = 'succeeded',
  Partial = 'partial',
  Failed = 'failed',
}

export enum AgentRuntimeLogLevel {
  Debug = 'debug',
  Info = 'info',
  Warn = 'warn',
  Error = 'error',
  Audit = 'audit',
}

@Entity('agent_runtime_tasks')
@Index('idx_agent_runtime_tasks_owner_status_updated', [
  'ownerUserId',
  'status',
  'updatedAt',
])
@Index('idx_agent_runtime_tasks_agent_status', ['agentConnectionId', 'status'])
@Index('uniq_agent_runtime_tasks_idempotency_key', ['idempotencyKey'], {
  unique: true,
  where: '"idempotencyKey" IS NOT NULL',
})
export class AgentRuntimeTask {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerUserId' })
  ownerUser: User;

  @Column({ type: 'int' })
  ownerUserId: number;

  @ManyToOne(() => AgentConnection, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'agentConnectionId' })
  agentConnection: AgentConnection | null;

  @Column({ type: 'int', nullable: true })
  agentConnectionId: number | null;

  @Column({ type: 'varchar', length: 80, default: 'social_agent_runtime' })
  source: string;

  @Column({
    type: 'enum',
    enum: AgentRuntimePermissionMode,
    enumName: 'agent_runtime_permission_mode_enum',
    default: AgentRuntimePermissionMode.Assist,
  })
  permissionMode: AgentRuntimePermissionMode;

  @Column({ type: 'varchar', length: 80, default: 'social_goal' })
  taskType: string;

  @Column({ type: 'varchar', length: 200, default: '' })
  title: string;

  @Column({ type: 'text', default: '' })
  goalSummary: string;

  @Column({
    type: 'enum',
    enum: AgentRuntimeTaskStatus,
    enumName: 'agent_runtime_task_status_enum',
    default: AgentRuntimeTaskStatus.Queued,
  })
  status: AgentRuntimeTaskStatus;

  @Column({
    type: 'enum',
    enum: AgentRuntimeRiskLevel,
    enumName: 'agent_runtime_risk_level_enum',
    default: AgentRuntimeRiskLevel.Low,
  })
  riskLevel: AgentRuntimeRiskLevel;

  @Column({ type: 'int', default: 0 })
  priority: number;

  @Column({ type: 'varchar', length: 120, nullable: true })
  idempotencyKey: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  context: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  memory: Record<string, unknown>;

  @Column({ type: 'text', default: '' })
  resultSummary: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  resultPayload: Record<string, unknown>;

  @Column({ type: 'varchar', length: 80, nullable: true })
  errorCode: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'int', default: 0 })
  retryCount: number;

  @Column({ type: 'int', default: 3 })
  maxRetries: number;

  @Column({ type: 'timestamptz', nullable: true })
  lockedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  waitingForUserAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  failedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('agent_runtime_goals')
@Index('idx_agent_runtime_goals_task_status', ['taskId', 'status'])
@Index('idx_agent_runtime_goals_owner_status', ['ownerUserId', 'status'])
export class AgentRuntimeGoal {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => AgentRuntimeTask, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'taskId' })
  task: AgentRuntimeTask;

  @Column({ type: 'int' })
  taskId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerUserId' })
  ownerUser: User;

  @Column({ type: 'int' })
  ownerUserId: number;

  @Column({ type: 'varchar', length: 80, default: 'social' })
  goalType: string;

  @Column({ type: 'varchar', length: 200, default: '' })
  title: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({
    type: 'enum',
    enum: AgentRuntimeGoalStatus,
    enumName: 'agent_runtime_goal_status_enum',
    default: AgentRuntimeGoalStatus.Active,
  })
  status: AgentRuntimeGoalStatus;

  @Column({ type: 'int', default: 0 })
  priority: number;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  successCriteria: Record<string, unknown>[];

  @Column({ type: 'jsonb', default: () => "'{}'" })
  constraints: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  targetProfile: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  resultPayload: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('agent_runtime_plans')
@Index('uniq_agent_runtime_plans_task_version', ['taskId', 'version'], {
  unique: true,
})
@Index('idx_agent_runtime_plans_task_status', ['taskId', 'status'])
@Index('idx_agent_runtime_plans_owner_status', ['ownerUserId', 'status'])
export class AgentRuntimePlan {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => AgentRuntimeTask, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'taskId' })
  task: AgentRuntimeTask;

  @Column({ type: 'int' })
  taskId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerUserId' })
  ownerUser: User;

  @Column({ type: 'int' })
  ownerUserId: number;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({
    type: 'enum',
    enum: AgentRuntimePlanStatus,
    enumName: 'agent_runtime_plan_status_enum',
    default: AgentRuntimePlanStatus.Draft,
  })
  status: AgentRuntimePlanStatus;

  @Column({ type: 'text', default: '' })
  rationale: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  steps: Record<string, unknown>[];

  @Column({ type: 'jsonb', default: () => "'{}'" })
  riskAssessment: Record<string, unknown>;

  @Column({ type: 'timestamptz', nullable: true })
  activatedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('agent_runtime_steps')
@Index('idx_agent_runtime_steps_task_order', ['taskId', 'stepOrder'])
@Index('idx_agent_runtime_steps_plan_status', ['planId', 'status'])
@Index('idx_agent_runtime_steps_owner_status', ['ownerUserId', 'status'])
@Index('idx_agent_runtime_steps_approval', ['approvalRequestId'])
@Index('uniq_agent_runtime_steps_idempotency_key', ['idempotencyKey'], {
  unique: true,
  where: '"idempotencyKey" IS NOT NULL',
})
export class AgentRuntimeStep {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => AgentRuntimeTask, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'taskId' })
  task: AgentRuntimeTask;

  @Column({ type: 'int' })
  taskId: number;

  @ManyToOne(() => AgentRuntimePlan, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'planId' })
  plan: AgentRuntimePlan | null;

  @Column({ type: 'int', nullable: true })
  planId: number | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerUserId' })
  ownerUser: User;

  @Column({ type: 'int' })
  ownerUserId: number;

  @Column({ type: 'int', default: 0 })
  stepOrder: number;

  @Column({ type: 'varchar', length: 200, default: '' })
  title: string;

  @Column({ type: 'varchar', length: 80, default: '' })
  actionType: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  toolName: string | null;

  @Column({
    type: 'enum',
    enum: AgentRuntimeStepStatus,
    enumName: 'agent_runtime_step_status_enum',
    default: AgentRuntimeStepStatus.Planned,
  })
  status: AgentRuntimeStepStatus;

  @Column({
    type: 'enum',
    enum: AgentRuntimeRiskLevel,
    enumName: 'agent_runtime_risk_level_enum',
    default: AgentRuntimeRiskLevel.Low,
  })
  riskLevel: AgentRuntimeRiskLevel;

  @Column({ default: false })
  requiresUserConfirmation: boolean;

  @ManyToOne(() => AgentApprovalRequest, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'approvalRequestId' })
  approvalRequest: AgentApprovalRequest | null;

  @Column({ type: 'int', nullable: true })
  approvalRequestId: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  idempotencyKey: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  inputPayload: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  outputPayload: Record<string, unknown>;

  @Column({ type: 'varchar', length: 80, nullable: true })
  errorCode: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'int', default: 0 })
  attemptCount: number;

  @Column({ type: 'int', default: 3 })
  maxAttempts: number;

  @Column({ type: 'timestamptz', nullable: true })
  scheduledAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  waitingForUserAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('agent_runtime_tool_calls')
@Index('idx_agent_runtime_tool_calls_task_created', ['taskId', 'createdAt'])
@Index('idx_agent_runtime_tool_calls_step_created', ['stepId', 'createdAt'])
@Index('idx_agent_runtime_tool_calls_owner_status', ['ownerUserId', 'status'])
@Index('idx_agent_runtime_tool_calls_tool_status', ['toolName', 'status'])
@Index('idx_agent_runtime_tool_calls_approval', ['approvalRequestId'])
@Index('uniq_agent_runtime_tool_calls_idempotency_key', ['idempotencyKey'], {
  unique: true,
  where: '"idempotencyKey" IS NOT NULL',
})
export class AgentRuntimeToolCall {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => AgentRuntimeTask, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'taskId' })
  task: AgentRuntimeTask;

  @Column({ type: 'int' })
  taskId: number;

  @ManyToOne(() => AgentRuntimeStep, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'stepId' })
  step: AgentRuntimeStep | null;

  @Column({ type: 'int', nullable: true })
  stepId: number | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerUserId' })
  ownerUser: User;

  @Column({ type: 'int' })
  ownerUserId: number;

  @ManyToOne(() => AgentConnection, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'agentConnectionId' })
  agentConnection: AgentConnection | null;

  @Column({ type: 'int', nullable: true })
  agentConnectionId: number | null;

  @Column({ type: 'varchar', length: 120 })
  toolName: string;

  @Column({ type: 'varchar', length: 120, default: '' })
  toolAction: string;

  @Column({
    type: 'enum',
    enum: AgentRuntimeToolCallStatus,
    enumName: 'agent_runtime_tool_call_status_enum',
    default: AgentRuntimeToolCallStatus.Planned,
  })
  status: AgentRuntimeToolCallStatus;

  @Column({
    type: 'enum',
    enum: AgentRuntimeRiskLevel,
    enumName: 'agent_runtime_risk_level_enum',
    default: AgentRuntimeRiskLevel.Low,
  })
  riskLevel: AgentRuntimeRiskLevel;

  @Column({ default: false })
  requiresUserConfirmation: boolean;

  @ManyToOne(() => AgentApprovalRequest, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'approvalRequestId' })
  approvalRequest: AgentApprovalRequest | null;

  @Column({ type: 'int', nullable: true })
  approvalRequestId: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  idempotencyKey: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  requestPayload: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  responsePayload: Record<string, unknown>;

  @Column({ type: 'varchar', length: 80, nullable: true })
  errorCode: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'int', nullable: true })
  durationMs: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('agent_runtime_results')
@Index('idx_agent_runtime_results_task_created', ['taskId', 'createdAt'])
@Index('idx_agent_runtime_results_owner_type_created', [
  'ownerUserId',
  'resultType',
  'createdAt',
])
@Index('idx_agent_runtime_results_target_user', ['targetUserId'])
@Index('idx_agent_runtime_results_related_social_request', [
  'relatedSocialRequestId',
])
@Index('idx_agent_runtime_results_related_candidate', ['relatedCandidateId'])
@Index('idx_agent_runtime_results_related_activity', ['relatedActivityId'])
export class AgentRuntimeResult {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => AgentRuntimeTask, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'taskId' })
  task: AgentRuntimeTask;

  @Column({ type: 'int' })
  taskId: number;

  @ManyToOne(() => AgentRuntimeStep, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'stepId' })
  step: AgentRuntimeStep | null;

  @Column({ type: 'int', nullable: true })
  stepId: number | null;

  @ManyToOne(() => AgentRuntimeToolCall, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'toolCallId' })
  toolCall: AgentRuntimeToolCall | null;

  @Column({ type: 'int', nullable: true })
  toolCallId: number | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerUserId' })
  ownerUser: User;

  @Column({ type: 'int' })
  ownerUserId: number;

  @Column({ type: 'varchar', length: 80, default: 'runtime' })
  resultType: string;

  @Column({
    type: 'enum',
    enum: AgentRuntimeResultStatus,
    enumName: 'agent_runtime_result_status_enum',
    default: AgentRuntimeResultStatus.Pending,
  })
  status: AgentRuntimeResultStatus;

  @Column({ type: 'varchar', length: 500, default: '' })
  summary: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  payload: Record<string, unknown>;

  @Column({ type: 'int', nullable: true })
  targetUserId: number | null;

  @Column({ type: 'int', nullable: true })
  relatedSocialRequestId: number | null;

  @Column({ type: 'int', nullable: true })
  relatedCandidateId: number | null;

  @Column({ type: 'int', nullable: true })
  relatedActivityId: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  paymentReference: string | null;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('agent_runtime_logs')
@Index('idx_agent_runtime_logs_task_created', ['taskId', 'createdAt'])
@Index('idx_agent_runtime_logs_owner_event_created', [
  'ownerUserId',
  'eventType',
  'createdAt',
])
@Index('idx_agent_runtime_logs_level_created', ['level', 'createdAt'])
@Index('idx_agent_runtime_logs_tool_call', ['toolCallId'])
export class AgentRuntimeLog {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => AgentRuntimeTask, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'taskId' })
  task: AgentRuntimeTask;

  @Column({ type: 'int' })
  taskId: number;

  @ManyToOne(() => AgentRuntimeStep, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'stepId' })
  step: AgentRuntimeStep | null;

  @Column({ type: 'int', nullable: true })
  stepId: number | null;

  @ManyToOne(() => AgentRuntimeToolCall, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'toolCallId' })
  toolCall: AgentRuntimeToolCall | null;

  @Column({ type: 'int', nullable: true })
  toolCallId: number | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerUserId' })
  ownerUser: User;

  @Column({ type: 'int' })
  ownerUserId: number;

  @Column({
    type: 'enum',
    enum: AgentRuntimeLogLevel,
    enumName: 'agent_runtime_log_level_enum',
    default: AgentRuntimeLogLevel.Info,
  })
  level: AgentRuntimeLogLevel;

  @Column({ type: 'varchar', length: 100 })
  eventType: string;

  @Column({ type: 'text', default: '' })
  message: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  payload: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;
}
