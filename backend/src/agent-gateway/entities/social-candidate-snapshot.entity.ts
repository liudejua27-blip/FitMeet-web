import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { User } from '../../users/user.entity';
import { UserSocialRequest } from '../../social-requests/social-request.entity';
import { AgentTask } from './agent-task.entity';
import { MatchingJob } from './matching-job.entity';
import { PublicSocialIntent } from './public-social-intent.entity';

export type SocialCandidateSnapshotType =
  | 'matching_job_result'
  | 'candidate_pool_search'
  | 'activity_pool_search';

@Entity('social_candidate_snapshots')
@Index('idx_social_candidate_snapshots_owner_created', [
  'ownerUserId',
  'createdAt',
])
@Index('idx_social_candidate_snapshots_task_created', ['taskId', 'createdAt'])
@Index('idx_social_candidate_snapshots_public_intent', ['publicIntentId'])
@Index('idx_social_candidate_snapshots_matching_job', ['matchingJobId'])
@Index('idx_social_candidate_snapshots_social_request', ['socialRequestId'])
@Index('idx_social_candidate_snapshots_type_created', [
  'snapshotType',
  'createdAt',
])
export class SocialCandidateSnapshot {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerUserId' })
  owner!: User;

  @Column({ type: 'int' })
  ownerUserId!: number;

  @ManyToOne(() => AgentTask, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'taskId' })
  task!: AgentTask | null;

  @Column({ type: 'int', nullable: true })
  taskId!: number | null;

  @ManyToOne(() => UserSocialRequest, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'socialRequestId' })
  socialRequest!: UserSocialRequest | null;

  @Column({ type: 'int', nullable: true })
  socialRequestId!: number | null;

  @ManyToOne(() => PublicSocialIntent, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'publicIntentId' })
  publicIntent!: PublicSocialIntent | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  publicIntentId!: string | null;

  @ManyToOne(() => MatchingJob, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'matchingJobId' })
  matchingJob!: MatchingJob | null;

  @Column({ type: 'int', nullable: true })
  matchingJobId!: number | null;

  @Column({ type: 'varchar', length: 60 })
  snapshotType!: SocialCandidateSnapshotType;

  @Column({ type: 'varchar', length: 128, default: '' })
  sourceVersion!: string;

  @Column({ type: 'varchar', length: 80, default: '' })
  scoreVersion!: string;

  @Column({ type: 'int', default: 0 })
  candidateCount!: number;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  query!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  constraints!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  candidates!: Array<Record<string, unknown>>;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  debug!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  @CreateDateColumn()
  createdAt!: Date;
}
