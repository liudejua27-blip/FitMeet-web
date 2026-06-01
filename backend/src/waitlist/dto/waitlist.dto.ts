import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { WaitlistDeviceType, WaitlistStatus, WaitlistUserRole } from '../waitlist.enums';

export class SubmitAppWaitlistDto {
  @IsEmail()
  @MaxLength(160)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsString()
  @MaxLength(80)
  country: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  region?: string;

  @IsString()
  @MaxLength(80)
  city: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  preferredLanguage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @IsEnum(WaitlistDeviceType)
  deviceType: WaitlistDeviceType;

  @IsArray()
  @IsString({ each: true })
  scenarios: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interests?: string[];

  @IsEnum(WaitlistUserRole)
  userRole: WaitlistUserRole;

  @IsBoolean()
  interviewWilling: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  inviteCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  source?: string;
}

export class ValidateInviteCodeDto {
  @IsString()
  @MaxLength(64)
  inviteCode: string;
}

export class CreateInviteCodeDto {
  @IsString()
  @MaxLength(64)
  code: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  batchName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  scenario?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  maxUses?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  expiresAt?: string;
}

export class AdminWaitlistQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsEnum(WaitlistDeviceType)
  deviceType?: WaitlistDeviceType;

  @IsOptional()
  @IsEnum(WaitlistStatus)
  status?: WaitlistStatus;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  qualityLevel?: string;
}

export class TrackWaitlistEventDto {
  @IsString()
  @MaxLength(80)
  eventName: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}
