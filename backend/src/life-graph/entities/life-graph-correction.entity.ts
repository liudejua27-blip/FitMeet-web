import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import {
  LifeGraphCorrectionType,
  LifeGraphFieldCategory,
  LifeGraphSignalKey,
} from '../life-graph.enums';

@Entity('life_graph_corrections')
@Index('idx_life_graph_corrections_user_created', ['userId', 'createdAt'])
export class LifeGraphCorrection {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  userId: number;

  @Column({ type: 'varchar', length: 48 })
  correctionType: LifeGraphCorrectionType;

  @Column({ type: 'varchar', length: 80, nullable: true })
  signalKey: LifeGraphSignalKey | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  category: LifeGraphFieldCategory | null;

  @Column({ type: 'varchar', length: 96, nullable: true })
  fieldKey: string | null;

  @Column({ type: 'text', default: '' })
  note: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  previousValue: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  correctedValue: Record<string, unknown>;

  @Column({ default: true })
  applied: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
