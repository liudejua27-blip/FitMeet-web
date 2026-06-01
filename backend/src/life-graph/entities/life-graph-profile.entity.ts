import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('life_graph_profiles')
export class LifeGraphProfile {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column()
  userId: number;

  @Column({ type: 'int', default: 0 })
  completenessScore: number;

  @Column({ type: 'text', default: '' })
  currentSocialGoal: string;

  @Column({ type: 'text', default: '' })
  aiSummary: string;

  @Column({ default: 'zh-CN' })
  preferredLanguage: string;

  @Column({ default: '' })
  country: string;

  @Column({ default: '' })
  region: string;

  @Column({ default: '' })
  city: string;

  @Column({ default: 'Asia/Shanghai' })
  timezone: string;

  @Column({ type: 'timestamptz', nullable: true })
  lastUpdatedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
