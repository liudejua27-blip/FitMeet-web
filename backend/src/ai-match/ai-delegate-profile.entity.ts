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

@Entity('ai_delegate_profiles')
@Unique(['userId'])
export class AiDelegateProfile {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: number;

  @Column({ default: false })
  enabled: boolean;

  @Column({ default: false })
  privacyConsent: boolean;

  @Column({ default: false })
  autoChatEnabled: boolean;

  @Column({ default: 3 })
  dailyAutoChatLimit: number;

  @Column({ default: '' })
  preferredName: string;

  @Column({ default: '' })
  city: string;

  @Column('simple-array', { default: '' })
  favoriteSports: string[];

  @Column({ type: 'text', default: '' })
  interests: string;

  @Column({ type: 'text', default: '' })
  workExperience: string;

  @Column({ type: 'text', default: '' })
  idealPartner: string;

  @Column({ type: 'text', default: '' })
  trainingGoals: string;

  @Column({ type: 'text', default: '' })
  boundaries: string;

  @Column({ default: '' })
  availability: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
