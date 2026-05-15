import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { MatchService } from './match.service';
import { RunMatchDto } from './dto/match.dto';

interface AuthenticatedRequest extends Request {
  user?: { id: number };
}

@Controller('social-requests')
@UseGuards(JwtAuthGuard)
export class MatchController {
  constructor(private readonly matchService: MatchService) {}

  /**
   * POST /api/social-requests/:id/match
   * Owner-only. Recomputes top-K candidates and replaces previous suggestions.
   */
  @Post(':id/match')
  async runMatch(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RunMatchDto,
  ) {
    return this.matchService.runMatch(id, req.user!.id, { limit: dto.limit });
  }

  /**
   * GET /api/social-requests/:id/candidates
   * Owner-only. Returns persisted candidates ordered by score DESC.
   */
  @Get(':id/candidates')
  async listCandidates(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.matchService.listCandidates(id, req.user!.id);
  }

  /**
   * POST /api/social-requests/:id/candidates/:candidateId/mark-messaged
   * Owner-only. Advances candidate status suggested/approved → messaged.
   */
  @Post(':id/candidates/:candidateId/mark-messaged')
  async markMessaged(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('candidateId', ParseIntPipe) candidateId: number,
  ) {
    return this.matchService.markCandidateMessaged(
      id,
      candidateId,
      req.user!.id,
    );
  }
}
