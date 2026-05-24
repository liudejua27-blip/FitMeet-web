import {
  Body,
  Controller,
  Get,
  HttpCode,
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
import type {
  SocialAgentPlanFailureContext,
  SocialAgentPlanReason,
} from './social-agent-planner.service';
import { SocialAgentChatService } from './social-agent-chat.service';

type FitMeetRequest = Request & {
  user: { id: number };
};

type RunBody = {
  goal?: string;
  permissionMode?: AgentTaskPermissionMode;
  idempotencyKey?: string | null;
};

type ReplanRunBody = {
  userMessage?: string | null;
  reason?: SocialAgentPlanReason;
  failure?: SocialAgentPlanFailureContext | null;
};

type RouteMessageBody = {
  message?: string | null;
  taskId?: number | null;
  hasCandidates?: boolean;
};

type SendMessageBody = {
  targetUserId?: number;
  candidateUserId?: number;
  message?: string;
  suggestedOpener?: string;
  candidateRecordId?: number | null;
  publicIntentId?: string | null;
  socialRequestId?: number | null;
  candidate?: Record<string, unknown>;
};

type SaveCandidateBody = {
  candidateRecordId?: number | null;
  publicIntentId?: string | null;
  socialRequestId?: number | null;
  targetUserId?: number | null;
  candidate?: Record<string, unknown>;
};

type ConnectCandidateBody = {
  targetUserId?: number | null;
  candidateUserId?: number | null;
  candidateRecordId?: number | null;
  publicIntentId?: string | null;
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

  @Post('run-async')
  @HttpCode(202)
  runQueued(@Req() req: FitMeetRequest, @Body() body: RunBody) {
    return this.chat.runQueued(req.user.id, body ?? {});
  }

  @Post('route-message')
  @HttpCode(200)
  routeMessage(@Req() req: FitMeetRequest, @Body() body: RouteMessageBody) {
    return this.chat.routeMessage(req.user.id, body ?? {});
  }

  @Post('messages')
  @HttpCode(200)
  handleMessage(@Req() req: FitMeetRequest, @Body() body: RouteMessageBody) {
    return this.chat.handleMessage(req.user.id, body ?? {});
  }

  @Get('session')
  getLatestSession(@Req() req: FitMeetRequest) {
    return this.chat.getLatestSession(req.user.id);
  }

  @Get('tasks/:id/session')
  getTaskSession(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.chat.getTaskSession(req.user.id, id);
  }

  @Post('tasks/:id/messages')
  @HttpCode(200)
  handleTaskMessage(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: RouteMessageBody,
  ) {
    return this.chat.handleMessage(req.user.id, {
      ...(body ?? {}),
      taskId: id,
    });
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
        message:
          error instanceof Error ? error.message : 'Social Agent 运行失败',
      });
    } finally {
      res.end();
    }
  }

  @Post('tasks/:id/publish-social-request')
  @HttpCode(200)
  publishSocialRequest(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CreateSocialRequestDto & { socialRequestId?: number | null },
  ) {
    return this.chat.publishDraft(req.user.id, id, body);
  }

  @Post('tasks/:id/replan-run')
  @HttpCode(202)
  replanAndRefresh(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ReplanRunBody,
  ) {
    return this.chat.replanAndRefresh(req.user.id, id, body ?? {});
  }

  @Post('tasks/:id/append-context')
  appendContext(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ReplanRunBody,
  ) {
    return this.chat.appendContext(req.user.id, id, body ?? {});
  }

  @Get('tasks/:id/runs/:runId')
  getRunStatus(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('runId') runId: string,
  ) {
    return this.chat.getRunStatus(req.user.id, id, runId);
  }

  @Post('tasks/:id/save-candidate')
  @HttpCode(200)
  saveCandidate(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SaveCandidateBody,
  ) {
    return this.chat.saveCandidate(req.user.id, id, body ?? {});
  }

  @Post('tasks/:id/send-message')
  @HttpCode(200)
  sendMessage(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SendMessageBody,
  ) {
    return this.chat.sendCandidateMessage(req.user.id, id, body ?? {});
  }

  @Post('tasks/:id/connect-candidate')
  @HttpCode(200)
  connectCandidate(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ConnectCandidateBody,
  ) {
    return this.chat.connectCandidate(req.user.id, id, body ?? {});
  }
}
