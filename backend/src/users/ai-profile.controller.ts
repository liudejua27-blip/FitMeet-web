import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import { SensitiveTagActionDto } from './dto/sensitive-tag-action.dto';
import { UpdateProfilePrivacyDto } from './dto/update-ai-profile-privacy.dto';
import { SocialProfileService } from './social-profile.service';

/**
 * /api/ai-profile/*
 *
 * Owner-only privacy console for the AI social profile:
 *   - GET    /privacy                       — read discoverable / agent switches
 *   - PATCH  /privacy                       — toggle discoverable / agent switches
 *   - GET    /sensitive-tags/pending        — list tags awaiting owner decision
 *   - POST   /sensitive-tags/confirm        — confirm a sensitive tag for matching
 *   - POST   /sensitive-tags/reject         — reject a sensitive tag from matching
 *
 * All endpoints are JWT-guarded and operate on `req.user.id` only. There
 * is no path or query parameter that targets another user — this prevents
 * Agents from manipulating someone else's privacy state even if the
 * Agent layer ever proxies these endpoints.
 */
@UseGuards(JwtAuthGuard)
@Controller('ai-profile')
export class AiProfileController {
  constructor(private readonly profiles: SocialProfileService) {}

  @Get('privacy')
  getPrivacy(@Request() req: AuthenticatedRequest) {
    return this.profiles.getPrivacy(req.user.id);
  }

  @Patch('privacy')
  updatePrivacy(
    @Request() req: AuthenticatedRequest,
    @Body() body: UpdateProfilePrivacyDto,
  ) {
    return this.profiles.updatePrivacy(req.user.id, body ?? {});
  }

  @Get('sensitive-tags/pending')
  getPendingSensitiveTags(@Request() req: AuthenticatedRequest) {
    return this.profiles.getPendingSensitiveTags(req.user.id);
  }

  @Post('sensitive-tags/confirm')
  confirmSensitiveTag(
    @Request() req: AuthenticatedRequest,
    @Body() body: SensitiveTagActionDto,
  ) {
    return this.profiles.confirmSensitiveTag(req.user.id, body.tag);
  }

  @Post('sensitive-tags/reject')
  rejectSensitiveTag(
    @Request() req: AuthenticatedRequest,
    @Body() body: SensitiveTagActionDto,
  ) {
    return this.profiles.rejectSensitiveTag(req.user.id, body.tag);
  }
}
