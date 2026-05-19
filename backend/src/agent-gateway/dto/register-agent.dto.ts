import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  AgentPermissionLevel,
  KnownAgent,
} from '../entities/agent-connection.entity';

export class RegisterAgentDto {
  @IsEnum(KnownAgent)
  agentName: KnownAgent | string;

  @IsString()
  @MaxLength(60)
  agentDisplayName: string;

  @IsOptional()
  @IsUrl()
  agentWebhookUrl?: string;

  @IsOptional()
  @IsEnum(AgentPermissionLevel)
  permissionLevel?: AgentPermissionLevel;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  dailyActionLimit?: number;

  /** ISO-8601 date string; omit for no expiry */
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
