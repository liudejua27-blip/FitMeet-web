import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('verification_requests')
export class VerificationRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column()
  type: 'real_name' | 'coach';

  @Column({ default: '' })
  realName: string;

  @Column({ default: '' })
  idNumberMasked: string;

  @Column({ default: '' })
  certName: string;

  @Column({ default: '' })
  certImageUrl: string;

  @Column({ default: 'pending' })
  status: 'pending' | 'approved' | 'rejected';

  @Column({ type: 'text', default: '' })
  adminNote: string;

  @Column({ type: 'integer', nullable: true })
  handledById: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
