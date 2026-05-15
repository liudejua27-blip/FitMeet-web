import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { AgentConnection } from './agent-connection.entity';

export enum SocialRequestStatus {
  Active = 'active',
  Searching = 'searching',
  Matched = 'matched',
  Inactive = 'inactive',
  Completed = 'completed',
  Closed = 'closed',
  Cancelled = 'cancelled',
}

export enum SocialRequestRiskLevel {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
}

@Entity('social_requests')
/**
 * @deprecated Read-compat only. New writes go through
 * `SocialRequestsService` -> `user_social_requests` via
 * `AgentSocialRequestAdapter`. Kept so historical rows and
 * legacy public-intent read paths continue to compile.
 */
export class SocialRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: number;

  @ManyToOne(() => AgentConnection, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'agentConnectionId' })
  agentConnection: AgentConnection | null;

  @Column({ type: 'int', nullable: true })
  agentConnectionId: number | null;

  @Column()
  requestType: string;

  @Column()
  title: string;

  @Column({ type: 'text', default: '' })
  description: string;

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

  @Column({ default: 'matched_users_only' })
  visibility: string;

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

  @Column({
    type: 'enum',
    enum: SocialRequestStatus,
    default: SocialRequestStatus.Searching,
  })
  status: SocialRequestStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
