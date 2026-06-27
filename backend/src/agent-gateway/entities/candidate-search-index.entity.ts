import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum CandidateSearchIndexSourceType {
  Profile = 'profile',
  PublicIntent = 'public_intent',
}

export enum CandidateSearchIndexStatus {
  Active = 'active',
  Paused = 'paused',
  Blocked = 'blocked',
  Expired = 'expired',
  Removed = 'removed',
}

@Entity('candidate_search_index')
@Index(['sourceType', 'sourceId'], { unique: true })
@Index(['status', 'city'])
@Index(['userId', 'status'])
@Index(['profileDiscoverable', 'agentCanRecommendMe', 'status'])
@Index(['sourceUpdatedAt', 'updatedAt'])
export class CandidateSearchIndex {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 32 })
  sourceType: CandidateSearchIndexSourceType;

  @Column({ type: 'varchar', length: 120 })
  sourceId: string;

  @Column({ type: 'varchar', length: 180, default: '' })
  sourceVersion: string;

  @Column({ type: 'int', nullable: true })
  userId: number | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  publicIntentId: string | null;

  @Column({ type: 'int', nullable: true })
  linkedSocialRequestId: number | null;

  @Column({ default: true })
  isRealUser: boolean;

  @Column({ default: false })
  profileDiscoverable: boolean;

  @Column({ default: false })
  agentCanRecommendMe: boolean;

  @Column({ default: false })
  agentCanStartChatAfterApproval: boolean;

  @Column({
    type: 'enum',
    enum: CandidateSearchIndexStatus,
    default: CandidateSearchIndexStatus.Active,
  })
  status: CandidateSearchIndexStatus;

  @Column({ default: '' })
  displayName: string;

  @Column({ default: '' })
  city: string;

  @Column({ type: 'text', default: '' })
  areaText: string;

  @Column({ type: 'double precision', nullable: true })
  lat: number | null;

  @Column({ type: 'double precision', nullable: true })
  lng: number | null;

  @Column({ type: 'int', default: 20 })
  radiusKm: number;

  @Column({ type: 'jsonb', default: '[]' })
  activityTypes: string[];

  @Column({ type: 'jsonb', default: '[]' })
  interestTags: string[];

  @Column({ type: 'jsonb', default: '[]' })
  lifestyleTags: string[];

  @Column({ type: 'jsonb', default: '[]' })
  socialScenes: string[];

  @Column({ type: 'jsonb', default: '[]' })
  relationshipGoals: string[];

  @Column({ type: 'jsonb', default: '[]' })
  timeBuckets: string[];

  @Column({ type: 'text', default: '' })
  publicSummary: string;

  @Column({ type: 'jsonb', default: '[]' })
  publicSafetyNotes: string[];

  @Column({ type: 'jsonb', default: '{}' })
  safetyFlags: Record<string, unknown>;

  @Column({ type: 'int', default: 0 })
  trustScore: number;

  @Column({ type: 'int', default: 0 })
  profileCompleteness: number;

  @Column({ type: 'int', default: 0 })
  exposureCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastRecommendedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastActiveAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  sourceUpdatedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
