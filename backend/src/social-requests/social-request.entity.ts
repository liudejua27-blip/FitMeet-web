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
import { AgentConnection } from '../agent-gateway/entities/agent-connection.entity';

export enum SocialRequestSource {
  Manual = 'manual',
  FitMeetAgent = 'fitmeet_agent',
  Codex = 'codex',
  Claude = 'claude',
  CustomAgent = 'custom_agent',
  Public = 'public',
}

export enum SocialRequestType {
  RunningPartner = 'running_partner',
  FitnessPartner = 'fitness_partner',
  DogWalking = 'dog_walking',
  CoffeeChat = 'coffee_chat',
  CityWalk = 'city_walk',
  StudyPartner = 'study_partner',
  Custom = 'custom',
}

export enum SocialRequestGenderPreference {
  Any = 'any',
  Male = 'male',
  Female = 'female',
  NonSpecified = 'non_specified',
}

export enum SocialRequestSafety {
  None = 'none',
  VerifiedOnly = 'verified_only',
  LowRiskOnly = 'low_risk_only',
}

export enum SocialRequestVisibility {
  Private = 'private',
  MatchedOnly = 'matched_only',
  Public = 'public',
}

export enum UserSocialRequestStatus {
  Draft = 'draft',
  Matching = 'matching',
  Matched = 'matched',
  InvitationPending = 'invitation_pending',
  Chatting = 'chatting',
  ActivityCreated = 'activity_created',
  Completed = 'completed',
  Cancelled = 'cancelled',
  Expired = 'expired',
}

/**
 * High-level social intent card.
 *
 * NOTE: Coexists with `social_requests` (used by AgentGateway internal
 * matching pipeline). This table is the user-facing "task card" surface.
 */
@Entity('user_social_requests')
@Index(['userId', 'status'])
@Index(['city', 'status'])
export class UserSocialRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: number;

  /** Optional link to the AgentConnection that authored this request */
  @ManyToOne(() => AgentConnection, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'agentId' })
  agent: AgentConnection | null;

  @Column({ type: 'int', nullable: true })
  agentId: number | null;

  @Column({
    type: 'enum',
    enum: SocialRequestSource,
    default: SocialRequestSource.Manual,
  })
  source: SocialRequestSource;

  @Column({
    type: 'enum',
    enum: SocialRequestType,
    default: SocialRequestType.Custom,
  })
  type: SocialRequestType;

  @Column({ type: 'varchar', length: 200, default: '' })
  title: string;

  @Column({ type: 'text', default: '' })
  description: string;

  /** Original natural language intent from user / agent */
  @Column({ type: 'text', default: '' })
  rawText: string;

  @Column({ type: 'varchar', length: 100, default: '' })
  city: string;

  @Column({ type: 'double precision', nullable: true })
  lat: number | null;

  @Column({ type: 'double precision', nullable: true })
  lng: number | null;

  @Column({ type: 'int', default: 5 })
  radiusKm: number;

  @Column({ type: 'timestamptz', nullable: true })
  timeStart: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  timeEnd: Date | null;

  @Column({
    type: 'enum',
    enum: SocialRequestGenderPreference,
    default: SocialRequestGenderPreference.Any,
  })
  genderPreference: SocialRequestGenderPreference;

  @Column({ type: 'int', nullable: true })
  ageMin: number | null;

  @Column({ type: 'int', nullable: true })
  ageMax: number | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  interestTags: string[];

  @Column({ type: 'varchar', length: 100, default: '' })
  activityType: string;

  @Column({
    type: 'enum',
    enum: SocialRequestSafety,
    default: SocialRequestSafety.None,
  })
  safetyRequirement: SocialRequestSafety;

  @Column({ default: true })
  agentAllowed: boolean;

  @Column({ default: true })
  requireUserConfirmation: boolean;

  @Column({
    type: 'enum',
    enum: UserSocialRequestStatus,
    default: UserSocialRequestStatus.Draft,
  })
  status: UserSocialRequestStatus;

  @Column({
    type: 'enum',
    enum: SocialRequestVisibility,
    default: SocialRequestVisibility.MatchedOnly,
  })
  visibility: SocialRequestVisibility;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, unknown>;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
