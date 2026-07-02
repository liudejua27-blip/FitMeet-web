import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Demand } from './demand.entity';

export enum DemandCandidateStatus {
  Recommended = 'recommended',
  Viewed = 'viewed',
  Invited = 'invited',
  Dismissed = 'dismissed',
  Expired = 'expired',
}

@Entity('demand_candidates')
@Index(['demandId', 'candidateUserId'], { unique: true })
@Index(['ownerUserId', 'status'])
@Index(['demandId', 'status'])
export class DemandCandidate {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Demand, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'demandId' })
  demand: Demand;

  @Column({ type: 'varchar', length: 80 })
  demandId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerUserId' })
  owner: User;

  @Column({ type: 'int' })
  ownerUserId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'candidateUserId' })
  candidateUser: User;

  @Column({ type: 'int' })
  candidateUserId: number;

  @Column({ type: 'varchar', length: 40, default: 'candidate_search_index' })
  source: string;

  @Column({ type: 'varchar', length: 120, default: '' })
  sourceId: string;

  @Column({ type: 'int', default: 0 })
  score: number;

  @Column({ type: 'jsonb', default: '[]' })
  reasons: string[];

  @Column({ type: 'jsonb', default: '[]' })
  sharedPoints: string[];

  @Column({ type: 'varchar', length: 80, default: '' })
  distanceText: string;

  @Column({ type: 'varchar', length: 120, default: '' })
  timeFitText: string;

  @Column({ type: 'varchar', length: 240, default: '' })
  safetyNote: string;

  @Column({
    type: 'enum',
    enum: DemandCandidateStatus,
    default: DemandCandidateStatus.Recommended,
  })
  status: DemandCandidateStatus;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
