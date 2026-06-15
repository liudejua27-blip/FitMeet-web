import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';

import {
  SocialAgentReminderService,
  type SocialAgentReminderPreferenceDto,
} from './social-agent-reminder.service';

type FitMeetRequest = Request & {
  user: { id: number };
};

@Controller('social-agent/reminders')
@UseGuards(AuthGuard('jwt'))
export class SocialAgentReminderController {
  constructor(private readonly reminders: SocialAgentReminderService) {}

  @Get('preferences')
  getPreference(@Req() req: FitMeetRequest) {
    return this.reminders.getPreference(req.user.id);
  }

  @Patch('preferences')
  updatePreference(
    @Req() req: FitMeetRequest,
    @Body() body: SocialAgentReminderPreferenceDto,
  ) {
    return this.reminders.updatePreference(req.user.id, body ?? {});
  }

  @Get()
  list(@Req() req: FitMeetRequest, @Query('limit') limit?: string) {
    return this.reminders.list(req.user.id, Number(limit));
  }

  @Post('run-once')
  @HttpCode(200)
  runOnce(@Req() req: FitMeetRequest, @Body() body?: { force?: boolean }) {
    return this.reminders.runOnce(req.user.id, {
      force: body?.force === true,
    });
  }

  @Post('disable')
  @HttpCode(200)
  disable(@Req() req: FitMeetRequest) {
    return this.reminders.disable(req.user.id);
  }

  @Post(':id/open')
  @HttpCode(200)
  open(@Req() req: FitMeetRequest, @Param('id', ParseIntPipe) id: number) {
    return this.reminders.markOpened(req.user.id, id);
  }

  @Post(':id/dismiss')
  @HttpCode(200)
  dismiss(@Req() req: FitMeetRequest, @Param('id', ParseIntPipe) id: number) {
    return this.reminders.dismiss(req.user.id, id);
  }
}
