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

@Entity('meets')
export class Meet {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  /** sport code: gym, run, yoga, outdoor, swim, martial, ball */
  @Column()
  type: string;

  /** display string: '🏋️ 健身房' */
  @Column()
  sport: string;

  @Column()
  time: string;

  @Column()
  loc: string;

  @Column({ default: '' })
  address: string;

  @Column({ type: 'varchar', nullable: true })
  poiId: string | null;

  @Column({ type: 'double precision', nullable: true })
  lat: number | null;

  @Column({ type: 'double precision', nullable: true })
  lng: number | null;

  @Column({ default: '' })
  dist: string;

  @Column({ default: '免费' })
  price: string;

  @Column({ default: 0 })
  slots: number;

  @Column({ default: 4 })
  maxSlots: number;

  @Column({ default: '全部' })
  level: string;

  @Column({ type: 'text', default: '' })
  desc: string;

  @Column({ nullable: true })
  feeType: string;

  @Column({ nullable: true })
  groupType: string;

  @Column({ nullable: true })
  creatorType: string;

  @Column({ default: 'pending' })
  status:
    | 'pending'
    | 'active'
    | 'matched'
    | 'activity_created'
    | 'completed'
    | 'cancelled';

  @Column({ type: 'varchar', nullable: true })
  tripShareToken: string | null;

  @Column({ type: 'integer', nullable: true })
  activityId: number | null;

  @Column({ type: 'decimal', precision: 3, scale: 1, default: 0 })
  rating: number;

  @Column({ default: 0 })
  meetCount: number;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: number;

  @Column({ default: '' })
  city: string;

  @Column({ type: 'timestamp', nullable: true })
  startAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  autoCancelAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  cancelReason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
