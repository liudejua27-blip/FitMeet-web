import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type MediaModerationStatus = 'pending' | 'approved' | 'rejected';
export type MediaPurpose = 'profile_photo' | 'post_media';

@Entity('media_assets')
export class MediaAsset {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  ownerUserId: number;

  @Column({ type: 'varchar', length: 40, default: 'profile_photo' })
  purpose: MediaPurpose;

  @Column({ type: 'text' })
  storageKey: string;

  @Column({ type: 'text' })
  url: string;

  @Column({ type: 'varchar', length: 120, default: 'image/webp' })
  mimeType: string;

  @Column({ type: 'int', default: 0 })
  width: number;

  @Column({ type: 'int', default: 0 })
  height: number;

  @Column({ type: 'varchar', length: 80, default: '' })
  sha256: string;

  @Column({ type: 'varchar', length: 32, default: 'pending' })
  moderationStatus: MediaModerationStatus;

  @Column({ type: 'text', default: '' })
  moderationReason: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
