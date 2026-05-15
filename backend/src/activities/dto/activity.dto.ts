import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ActivityProofPolicy,
  ActivityType,
} from '../entities/activity-template.entity';
import {
  ActivityProofPrivacyMode,
  ActivityProofType,
} from '../entities/activity-proof.entity';

export class CreateActivityDto {
  @IsEnum(ActivityType)
  type: ActivityType;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  locationName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  /** ISO datetime string. */
  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  durationMinutes?: number;

  @IsOptional()
  @IsInt()
  socialRequestId?: number;

  @IsOptional()
  @IsInt()
  meetId?: number;

  @IsOptional()
  @IsInt()
  matchedCandidateId?: number;

  /** Optional override; otherwise template default is used. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  icebreakerTasks?: string[];

  @IsOptional()
  @IsBoolean()
  proofRequired?: boolean;

  @IsOptional()
  @IsEnum(ActivityProofPolicy)
  proofPolicy?: ActivityProofPolicy;

  /** For invite-paired activities (matched 1:1). */
  @IsOptional()
  @IsInt()
  invitedUserId?: number;
}

export class SubmitActivityProofDto {
  @IsEnum(ActivityProofType)
  proofType: ActivityProofType;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  photoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  locationApprox?: string;

  @IsOptional()
  @IsEnum(ActivityProofPrivacyMode)
  privacyMode?: ActivityProofPrivacyMode;
}

export class CheckinActivityDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  locationApprox?: string;
}

export class ReviewActivityDto {
  @IsInt()
  @Min(1)
  rating: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

export class RespondActivityProofDto {
  @IsBoolean()
  accept: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
