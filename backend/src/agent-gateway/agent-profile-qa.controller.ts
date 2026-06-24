import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { AgentProfileQAService } from './agent-profile-qa.service';

type FitMeetRequest = Request & {
  user: { id: number };
};

@Controller('agent/profile')
@UseGuards(AuthGuard('jwt'))
export class AgentProfileQAController {
  constructor(private readonly qa: AgentProfileQAService) {}

  @Get('questions')
  getQuestions(@Req() req: FitMeetRequest) {
    return this.qa.generateQuestions(req.user.id);
  }

  @Post('answers')
  @HttpCode(200)
  saveAnswers(
    @Req() req: FitMeetRequest,
    @Body()
    body: {
      answers?: Array<{ key: string; value: unknown }>;
      confirm?: boolean;
    },
  ) {
    return this.qa.saveAnswers(req.user.id, body?.answers ?? [], {
      confirm: body?.confirm === true,
    });
  }

  @Get('completion')
  getCompletion(@Req() req: FitMeetRequest) {
    return this.qa.getCompletion(req.user.id);
  }
}
