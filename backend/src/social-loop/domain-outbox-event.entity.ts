import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type DomainOutboxEventStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed';

@Entity('domain_outbox_events')
@Index(['dedupeKey'], { unique: true })
@Index(['status', 'availableAt'])
@Index(['status', 'leaseExpiresAt'])
export class DomainOutboxEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 120 })
  eventType: string;

  @Column({ type: 'varchar', length: 80 })
  aggregateType: string;

  @Column({ type: 'varchar', length: 120 })
  aggregateId: string;

  @Column({ type: 'varchar', length: 180 })
  dedupeKey: string;

  @Column({ type: 'jsonb', default: '{}' })
  payload: Record<string, unknown>;

  @Column({ type: 'varchar', length: 24, default: 'pending' })
  status: DomainOutboxEventStatus;

  @Column({ type: 'int', default: 0 })
  attemptCount: number;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  availableAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  leaseOwner: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  leaseExpiresAt: Date | null;

  @Column({ type: 'text', default: '' })
  lastError: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
