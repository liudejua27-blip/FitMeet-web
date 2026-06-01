import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('waitlist_analytics_events')
@Index(['eventName', 'createdAt'])
@Index(['ipHash', 'createdAt'])
export class WaitlistAnalyticsEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 80 })
  eventName: string;

  @Column({ type: 'varchar', length: 96, default: '' })
  ipHash: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
