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

export enum AgentType {
  UserAgent = 'user_agent',
  PlatformAgent = 'platform_agent',
  ExternalAgent = 'external_agent',
}

export enum AgentProvider {
  DeepSeek = 'deepseek',
  OpenClaw = 'openclaw',
  Codex = 'codex',
  QClaw = 'qclaw',
  Custom = 'custom',
}

export enum AgentAutonomyLevel {
  Assisted = 'assisted',
  Normal = 'normal',
  Open = 'open',
}

export enum AgentProfileStatus {
  Active = 'active',
  Paused = 'paused',
  Blocked = 'blocked',
}

@Entity('agent_profiles')
@Index(['ownerUserId'])
@Index(['agentType'])
@Index(['provider'])
export class AgentProfile {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'ownerUserId' })
  ownerUser: User | null;

  @Column({ type: 'int', nullable: true })
  ownerUserId: number | null;

  @ManyToOne(() => AgentConnection, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'agentConnectionId' })
  agentConnection: AgentConnection | null;

  @Column({ type: 'int', nullable: true })
  agentConnectionId: number | null;

  @Column({ length: 80 })
  agentName: string;

  @Column({ type: 'enum', enum: AgentType, default: AgentType.UserAgent })
  agentType: AgentType;

  @Column({ type: 'enum', enum: AgentProvider, default: AgentProvider.Custom })
  provider: AgentProvider;

  @Column({ default: '' })
  avatar: string;

  @Column({ type: 'text', default: '' })
  bio: string;

  @Column({ type: 'text', default: '' })
  personality: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  goals: string[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  interests: string[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  preferredTargets: string[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  boundaries: string[];

  @Column({
    type: 'enum',
    enum: AgentAutonomyLevel,
    default: AgentAutonomyLevel.Normal,
  })
  autonomyLevel: AgentAutonomyLevel;

  @Column({
    type: 'enum',
    enum: AgentProfileStatus,
    default: AgentProfileStatus.Active,
  })
  status: AgentProfileStatus;

  @Column({ type: 'timestamptz', nullable: true })
  lastActiveAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
