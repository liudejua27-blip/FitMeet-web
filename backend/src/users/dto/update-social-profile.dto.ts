import {
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * PUT /users/me/social-profile —— upsert 当前用户的社交画像。
 *
 * 全部字段可选；未提供的字段保持原值（首次写入时为默认空值）。
 */
export class UpdateSocialProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  gender?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  nickname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  ageRange?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  zodiac?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  mbti?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  traits?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  socialStyle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  communicationStyle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  nearbyArea?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fitnessGoals?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interestTags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lifestyleTags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  socialScenes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  wantToMeet?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredTraits?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  avoidTraits?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  relationshipGoals?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(20)
  openness?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  availableTimes?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  weekdayAvailability?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  weekendAvailability?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  socialPreference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  rejectRules?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  privacyBoundary?: string;

  @IsOptional()
  @IsBoolean()
  profileDiscoverable?: boolean;

  @IsOptional()
  @IsBoolean()
  agentCanRecommendMe?: boolean;

  @IsOptional()
  @IsBoolean()
  agentCanStartChatAfterApproval?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1200)
  aiSummary?: string;

  @IsOptional()
  @IsObject()
  aiProfileCard?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  matchSignals?: Record<string, unknown>;
}
