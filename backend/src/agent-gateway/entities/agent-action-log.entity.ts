import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * AgentActionLog
 *
 * Append-only audit log of every agent behaviour, regardless of whether
 * the action was planned, executed, awaiting approval, rejected or failed.
 * Used by Agent Gateway for read-back, compliance, and trust-score signals.
 */

export enum AgentActionType {
  AgentEvent = 'agent_event',
  ReadProfile = 'read_profile',
  GenerateProfileQuestion = 'generate_profile_question',
  UpdateProfile = 'update_profile',
  CreateSocialRequest = 'create_social_request',
  SyncToHall = 'sync_to_hall',
  RunMatch = 'run_match',
  GenerateInvite = 'generate_invite',
  SendMessage = 'send_message',
  AddFriend = 'add_friend',
  CreateActivity = 'create_activity',
  InviteActivity = 'invite_activity',
  OfflineMeeting = 'offline_meeting',
  JoinActivity = 'join_activity',
  Payment = 'payment',
  SubmitProof = 'submit_proof',
  ApproveAction = 'approve_action',
  RejectAction = 'reject_action',
}

export enum AgentActionStatus {
  Planned = 'planned',
  Executed = 'executed',
  PendingApproval = 'pending_approval',
  Rejected = 'rejected',
  Failed = 'failed',
}

export enum AgentActionRiskLevel {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
}

@Entity('agent_action_logs')
@Index(['ownerUserId', 'createdAt'])
@Index(['agentId', 'createdAt'])
@Index(['agentTaskId', 'createdAt'])
export class AgentActionLog {
  @PrimaryGeneratedColumn()
  id: number;

  /** AgentConnection.id — the acting agent. Null for system-owned actions. */
  @Column({ type: 'int', nullable: true })
  agentId: number | null;

  /** Canonical Agent Runtime task id (`agent_tasks.id`) when available. */
  @Column({ type: 'int', nullable: true })
  agentTaskId: number | null;

  /** The owner (real user) on whose behalf the agent acted. */
  @Column({ type: 'int' })
  ownerUserId: number;

  @Column({ type: 'enum', enum: AgentActionType })
  actionType: AgentActionType;

  @Column({ type: 'varchar', length: 100, nullable: true })
  eventType: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  conversationId: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  messageId: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  status: string | null;

  @Column({
    type: 'enum',
    enum: AgentActionStatus,
    default: AgentActionStatus.Planned,
  })
  actionStatus: AgentActionStatus;

  @Column({
    type: 'enum',
    enum: AgentActionRiskLevel,
    default: AgentActionRiskLevel.Low,
  })
  riskLevel: AgentActionRiskLevel;

  @Column({ type: 'int', nullable: true })
  targetUserId: number | null;

  @Column({ type: 'int', nullable: true })
  targetAgentId: number | null;

  @Column({ type: 'int', nullable: true })
  relatedSocialRequestId: number | null;

  @Column({ type: 'int', nullable: true })
  relatedCandidateId: number | null;

  @Column({ type: 'int', nullable: true })
  relatedActivityId: number | null;

  /** Short human-readable input summary, PII stripped. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  inputSummary: string | null;

  /** Short human-readable output summary, PII stripped. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  outputSummary: string | null;

  /** Structured machine-readable context. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  payload: Record<string, unknown>;

  /** Why this status was reached (e.g. block reason, rejection note). */
  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
