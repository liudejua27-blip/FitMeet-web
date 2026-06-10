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
import { AgentEvalCase, AgentSkillPatch } from './agent-self-improve.entity';
import type { FitMeetAlphaAgentName } from '../fitmeet-alpha-agent.types';

export type AgentReplaySampleStatus = 'captured' | 'used_for_eval' | 'ignored';

@Entity('agent_online_replay_samples')
@Index('idx_agent_online_replay_samples_task_created', [
  'agentTaskId',
  'createdAt',
])
@Index('idx_agent_online_replay_samples_eval_case', ['evalCaseId'])
@Index('idx_agent_online_replay_samples_owner_created', [
  'ownerUserId',
  'createdAt',
])
export class AgentOnlineReplaySample {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'ownerUserId' })
  owner!: User | null;

  @Column({ type: 'int', nullable: true })
  ownerUserId!: number | null;

  @ManyToOne(() => AgentTask, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'agentTaskId' })
  task!: AgentTask | null;

  @Column({ type: 'int', nullable: true })
  agentTaskId!: number | null;

  @ManyToOne(() => AgentEvalCase, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'evalCaseId' })
  evalCase!: AgentEvalCase | null;

  @Column({ type: 'int', nullable: true })
  evalCaseId!: number | null;

  @Column({ type: 'varchar', length: 80, default: 'chat_turn' })
  replayType!: string;

  @Column({ type: 'varchar', length: 40, default: 'captured' })
  status!: AgentReplaySampleStatus;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  input!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  expectedBehavior!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  replayContext!: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  lastReplay!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('agent_subagent_memory')
@Index('idx_agent_subagent_memory_user_agent_updated', [
  'ownerUserId',
  'agentName',
  'updatedAt',
])
@Index('idx_agent_subagent_memory_task_agent', ['agentTaskId', 'agentName'])
@Index('idx_agent_subagent_memory_scope', ['memoryScope'])
export class AgentSubagentMemory {
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

  @Column({ type: 'varchar', length: 80 })
  agentName!: FitMeetAlphaAgentName;

  @Column({ type: 'varchar', length: 120 })
  memoryScope!: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  input!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  observation!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  critique!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  handoffOutput!: Record<string, unknown>;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('agent_meet_loop_states')
@Index('uniq_agent_meet_loop_states_task', ['agentTaskId'], { unique: true })
@Index('idx_agent_meet_loop_states_owner_stage', ['ownerUserId', 'stage'])
@Index('idx_agent_meet_loop_states_activity', ['activityId'])
export class AgentMeetLoopState {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerUserId' })
  owner!: User;

  @Column({ type: 'int' })
  ownerUserId!: number;

  @ManyToOne(() => AgentTask, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agentTaskId' })
  task!: AgentTask;

  @Column({ type: 'int' })
  agentTaskId!: number;

  @Column({ type: 'int', nullable: true })
  activityId!: number | null;

  @Column({ type: 'int', nullable: true })
  candidateUserId!: number | null;

  @Column({ type: 'varchar', length: 80, default: 'draft_created' })
  stage!: string;

  @Column({ type: 'varchar', length: 80, default: 'waiting_confirmation' })
  waitingFor!: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  state!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  transitionHistory!: Array<Record<string, unknown>>;

  @Column({ type: 'jsonb', nullable: true })
  review!: Record<string, unknown> | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('agent_skill_patch_effects')
@Index('idx_agent_skill_patch_effects_patch_created', ['patchId', 'createdAt'])
@Index('idx_agent_skill_patch_effects_decision_created', [
  'decision',
  'createdAt',
])
export class AgentSkillPatchEffect {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => AgentSkillPatch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patchId' })
  patch!: AgentSkillPatch;

  @Column({ type: 'int' })
  patchId!: number;

  @Column({ type: 'varchar', length: 80 })
  metric!: string;

  @Column({ type: 'float' })
  value!: number;

  @Column({ type: 'int', nullable: true })
  sampleSize!: number | null;

  @Column({ type: 'varchar', length: 40, default: 'observe' })
  decision!: 'observe' | 'promote' | 'rollback';

  @Column({ type: 'text', default: '' })
  note!: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  context!: Record<string, unknown>;

  @CreateDateColumn()
  createdAt!: Date;
}

export type SubagentWorkerJobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

@Entity('subagent_worker_jobs')
@Index('idx_subagent_worker_jobs_queue_status_priority', [
  'queueName',
  'status',
  'priority',
  'createdAt',
])
@Index('idx_subagent_worker_jobs_run_trace', ['runId', 'traceId'])
@Index('idx_subagent_worker_jobs_locked', ['lockedBy', 'lockedUntil'])
export class SubagentWorkerJob {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 80 })
  agentName!: FitMeetAlphaAgentName;

  @Column({ type: 'varchar', length: 120 })
  queueName!: string;

  @Column({ type: 'varchar', length: 40, default: 'queued' })
  status!: SubagentWorkerJobStatus;

  @Column({ type: 'int', default: 0 })
  priority!: number;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  payload!: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  result!: Record<string, unknown> | null;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ type: 'int', default: 3 })
  maxAttempts!: number;

  @Column({ type: 'varchar', length: 160, nullable: true })
  lockedBy!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  lockedUntil!: Date | null;

  @Column({ type: 'varchar', length: 96, nullable: true })
  runId!: string | null;

  @Column({ type: 'varchar', length: 96, nullable: true })
  traceId!: string | null;

  @Column({ type: 'text', nullable: true })
  lastError!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('subagent_worker_heartbeats')
@Index(
  'uniq_subagent_worker_heartbeats_worker_queue',
  ['workerId', 'queueName'],
  {
    unique: true,
  },
)
@Index('idx_subagent_worker_heartbeats_seen', ['lastSeenAt'])
export class SubagentWorkerHeartbeat {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 160 })
  workerId!: string;

  @Column({ type: 'varchar', length: 120 })
  queueName!: string;

  @Column({ type: 'varchar', length: 40, default: 'idle' })
  status!: 'idle' | 'running' | 'failed';

  @Column({ type: 'int', nullable: true })
  activeJobId!: number | null;

  @Column({ type: 'timestamptz' })
  lastSeenAt!: Date;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('subagent_worker_failures')
@Index('idx_subagent_worker_failures_job_created', ['jobId', 'createdAt'])
@Index('idx_subagent_worker_failures_queue_created', ['queueName', 'createdAt'])
export class SubagentWorkerFailure {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  jobId!: number;

  @Column({ type: 'varchar', length: 80 })
  agentName!: FitMeetAlphaAgentName;

  @Column({ type: 'varchar', length: 120 })
  queueName!: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  workerId!: string | null;

  @Column({ type: 'text' })
  error!: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  context!: Record<string, unknown>;

  @CreateDateColumn()
  createdAt!: Date;
}
