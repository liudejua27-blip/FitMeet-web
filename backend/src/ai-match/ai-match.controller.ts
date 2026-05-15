import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AiMatchService } from './ai-match.service';
import { UpsertAiDelegateProfileDto } from './dto/upsert-ai-delegate-profile.dto';
import { SimulateAiMatchDto } from './dto/simulate-ai-match.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';

@Controller('ai-match')
@UseGuards(JwtAuthGuard)
export class AiMatchController {
  constructor(private readonly aiMatchService: AiMatchService) {}

  @Get('profile')
  getProfile(@CurrentUser() user: User) {
    return this.aiMatchService.getProfile(user.id);
  }

  @Put('profile')
  upsertProfile(
    @CurrentUser() user: User,
    @Body() dto: UpsertAiDelegateProfileDto,
  ) {
    return this.aiMatchService.upsertProfile(user.id, dto);
  }

  @Get('candidates')
  getCandidates(@CurrentUser() user: User) {
    return this.aiMatchService.getCandidates(user.id);
  }

  @Post('simulate')
  simulate(@CurrentUser() user: User, @Body() dto: SimulateAiMatchDto) {
    return this.aiMatchService.simulate(user.id, dto.targetUserId);
  }

  @Post('sessions/:id/approve-friend')
  approveConnection(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.aiMatchService.approveConnection(user.id, id);
  }

  @Post('autopilot/run')
  runAutopilot(@CurrentUser() user: User) {
    return this.aiMatchService.runAutopilot(user.id);
  }

  @Get('autopilot/history')
  getAutopilotHistory(@CurrentUser() user: User) {
    return this.aiMatchService.getAutopilotHistory(user.id);
  }
}
