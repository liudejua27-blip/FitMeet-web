import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type LifeGraphSecurityRequestType = 'export' | 'delete';
export type LifeGraphSecurityRequestStatus =
  | 'pending_cooldown'
  | 'ready'
  | 'executed'
  | 'expired'
  | 'cancelled';

@Entity('life_graph_security_requests')
@Index('idx_life_graph_security_requests_user_type_created', [
  'requestedByUserId',
  'type',
  'createdAt',
])
@Index('idx_life_graph_security_requests_status_available', [
  'status',
  'availableAt',
])
export class LifeGraphSecurityRequest {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 20 })
  type!: LifeGraphSecurityRequestType;

  @Column({ type: 'varchar', length: 40, default: 'pending_cooldown' })
  status!: LifeGraphSecurityRequestStatus;

  @Column({ type: 'int' })
  requestedByUserId!: number;

  @Column({ type: 'varchar', length: 128 })
  confirmationCodeHash!: string;

  @Column({ type: 'timestamptz' })
  availableAt!: Date;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  confirmedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  executedAt!: Date | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  notificationEmail!: string | null;

  @Column({ type: 'varchar', length: 40, default: 'skipped' })
  notificationStatus!: 'sent' | 'skipped' | 'failed';

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
