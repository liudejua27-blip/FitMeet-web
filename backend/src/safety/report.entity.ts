import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('safety_reports')
export class SafetyReport {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  reporterId: number;

  @Column()
  targetType: 'user' | 'post' | 'meet' | 'comment';

  @Column()
  targetId: number;

  @Column()
  reason: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ default: 'pending' })
  status: 'pending' | 'reviewing' | 'resolved' | 'rejected';

  @Column({ type: 'text', default: '' })
  adminNote: string;

  @Column({ type: 'integer', nullable: true })
  handledById: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
