import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum PaymentIntentStatus {
  Pending = 'pending',
  Created = 'created',
  Completed = 'completed',
  Failed = 'failed',
}

@Entity('payment_intents')
@Index(['ownerUserId', 'createdAt'])
@Index(['agentConnectionId', 'createdAt'])
@Index(['status', 'createdAt'])
export class PaymentIntent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  ownerUserId: number;

  @Column({ type: 'int', nullable: true })
  agentConnectionId: number | null;

  @Column({ type: 'int', nullable: true })
  agentTaskId: number | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  stepId: string | null;

  @Column({ type: 'int', nullable: true })
  targetUserId: number | null;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount: string;

  @Column({ type: 'varchar', length: 8, default: 'CNY' })
  currency: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({
    type: 'enum',
    enum: PaymentIntentStatus,
    default: PaymentIntentStatus.Created,
  })
  status: PaymentIntentStatus;

  @Column({ type: 'varchar', length: 80, default: 'manual_intent' })
  provider: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  providerReference: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
