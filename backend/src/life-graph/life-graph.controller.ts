import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Param,
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
  ConfirmLifeGraphSecurityRequestDto,
  CorrectLifeGraphDto,
  CreateLifeGraphSecurityRequestDto,
  ExtractLifeGraphFromChatDto,
  RejectLifeGraphUpdateDto,
  RecordLifeGraphBehaviorEventDto,
  RevokeLifeGraphFieldDto,
  UpdateLifeGraphDto,
} from './dto/life-graph.dto';
import { LifeGraphSecurityRequestService } from './life-graph-security-request.service';
import { LifeGraphService } from './life-graph.service';

@UseGuards(JwtAuthGuard)
@Controller('life-graph')
export class LifeGraphController {
  constructor(
    private readonly lifeGraph: LifeGraphService,
    private readonly securityRequests: LifeGraphSecurityRequestService,
  ) {}

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

  @Get('behavior-events')
  getBehaviorEvents(
    @Request() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.lifeGraph.getBehaviorEvents(req.user.id, {
      limit: limit ? Number(limit) : undefined,
      cursor,
    });
  }

  @Post('behavior-events')
  recordBehaviorEvent(
    @Request() req: AuthenticatedRequest,
    @Body() body: RecordLifeGraphBehaviorEventDto,
  ) {
    return this.lifeGraph.recordBehaviorEvent(req.user.id, body);
  }

  @Get('signal-scores')
  getSignalScores(@Request() req: AuthenticatedRequest) {
    return this.lifeGraph.getSignalScores(req.user.id);
  }

  @Get('update-audits')
  getUpdateAudits(
    @Request() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.lifeGraph.getUpdateAudits(req.user.id, {
      limit: limit ? Number(limit) : undefined,
      cursor,
    });
  }

  @Post('corrections')
  correctLifeGraph(
    @Request() req: AuthenticatedRequest,
    @Body() body: CorrectLifeGraphDto,
  ) {
    return this.lifeGraph.correctLifeGraph(req.user.id, body);
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

  @Get('export')
  exportLifeGraph() {
    throw new ConflictException({
      code: 'life_graph_confirmation_required',
      message:
        'Life Graph export now requires a security request, cooldown, and confirmation code.',
      nextEndpoint: '/life-graph/export-requests',
    });
  }

  @Post('export-requests')
  createExportRequest(
    @Request() req: AuthenticatedRequest,
    @Body() body: CreateLifeGraphSecurityRequestDto,
  ) {
    return this.securityRequests.createRequest(
      req.user.id,
      'export',
      body ?? {},
    );
  }

  @Post('export-requests/:id/confirm')
  confirmExportRequest(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: ConfirmLifeGraphSecurityRequestDto,
  ) {
    return this.securityRequests.confirmExportRequest(
      req.user.id,
      Number(id),
      body,
    );
  }

  @Delete('me')
  deleteLifeGraphMemory() {
    throw new ConflictException({
      code: 'life_graph_confirmation_required',
      message:
        'Life Graph deletion now requires a security request, cooldown, and confirmation code.',
      nextEndpoint: '/life-graph/delete-requests',
    });
  }

  @Post('delete-requests')
  createDeleteRequest(
    @Request() req: AuthenticatedRequest,
    @Body() body: CreateLifeGraphSecurityRequestDto,
  ) {
    return this.securityRequests.createRequest(
      req.user.id,
      'delete',
      body ?? {},
    );
  }

  @Post('delete-requests/:id/confirm')
  confirmDeleteRequest(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: ConfirmLifeGraphSecurityRequestDto,
  ) {
    return this.securityRequests.confirmDeleteRequest(
      req.user.id,
      Number(id),
      body,
    );
  }
}
