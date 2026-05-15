import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { AgentConnection } from './agent-connection.entity';

export enum LoggedAction {
  AgentEvent = 'agent_event',
  CreateSocialRequest = 'create_social_request',
  ConfirmSocialRequestCandidate = 'confirm_social_request_candidate',
  Search = 'search',
  DraftPost = 'draft_post',
  DraftMessage = 'draft_message',
  SendMessage = 'send_message',
  ContactRequest = 'contact_request',
  LabChat = 'lab_chat',
  Intercepted = 'intercepted',
  MatchPartner = 'match_partner',
  CreateActivity = 'create_activity',
  JoinActivity = 'join_activity',
  ReportRisk = 'report_risk',
  SubmitCompletionProof = 'submit_completion_proof',
}

export enum ActionResult {
  Success = 'success',
  Blocked = 'blocked',
  PendingApproval = 'pending_approval',
  Error = 'error',
}

@Entity('agent_activity_logs')
export class AgentActivityLog {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => AgentConnection, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'agentConnectionId' })
  agentConnection: AgentConnection | null;

  @Column({ type: 'int', nullable: true })
  agentConnectionId: number | null;

  /** The user on whose behalf the action was taken */
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: number;

  @Column({ type: 'int', nullable: true })
  ownerUserId: number | null;

  @Column({ type: 'enum', enum: LoggedAction })
  action: LoggedAction;

  @Column({ type: 'varchar', length: 100, nullable: true })
  eventType: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  conversationId: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  messageId: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  status: string | null;

  /**
   * Sanitized payload (PII stripped).
   * e.g. { "query": "...", "candidateCount": 5 }
   */
  @Column({ type: 'jsonb', default: '{}' })
  payload: Record<string, unknown>;

  @Column({ type: 'enum', enum: ActionResult, default: ActionResult.Success })
  result: ActionResult;

  /** 0.0 (safe) – 1.0 (high-risk), computed by SafetyService */
  @Column({ type: 'float', default: 0 })
  riskScore: number;

  /** Reason the action was blocked, if applicable */
  @Column({ type: 'text', nullable: true })
  blockReason: string | null;

  /** Extra context for debugging/audit */
  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;
}
