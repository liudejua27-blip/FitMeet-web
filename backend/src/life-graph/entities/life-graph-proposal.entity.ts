import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { LifeGraphProposalStatus } from '../life-graph.enums';

@Entity('life_graph_proposals')
export class LifeGraphProposal {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  userId: number;

  @Column({ type: 'int', nullable: true })
  taskId: number | null;

  @Column({ type: 'varchar', length: 96, nullable: true })
  messageId: string | null;

  @Column({ type: 'jsonb', default: [] })
  proposedFields: unknown[];

  @Column({ type: 'varchar', length: 48, default: LifeGraphProposalStatus.Proposed })
  status: LifeGraphProposalStatus;

  @Column({ type: 'text', default: '' })
  aiSummary: string;

  @Column({ type: 'jsonb', default: [] })
  missingFields: unknown[];

  @Column({ default: true })
  confirmationRequired: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  confirmedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  rejectedAt: Date | null;
}
