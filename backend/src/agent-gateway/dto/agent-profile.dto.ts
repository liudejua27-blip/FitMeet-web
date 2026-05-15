import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import {
  AgentAutonomyLevel,
  AgentProfileStatus,
  AgentProvider,
  AgentType,
} from '../entities/agent-profile.entity';

class AgentProfileFieldsDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  agentName?: string;

  @IsOptional()
  @IsEnum(AgentProvider)
  provider?: AgentProvider;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatar?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  personality?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  goals?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  interests?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  preferredTargets?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  boundaries?: string[];

  @IsOptional()
  @IsEnum(AgentAutonomyLevel)
  autonomyLevel?: AgentAutonomyLevel;
}

export class CreateAgentProfileDto extends AgentProfileFieldsDto {
  @IsString()
  @MaxLength(80)
  agentName: string;

  @IsOptional()
  @IsEnum(AgentType)
  agentType?: AgentType;

  @IsOptional()
  @IsEnum(AgentProfileStatus)
  status?: AgentProfileStatus;

  @IsOptional()
  @IsInt()
  @Min(1)
  agentConnectionId?: number;
}

export class UpdateAgentProfileDto extends AgentProfileFieldsDto {
  @IsOptional()
  @IsEnum(AgentProfileStatus)
  status?: AgentProfileStatus;
}
