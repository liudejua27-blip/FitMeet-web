import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  SocialRequestSafety,
  SocialRequestType,
} from '../../social-requests/social-request.entity';

export class NearbySearchDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

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
  @IsEnum(SocialRequestType)
  type?: SocialRequestType;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  activityType?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interestTags?: string[];

  @IsOptional()
  @IsISO8601()
  timeStart?: string;

  @IsOptional()
  @IsISO8601()
  timeEnd?: string;

  @IsOptional()
  @IsEnum(SocialRequestSafety)
  safetyRequirement?: SocialRequestSafety;

  @IsOptional()
  @IsBoolean()
  agentAllowedRequired?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class RunMatchDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  limit?: number;
}
