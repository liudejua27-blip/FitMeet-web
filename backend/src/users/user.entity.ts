import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column({ unique: true, nullable: true })
  phone: string;

  @Column({ nullable: true })
  wechatOpenId: string;

  @Column()
  name: string;

  @Column({ default: '' })
  avatar: string;

  @Column({ default: '#C8FF00' })
  color: string;

  @Column({ default: '' })
  gender: string;

  @Column({ default: 0 })
  age: number;

  @Column({ default: '' })
  city: string;

  /** Last reported geo coordinates (decimal degrees). Null until the user
   *  opts into location sharing via PUT /api/users/me/location. */
  @Column({ type: 'double precision', nullable: true })
  lat: number | null;

  @Column({ type: 'double precision', nullable: true })
  lng: number | null;

  /** When `lat`/`lng` were last refreshed; used to age-out stale fixes. */
  @Column({ type: 'timestamptz', nullable: true })
  locationUpdatedAt: Date | null;

  /** User opts in to being surfaced as a "nearby match" candidate. When
   *  false, AgentGateway/Match nearby searches must skip this user even
   *  if they appear in the radius. */
  @Column({ default: true })
  acceptNearbyMatch: boolean;

  @Column({ default: '' })
  gym: string;

  @Column({ type: 'text', default: '' })
  bio: string;

  @Column({ nullable: true })
  coverUrl: string;

  @Column({ default: false })
  singleCert: boolean;

  @Column({ default: false })
  verified: boolean;

  @Column('simple-array', { default: '' })
  interestTags: string[];

  @Column({ default: 0 })
  trainingDays: number;

  @Column({ default: 0 })
  trainingCount: number;

  @Column({ default: 0 })
  caloriesBurned: number;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  bestRecords: { name: string; value: string }[];

  @Column({ default: false })
  isCoach: boolean;

  /** Cumulative trust score: +1 per accepted proof, +2 per completed
   *  mutually-confirmed activity. Used by AgentGateway risk scoring. */
  @Column({ type: 'int', default: 0 })
  trustScore: number;

  /** Number of completed offline social activities (proof accepted by
   *  counterpart). Driver of "可信社交" badge on profile. */
  @Column({ type: 'int', default: 0 })
  socialTrustCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
