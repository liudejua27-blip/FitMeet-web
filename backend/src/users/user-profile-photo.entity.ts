import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type UserProfilePhotoStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'deleted';

@Entity('user_profile_photos')
export class UserProfilePhoto {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column()
  assetId: number;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ default: false })
  isCover: boolean;

  @Column({ type: 'varchar', length: 32, default: 'pending' })
  status: UserProfilePhotoStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
