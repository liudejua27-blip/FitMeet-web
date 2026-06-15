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
import { AgentTask } from './agent-task.entity';

export type SocialAgentMessageFeedbackValue = 'positive' | 'negative';

@Entity('social_agent_message_feedback')
@Index(
  'uniq_social_agent_message_feedback_user_message',
  ['ownerUserId', 'messageId'],
  {
    unique: true,
  },
)
@Index('idx_social_agent_message_feedback_task_created', [
  'agentTaskId',
  'createdAt',
])
@Index('idx_social_agent_message_feedback_trace', ['traceId'])
export class SocialAgentMessageFeedback {
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

  @Column({ type: 'varchar', length: 160 })
  messageId!: string;

  @Column({ type: 'varchar', length: 20 })
  value!: SocialAgentMessageFeedbackValue;

  @Column({ type: 'varchar', length: 240, nullable: true })
  reason!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  runId!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  traceId!: string | null;

  @Column({ type: 'varchar', length: 80, default: 'agent_web' })
  source!: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
