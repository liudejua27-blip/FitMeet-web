import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn, Unique,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Meet } from './meet.entity';

@Entity('meet_participants')
@Unique(['userId', 'meetId'])
export class MeetParticipant {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: number;

  @ManyToOne(() => Meet, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'meetId' })
  meet: Meet;

  @Column()
  meetId: number;

  @Column({ default: 'pending' })
  status: 'pending' | 'active' | 'completed' | 'cancelled';

  @CreateDateColumn()
  createdAt: Date;
}
