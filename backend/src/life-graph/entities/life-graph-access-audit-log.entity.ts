import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('life_graph_access_audit_logs')
@Index('idx_life_graph_access_audit_user_created', ['userId', 'createdAt'])
@Index('idx_life_graph_access_audit_actor_created', [
  'actorUserId',
  'createdAt',
])
@Index('idx_life_graph_access_audit_action_created', ['action', 'createdAt'])
export class LifeGraphAccessAuditLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ type: 'int' })
  userId!: number;

  @Column({ type: 'int', nullable: true })
  actorUserId!: number | null;

  @Column({ type: 'varchar', length: 80 })
  action!: string;

  @Column({ type: 'varchar', length: 120, default: '' })
  purpose!: string;

  @Column({ type: 'varchar', length: 180, default: '' })
  route!: string;

  @Column({ type: 'varchar', length: 40, default: 'allowed' })
  decision!: 'allowed' | 'denied' | 'system';

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  dataTiers!: string[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  fieldKeys!: string[];

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
