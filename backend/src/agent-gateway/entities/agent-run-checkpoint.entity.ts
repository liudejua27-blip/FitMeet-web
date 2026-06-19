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
import { AgentTask } from './agent-task.entity';

export enum AgentRunCheckpointType {
  Step = 'step',
  Interrupt = 'interrupt',
  Result = 'result',
  Retry = 'retry',
  Replay = 'replay',
  Fork = 'fork',
}

export enum AgentRunCheckpointStatus {
  Active = 'active',
  Resumed = 'resumed',
  Retried = 'retried',
  Replayed = 'replayed',
  Forked = 'forked',
  Expired = 'expired',
}

@Entity('agent_run_checkpoints')
@Index('idx_agent_run_checkpoints_owner_task_created', [
  'ownerUserId',
  'agentTaskId',
  'createdAt',
])
@Index('idx_agent_run_checkpoints_approval_status', [
  'approvalRequestId',
  'status',
])
@Index('idx_agent_run_checkpoints_parent', ['parentCheckpointId'])
export class AgentRunCheckpoint {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerUserId' })
  ownerUser!: User;

  @Column({ type: 'int' })
  ownerUserId!: number;

  @ManyToOne(() => AgentTask, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agentTaskId' })
  agentTask!: AgentTask;

  @Column({ type: 'int' })
  agentTaskId!: number;

  @ManyToOne(() => AgentApprovalRequest, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'approvalRequestId' })
  approvalRequest!: AgentApprovalRequest | null;

  @Column({ type: 'int', nullable: true })
  approvalRequestId!: number | null;

  @ManyToOne(() => AgentRunCheckpoint, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'parentCheckpointId' })
  parentCheckpoint!: AgentRunCheckpoint | null;

  @Column({ type: 'int', nullable: true })
  parentCheckpointId!: number | null;

  @Column({
    type: 'enum',
    enum: AgentRunCheckpointType,
    enumName: 'agent_run_checkpoint_type_enum',
    default: AgentRunCheckpointType.Step,
  })
  type!: AgentRunCheckpointType;

  @Column({
    type: 'enum',
    enum: AgentRunCheckpointStatus,
    enumName: 'agent_run_checkpoint_status_enum',
    default: AgentRunCheckpointStatus.Active,
  })
  status!: AgentRunCheckpointStatus;

  @Column({ type: 'varchar', length: 120, nullable: true })
  runId!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  traceId!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  phase!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  toolName!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  stepId!: string | null;

  @Column({ type: 'text', default: '' })
  resumePrompt!: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  state!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  steps!: Record<string, unknown>[];

  @Column({ type: 'jsonb', default: () => "'{}'" })
  result!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  events!: Record<string, unknown>[];

  @Column({ type: 'int', default: 0 })
  resumeCount!: number;

  @Column({ type: 'int', default: 0 })
  replayCount!: number;

  @Column({ type: 'int', default: 0 })
  retryCount!: number;

  @Column({ type: 'int', default: 0 })
  forkCount!: number;

  @Column({ type: 'timestamptz', nullable: true })
  resumedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
