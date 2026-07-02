import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ContactPermission } from './contact-permission.entity';

export type ContactPermissionGrantStatus = 'active' | 'revoked';
export type ContactPermissionGrantSource =
  | 'connection_request'
  | 'friendship'
  | 'public_intent_application'
  | 'task_intent_application'
  | 'agent_candidate'
  | 'meet'
  | 'block';

@Entity('contact_permission_grants')
@Index(['permissionId', 'status'])
@Index(['sourceType', 'sourceId', 'status'])
export class ContactPermissionGrant {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => ContactPermission, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'permissionId' })
  permission: ContactPermission;

  @Column()
  permissionId: number;

  @Column({ type: 'varchar', length: 64 })
  sourceType: ContactPermissionGrantSource;

  @Column({ type: 'varchar', length: 120 })
  sourceId: string;

  @Column({ type: 'varchar', length: 24, default: 'active' })
  status: ContactPermissionGrantStatus;

  @Column({ type: 'int', nullable: true })
  grantedByUserId: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
