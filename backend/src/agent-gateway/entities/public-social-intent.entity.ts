import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  SocialRequestRiskLevel,
  SocialRequestStatus,
} from './social-request.entity';

@Entity('public_social_intents')
@Index(['userId', 'status'])
@Index(['linkedSocialRequestId'])
export class PublicSocialIntent {
  @PrimaryColumn({ type: 'varchar', length: 80 })
  id: string;

  @Column({ type: 'int', nullable: true })
  userId: number | null;

  @Column({ type: 'int', nullable: true })
  linkedSocialRequestId: number | null;

  @Column({ default: 'public_intent' })
  source: string;

  @Column({ default: 'public' })
  mode: string;

  @Column()
  requestType: string;

  @Column()
  title: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ type: 'jsonb', default: '[]' })
  interestTags: string[];

  @Column({ default: '' })
  city: string;

  @Column({ default: '' })
  loc: string;

  @Column({ type: 'double precision', nullable: true })
  lat: number | null;

  @Column({ type: 'double precision', nullable: true })
  lng: number | null;

  @Column({ default: 5 })
  radiusKm: number;

  @Column({ default: '' })
  timePreference: string;

  @Column({ type: 'text', default: '' })
  locationPreference: string;

  @Column({ type: 'text', default: '' })
  socialGoal: string;

  @Column({
    type: 'enum',
    enum: SocialRequestRiskLevel,
    default: SocialRequestRiskLevel.Low,
  })
  riskLevel: SocialRequestRiskLevel;

  @Column({ default: true })
  requiresUserConfirmation: boolean;

  @Column({ type: 'jsonb', default: '{}' })
  filters: Record<string, unknown>;

  @Column({ type: 'jsonb', default: '[]' })
  candidateUserIds: number[];

  @Column({ default: 0 })
  matchedCount: number;

  @Column({ type: 'int', default: 1 })
  capacityMin: number;

  @Column({ type: 'int', default: 1 })
  capacityMax: number;

  @Column({ type: 'int', default: 0 })
  acceptedCount: number;

  @Column({ type: 'varchar', length: 32, default: 'approval_required' })
  applicationPolicy: 'approval_required' | 'auto_accept';

  @Column({ type: 'int', nullable: true })
  linkedMeetId: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  closesAt: Date | null;

  @Column({
    type: 'enum',
    enum: SocialRequestStatus,
    default: SocialRequestStatus.Searching,
  })
  status: SocialRequestStatus;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
