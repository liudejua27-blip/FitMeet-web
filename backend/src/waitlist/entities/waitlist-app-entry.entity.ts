import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  WaitlistDeviceType,
  WaitlistQualityLevel,
  WaitlistStatus,
  WaitlistUserRole,
} from '../waitlist.enums';

@Entity('waitlist_app_entries')
@Index(['email'], { unique: true })
@Index(['phone'], {
  unique: true,
  where: '"phone" IS NOT NULL AND "phone" <> \'\'',
})
@Index(['status', 'createdAt'])
@Index(['qualityLevel', 'createdAt'])
@Index(['city', 'createdAt'])
export class WaitlistAppEntry {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 160 })
  email: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 80, default: '' })
  country: string;

  @Column({ type: 'varchar', length: 80, default: '' })
  region: string;

  @Column({ type: 'varchar', length: 80, default: '' })
  city: string;

  @Column({ type: 'varchar', length: 20, default: 'zh-CN' })
  preferredLanguage: string;

  @Column({ type: 'varchar', length: 80, default: 'Asia/Shanghai' })
  timezone: string;

  @Column({ type: 'varchar', length: 16 })
  deviceType: WaitlistDeviceType;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  scenarios: string[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  interests: string[];

  @Column({ type: 'varchar', length: 32 })
  userRole: WaitlistUserRole;

  @Column({ type: 'boolean', default: false })
  interviewWilling: boolean;

  @Column({ type: 'varchar', length: 64, nullable: true })
  inviteCode: string | null;

  @Column({ type: 'varchar', length: 80, default: 'app_page' })
  source: string;

  @Column({ type: 'int', default: 0 })
  qualityScore: number;

  @Column({ type: 'varchar', length: 16, default: WaitlistQualityLevel.Low })
  qualityLevel: WaitlistQualityLevel;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  qualityReasons: string[];

  @Column({ type: 'varchar', length: 24, default: WaitlistStatus.Pending })
  status: WaitlistStatus;

  @Column({ type: 'varchar', length: 96, default: '' })
  ipHash: string;

  @Column({ type: 'text', default: '' })
  userAgent: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
