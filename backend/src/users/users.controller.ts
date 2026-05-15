import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  UseGuards,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { SocialProfileService } from './social-profile.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { UpdateSocialProfileDto } from './dto/update-social-profile.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import type { AiProfileBuilderCard } from '../ai/ai.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly socialProfileService: SocialProfileService,
  ) {}

  @Public()
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Put('profile')
  updateProfile(
    @Request() req: AuthenticatedRequest,
    @Body() data: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(req.user.id, data);
  }

  /**
   * PUT /api/users/me/location
   * Persist the caller's latest coordinates so they can be surfaced (or
   * not) in nearby-match searches.
   */
  @UseGuards(JwtAuthGuard)
  @Put('me/location')
  updateLocation(
    @Request() req: AuthenticatedRequest,
    @Body() data: UpdateLocationDto,
  ) {
    return this.usersService.updateLocation(
      req.user.id,
      data.lat,
      data.lng,
      data.acceptNearbyMatch,
    );
  }

  /**
   * GET /api/users/me/social-profile
   * 读取当前用户的社交画像，供 AI 社交助手页面使用。
   * 从未保存过则返回一份带默认空值的占位对象。
   */
  @UseGuards(JwtAuthGuard)
  @Get('me/social-profile')
  getSocialProfile(@Request() req: AuthenticatedRequest) {
    return this.socialProfileService.get(req.user.id);
  }

  /**
   * PUT /api/users/me/social-profile
   * Upsert 当前用户的社交画像。只覆盖请求中显式提供的字段。
   */
  @UseGuards(JwtAuthGuard)
  @Put('me/social-profile')
  updateSocialProfile(
    @Request() req: AuthenticatedRequest,
    @Body() data: UpdateSocialProfileDto,
  ) {
    return this.socialProfileService.upsert(req.user.id, data);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/social-profile/questions')
  generateSocialProfileQuestions(@Request() req: AuthenticatedRequest) {
    return this.socialProfileService.generateQuestions(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/social-profile/answers')
  saveSocialProfileAnswer(
    @Request() req: AuthenticatedRequest,
    @Body() body: { key: string; answer: string },
  ) {
    return this.socialProfileService.saveAnswer(
      req.user.id,
      body.key,
      body.answer,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/social-profile/ai-draft')
  generateAiSocialProfileDraft(
    @Request() req: AuthenticatedRequest,
    @Body()
    body: {
      answers?: Array<{
        key?: string;
        question?: string;
        answer?: string;
        value?: unknown;
      }>;
      rawText?: string;
      source?: string;
    },
  ) {
    return this.socialProfileService.generateAiDraft(req.user.id, body ?? {});
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/social-profile/ai-save')
  saveAiSocialProfileDraft(
    @Request() req: AuthenticatedRequest,
    @Body() body: { profile?: AiProfileBuilderCard; enableMatching?: boolean },
  ) {
    return this.socialProfileService.saveAiDraft(req.user.id, body ?? {});
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/social-profile/completion')
  getSocialProfileCompletion(@Request() req: AuthenticatedRequest) {
    return this.socialProfileService.getCompletion(req.user.id);
  }
}
