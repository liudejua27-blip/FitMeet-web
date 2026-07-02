import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  DemandHallTarget,
  DemandType,
  DemandVisibility,
} from './demand.entity';
import {
  DemandInvitationSourceType,
  DemandInvitationStatus,
} from './demand-invitation.entity';

export class DemandCardFieldDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  id?: string;

  @IsString()
  @MaxLength(40)
  title: string;

  @IsString()
  @MaxLength(180)
  value: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  systemName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  importance?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  privacy?: string;
}

export class DemandMatchingPolicyDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  radiusKm?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  hardFilters?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  softPreferences?: string[];
}

export class CreateDemandDto {
  @IsEnum(DemandType)
  type: DemandType;

  @IsString()
  @MaxLength(120)
  title: string;

  @IsString()
  @MaxLength(2000)
  summary: string;

  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => DemandCardFieldDto)
  fields: DemandCardFieldDto[];

  @IsEnum(DemandVisibility)
  visibility: DemandVisibility;

  @IsOptional()
  @IsEnum(DemandHallTarget)
  hallTarget?: DemandHallTarget;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sourceConversationId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DemandMatchingPolicyDto)
  matchingPolicy?: DemandMatchingPolicyDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  safetyFlags?: string[];
}

export class DemandVisibilityMutationDto {
  @IsOptional()
  @IsEnum(DemandVisibility)
  visibility?: DemandVisibility;

  @IsOptional()
  @IsEnum(DemandHallTarget)
  hallTarget?: DemandHallTarget;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  category?: string;
}

export class CancelDemandDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class DemandQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  status?: string;

  @IsOptional()
  @IsEnum(DemandVisibility)
  visibility?: DemandVisibility;
}

export class DemandCandidateQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}

export class CreateDemandInvitationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  inviteeUserId: number;

  @IsOptional()
  @IsEnum(DemandInvitationSourceType)
  sourceType?: DemandInvitationSourceType;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sourceId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  candidateRecordId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  publicIntentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  demandId?: string;

  @IsString()
  @MaxLength(120)
  title: string;

  @IsString()
  @MaxLength(500)
  message: string;

  @IsString()
  @MaxLength(80)
  activityType: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsString()
  @MaxLength(160)
  locationText: string;

  @IsString()
  @MaxLength(160)
  timeWindow: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  capacityMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  capacityMax?: number;
}

export class DemandInvitationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(12)
  role?: 'sent' | 'received';

  @IsOptional()
  @IsEnum(DemandInvitationStatus)
  status?: DemandInvitationStatus;
}

export class ResolveDemandInvitationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
