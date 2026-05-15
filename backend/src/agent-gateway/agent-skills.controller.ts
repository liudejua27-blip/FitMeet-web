import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type { Request } from 'express';
import { AgentGatewayService } from './agent-gateway.service';
import { MeetsService } from '../meets/meets.service';
import { SafetyService } from '../safety/safety.service';
import { CreateMeetDto } from '../meets/dto/create-meet.dto';
import { CreateReportDto } from '../safety/dto/create-report.dto';
import {
  AGENT_CONNECTION_KEY,
  AgentTokenGuard,
} from './guards/agent-token.guard';
import {
  AgentPermissionGuard,
  RequirePermission,
} from './guards/agent-permission.guard';
import { AgentAction } from './entities/agent-permission.entity';
import { AgentConnection } from './entities/agent-connection.entity';
import {
  ActionResult,
  LoggedAction,
} from './entities/agent-activity-log.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AgentApprovalRequest,
  ApprovalStatus,
  ApprovalType,
} from './entities/agent-approval-request.entity';

type AgentReq = Request & {
  [AGENT_CONNECTION_KEY]: AgentConnection;
};

class SubmitProofDto {
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  photoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  finishedAt?: string;
}

class JoinActivityDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

@Controller('agent')
@UseGuards(AgentTokenGuard, AgentPermissionGuard)
export class AgentSkillsController {
  constructor(
    private readonly gateway: AgentGatewayService,
    private readonly meetsService: MeetsService,
    private readonly safetyService: SafetyService,
    @InjectRepository(AgentApprovalRequest)
    private readonly approvalRepo: Repository<AgentApprovalRequest>,
  ) {}

  // NOTE: `POST /api/agent/match/partner` and `POST /api/agent/nearby/search`
  // are now served by `MatchModule` (src/match/agent-match.controller.ts).
  // The legacy random-scored implementation has been retired.

  // NOTE: `POST /api/agent/activities`, `/:id/join`, `/:id/proof` are now
  // served by `ActivitiesModule` (src/activities/agent-activities.controller.ts)
  // which is backed by the SocialActivity / ActivityProof system rather than
  // the legacy Meets table.

  /** POST /api/agent/safety/report */
  @Post('safety/report')
  @RequirePermission(AgentAction.ReportRisk)
  async reportRisk(@Req() req: AgentReq, @Body() dto: CreateReportDto) {
    const conn = req[AGENT_CONNECTION_KEY];
    const report = await this.safetyService.createReport(conn.userId, dto);
    await this.gateway.logAgentSkill(
      conn,
      LoggedAction.ReportRisk,
      {
        reportId: report?.id,
        targetType: dto.targetType,
        targetId: dto.targetId,
        reason: dto.reason,
      },
      ActionResult.Success,
      null,
      0.3,
    );
    return report;
  }
}
