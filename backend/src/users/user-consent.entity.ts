import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type UserConsentType =
  | 'terms'
  | 'privacy'
  | 'adult_attestation'
  | 'matching'
  | 'profile_discovery';

@Entity('user_consents')
export class UserConsent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column({ type: 'varchar', length: 60 })
  consentType: UserConsentType;

  @Column({ type: 'varchar', length: 40 })
  version: string;

  @Column({ type: 'timestamptz' })
  acceptedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
