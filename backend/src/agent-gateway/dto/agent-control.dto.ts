import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AgentSettingsMode } from '../entities/agent-settings.entity';
import { ApprovalType } from '../entities/agent-approval-request.entity';

export class UpdateAgentPermissionsDto {
  @IsOptional() @IsEnum(AgentSettingsMode) mode?: AgentSettingsMode;

  @IsOptional() @IsBoolean() allowSearch?: boolean;
  @IsOptional() @IsBoolean() allowDraftMessage?: boolean;
  @IsOptional() @IsBoolean() allowSendMessage?: boolean;
  @IsOptional() @IsBoolean() allowAutoReply?: boolean;
  @IsOptional() @IsBoolean() allowCreateActivity?: boolean;
  @IsOptional() @IsBoolean() allowJoinActivity?: boolean;
  @IsOptional() @IsBoolean() allowShareLocation?: boolean;
  @IsOptional() @IsBoolean() allowUploadProof?: boolean;
  @IsOptional() @IsBoolean() allowContactExchange?: boolean;

  @IsOptional() @IsInt() @Min(0) @Max(1000) maxDailyMessages?: number;

  @IsOptional() @IsBoolean() requireApprovalForFirstMessage?: boolean;
  @IsOptional() @IsBoolean() requireApprovalForOfflineMeeting?: boolean;
  @IsOptional() @IsBoolean() requireApprovalForPhotoUpload?: boolean;
  @IsOptional() @IsBoolean() requireApprovalForAll?: boolean;
}

export class CreateApprovalDto {
  @IsEnum(ApprovalType) type: ApprovalType;

  @IsOptional() @IsString() @MaxLength(64) skillName?: string;

  @IsObject() payload: Record<string, unknown>;

  @IsOptional() @IsString() @MaxLength(500) summary?: string;

  @IsOptional() @IsString() @MaxLength(2000) rationale?: string;

  @IsOptional() @IsInt() agentConnectionId?: number;
}
