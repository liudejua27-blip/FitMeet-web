import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Club } from './club.entity';

export type ClubMemberRole = 'owner' | 'manager' | 'member';
export type ClubMemberStatus = 'pending' | 'active' | 'rejected';

@Entity('club_members')
@Unique(['clubId', 'userId'])
export class ClubMember {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Club, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clubId' })
  club: Club;

  @Column()
  clubId: number;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: number;

  @Column({ default: 'member' })
  role: ClubMemberRole;

  @Column({ default: 'pending' })
  status: ClubMemberStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
