import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ContactPermissionStatus =
  | 'none'
  | 'opener_available'
  | 'awaiting_reply'
  | 'open'
  | 'closed';

@Entity('contact_permissions')
@Index(['userLowId', 'userHighId'], { unique: true })
@Index(['conversationId'])
export class ContactPermission {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userLowId: number;

  @Column()
  userHighId: number;

  @Column({ type: 'varchar', length: 32, default: 'none' })
  status: ContactPermissionStatus;

  @Column({ type: 'varchar', length: 120, nullable: true })
  conversationId: string | null;

  @Column({ type: 'int', nullable: true })
  openerSenderId: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  openerContextType: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  openerContextId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  openerSentAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  openedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
