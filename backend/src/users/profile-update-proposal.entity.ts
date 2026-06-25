import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ProfileUpdateProposalStatus =
  | 'pending'
  | 'applied'
  | 'rejected'
  | 'expired';

@Entity('profile_update_proposals')
@Index(['userId', 'status', 'expiresAt'])
export class ProfileUpdateProposal {
  @PrimaryGeneratedColumn()
  proposalId: number;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'int' })
  baseProfileVersion: number;

  @Column({ type: 'jsonb', default: '{}' })
  proposedFields: Record<string, unknown>;

  @Column({ type: 'jsonb', default: '{}' })
  draft: Record<string, unknown>;

  @Column({ type: 'varchar', length: 40, default: 'pending' })
  status: ProfileUpdateProposalStatus;

  @Column({ type: 'varchar', length: 80, default: 'agent_profile_completion' })
  source: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  appliedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  rejectedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
