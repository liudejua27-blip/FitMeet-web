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

export enum ApprovalType {
  SendMessage = 'send_message',
  FirstMessage = 'first_message',
  PostPublish = 'post_publish',
  ContactRequest = 'contact_request',
  ContactExchange = 'contact_exchange',
  CreateActivity = 'create_activity',
  JoinActivity = 'join_activity',
  OfflineMeeting = 'offline_meeting',
  ShareLocation = 'share_location',
  PhotoUpload = 'photo_upload',
  SubmitCompletionProof = 'submit_completion_proof',
  NightActivity = 'night_activity',
  AlcoholActivity = 'alcohol_activity',
  Payment = 'payment',
  UnknownRisk = 'unknown_risk',
  Custom = 'custom',
}

export enum ApprovalStatus {
  Pending = 'pending',
  Approved = 'approved',
  Rejected = 'rejected',
  Expired = 'expired',
}

export enum ApprovalRiskLevel {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
}

@Entity('agent_approval_requests')
export class AgentApprovalRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => AgentConnection, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'agentConnectionId' })
  agentConnection: AgentConnection | null;

  @Column({ type: 'int', nullable: true })
  agentConnectionId: number | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: number;

  @Column({ type: 'enum', enum: ApprovalType })
  type: ApprovalType;

  @Column({ type: 'varchar', length: 80, default: '' })
  actionType: string;

  /** Optional skill / endpoint name that triggered this approval */
  @Column({ type: 'varchar', length: 64, default: '' })
  skillName: string;

  /** Content the agent wants to submit after approval */
  @Column({ type: 'jsonb', default: '{}' })
  payload: Record<string, unknown>;

  /** One-line human summary shown to the user */
  @Column({ type: 'varchar', length: 500, default: '' })
  summary: string;

  @Column({ type: 'text', default: '' })
  reason: string;

  @Column({ type: 'varchar', length: 32, default: 'agent' })
  createdBy: string;

  @Column({ type: 'int', nullable: true })
  relatedSocialRequestId: number | null;

  @Column({ type: 'int', nullable: true })
  relatedCandidateId: number | null;

  /**
   * Pending-action support: when the queued action is bound to a concrete
   * activity (invite_activity / create_activity / join_activity), the
   * activity id is stored here so the dispatcher and audit log can link
   * back to the resource without re-parsing `payload`.
   */
  @Column({ type: 'int', nullable: true })
  relatedActivityId: number | null;

  @Column({
    type: 'enum',
    enum: ApprovalRiskLevel,
    default: ApprovalRiskLevel.Medium,
  })
  riskLevel: ApprovalRiskLevel;

  @Column({
    type: 'enum',
    enum: ApprovalStatus,
    default: ApprovalStatus.Pending,
  })
  status: ApprovalStatus;

  /** Human-readable explanation shown to the user */
  @Column({ type: 'text', default: '' })
  agentRationale: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  respondedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
