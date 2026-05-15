import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ActivityType {
  Running = 'running',
  Fitness = 'fitness',
  DogWalking = 'dog_walking',
  CoffeeChat = 'coffee_chat',
  CityWalk = 'city_walk',
  Custom = 'custom',
}

export enum ActivitySafetyLevel {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
}

export enum ActivityProofPolicy {
  /** Mutual confirmation alone is enough. */
  MutualConfirm = 'mutual_confirm',
  /** Mutual confirmation OR a scene/checkin proof. */
  MutualOrProof = 'mutual_or_proof',
  /** Both mutual confirmation AND at least one proof. */
  MutualAndProof = 'mutual_and_proof',
}

@Entity('activity_templates')
export class ActivityTemplate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: ActivityType, unique: true })
  type: ActivityType;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ type: 'int', default: 30 })
  defaultDurationMinutes: number;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  defaultIcebreakers: string[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  proofOptions: string[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  safetyTips: string[];

  @Column({
    type: 'enum',
    enum: ActivitySafetyLevel,
    default: ActivitySafetyLevel.Low,
  })
  safetyLevel: ActivitySafetyLevel;

  @Column({
    type: 'enum',
    enum: ActivityProofPolicy,
    default: ActivityProofPolicy.MutualOrProof,
  })
  defaultProofPolicy: ActivityProofPolicy;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
