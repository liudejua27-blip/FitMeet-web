import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  SocialRequestGenderPreference,
  SocialRequestSafety,
  SocialRequestSource,
  SocialRequestType,
  SocialRequestVisibility,
  UserSocialRequestStatus,
} from '../social-request.entity';

export class CreateSocialRequestDto {
  @IsEnum(SocialRequestType)
  type!: SocialRequestType;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rawText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @IsLongitude()
  lng?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  radiusKm?: number;

  @IsOptional()
  @IsISO8601()
  timeStart?: string;

  @IsOptional()
  @IsISO8601()
  timeEnd?: string;

  @IsOptional()
  @IsEnum(SocialRequestGenderPreference)
  genderPreference?: SocialRequestGenderPreference;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  ageMin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  ageMax?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  interestTags?: string[];

  /** Backwards-compat alias for older clients that still send `tags`. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  activityType?: string;

  @IsOptional()
  @IsEnum(SocialRequestSafety)
  safetyRequirement?: SocialRequestSafety;

  @IsOptional()
  @IsBoolean()
  agentAllowed?: boolean;

  @IsOptional()
  @IsBoolean()
  requireUserConfirmation?: boolean;

  @IsOptional()
  @IsEnum(SocialRequestVisibility)
  visibility?: SocialRequestVisibility;

  @IsOptional()
  @IsEnum(UserSocialRequestStatus)
  status?: UserSocialRequestStatus;

  @IsOptional()
  @IsEnum(SocialRequestSource)
  source?: SocialRequestSource;

  @IsOptional()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
