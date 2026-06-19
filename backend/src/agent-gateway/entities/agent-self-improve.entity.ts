import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AgentReflectionRunStatus =
  | 'queued'
  | 'completed'
  | 'failed'
  | 'dismissed';

export type AgentSkillPatchStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'published'
  | 'rolled_back';

export type AgentSkillPatchRiskLevel = 'low' | 'medium' | 'high';

export type AgentEvalCaseStatus = 'active' | 'disabled' | 'fixed';

@Entity('agent_reflection_runs')
@Index('idx_agent_reflection_runs_task_created', ['agentTaskId', 'createdAt'])
@Index('idx_agent_reflection_runs_status_created', ['status', 'createdAt'])
@Index('idx_agent_reflection_runs_owner_created', ['ownerUserId', 'createdAt'])
export class AgentReflectionRun {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int', nullable: true })
  ownerUserId!: number | null;

  @Column({ type: 'int', nullable: true })
  agentTaskId!: number | null;

  @Column({ type: 'varchar', length: 80, default: 'quality_failed' })
  triggerType!: string;

  @Column({ type: 'varchar', length: 40, default: 'queued' })
  status!: AgentReflectionRunStatus;

  @Column({ type: 'varchar', length: 80, default: 'fitmeet_agent' })
  source!: string;

  @Column({ type: 'varchar', length: 20, default: 'medium' })
  severity!: AgentSkillPatchRiskLevel;

  @Column({ type: 'int', nullable: true })
  qualityScore!: number | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  failedChecks!: Array<Record<string, unknown>>;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  input!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  reflection!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  suggestedPatchIds!: number[];

  @Column({ type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('agent_skill_patches')
@Index('idx_agent_skill_patches_reflection', ['reflectionRunId'])
@Index('idx_agent_skill_patches_status_created', ['status', 'createdAt'])
@Index('idx_agent_skill_patches_type_status', ['patchType', 'status'])
export class AgentSkillPatch {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int', nullable: true })
  reflectionRunId!: number | null;

  @Column({ type: 'varchar', length: 60 })
  patchType!: string;

  @Column({ type: 'varchar', length: 40, default: 'draft' })
  status!: AgentSkillPatchStatus;

  @Column({ type: 'varchar', length: 20, default: 'medium' })
  riskLevel!: AgentSkillPatchRiskLevel;

  @Column({ type: 'varchar', length: 160 })
  title!: string;

  @Column({ type: 'text', default: '' })
  rationale!: string;

  @Column({ type: 'varchar', length: 160, default: '' })
  target!: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  patch!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  evalCaseIds!: number[];

  @Column({ type: 'int', nullable: true })
  reviewedByUserId!: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('agent_eval_cases')
@Index('idx_agent_eval_cases_reflection', ['reflectionRunId'])
@Index('idx_agent_eval_cases_task_created', ['agentTaskId', 'createdAt'])
@Index('idx_agent_eval_cases_status_type', ['status', 'caseType'])
export class AgentEvalCase {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int', nullable: true })
  reflectionRunId!: number | null;

  @Column({ type: 'int', nullable: true })
  agentTaskId!: number | null;

  @Column({ type: 'varchar', length: 80, default: 'quality_regression' })
  caseType!: string;

  @Column({ type: 'varchar', length: 40, default: 'active' })
  status!: AgentEvalCaseStatus;

  @Column({ type: 'varchar', length: 160 })
  title!: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  input!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  expectedBehavior!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 80, default: 'self_improve' })
  source!: string;

  @Column({ type: 'jsonb', nullable: true })
  lastRun!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
