import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

@Entity('posts')
export class Post {
  @PrimaryGeneratedColumn()
  id!: number;

  /** 'meet' | 'log' */
  @Column()
  type!: string;

  /** sport code: gym, run, yoga, outdoor, swim, martial, ball */
  @Column()
  sport!: string;

  @Column({ nullable: true })
  title!: string;

  @Column({ default: '' })
  emoji!: string;

  @Column({ type: 'text' })
  text!: string;

  @Column('simple-array', { default: '' })
  tags!: string[];

  @Column({ type: 'jsonb', default: [] })
  images!: Array<{ url: string; width: number; height: number }>;

  @Column({ nullable: true })
  videoUrl!: string;

  @Column({ nullable: true })
  level!: string;

  /** e.g. '2/4' or null */
  @Column({ nullable: true })
  slots!: string;

  @Column({ default: '' })
  dist!: string;

  @Column({ default: 0 })
  likesCount!: number;

  @Column({ default: 0 })
  commentsCount!: number;

  @Column({ default: 0 })
  viewCount!: number;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column()
  userId!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
