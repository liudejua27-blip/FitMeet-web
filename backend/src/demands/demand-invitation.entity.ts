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
import { DemandCandidate } from './demand-candidate.entity';
import { Demand } from './demand.entity';

export enum DemandInvitationStatus {
  Pending = 'pending',
  Accepted = 'accepted',
  Rejected = 'rejected',
  Cancelled = 'cancelled',
  Expired = 'expired',
}

export enum DemandInvitationSourceType {
  AgentCandidate = 'agent_candidate',
  Profile = 'profile',
  Friendship = 'friendship',
  PublicIntent = 'public_intent',
}

@Entity('demand_invitations')
@Index(['inviterUserId', 'status'])
@Index(['inviteeUserId', 'status'])
@Index(['demandId', 'candidateRecordId'])
export class DemandInvitation {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Demand, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'demandId' })
  demand: Demand | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  demandId: string | null;

  @ManyToOne(() => DemandCandidate, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'candidateRecordId' })
  candidateRecord: DemandCandidate | null;

  @Column({ type: 'int', nullable: true })
  candidateRecordId: number | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'inviterUserId' })
  inviter: User;

  @Column({ type: 'int' })
  inviterUserId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'inviteeUserId' })
  invitee: User;

  @Column({ type: 'int' })
  inviteeUserId: number;

  @Column({
    type: 'varchar',
    length: 40,
    default: DemandInvitationSourceType.AgentCandidate,
  })
  sourceType: DemandInvitationSourceType;

  @Column({ type: 'varchar', length: 120, nullable: true })
  sourceId: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  publicIntentId: string | null;

  @Column({ type: 'varchar', length: 120 })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'varchar', length: 80 })
  activityType: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  city: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  locationText: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  timeWindow: string | null;

  @Column({ type: 'int', nullable: true })
  capacityMin: number | null;

  @Column({ type: 'int', nullable: true })
  capacityMax: number | null;

  @Column({
    type: 'varchar',
    length: 24,
    default: DemandInvitationStatus.Pending,
  })
  status: DemandInvitationStatus;

  @Column({ type: 'int', nullable: true })
  proposedMeetId: number | null;

  @Column({ type: 'int', nullable: true })
  acceptedMeetId: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  conversationId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
