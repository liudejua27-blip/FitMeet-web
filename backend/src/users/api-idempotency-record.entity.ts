import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ApiIdempotencyStatus = 'processing' | 'completed' | 'failed';

@Entity('api_idempotency_records')
export class ApiIdempotencyRecord {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  ownerUserId: number;

  @Column({ type: 'varchar', length: 80 })
  scope: string;

  @Column({ type: 'varchar', length: 180 })
  idempotencyKey: string;

  @Column({ type: 'varchar', length: 80 })
  requestHash: string;

  @Column({ type: 'varchar', length: 32, default: 'processing' })
  status: ApiIdempotencyStatus;

  @Column({ type: 'int', nullable: true })
  responseStatus: number | null;

  @Column({ type: 'jsonb', nullable: true })
  responseBody: Record<string, unknown> | null;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
