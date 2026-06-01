import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum FitMeetAgentRunStatus {
  Running = 'running',
  WaitingConfirmation = 'waiting_confirmation',
  Completed = 'completed',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

export enum FitMeetAgentPermissionMode {
  Assisted = 'assist',
  LimitedAuto = 'limited_auto',
  Open = 'open',
}

export enum FitMeetAgentStepStatus {
  Running = 'running',
  Completed = 'completed',
  WaitingConfirmation = 'waiting_confirmation',
  Failed = 'failed',
  Blocked = 'blocked',
}

export enum FitMeetAgentToolStatus {
  Running = 'running',
  Succeeded = 'succeeded',
  Failed = 'failed',
  Blocked = 'blocked',
  WaitingConfirmation = 'waiting_confirmation',
}

@Entity('agent_runs')
@Index('idx_agent_runs_user_status_updated', ['userId', 'status', 'updatedAt'])
@Index('idx_agent_runs_task', ['agentTaskId'])
export class FitMeetAgentRun {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'int', nullable: true })
  agentTaskId: number | null;

  @Column({ type: 'varchar', length: 120, default: 'fitmeet_social_agent' })
  agentName: string;

  @Column({
    type: 'enum',
    enum: FitMeetAgentPermissionMode,
    enumName: 'fitmeet_agent_permission_mode_enum',
    default: FitMeetAgentPermissionMode.Assisted,
  })
  permissionMode: FitMeetAgentPermissionMode;

  @Column({
    type: 'enum',
    enum: FitMeetAgentRunStatus,
    enumName: 'fitmeet_agent_run_status_enum',
    default: FitMeetAgentRunStatus.Running,
  })
  status: FitMeetAgentRunStatus;

  @Column({ type: 'text' })
  userMessage: string;

  @Column({ type: 'text', default: '' })
  safeSummary: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  resultPayload: Record<string, unknown>;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('agent_run_steps')
@Index('idx_agent_run_steps_run_order', ['runId', 'stepOrder'])
@Index('idx_agent_run_steps_user_created', ['userId', 'createdAt'])
export class FitMeetAgentRunStep {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  runId: number;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'int' })
  stepOrder: number;

  @Column({ type: 'varchar', length: 120 })
  stepKey: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({
    type: 'enum',
    enum: FitMeetAgentStepStatus,
    enumName: 'fitmeet_agent_step_status_enum',
    default: FitMeetAgentStepStatus.Running,
  })
  status: FitMeetAgentStepStatus;

  @Column({ type: 'varchar', length: 120, nullable: true })
  toolName: string | null;

  @Column({ type: 'boolean', default: false })
  requiresUserConfirmation: boolean;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  safePayload: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('agent_tool_calls')
@Index('idx_agent_tool_calls_run_created', ['runId', 'createdAt'])
@Index('idx_agent_tool_calls_user_tool_status', ['userId', 'toolName', 'status'])
export class FitMeetAgentToolCall {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  runId: number;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'int', nullable: true })
  stepId: number | null;

  @Column({ type: 'varchar', length: 120 })
  toolName: string;

  @Column({
    type: 'enum',
    enum: FitMeetAgentToolStatus,
    enumName: 'fitmeet_agent_tool_status_enum',
    default: FitMeetAgentToolStatus.Running,
  })
  status: FitMeetAgentToolStatus;

  @Column({ type: 'boolean', default: false })
  requiresUserConfirmation: boolean;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  safeInput: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  safeOutput: Record<string, unknown>;

  @Column({ type: 'varchar', length: 80, nullable: true })
  errorCode: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'int', nullable: true })
  durationMs: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('agent_messages')
@Index('idx_agent_messages_run_created', ['runId', 'createdAt'])
@Index('idx_agent_messages_user_created', ['userId', 'createdAt'])
export class FitMeetAgentMessage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  runId: number;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'varchar', length: 20 })
  role: 'user' | 'assistant' | 'system';

  @Column({ type: 'varchar', length: 40, default: 'text' })
  messageType: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  safeMetadata: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('agent_memory_updates')
@Index('idx_agent_memory_updates_run_created', ['runId', 'createdAt'])
@Index('idx_agent_memory_updates_user_type', ['userId', 'memoryType'])
export class FitMeetAgentMemoryUpdate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  runId: number;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'varchar', length: 80 })
  memoryType: string;

  @Column({ type: 'varchar', length: 120 })
  source: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  safePayload: Record<string, unknown>;

  @Column({ type: 'boolean', default: true })
  requiresUserConfirmation: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
