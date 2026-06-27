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
import { MatchingJob } from './matching-job.entity';
import { PublicSocialIntent } from './public-social-intent.entity';
import { AgentTask } from './agent-task.entity';

export type AgentFeedbackType =
  | 'candidate_quality'
  | 'agent_understanding'
  | 'task_correction'
  | 'task_outcome'
  | 'message_quality';

export type AgentFeedbackReasonCode =
  | 'good_fit'
  | 'more_like_this'
  | 'save_candidate'
  | 'connect_candidate'
  | 'bad_fit'
  | 'too_far'
  | 'time_mismatch'
  | 'style_mismatch'
  | 'wrong_activity'
  | 'privacy_preference'
  | 'not_public'
  | 'other';

@Entity('agent_feedback_events')
@Index('idx_agent_feedback_events_user_created', ['userId', 'createdAt'])
@Index('idx_agent_feedback_events_task_created', ['taskId', 'createdAt'])
@Index('idx_agent_feedback_events_public_intent', ['publicIntentId'])
@Index('idx_agent_feedback_events_matching_job', ['matchingJobId'])
@Index('idx_agent_feedback_events_candidate', ['candidateId'])
@Index('idx_agent_feedback_events_type_reason_created', [
  'feedbackType',
  'reasonCode',
  'createdAt',
])
export class AgentFeedbackEvent {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ type: 'int' })
  userId!: number;

  @ManyToOne(() => AgentTask, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'taskId' })
  task!: AgentTask | null;

  @Column({ type: 'int', nullable: true })
  taskId!: number | null;

  @ManyToOne(() => PublicSocialIntent, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'publicIntentId' })
  publicIntent!: PublicSocialIntent | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  publicIntentId!: string | null;

  @ManyToOne(() => MatchingJob, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'matchingJobId' })
  matchingJob!: MatchingJob | null;

  @Column({ type: 'int', nullable: true })
  matchingJobId!: number | null;

  @Column({ type: 'int', nullable: true })
  candidateId!: number | null;

  @Column({ type: 'int', nullable: true })
  candidateRecordId!: number | null;

  @Column({ type: 'varchar', length: 60 })
  feedbackType!: AgentFeedbackType;

  @Column({ type: 'varchar', length: 80 })
  reasonCode!: AgentFeedbackReasonCode;

  @Column({ type: 'text', nullable: true })
  freeText!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  correctionType!: string | null;

  @Column({ type: 'varchar', length: 240, nullable: true })
  oldValue!: string | null;

  @Column({ type: 'varchar', length: 240, nullable: true })
  newValue!: string | null;

  @Column({ type: 'boolean', default: true })
  appliesToCurrentTask!: boolean;

  @Column({ type: 'boolean', default: false })
  appliesToFutureProfile!: boolean;

  @Column({ type: 'varchar', length: 80, default: 'agent_web' })
  source!: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  @CreateDateColumn()
  createdAt!: Date;
}
