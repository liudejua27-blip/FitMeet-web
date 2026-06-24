import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AgentGatewayService } from './agent-gateway.service';
import { CreateSocialRequestDto } from './dto/agent-gateway.dto';
import { SocialRequestStatus } from './entities/social-request.entity';

@Controller('public/social-intents')
export class PublicSocialIntentController {
  constructor(private readonly svc: AgentGatewayService) {}

  @Get()
  listPublicSocialIntents(
    @Query('page') page = '1',
    @Query('limit') limit = '30',
    @Query('q') q?: string,
    @Query('city') city?: string,
    @Query('requestType') requestType?: string,
    @Query('status') status?: SocialRequestStatus,
    @Query('publicIntentId') publicIntentId?: string,
  ) {
    return this.svc.listPublicSocialIntents({
      page: Number(page),
      limit: Number(limit),
      q,
      city,
      requestType,
      status,
      publicIntentId,
    });
  }

  @Get(':id/matches')
  getPublicSocialIntentMatches(@Param('id') id: string) {
    return this.svc.getPublicSocialIntentMatches(id);
  }

  @Get(':id')
  getPublicSocialIntent(@Param('id') id: string) {
    return this.svc.getPublicSocialIntent(id);
  }

  @Post()
  submitPublicSocialIntent(
    @Req() req: Request,
    @Body() dto: CreateSocialRequestDto,
  ) {
    return this.svc.submitPublicSocialIntent(dto, {
      ip: req.ip,
      forwardedFor: req.headers['x-forwarded-for'],
      userAgent: req.headers['user-agent'],
      deviceId: req.headers['x-fitmeet-device-id'],
      origin: req.headers.origin,
    });
  }
}
