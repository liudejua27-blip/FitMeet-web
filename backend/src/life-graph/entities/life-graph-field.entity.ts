import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  LifeGraphFieldCategory,
  LifeGraphFieldSource,
  LifeGraphSignalType,
} from '../life-graph.enums';

@Entity('life_graph_fields')
@Index(['userId', 'category', 'fieldKey'], { unique: true })
@Index(['userId', 'category'])
@Index(['userId', 'fieldKey'])
export class LifeGraphField {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  userId: number;

  @Column({ type: 'varchar', length: 64 })
  category: LifeGraphFieldCategory;

  @Column({ type: 'varchar', length: 96 })
  fieldKey: string;

  @Column({ type: 'jsonb', default: {} })
  fieldValue: unknown;

  @Column({ type: 'varchar', length: 48 })
  source: LifeGraphFieldSource;

  @Column({ type: 'float', default: 1 })
  confidence: number;

  @Column({ default: false })
  confirmedByUser: boolean;

  @Column({ default: true })
  editable: boolean;

  @Column({ default: false })
  revoked: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastInferredAt: Date | null;

  @Column({
    type: 'varchar',
    length: 40,
    default: LifeGraphSignalType.Core,
  })
  signalType: LifeGraphSignalType;

  @Column({ default: true })
  visibleInRecommendationReason: boolean;

  @Column({ default: false })
  userCanDisableForMatching: boolean;

  @Column({ default: true })
  enabledForMatching: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
