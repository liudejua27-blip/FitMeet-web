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

export type SocialAgentReminderTopic =
  | 'friendship'
  | 'fitness_partner'
  | 'activity'
  | 'life_graph';

export type SocialAgentReminderTone = 'gentle' | 'direct' | 'quiet';
export type SocialAgentReminderFrequency =
  | 'realtime'
  | 'daily'
  | 'weekly'
  | 'manual';

export type SocialAgentReminderStatus =
  | 'suggested'
  | 'opened'
  | 'dismissed'
  | 'acted';

@Entity('social_agent_reminder_preferences')
@Index('uniq_social_agent_reminder_preferences_user', ['userId'], {
  unique: true,
})
export class SocialAgentReminderPreference {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ type: 'int' })
  userId!: number;

  @Column({ default: false })
  enabled!: boolean;

  @Column({
    type: 'jsonb',
    default: () => '\'["friendship", "fitness_partner", "activity"]\'',
  })
  topics!: SocialAgentReminderTopic[];

  @Column({ type: 'varchar', length: 32, default: 'weekly' })
  frequency!: SocialAgentReminderFrequency;

  @Column({ type: 'varchar', length: 16, default: '09:00' })
  quietStart!: string;

  @Column({ type: 'varchar', length: 16, default: '21:00' })
  quietEnd!: string;

  @Column({ type: 'varchar', length: 24, default: 'gentle' })
  tone!: SocialAgentReminderTone;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata!: Record<string, unknown>;

  @Column({ type: 'timestamptz', nullable: true })
  lastSuggestedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  mutedUntil!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('social_agent_reminders')
@Index('idx_social_agent_reminders_user_status_created', [
  'userId',
  'status',
  'createdAt',
])
@Index('uniq_social_agent_reminders_dedupe', ['dedupeKey'], {
  unique: true,
})
export class SocialAgentReminder {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ type: 'int' })
  userId!: number;

  @Column({ type: 'varchar', length: 40 })
  topic!: SocialAgentReminderTopic;

  @Column({ type: 'varchar', length: 40, default: 'suggested' })
  status!: SocialAgentReminderStatus;

  @Column({ type: 'varchar', length: 160 })
  dedupeKey!: string;

  @Column({ type: 'varchar', length: 220 })
  title!: string;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  context!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 120, nullable: true })
  threadId!: string | null;

  @Column({ type: 'int', nullable: true })
  taskId!: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  openedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  dismissedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
