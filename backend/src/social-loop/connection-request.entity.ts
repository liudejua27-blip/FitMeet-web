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

export type ConnectionRequestStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'cancelled';

@Entity('connection_requests')
@Index(['requesterId', 'targetUserId', 'status'])
@Index(['targetUserId', 'status'])
export class ConnectionRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requesterId' })
  requester: User;

  @Column()
  requesterId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'targetUserId' })
  target: User;

  @Column()
  targetUserId: number;

  @Column({ type: 'varchar', length: 24, default: 'pending' })
  status: ConnectionRequestStatus;

  @Column({ type: 'text', default: '' })
  message: string;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
