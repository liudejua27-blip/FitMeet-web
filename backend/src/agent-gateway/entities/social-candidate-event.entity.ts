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
import { SocialCandidateSnapshot } from './social-candidate-snapshot.entity';

export type SocialCandidateEventType =
  | 'candidate_impression'
  | 'candidate_viewed'
  | 'candidate_saved'
  | 'candidate_skipped'
  | 'more_like_this_requested'
  | 'opener_previewed'
  | 'opener_regenerated'
  | 'invite_approval_requested'
  | 'invite_rejected'
  | 'invite_sent'
  | 'connect_approval_requested'
  | 'connect_established'
  | 'candidate_replied'
  | 'activity_confirmed'
  | 'activity_completed'
  | 'review_submitted';

@Entity('social_candidate_events')
@Index('idx_social_candidate_events_owner_created', [
  'ownerUserId',
  'createdAt',
])
@Index('idx_social_candidate_events_task_created', ['taskId', 'createdAt'])
@Index('idx_social_candidate_events_snapshot', ['snapshotId'])
@Index('idx_social_candidate_events_public_intent', ['publicIntentId'])
@Index('idx_social_candidate_events_matching_job', ['matchingJobId'])
@Index('idx_social_candidate_events_social_request', ['socialRequestId'])
@Index('idx_social_candidate_events_candidate', ['candidateUserId'])
@Index('idx_social_candidate_events_type_created', ['eventType', 'createdAt'])
export class SocialCandidateEvent {
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

  @ManyToOne(() => SocialCandidateSnapshot, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'snapshotId' })
  snapshot!: SocialCandidateSnapshot | null;

  @Column({ type: 'int', nullable: true })
  snapshotId!: number | null;

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

  @Column({ type: 'int', nullable: true })
  candidateUserId!: number | null;

  @Column({ type: 'int', nullable: true })
  candidateRecordId!: number | null;

  @Column({ type: 'varchar', length: 80 })
  eventType!: SocialCandidateEventType;

  @Column({ type: 'varchar', length: 180, nullable: true })
  idempotencyKey!: string | null;

  @Column({ type: 'varchar', length: 80, default: 'agent' })
  source!: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  payload!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  @CreateDateColumn()
  createdAt!: Date;
}
