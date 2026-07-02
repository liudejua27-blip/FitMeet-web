import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

export enum DemandType {
  Friends = 'friends',
  Dating = 'dating',
  Workout = 'workout',
  Buddy = 'buddy',
  Travel = 'travel',
  Service = 'service',
  Housing = 'housing',
  Activity = 'activity',
  Help = 'help',
  Other = 'other',
}

export enum DemandVisibility {
  Public = 'public',
  Hidden = 'hidden',
}

export enum DemandHallTarget {
  SocialHall = 'socialHall',
  TaskHall = 'taskHall',
  HiddenMatching = 'hiddenMatching',
  None = 'none',
}

export enum DemandStatus {
  Draft = 'draft',
  Confirmable = 'confirmable',
  Published = 'published',
  Hidden = 'hidden',
  Matching = 'matching',
  CandidatePool = 'candidatePool',
  HasCandidates = 'hasCandidates',
  Invited = 'invited',
  MatchedCommunicating = 'matchedCommunicating',
  Closed = 'closed',
  Canceled = 'canceled',
}

export type DemandCardField = {
  id?: string;
  title: string;
  value: string;
  systemName?: string;
  importance?: string;
  privacy?: string;
};

export type DemandMatchingPolicy = {
  city?: string;
  radiusKm?: number;
  hardFilters?: string[];
  softPreferences?: string[];
};

@Entity('demands')
@Index(['ownerUserId', 'status'])
@Index(['ownerUserId', 'visibility'])
@Index(['hallTarget', 'status'])
@Index(['publicIntentId'])
@Index(['taskIntentId'])
export class Demand {
  @PrimaryColumn({ type: 'varchar', length: 80 })
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerUserId' })
  owner: User;

  @Column({ type: 'int' })
  ownerUserId: number;

  @Column({ type: 'varchar', length: 32 })
  type: DemandType;

  @Column({ type: 'varchar', length: 120 })
  title: string;

  @Column({ type: 'text', default: '' })
  summary: string;

  @Column({ type: 'jsonb', default: '[]' })
  fields: DemandCardField[];

  @Column({ type: 'varchar', length: 16 })
  visibility: DemandVisibility;

  @Column({ type: 'varchar', length: 24, default: DemandHallTarget.SocialHall })
  hallTarget: DemandHallTarget;

  @Column({ type: 'varchar', length: 40, default: '' })
  category: string;

  @Column({ type: 'varchar', length: 32 })
  status: DemandStatus;

  @Column({ type: 'varchar', length: 120, nullable: true })
  sourceConversationId: string | null;

  @Column({ type: 'jsonb', default: '{}' })
  matchingPolicy: DemandMatchingPolicy;

  @Column({ type: 'jsonb', default: '[]' })
  safetyFlags: string[];

  @Column({ type: 'varchar', length: 80, nullable: true })
  publicIntentId: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  taskIntentId: string | null;

  @Column({ type: 'int', default: 0 })
  candidateCount: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
