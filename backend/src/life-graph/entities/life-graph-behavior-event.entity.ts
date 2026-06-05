import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { LifeGraphBehaviorEventType } from '../life-graph.enums';

@Entity('life_graph_events')
@Index('idx_life_graph_events_user_type_created', [
  'userId',
  'eventType',
  'createdAt',
])
@Index('idx_life_graph_events_user_created', ['userId', 'createdAt'])
export class LifeGraphBehaviorEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  userId: number;

  @Column({ type: 'varchar', length: 64 })
  eventType: LifeGraphBehaviorEventType;

  @Column({ type: 'varchar', length: 80, nullable: true })
  source: string | null;

  @Column({ type: 'int', nullable: true })
  taskId: number | null;

  @Column({ type: 'int', nullable: true })
  activityId: number | null;

  @Column({ type: 'int', nullable: true })
  candidateUserId: number | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, unknown>;

  @Column({ type: 'text', default: '' })
  naturalSummary: string;

  @Column({ type: 'float', default: 1 })
  weight: number;

  @CreateDateColumn({ type: 'timestamptz' })
  @Index()
  createdAt: Date;
}
