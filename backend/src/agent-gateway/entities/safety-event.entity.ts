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

export enum SafetyEventType {
  RateLimitExceeded = 'rate_limit_exceeded',
  HarassmentDetected = 'harassment_detected',
  SpamDetected = 'spam_detected',
  ImpersonationAttempt = 'impersonation_attempt',
  ContactBypass = 'contact_bypass',
  UnauthorizedAction = 'unauthorized_action',
  SuspiciousPattern = 'suspicious_pattern',
}

export enum Severity {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  Critical = 'critical',
}

@Entity('safety_events')
export class SafetyEvent {
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

  @Column({ type: 'enum', enum: SafetyEventType })
  eventType: SafetyEventType;

  @Column({ type: 'enum', enum: Severity, default: Severity.Low })
  severity: Severity;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>;

  @Column({ default: false })
  resolved: boolean;

  @Column({ type: 'text', nullable: true })
  resolution: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
