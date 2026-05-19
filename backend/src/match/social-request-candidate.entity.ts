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
@Index(['socialRequestId', 'status'])
@Index(['socialRequestId', 'score'])
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
