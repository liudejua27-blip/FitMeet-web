import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

export type AiMatchSessionStatus = 'review' | 'approved' | 'rejected';
export type AiMatchSessionInitiator =
  | 'manual'
  | 'autopilot'
  | 'profile_match_autopilot';

@Entity('ai_match_sessions')
export class AiMatchSession {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerId' })
  owner: User;

  @Column()
  ownerId: number;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'targetUserId' })
  targetUser: User;

  @Column()
  targetUserId: number;

  @Column({ default: 0 })
  score: number;

  @Column({ default: 'review' })
  status: AiMatchSessionStatus;

  @Column({ default: 'manual' })
  initiatedBy: AiMatchSessionInitiator;

  @Column({ default: 'ai_delegate' })
  source: string;

  @Column({ nullable: true })
  conversationId: string;

  @Column({ default: false })
  contactCardSent: boolean;

  @Column({ type: 'timestamp', nullable: true })
  contactedAt: Date | null;

  @Column({ type: 'text', default: '' })
  summary: string;

  @Column('simple-array', { default: '' })
  reasons: string[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  transcript: Array<{ speaker: string; text: string }>;

  @CreateDateColumn()
  createdAt: Date;
}
