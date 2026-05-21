import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';

import { CreateSocialRequestDto } from '../social-requests/dto/create-social-request.dto';
import { AgentTaskPermissionMode } from './entities/agent-task.entity';
import { SocialAgentChatService } from './social-agent-chat.service';

type FitMeetRequest = Request & {
  user: { id: number };
};

type RunBody = {
  goal?: string;
  permissionMode?: AgentTaskPermissionMode;
  idempotencyKey?: string | null;
};

type SendMessageBody = {
  targetUserId?: number;
  message?: string;
  candidate?: Record<string, unknown>;
};

type SaveCandidateBody = {
  candidateRecordId?: number | null;
  socialRequestId?: number | null;
  targetUserId?: number | null;
  candidate?: Record<string, unknown>;
};

type ConnectCandidateBody = {
  targetUserId?: number | null;
  candidateRecordId?: number | null;
  socialRequestId?: number | null;
  candidate?: Record<string, unknown>;
};

@Controller('social-agent/chat')
@UseGuards(AuthGuard('jwt'))
export class SocialAgentChatController {
  constructor(private readonly chat: SocialAgentChatService) {}

  @Post('run')
  run(@Req() req: FitMeetRequest, @Body() body: RunBody) {
    return this.chat.run(req.user.id, body ?? {});
  }

  @Post('stream')
  async streamRun(
    @Req() req: FitMeetRequest,
    @Body() body: RunBody,
    @Res() res: Response,
  ) {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const write = (event: string, data: unknown) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      await this.chat.runStream(req.user.id, body ?? {}, (payload) => {
        write(payload.type, payload);
      });
    } catch (error) {
      write('error', {
        type: 'error',
        message: error instanceof Error ? error.message : 'Social Agent 运行失败',
      });
    } finally {
      res.end();
    }
  }

  @Post('tasks/:id/publish-social-request')
  publishSocialRequest(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CreateSocialRequestDto & { socialRequestId?: number | null },
  ) {
    return this.chat.publishDraft(req.user.id, id, body);
  }

  @Post('tasks/:id/save-candidate')
  saveCandidate(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SaveCandidateBody,
  ) {
    return this.chat.saveCandidate(req.user.id, id, body ?? {});
  }

  @Post('tasks/:id/send-message')
  sendMessage(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SendMessageBody,
  ) {
    return this.chat.sendCandidateMessage(req.user.id, id, body ?? {});
  }

  @Post('tasks/:id/connect-candidate')
  connectCandidate(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ConnectCandidateBody,
  ) {
    return this.chat.connectCandidate(req.user.id, id, body ?? {});
  }
}
