import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, OneToMany,
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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
