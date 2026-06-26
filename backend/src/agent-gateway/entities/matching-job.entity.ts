import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum MatchingJobStatus {
  Queued = 'queued',
  Running = 'running',
  CandidatesReady = 'candidates_ready',
  NoCandidates = 'no_candidates',
  FailedRetryable = 'failed_retryable',
  FailedFinal = 'failed_final',
  Cancelled = 'cancelled',
}

@Entity('matching_jobs')
@Index(['publicIntentId', 'sourceVersion'])
@Index(['status', 'nextRunAt'])
@Index(['idempotencyKey'], { unique: true })
export class MatchingJob {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 80 })
  publicIntentId: string;

  @Column({ type: 'int', nullable: true })
  ownerUserId: number | null;

  @Column({ type: 'int', nullable: true })
  linkedSocialRequestId: number | null;

  @Column({ type: 'varchar', length: 128 })
  sourceVersion: string;

  @Column({ type: 'varchar', length: 180 })
  idempotencyKey: string;

  @Column({
    type: 'enum',
    enum: MatchingJobStatus,
    default: MatchingJobStatus.Queued,
  })
  status: MatchingJobStatus;

  @Column({ type: 'int', default: 0 })
  attemptCount: number;

  @Column({ type: 'int', default: 0 })
  candidateCount: number;

  @Column({ type: 'text', default: '' })
  errorMessage: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  leaseOwner: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  leaseExpiresAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastHeartbeatAt: Date | null;

  @Column({ type: 'jsonb', default: '{}' })
  result: Record<string, unknown>;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>;

  @Column({ type: 'timestamptz', nullable: true })
  nextRunAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
