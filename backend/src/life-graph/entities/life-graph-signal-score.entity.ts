import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LifeGraphSignalKey } from '../life-graph.enums';

@Entity('life_graph_signal_scores')
@Index('idx_life_graph_signal_scores_user_key', ['userId', 'signalKey'], {
  unique: true,
})
@Index('idx_life_graph_signal_scores_user_updated', ['userId', 'updatedAt'])
export class LifeGraphSignalScore {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  userId: number;

  @Column({ type: 'varchar', length: 80 })
  signalKey: LifeGraphSignalKey;

  @Column({ type: 'float', default: 50 })
  score: number;

  @Column({ type: 'float', default: 0.5 })
  confidence: number;

  @Column({ type: 'varchar', length: 80, default: 'rules_v1' })
  source: string;

  @Column({ type: 'text', default: '' })
  explanation: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  evidence: Record<string, unknown>;

  @Column({ default: true })
  enabledForMatching: boolean;

  @Column({ type: 'int', default: 0 })
  correctionCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastCalculatedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
