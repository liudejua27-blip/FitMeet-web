import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum AgentSideEffectLedgerStatus {
  Pending = 'pending',
  Running = 'running',
  Succeeded = 'succeeded',
  FailedRetryable = 'failed_retryable',
  UnknownCommitState = 'unknown_commit_state',
  FailedFinal = 'failed_final',
  ManualReviewRequired = 'manual_review_required',
  Failed = 'failed',
}

@Entity('agent_side_effect_ledger')
@Index(['actionType', 'idempotencyKey'], { unique: true })
@Index(['ownerUserId', 'agentTaskId'])
@Index(['status', 'nextRetryAt'])
@Index(['status', 'leaseExpiresAt'])
export class AgentSideEffectLedger {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  ownerUserId: number;

  @Column({ type: 'int', nullable: true })
  agentTaskId: number | null;

  @Column({ type: 'varchar', length: 96 })
  actionType: string;

  @Column({ type: 'varchar', length: 180 })
  idempotencyKey: string;

  @Column({
    type: 'enum',
    enum: AgentSideEffectLedgerStatus,
    default: AgentSideEffectLedgerStatus.Pending,
  })
  status: AgentSideEffectLedgerStatus;

  @Column({ type: 'varchar', length: 80, default: '' })
  resourceType: string;

  @Column({ type: 'varchar', length: 120, default: '' })
  resourceId: string;

  @Column({ type: 'int', default: 0 })
  attemptCount: number;

  @Column({ type: 'varchar', length: 120, nullable: true })
  leaseOwner: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  leaseExpiresAt: Date | null;

  @Column({ type: 'varchar', length: 128, default: '' })
  requestHash: string;

  @Column({ type: 'jsonb', default: '{}' })
  result: Record<string, unknown>;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>;

  @Column({ type: 'text', default: '' })
  errorMessage: string;

  @Column({ type: 'timestamptz', nullable: true })
  lastAttemptAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  nextRetryAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
