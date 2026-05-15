import { Controller, Get, UseGuards, Request, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import { RecommendationsService } from './recommendations.service';

@Controller('recommendations')
@UseGuards(JwtAuthGuard)
export class RecommendationsController {
  constructor(
    private readonly recommendationsService: RecommendationsService,
  ) {}

  @Get('posts')
  async getRecommendedPosts(
    @Request() req: AuthenticatedRequest,
    @Query('limit') limit: number,
  ) {
    return this.recommendationsService.getRecommendedPosts(
      req.user.userId ?? req.user.id,
      limit || 10,
    );
  }

  @Get('users')
  async getRecommendedUsers(
    @Request() req: AuthenticatedRequest,
    @Query('limit') limit: number,
  ) {
    return this.recommendationsService.getRecommendedUsers(
      req.user.userId ?? req.user.id,
      limit || 5,
    );
  }
}
