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
import { User } from '../users/user.entity';
import { UserSocialRequest } from '../social-requests/social-request.entity';

export enum SocialRequestCandidateStatus {
  /** Algorithm returned this user as a candidate */
  Suggested = 'suggested',
  /** Owner explicitly approved (e.g. clicked "send invite") */
  Approved = 'approved',
  /** A real message was sent to this candidate */
  Messaged = 'messaged',
  /** Owner explicitly rejected */
  Rejected = 'rejected',
  /** Candidate aged out (request expired or rematched) */
  Expired = 'expired',
}

export enum CandidateRiskLevel {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
}

export enum CandidateMatchLevel {
  High = 'high',
  Medium = 'medium',
  Low = 'low',
}

/**
 * Persisted scored candidate for a UserSocialRequest. Drives the
 * "match review" surface and prevents recomputing the algorithm on
 * every refresh or "try another" action.
 */
@Entity('social_request_candidates')
@Index(
  'uniq_src_request_candidate_user',
  ['socialRequestId', 'candidateUserId'],
  {
    unique: true,
  },
)
@Index(['socialRequestId', 'status'])
@Index(['socialRequestId', 'score'])
@Index(['socialRequestId', 'scoreVersion'])
@Index(['socialRequestId', 'sourceType', 'sourceId'])
@Index(['socialRequestId', 'userAction'])
export class SocialRequestCandidate {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => UserSocialRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'socialRequestId' })
  socialRequest: UserSocialRequest;

  @Column()
  socialRequestId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'candidateUserId' })
  candidateUser: User;

  @Column()
  candidateUserId: number;

  @Column({ type: 'int' })
  score: number;

  @Column({
    type: 'enum',
    enum: CandidateMatchLevel,
    default: CandidateMatchLevel.Medium,
  })
  level: CandidateMatchLevel;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  scoreBreakdown: Record<string, number>;

  @Column({ type: 'varchar', length: 40, default: 'profile' })
  sourceType: string;

  @Column({ type: 'varchar', length: 120, default: '' })
  sourceId: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  publicIntentId: string | null;

  @Column({ type: 'int', nullable: true })
  activityId: number | null;

  @Column({ type: 'int', nullable: true })
  rankPosition: number | null;

  @Column({ type: 'varchar', length: 40, default: 'fitmeet_match_v1' })
  scoreVersion: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  explanation: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  relationshipState: Record<string, unknown>;

  @Column({ type: 'varchar', length: 120, default: '' })
  exposureReason: string;

  @Column({ type: 'varchar', length: 40, default: '' })
  userAction: string;

  @Column({ type: 'timestamptz', nullable: true })
  userActionAt: Date | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  reasons: string[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  commonTags: string[];

  @Column({ type: 'double precision', nullable: true })
  distanceKm: number | null;

  @Column({
    type: 'enum',
    enum: CandidateRiskLevel,
    default: CandidateRiskLevel.Low,
  })
  riskLevel: CandidateRiskLevel;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  riskWarnings: string[];

  @Column({ type: 'text', default: '' })
  suggestedMessage: string;

  @Column({
    type: 'enum',
    enum: SocialRequestCandidateStatus,
    default: SocialRequestCandidateStatus.Suggested,
  })
  status: SocialRequestCandidateStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
