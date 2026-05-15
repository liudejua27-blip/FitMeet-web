import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { AgentConnection } from './agent-connection.entity';

export enum ContactRequestStatus {
  Pending = 'pending',
  Accepted = 'accepted',
  Declined = 'declined',
  Expired = 'expired',
}

@Entity('contact_requests')
export class ContactRequest {
  @PrimaryGeneratedColumn()
  id: number;

  /** The user whose agent initiated the request */
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requesterId' })
  requester: User;

  @Column()
  requesterId: number;

  /** Target user who must explicitly consent */
  @Column()
  targetUserId: number;

  @ManyToOne(() => AgentConnection, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'agentConnectionId' })
  agentConnection: AgentConnection | null;

  @Column({ type: 'int', nullable: true })
  agentConnectionId: number | null;

  @Column({
    type: 'enum',
    enum: ContactRequestStatus,
    default: ContactRequestStatus.Pending,
  })
  status: ContactRequestStatus;

  /** Short note from the requester; moderated before delivery */
  @Column({ type: 'text', default: '' })
  note: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  respondedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
