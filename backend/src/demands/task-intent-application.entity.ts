import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { PublicTaskIntent } from './public-task-intent.entity';

export type TaskIntentApplicationStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'cancelled';

@Entity('task_intent_applications')
@Index(['taskIntentId', 'applicantUserId', 'status'])
@Index(['ownerUserId', 'status'])
@Index(['applicantUserId', 'status'])
export class TaskIntentApplication {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => PublicTaskIntent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'taskIntentId' })
  taskIntent: PublicTaskIntent;

  @Column({ type: 'varchar', length: 80 })
  taskIntentId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerUserId' })
  owner: User;

  @Column()
  ownerUserId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'applicantUserId' })
  applicant: User;

  @Column()
  applicantUserId: number;

  @Column({ type: 'varchar', length: 24, default: 'pending' })
  status: TaskIntentApplicationStatus;

  @Column({ type: 'text', default: '' })
  message: string;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
