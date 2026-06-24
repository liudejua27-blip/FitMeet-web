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

export enum AgentPermissionLevel {
  /** Read recommendations only, no write actions */
  ReadOnly = 'read_only',
  /** Generate drafts for human review, never auto-publish */
  DraftMode = 'draft_mode',
  /** 基础模式 — user confirms every write action */
  Basic = 'basic',
  /** 正常模式 — low-risk auto, high-risk still confirmed */
  Standard = 'standard',
  /** 开放模式 — maximum autonomy, platform safety filters still apply */
  Open = 'open',
  /** Internal: agent-to-agent sandbox only, cannot touch real users */
  SandboxInternal = 'sandbox_internal',
}

export enum ConnectionStatus {
  Active = 'active',
  Suspended = 'suspended',
  Revoked = 'revoked',
}

export enum KnownAgent {
  FitMeetAgent = 'fitmeet_agent',
  Codex = 'codex',
  Hermes = 'hermes',
  QClaw = 'qclaw',
  Custom = 'custom',
}

@Entity('agent_connections')
export class AgentConnection {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: number;

  /** Well-known agent slug or 'custom' */
  @Column({ type: 'varchar', default: KnownAgent.Custom })
  agentName: KnownAgent | string;

  /** Human-readable label shown in the UI */
  @Column({ default: '' })
  agentDisplayName: string;

  /** Webhook endpoint the agent can receive callbacks on */
  @Column({ type: 'varchar', nullable: true })
  agentWebhookUrl: string | null;

  /**
   * bcrypt-hashed token issued to the agent.
   * The raw token is shown ONCE at creation and never stored in plain text.
   */
  @Column()
  agentTokenHash: string;

  /** Token prefix for quick lookup without full brute-force scan */
  @Column({ length: 12 })
  tokenPrefix: string;

  @Column({
    type: 'enum',
    enum: AgentPermissionLevel,
    default: AgentPermissionLevel.Open,
  })
  permissionLevel: AgentPermissionLevel;

  @Column({
    type: 'enum',
    enum: ConnectionStatus,
    default: ConnectionStatus.Active,
  })
  status: ConnectionStatus;

  /** Hard cap per calendar day; resets at UTC midnight */
  @Column({ default: 50 })
  dailyActionLimit: number;

  @Column({ default: 0 })
  dailyActionsUsed: number;

  @Column({ type: 'timestamptz', nullable: true })
  dailyResetAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastActiveAt: Date | null;

  /** ISO-8601 expiry date; null = never expires */
  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
