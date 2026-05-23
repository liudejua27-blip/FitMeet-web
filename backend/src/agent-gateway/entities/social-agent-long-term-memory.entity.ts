import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';

/**
 * Structured long-term memory for the Social Agent (v1, no Vector DB).
 *
 * One row per `userId`. Populated by summarising completed `agent_tasks`:
 * - Stable preferences (interests / social style / preferred traits)
 * - Boundaries (noNightMeet / publicPlaceOnly / noAutoMessage / excluded genders)
 * - Activity preferences (favourite cities / activity types / time slots)
 * - Match signals (successful + failed match samples)
 *
 * Used as a *weak signal* during planning / matching — never as a hard filter.
 */
@Entity('social_agent_long_term_memory')
export class SocialAgentLongTermMemory {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Index({ unique: true })
  @Column()
  userId: number;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  preferences: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  boundaries: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  activityPreferences: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  matchSignals: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  taskSummaries: Array<Record<string, unknown>>;

  @Column({ type: 'int', default: 0 })
  taskCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
