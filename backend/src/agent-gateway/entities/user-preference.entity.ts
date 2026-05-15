import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';

export enum RelationshipGoal {
  FitnessBuddy = 'fitness_buddy',
  Casual = 'casual',
  Dating = 'dating',
  Serious = 'serious',
}

export enum ChatStyle {
  Playful = 'playful',
  Direct = 'direct',
  Intellectual = 'intellectual',
  Warm = 'warm',
}

@Entity('user_preferences')
export class UserPreference {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: number;

  /** Free-text description of ideal partner */
  @Column({ type: 'text', default: '' })
  idealPartnerDescription: string;

  /** {"bodyType":["athletic"], "ageRange":[25,35], "locationRadius":50} */
  @Column({ type: 'jsonb', default: '{}' })
  aestheticPreferences: Record<string, unknown>;

  /** {"traits":["optimistic","adventurous"], "dealbreakers":["smoking"]} */
  @Column({ type: 'jsonb', default: '{}' })
  personalityPreferences: Record<string, unknown>;

  @Column({
    type: 'enum',
    enum: RelationshipGoal,
    default: RelationshipGoal.FitnessBuddy,
  })
  relationshipGoal: RelationshipGoal;

  @Column({ type: 'enum', enum: ChatStyle, default: ChatStyle.Warm })
  chatStyle: ChatStyle;

  /**
   * Privacy / hard limits passed to the agent.
   * e.g. {"noPhotoSharing": true, "noPolitics": true, "maxMessageLength": 200}
   */
  @Column({ type: 'jsonb', default: '{}' })
  privacyBoundaries: Record<string, unknown>;

  /** User allows agents (own or counterpart) to send messages on their behalf */
  @Column({ default: false })
  agentMessagingEnabled: boolean;

  /** User allows incoming messages marked as Agent-sent */
  @Column({ default: true })
  acceptAgentMessages: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
