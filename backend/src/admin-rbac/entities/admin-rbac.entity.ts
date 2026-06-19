import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('admin_roles')
@Index('uniq_admin_roles_key', ['key'], { unique: true })
export class AdminRole {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 80 })
  key!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'text', default: '' })
  description!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('admin_permissions')
@Index('uniq_admin_permissions_key', ['key'], { unique: true })
export class AdminPermission {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 120 })
  key!: string;

  @Column({ type: 'text', default: '' })
  description!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('admin_user_roles')
@Index('uniq_admin_user_roles_user_role', ['userId', 'roleKey'], {
  unique: true,
})
@Index('idx_admin_user_roles_user', ['userId'])
export class AdminUserRole {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  userId!: number;

  @Column({ type: 'varchar', length: 80 })
  roleKey!: string;

  @Column({ type: 'int', nullable: true })
  grantedByUserId!: number | null;

  @CreateDateColumn()
  createdAt!: Date;
}

@Entity('admin_audit_logs')
@Index('idx_admin_audit_logs_user_created', ['userId', 'createdAt'])
@Index('idx_admin_audit_logs_permission_created', ['permission', 'createdAt'])
export class AdminAuditLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int', nullable: true })
  userId!: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  permission!: string | null;

  @Column({ type: 'varchar', length: 240, default: '' })
  route!: string;

  @Column({ type: 'varchar', length: 40 })
  decision!: 'allowed' | 'denied' | 'system';

  @Column({ type: 'text', default: '' })
  reason!: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  @CreateDateColumn()
  createdAt!: Date;
}
