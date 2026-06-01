import {
  IsArray,
  IsBoolean,
  IsDefined,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  LifeGraphAuditAction,
  LifeGraphFieldCategory,
  LifeGraphFieldSource,
  LifeGraphProposalStatus,
  LifeGraphSignalType,
} from '../life-graph.enums';

export class LifeGraphProfileDto {
  id: number;
  userId: number;
  completenessScore: number;
  currentSocialGoal: string;
  aiSummary: string;
  preferredLanguage: string;
  country: string;
  region: string;
  city: string;
  timezone: string;
  lastUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export class LifeGraphFieldDto {
  id: number;
  userId: number;
  category: LifeGraphFieldCategory;
  fieldKey: string;
  fieldValue: unknown;
  source: LifeGraphFieldSource;
  confidence: number;
  confirmedByUser: boolean;
  editable: boolean;
  revoked: boolean;
  revokedAt: string | null;
  lastInferredAt: string | null;
  signalType: LifeGraphSignalType;
  visibleInRecommendationReason: boolean;
  userCanDisableForMatching: boolean;
  enabledForMatching: boolean;
  createdAt: string;
  updatedAt: string;
}

export class LifeGraphMissingFieldDto {
  category: LifeGraphFieldCategory;
  fieldKey: string;
  label: string;
  priority: 'high' | 'medium' | 'low';
}

export class LifeGraphCompletenessDto {
  completenessScore: number;
  modules: Record<LifeGraphFieldCategory, number>;
  missingFields: LifeGraphMissingFieldDto[];
}

export class LifeGraphMatchSignalsDto {
  identity: Record<string, unknown>;
  socialIntent: Record<string, unknown>;
  lifestyle: Record<string, unknown>;
  fitnessActivity: Record<string, unknown>;
  trustSafety: Record<string, unknown>;
  interactionMemory: Record<string, unknown>;
  privacyBoundary: Record<string, unknown>;
}

export class LifeGraphUnifiedMatchSignalsDto {
  identitySignals: Record<string, unknown>;
  socialIntentSignals: Record<string, unknown>;
  lifestyleSignals: Record<string, unknown>;
  fitnessSignals: Record<string, unknown>;
  behaviorSignals: LifeGraphDynamicSignalsDto;
  safetySignals: {
    realNameRequired: boolean;
    publicPlaceOnly: boolean;
    strictConfirmationRequired: boolean;
    blockedScenarios: string[];
    locationSharingAllowed: boolean;
    acceptsNightMeet: boolean | null;
  };
  confidence: {
    overall: number;
    byField: Record<string, number>;
  };
  missingCriticalFields: LifeGraphMissingFieldDto[];
}

export class LifeGraphDynamicSignalsDto {
  activityLevel: 'active' | 'quiet' | 'unknown';
  socialEnergy: 'sports' | 'social' | 'balanced' | 'unknown';
  completionTrend: 'reliable' | 'mixed' | 'fragile' | 'unknown';
  cancellationPattern: 'rare' | 'occasional' | 'frequent' | 'unknown';
  pressurePreference: 'low' | 'medium' | 'unknown';
  nightBoundary: 'avoids_late_private' | 'flexible' | 'unknown';
  locationPreference:
    | 'same_school_or_area'
    | 'same_city'
    | 'interest_first'
    | 'unknown';
  feedbackPattern: string[];
  scores: {
    rhythmConfidence: number;
    sportsAffinity: number;
    lowPressureFit: number;
    safetyBoundaryClarity: number;
    reliability: number;
  };
  summary: string;
  insights: string[];
}

export class LifeGraphAuditLogDto {
  id: number;
  userId: number;
  fieldKey: string;
  category: LifeGraphFieldCategory;
  oldValue: unknown;
  newValue: unknown;
  source: LifeGraphFieldSource;
  confidence: number | null;
  action: LifeGraphAuditAction;
  reason: string;
  taskId: number | null;
  messageId: string | null;
  createdAt: string;
}

export class LifeGraphProposedFieldDto {
  proposalFieldId: string;
  category: LifeGraphFieldCategory;
  fieldKey: string;
  fieldValue: unknown;
  source: LifeGraphFieldSource;
  confidence: number;
  reason: string;
  requiresUserConfirmation: boolean;
  status:
    | 'proposed'
    | 'confirmed'
    | 'rejected'
    | 'conflict'
    | 'revoked_conflict';
  conflict: boolean;
  oldValue: unknown;
}

export class LifeGraphProposalDto {
  proposalId: number;
  userId: number;
  taskId: number | null;
  messageId: string | null;
  proposedFields: LifeGraphProposedFieldDto[];
  status: LifeGraphProposalStatus;
  aiSummary: string;
  missingFields: LifeGraphMissingFieldDto[];
  confirmationRequired: boolean;
  createdAt: string;
  confirmedAt: string | null;
  rejectedAt: string | null;
}

export class ExtractLifeGraphFromChatDto {
  @IsString()
  @MaxLength(2000)
  message: string;

  @IsOptional()
  @IsNumber()
  taskId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(96)
  messageId?: string | null;

  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}

export class ConfirmLifeGraphUpdateDto {
  @IsNumber()
  proposalId: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fieldIds?: string[];
}

export class RejectLifeGraphUpdateDto {
  @IsNumber()
  proposalId: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fieldIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class RevokeLifeGraphFieldDto {
  @IsEnum(LifeGraphFieldCategory)
  category: LifeGraphFieldCategory;

  @IsString()
  @MaxLength(96)
  fieldKey: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class LifeGraphResponseDto {
  profile: LifeGraphProfileDto;
  fields: Record<LifeGraphFieldCategory, LifeGraphFieldDto[]>;
  completeness: LifeGraphCompletenessDto;
  dynamicInsights?: LifeGraphDynamicSignalsDto;
}

export class UpdateLifeGraphFieldDto {
  @IsEnum(LifeGraphFieldCategory)
  category: LifeGraphFieldCategory;

  @IsString()
  @MaxLength(96)
  fieldKey: string;

  @IsDefined()
  fieldValue: unknown;

  @IsOptional()
  @IsBoolean()
  confirmedByUser?: boolean;

  @IsOptional()
  @IsBoolean()
  editable?: boolean;

  @IsOptional()
  @IsBoolean()
  revoked?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;

  @IsOptional()
  @IsEnum(LifeGraphSignalType)
  signalType?: LifeGraphSignalType;

  @IsOptional()
  @IsBoolean()
  visibleInRecommendationReason?: boolean;

  @IsOptional()
  @IsBoolean()
  userCanDisableForMatching?: boolean;

  @IsOptional()
  @IsBoolean()
  enabledForMatching?: boolean;
}

export class UpdateLifeGraphDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateLifeGraphFieldDto)
  fields?: UpdateLifeGraphFieldDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  currentSocialGoal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  preferredLanguage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  region?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;
}

export class LifeGraphInternalFieldUpdateDto {
  @IsEnum(LifeGraphFieldCategory)
  category: LifeGraphFieldCategory;

  @IsString()
  @MaxLength(96)
  fieldKey: string;

  @IsDefined()
  fieldValue: unknown;

  @IsEnum(LifeGraphFieldSource)
  source: LifeGraphFieldSource;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @IsOptional()
  @IsBoolean()
  confirmedByUser?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
