import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { User } from '../../users/user.entity';
import { AgentTask } from './agent-task.entity';

export type SocialAgentUserInterestEventType =
  | 'view_profile'
  | 'save_candidate'
  | 'skip_candidate'
  | 'more_like_this'
  | 'generate_opener'
  | 'send_invite'
  | 'connect_candidate'
  | 'discover_click'
  | 'activity_complete'
  | 'review_positive'
  | 'review_negative'
  | 'chat_topic';

@Entity('social_agent_user_interest_events')
@Index('idx_social_agent_user_interest_events_owner_created', [
  'ownerUserId',
  'createdAt',
])
@Index('idx_social_agent_user_interest_events_owner_type_created', [
  'ownerUserId',
  'eventType',
  'createdAt',
])
@Index('idx_social_agent_user_interest_events_target', [
  'ownerUserId',
  'targetUserId',
  'eventType',
])
@Index('uniq_social_agent_user_interest_events_dedupe', ['dedupeKey'], {
  unique: true,
  where: '"dedupeKey" IS NOT NULL',
})
export class SocialAgentUserInterestEvent {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerUserId' })
  owner!: User;

  @Column({ type: 'int' })
  ownerUserId!: number;

  @ManyToOne(() => AgentTask, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'agentTaskId' })
  task!: AgentTask | null;

  @Column({ type: 'int', nullable: true })
  agentTaskId!: number | null;

  @Column({ type: 'varchar', length: 40 })
  eventType!: SocialAgentUserInterestEventType;

  @Column({ type: 'int', nullable: true })
  targetUserId!: number | null;

  @Column({ type: 'int', nullable: true })
  candidateRecordId!: number | null;

  @Column({ type: 'int', nullable: true })
  socialRequestId!: number | null;

  @Column({ type: 'int', nullable: true })
  activityId!: number | null;

  @Column({ type: 'double precision', default: 1 })
  weight!: number;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  activityTags!: string[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  candidatePreferenceTags!: string[];

  @Column({ type: 'varchar', length: 120, nullable: true })
  city!: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  locationText!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  timeWindow!: string | null;

  @Column({ type: 'varchar', length: 80, default: 'agent_web' })
  source!: string;

  @Column({ type: 'varchar', length: 240, nullable: true })
  dedupeKey!: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  @CreateDateColumn()
  createdAt!: Date;
}
