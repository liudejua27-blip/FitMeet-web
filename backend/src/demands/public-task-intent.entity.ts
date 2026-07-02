import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

export type PublicTaskIntentStatus =
  | 'open'
  | 'in_progress'
  | 'closed'
  | 'cancelled';

@Entity('public_task_intents')
@Index(['userId', 'status'])
@Index(['category', 'status'])
@Index(['demandId'])
export class PublicTaskIntent {
  @PrimaryColumn({ type: 'varchar', length: 80 })
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'int', nullable: true })
  userId: number | null;

  @Column({ type: 'varchar', length: 80 })
  demandId: string;

  @Column({ default: 'demand' })
  source: string;

  @Column({ default: 'public' })
  mode: string;

  @Column({ type: 'varchar', length: 32 })
  requestType: string;

  @Column({ type: 'varchar', length: 40, default: 'service' })
  category: string;

  @Column({ type: 'varchar', length: 120 })
  title: string;

  @Column({ type: 'text', default: '' })
  summary: string;

  @Column({ type: 'jsonb', default: '[]' })
  fields: Record<string, unknown>[];

  @Column({ default: '' })
  city: string;

  @Column({ default: '' })
  loc: string;

  @Column({ type: 'double precision', nullable: true })
  lat: number | null;

  @Column({ type: 'double precision', nullable: true })
  lng: number | null;

  @Column({ default: '' })
  timePreference: string;

  @Column({ default: '' })
  budgetText: string;

  @Column({ default: '' })
  urgencyText: string;

  @Column({ type: 'varchar', length: 24, default: 'medium' })
  riskLevel: string;

  @Column({ type: 'varchar', length: 24, default: 'owner_approval_required' })
  applicationPolicy: string;

  @Column({ type: 'int', default: 0 })
  applicantCount: number;

  @Column({ type: 'int', nullable: true })
  acceptedApplicantId: number | null;

  @Column({ type: 'varchar', length: 24, default: 'open' })
  status: PublicTaskIntentStatus;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
