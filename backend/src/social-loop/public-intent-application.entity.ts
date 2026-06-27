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
import { PublicSocialIntent } from '../agent-gateway/entities/public-social-intent.entity';
import { Meet } from '../meets/meet.entity';
import { User } from '../users/user.entity';

export type PublicIntentApplicationStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'cancelled';

@Entity('public_intent_applications')
@Index(['publicIntentId', 'applicantUserId', 'status'])
@Index(['ownerUserId', 'status'])
@Index(['applicantUserId', 'status'])
export class PublicIntentApplication {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => PublicSocialIntent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'publicIntentId' })
  publicIntent: PublicSocialIntent;

  @Column({ type: 'varchar', length: 80 })
  publicIntentId: string;

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
  status: PublicIntentApplicationStatus;

  @Column({ type: 'text', default: '' })
  message: string;

  @ManyToOne(() => Meet, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'meetId' })
  meet: Meet | null;

  @Column({ type: 'int', nullable: true })
  meetId: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
