import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import {
  LifeGraphAuditAction,
  LifeGraphFieldCategory,
  LifeGraphFieldSource,
} from '../life-graph.enums';

@Entity('life_graph_audit_logs')
@Index(['userId', 'createdAt'])
export class LifeGraphAuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  userId: number;

  @Column({ type: 'varchar', length: 96 })
  fieldKey: string;

  @Column({ type: 'varchar', length: 64 })
  category: LifeGraphFieldCategory;

  @Column({ type: 'jsonb', nullable: true })
  oldValue: unknown | null;

  @Column({ type: 'jsonb', nullable: true })
  newValue: unknown | null;

  @Column({ type: 'varchar', length: 48 })
  source: LifeGraphFieldSource;

  @Column({ type: 'float', nullable: true })
  confidence: number | null;

  @Column({ type: 'varchar', length: 48 })
  action: LifeGraphAuditAction;

  @Column({ type: 'text', default: '' })
  reason: string;

  @Column({ type: 'int', nullable: true })
  taskId: number | null;

  @Column({ type: 'varchar', length: 96, nullable: true })
  messageId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  @Index()
  createdAt: Date;
}
