import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  OneToOne,
} from 'typeorm';
import { User } from '../users/user.entity';

@Entity('coaches')
export class Coach {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  specialty: string;

  @Column()
  experience: string;

  @Column('simple-array', { default: '' })
  tags: string[];

  @Column()
  specialtyCode: string;

  @Column({ type: 'decimal', precision: 3, scale: 1, default: 0 })
  rating: number;

  @Column({ default: 0 })
  reviewCount: number;

  @Column({ default: 0 })
  students: number;

  @Column({ default: 0 })
  sessions: number;

  @Column({ default: 0 })
  price: number;

  @Column({ default: '/ 节' })
  unit: string;

  @Column({ default: false })
  cert: boolean;

  @Column({ type: 'text', default: '' })
  desc: string;

  @Column({ default: '' })
  cover: string;

  @Column({ default: '' })
  coverBg: string;

  @Column('simple-array', { default: '' })
  works: string[];

  @Column('simple-array', { default: '' })
  coachCerts: string[];

  @Column({ default: 0 })
  income: number;

  @OneToOne(() => User, { eager: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ unique: true })
  userId: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
