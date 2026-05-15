import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

export type ClubJoinPolicy = 'open' | 'approval';

@Entity('clubs')
export class Club {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ default: '' })
  city: string;

  @Column()
  sportType: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ default: '' })
  coverUrl: string;

  @Column({ default: 'open' })
  joinPolicy: ClubJoinPolicy;

  @Column({ type: 'text', default: '' })
  announcement: string;

  @Column({ default: 1 })
  memberCount: number;

  @Column({ default: 0 })
  meetCount: number;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'ownerId' })
  owner: User;

  @Column()
  ownerId: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
