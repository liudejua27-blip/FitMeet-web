import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('invite_codes')
@Index(['code'], { unique: true })
@Index(['active', 'expiresAt'])
@Index(['batchName'])
export class InviteCode {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 64 })
  code: string;

  @Column({ type: 'varchar', length: 120, default: '' })
  batchName: string;

  @Column({ type: 'varchar', length: 80, default: '' })
  source: string;

  @Column({ type: 'varchar', length: 80, default: '' })
  city: string;

  @Column({ type: 'varchar', length: 120, default: '' })
  scenario: string;

  @Column({ type: 'int', default: 1 })
  maxUses: number;

  @Column({ type: 'int', default: 0 })
  usedCount: number;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
