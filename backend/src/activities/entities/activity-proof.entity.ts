import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { SocialActivity } from './activity.entity';

export enum ActivityProofType {
  Checkin = 'checkin',
  MutualConfirm = 'mutual_confirm',
  ScenePhoto = 'scene_photo',
  /** Optional selfie. Never required by the platform. */
  SelfieOptional = 'selfie_optional',
  QrCode = 'qr_code',
  MerchantConfirm = 'merchant_confirm',
}

export enum ActivityProofStatus {
  Pending = 'pending',
  Accepted = 'accepted',
  Rejected = 'rejected',
}

export enum ActivityProofPrivacyMode {
  /** Photo deliberately avoids faces. */
  HiddenFace = 'hidden_face',
  /** Pure scene photo, no people. */
  SceneOnly = 'scene_only',
  /** Stored privately, only visible to the activity participants. */
  Private = 'private',
}

@Entity('activity_proofs')
@Index(['activityId', 'userId'])
export class ActivityProof {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => SocialActivity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'activityId' })
  activity: SocialActivity;

  @Column()
  activityId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: number;

  @Column({ type: 'enum', enum: ActivityProofType })
  proofType: ActivityProofType;

  @Column({ type: 'varchar', length: 500, nullable: true })
  photoUrl: string | null;

  @Column({ type: 'varchar', length: 500, default: '' })
  note: string;

  /** Approximate location like "朝阳公园 西门附近" — NOT exact coords. */
  @Column({ type: 'varchar', length: 200, default: '' })
  locationApprox: string;

  @Column({
    type: 'enum',
    enum: ActivityProofStatus,
    default: ActivityProofStatus.Pending,
  })
  status: ActivityProofStatus;

  @Column({
    type: 'enum',
    enum: ActivityProofPrivacyMode,
    default: ActivityProofPrivacyMode.SceneOnly,
  })
  privacyMode: ActivityProofPrivacyMode;

  /** Participant (other than the author) who accepted/rejected this proof. */
  @Column({ type: 'int', nullable: true })
  reviewedById: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  /** Optional reason supplied on reject (or short note on accept). */
  @Column({ type: 'varchar', length: 500, default: '' })
  reviewReason: string;

  @CreateDateColumn()
  createdAt: Date;
}
