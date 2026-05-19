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
import { User } from '../../users/user.entity';
import { AgentConnection } from './agent-connection.entity';

/**
 * Coarse-grained policy that gates agent autonomy. The fine-grained
 * `AgentPermission` rows (per-action) are still used by the
 * AgentPermissionGuard; AgentSettings sits one layer above and is the
 * UI-facing "control panel" the user actually edits.
 */
export enum AgentSettingsMode {
  Assisted = 'assisted',
  /**
   * 基础模式 — drafts/suggestions only. First-time outbound messages,
   * contact exchange, friend-add, offline invites, activity creation,
   * and proof upload all require explicit user approval. Safest default.
   */
  Basic = 'basic',
  Normal = 'normal',
  /**
   * 正常模式 — low-risk auto-execute (post, auto-filter matches, ordinary
   * chat, follow-up replies, assisted contact-exchange/activity invites).
   * First contact with strangers, night/alcohol/payment activities,
   * precise location, photo upload, and final publish still require
   * confirmation.
   */
  Standard = 'standard',
  /**
   * 开放模式 — maximum agent autonomy. Auto-chat, friend-add, invite,
   * publish allowed. Platform safety filters (illegal/harassment/sexual/
   * violent content, payment induction, blocked-by-target, target opted
   * out of agent contact) still apply and cannot be bypassed.
   */
  Open = 'open',
  /**
   * Internal sandbox: agent can only operate in the agent-to-agent
   * sandbox; cannot contact real users for any action. Not surfaced in
   * the UI; preserved for legacy Lab Mode rows and for engineering use.
   */
  SandboxInternal = 'sandbox_internal',
}

@Entity('agent_settings')
@Index(['userId', 'agentConnectionId'], { unique: true })
export class AgentSettings {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: number;

  /**
   * `null` = applies to ALL of this user's agents (default).
   * Specific id = override for one agent connection.
   */
  @ManyToOne(() => AgentConnection, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'agentConnectionId' })
  agentConnection: AgentConnection | null;

  @Column({ type: 'int', nullable: true })
  agentConnectionId: number | null;

  @Column({
    type: 'enum',
    enum: AgentSettingsMode,
    default: AgentSettingsMode.Open,
  })
  mode: AgentSettingsMode;

  // ── capability switches ───────────────────────────────────────
  @Column({ default: true }) allowSearch: boolean;
  @Column({ default: true }) allowDraftMessage: boolean;
  @Column({ default: true }) allowSendMessage: boolean;
  @Column({ default: true }) allowAutoReply: boolean;
  @Column({ default: true }) allowCreateActivity: boolean;
  @Column({ default: true }) allowJoinActivity: boolean;
  @Column({ default: true }) allowShareLocation: boolean;
  @Column({ default: true }) allowUploadProof: boolean;
  @Column({ default: true }) allowContactExchange: boolean;

  // ── quotas ───────────────────────────────────────────────────
  @Column({ type: 'int', default: 20 })
  maxDailyMessages: number;

  // ── approval gates ───────────────────────────────────────────
  @Column({ default: false }) requireApprovalForFirstMessage: boolean;
  @Column({ default: false }) requireApprovalForOfflineMeeting: boolean;
  @Column({ default: false }) requireApprovalForPhotoUpload: boolean;

  /** Master switch: every write action requires explicit approval. */
  @Column({ default: false }) requireApprovalForAll: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
