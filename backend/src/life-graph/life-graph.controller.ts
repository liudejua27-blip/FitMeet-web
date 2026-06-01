import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import {
  ConfirmLifeGraphUpdateDto,
  ExtractLifeGraphFromChatDto,
  RejectLifeGraphUpdateDto,
  RevokeLifeGraphFieldDto,
  UpdateLifeGraphDto,
} from './dto/life-graph.dto';
import { LifeGraphService } from './life-graph.service';

@UseGuards(JwtAuthGuard)
@Controller('life-graph')
export class LifeGraphController {
  constructor(private readonly lifeGraph: LifeGraphService) {}

  @Get('me')
  getMe(@Request() req: AuthenticatedRequest) {
    return this.lifeGraph.getLifeGraph(req.user.id);
  }

  @Patch('me')
  updateMe(
    @Request() req: AuthenticatedRequest,
    @Body() body: UpdateLifeGraphDto,
  ) {
    return this.lifeGraph.updateLifeGraph(req.user.id, body ?? {});
  }

  @Get('completeness')
  getCompleteness(@Request() req: AuthenticatedRequest) {
    return this.lifeGraph.getCompleteness(req.user.id);
  }

  @Get('match-signals')
  getMatchSignals(@Request() req: AuthenticatedRequest) {
    return this.lifeGraph.getUnifiedMatchSignals(req.user.id);
  }

  @Get('audit')
  getAudit(
    @Request() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.lifeGraph.getAuditLogs(req.user.id, {
      limit: limit ? Number(limit) : undefined,
      cursor,
    });
  }

  @Post('extract-from-chat')
  extractFromChat(
    @Request() req: AuthenticatedRequest,
    @Body() body: ExtractLifeGraphFromChatDto,
  ) {
    return this.lifeGraph.extractFromChat(req.user.id, body);
  }

  @Post('confirm-update')
  confirmUpdate(
    @Request() req: AuthenticatedRequest,
    @Body() body: ConfirmLifeGraphUpdateDto,
  ) {
    return this.lifeGraph.confirmUpdate(req.user.id, body);
  }

  @Post('reject-update')
  rejectUpdate(
    @Request() req: AuthenticatedRequest,
    @Body() body: RejectLifeGraphUpdateDto,
  ) {
    return this.lifeGraph.rejectUpdate(req.user.id, body);
  }

  @Post('revoke-field')
  revokeField(
    @Request() req: AuthenticatedRequest,
    @Body() body: RevokeLifeGraphFieldDto,
  ) {
    return this.lifeGraph.revokeField(req.user.id, body);
  }
}
