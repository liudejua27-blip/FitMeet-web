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
import { ConnectionRequest } from './connection-request.entity';

export type FriendshipStatus = 'active' | 'removed';

@Entity('friendships')
@Index(['userLowId', 'userHighId'], { unique: true })
@Index(['status'])
export class Friendship {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userLowId' })
  userLow: User;

  @Column()
  userLowId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userHighId' })
  userHigh: User;

  @Column()
  userHighId: number;

  @Column({ type: 'varchar', length: 24, default: 'active' })
  status: FriendshipStatus;

  @ManyToOne(() => ConnectionRequest, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'sourceConnectionRequestId' })
  sourceConnectionRequest: ConnectionRequest | null;

  @Column({ type: 'int', nullable: true })
  sourceConnectionRequestId: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  removedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
