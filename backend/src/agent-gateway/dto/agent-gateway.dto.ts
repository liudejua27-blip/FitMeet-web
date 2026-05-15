import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { RelationshipGoal } from '../entities/user-preference.entity';

export class SearchMatchDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  query?: string;

  @IsOptional()
  @IsEnum(RelationshipGoal)
  relationshipGoal?: RelationshipGoal;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsInt()
  @Min(18)
  @Max(80)
  ageMin?: number;

  @IsOptional()
  @IsInt()
  @Min(18)
  @Max(80)
  ageMax?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}

export class CreateSocialRequestDto {
  @IsString()
  @MaxLength(80)
  requestType: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsString()
  @MaxLength(2000)
  description: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  loc?: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  radiusKm?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  timePreference?: string;

  @IsOptional()
  @IsString()
  visibility?: string;

  @IsOptional()
  @IsBoolean()
  verifiedOnly?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interests?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}

export class SearchNearbyPeopleDto extends CreateSocialRequestDto {}

export class ConfirmSocialRequestCandidateDto {
  @IsInt()
  candidateUserId: number;

  @IsEnum(['approve', 'reject'])
  decision: 'approve' | 'reject';

  @IsOptional()
  @IsEnum(['none', 'send_intro', 'request_contact_exchange'])
  connectionAction?: 'none' | 'send_intro' | 'request_contact_exchange';

  @IsOptional()
  @IsBoolean()
  ownerConfirmed?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class DraftContentDto {
  @IsEnum(['post', 'message'])
  type: 'post' | 'message';

  /** Context for generation, e.g. recipient user ID or topic */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  context?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  tone?: string;

  /** Target audience user ID (for messages) */
  @IsOptional()
  @IsInt()
  recipientUserId?: number;
}

export class SendMessageDto {
  /** New canonical field. `recipientUserId` is kept for backwards compat. */
  @IsOptional()
  @IsInt()
  toUserId?: number;

  @IsOptional()
  @IsInt()
  recipientUserId?: number;

  /** New canonical field. `text` is kept for backwards compat. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  messageType?: string;

  @IsOptional()
  @IsInt()
  socialRequestId?: number;

  @IsOptional()
  @IsInt()
  activityId?: number;

  @IsOptional()
  metadata?: Record<string, unknown>;

  /** References the approval request that authorized this send */
  @IsOptional()
  @IsInt()
  approvalRequestId?: number;
}

export class ContactRequestDto {
  @IsInt()
  targetUserId: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class RespondApprovalDto {
  @IsInt()
  approvalRequestId: number;

  @IsEnum(['approved', 'rejected'])
  decision: 'approved' | 'rejected';
}

export class UpdatePreferencesDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  idealPartnerDescription?: string;

  @IsOptional()
  aestheticPreferences?: Record<string, unknown>;

  @IsOptional()
  personalityPreferences?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(RelationshipGoal)
  relationshipGoal?: RelationshipGoal;

  @IsOptional()
  privacyBoundaries?: Record<string, unknown>;

  @IsOptional()
  agentMessagingEnabled?: boolean;

  @IsOptional()
  acceptAgentMessages?: boolean;
}
