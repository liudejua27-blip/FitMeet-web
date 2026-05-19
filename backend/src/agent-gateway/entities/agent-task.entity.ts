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
import { AgentConnection } from './agent-connection.entity';

/**
 * Social Agent Runtime — foundational layer.
 *
 * One `agent_tasks` row represents a full "understand goal → plan → call tools →
 * wait for confirmation → execute → listen for feedback" loop, on behalf of
 * `ownerUserId`. Plan, executed steps, tool-call records, and final result are
 * all stored as JSONB on the task row to keep the runtime self-contained.
 *
 * `agent_task_events` is the append-only timeline used for replay, audit, and
 * driving UI (Agent Inbox / activity feed).
 *
 * This is a NEW, deliberately simple layer; the older fine-grained
 * `agent_runtime_*` tables remain untouched.
 */

export enum AgentTaskStatus {
  Pending = 'pending',
  Planning = 'planning',
  AwaitingConfirmation = 'awaiting_confirmation',
  Executing = 'executing',
  AwaitingFeedback = 'awaiting_feedback',
  Succeeded = 'succeeded',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

export enum AgentTaskPermissionMode {
  Assist = 'assist',
  Confirm = 'confirm',
  LimitedAuto = 'limited_auto',
}

export enum AgentTaskRiskLevel {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  Blocked = 'blocked',
}

export enum AgentTaskEventType {
  TaskCreated = 'task.created',
  GoalUnderstood = 'goal.understood',
  PlanGenerated = 'plan.generated',
  PlanUpdated = 'plan.updated',
  StepStarted = 'step.started',
  ToolCalled = 'tool.called',
  ToolReturned = 'tool.returned',
  ConfirmationRequested = 'confirmation.requested',
  ConfirmationReceived = 'confirmation.received',
  StepCompleted = 'step.completed',
  FeedbackReceived = 'feedback.received',
  TaskSucceeded = 'task.succeeded',
  TaskFailed = 'task.failed',
  TaskCancelled = 'task.cancelled',
  Note = 'note',
}

export enum AgentTaskEventActor {
  Agent = 'agent',
  User = 'user',
  System = 'system',
  Tool = 'tool',
}

@Entity('agent_tasks')
@Index('idx_agent_tasks_owner_status_updated', [
  'ownerUserId',
  'status',
  'updatedAt',
])
@Index('idx_agent_tasks_agent_status', ['agentConnectionId', 'status'])
@Index('uniq_agent_tasks_idempotency_key', ['idempotencyKey'], {
  unique: true,
  where: '"idempotencyKey" IS NOT NULL',
})
export class AgentTask {
  @PrimaryGeneratedColumn()
  id: number;

  /** The real user on whose behalf the agent is acting. */
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerUserId' })
  ownerUser: User;

  @Column({ type: 'int' })
  ownerUserId: number;

  /** Acting agent connection (nullable for system-issued tasks). */
  @ManyToOne(() => AgentConnection, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'agentConnectionId' })
  agentConnection: AgentConnection | null;

  @Column({ type: 'int', nullable: true })
  agentConnectionId: number | null;

  /** High-level task category, e.g. 'social_match', 'meet_invite', 'profile_refresh'. */
  @Column({ type: 'varchar', length: 80, default: 'social_goal' })
  taskType: string;

  @Column({ type: 'varchar', length: 200, default: '' })
  title: string;

  /** Natural-language goal the agent is trying to achieve. */
  @Column({ type: 'text', default: '' })
  goal: string;

  /** Initial input / structured context the agent was given. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  input: Record<string, unknown>;

  /**
   * Current plan as an ordered list of steps. Each entry is an opaque
   * `{ id, title, action, toolName?, status, ... }` object — schema is
   * enforced at the service layer, not the DB, so the runtime can evolve
   * without migrations.
   */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  plan: Record<string, unknown>[];

  /**
   * Append-only list of tool invocations made for this task. Mirror copy for
   * fast read-back; the canonical event stream lives in `agent_task_events`.
   */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  toolCalls: Record<string, unknown>[];

  /** Final (or latest partial) result payload. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  result: Record<string, unknown>;

  @Column({
    type: 'enum',
    enum: AgentTaskStatus,
    enumName: 'agent_task_status_enum',
    default: AgentTaskStatus.Pending,
  })
  status: AgentTaskStatus;

  @Column({
    type: 'enum',
    enum: AgentTaskPermissionMode,
    enumName: 'agent_task_permission_mode_enum',
    default: AgentTaskPermissionMode.Confirm,
  })
  permissionMode: AgentTaskPermissionMode;

  @Column({
    type: 'enum',
    enum: AgentTaskRiskLevel,
    enumName: 'agent_task_risk_level_enum',
    default: AgentTaskRiskLevel.Low,
  })
  riskLevel: AgentTaskRiskLevel;

  /** Optional caller-supplied key for de-duplicating task creation. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  idempotencyKey: string | null;

  /** Reason for the current status (block reason / failure note / cancel note). */
  @Column({ type: 'text', nullable: true })
  statusReason: string | null;

  /** Structured error info when status = failed. */
  @Column({ type: 'jsonb', nullable: true })
  error: Record<string, unknown> | null;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  awaitingConfirmationAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('agent_task_events')
@Index('idx_agent_task_events_task_created', ['taskId', 'createdAt'])
@Index('idx_agent_task_events_owner_type_created', [
  'ownerUserId',
  'eventType',
  'createdAt',
])
export class AgentTaskEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => AgentTask, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'taskId' })
  task: AgentTask;

  @Column({ type: 'int' })
  taskId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerUserId' })
  ownerUser: User;

  @Column({ type: 'int' })
  ownerUserId: number;

  @Column({
    type: 'enum',
    enum: AgentTaskEventType,
    enumName: 'agent_task_event_type_enum',
  })
  eventType: AgentTaskEventType;

  @Column({
    type: 'enum',
    enum: AgentTaskEventActor,
    enumName: 'agent_task_event_actor_enum',
    default: AgentTaskEventActor.Agent,
  })
  actor: AgentTaskEventActor;

  /** Short human-readable summary, PII-stripped, safe to show in UI. */
  @Column({ type: 'varchar', length: 500, default: '' })
  summary: string;

  /** Structured machine-readable payload (plan diff, tool args, result, etc). */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  payload: Record<string, unknown>;

  /** Optional reference to a plan step id (matches plan[].id on the task). */
  @Column({ type: 'varchar', length: 80, nullable: true })
  stepId: string | null;

  /** Optional reference to a tool-call id (matches toolCalls[].id on the task). */
  @Column({ type: 'varchar', length: 80, nullable: true })
  toolCallId: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
