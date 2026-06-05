import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { LifeGraphUpdateAuditStatus } from '../life-graph.enums';

@Entity('life_graph_update_audits')
@Index('idx_life_graph_update_audits_user_created', ['userId', 'createdAt'])
@Index('idx_life_graph_update_audits_user_status', ['userId', 'status'])
export class LifeGraphUpdateAudit {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  userId: number;

  @Column({ type: 'varchar', length: 80 })
  updateType: string;

  @Column({ type: 'varchar', length: 80, default: 'life_graph' })
  source: string;

  @Column({ type: 'varchar', length: 40 })
  status: LifeGraphUpdateAuditStatus;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  before: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  after: Record<string, unknown>;

  @Column({ type: 'text', default: '' })
  userFacingSummary: string;

  @Column({ default: true })
  reversible: boolean;

  @Column({ type: 'int', nullable: true })
  eventId: number | null;

  @Column({ type: 'int', nullable: true })
  correctionId: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
