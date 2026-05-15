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
import {
  ActivityProofPolicy,
  ActivitySafetyLevel,
  ActivityType,
} from './activity-template.entity';

export enum SocialActivityStatus {
  Draft = 'draft',
  PendingConfirm = 'pending_confirm',
  Confirmed = 'confirmed',
  InProgress = 'in_progress',
  Completed = 'completed',
  Cancelled = 'cancelled',
}

export interface IcebreakerTask {
  id: string;
  text: string;
  done?: boolean;
}

@Entity('social_activities')
@Index(['city', 'status'])
@Index(['creatorId', 'status'])
export class SocialActivity {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'creatorId' })
  creator: User;

  @Column()
  creatorId: number;

  /** Confirmed participants (creator + accepted invitees). */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  participantIds: number[];

  /** Optional link back to the originating UserSocialRequest. */
  @Column({ type: 'int', nullable: true })
  socialRequestId: number | null;

  /** Optional link back to the originating Meet (传统约练 flow). */
  @Column({ type: 'int', nullable: true })
  meetId: number | null;

  /** Optional link to the matched candidate row that triggered this. */
  @Column({ type: 'int', nullable: true })
  matchedCandidateId: number | null;

  @Column({ type: 'enum', enum: ActivityType, default: ActivityType.Custom })
  type: ActivityType;

  @Column({ type: 'varchar', length: 200, default: '' })
  title: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ type: 'varchar', length: 200, default: '' })
  locationName: string;

  @Column({ type: 'varchar', length: 100, default: '' })
  city: string;

  @Column({ type: 'double precision', nullable: true })
  lat: number | null;

  @Column({ type: 'double precision', nullable: true })
  lng: number | null;

  @Column({ type: 'timestamp', nullable: true })
  startTime: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  endTime: Date | null;

  @Column({
    type: 'enum',
    enum: SocialActivityStatus,
    default: SocialActivityStatus.Draft,
  })
  status: SocialActivityStatus;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  icebreakerTasks: IcebreakerTask[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  safetyTips: string[];

  @Column({ default: true })
  proofRequired: boolean;

  @Column({
    type: 'enum',
    enum: ActivityProofPolicy,
    default: ActivityProofPolicy.MutualOrProof,
  })
  proofPolicy: ActivityProofPolicy;

  @Column({
    type: 'enum',
    enum: ActivitySafetyLevel,
    default: ActivitySafetyLevel.Low,
  })
  safetyLevel: ActivitySafetyLevel;

  /** Per-user check-in flags. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  checkinByUserId: Record<string, string>;

  /** Per-user mutual-confirm flags. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  confirmByUserId: Record<string, string>;

  /** Per-user post-activity review payloads. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  reviewByUserId: Record<
    string,
    { rating: number; comment: string; createdAt: string }
  >;

  /**
   * Post-completion recap text. Populated by AIService.generateActivityReviewSummary
   * (with deterministic fallback) the first time the activity transitions to
   * Completed. Nullable for pre-existing rows.
   */
  @Column({ type: 'text', nullable: true })
  recap: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
