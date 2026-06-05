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
import { UserFacingResponseSanitizerService } from './response-quality/user-facing-response-sanitizer.service';
import type {
  SocialAgentPlanFailureContext,
  SocialAgentPlanReason,
} from './social-agent-planner.service';
import { SocialAgentChatService } from './social-agent-chat.service';
import type { SocialAgentCardActionBody } from './social-agent-chat.service';

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

type UserFacingStreamEvent =
  | { type: 'status'; lightStatus: string }
  | {
      type: 'progress';
      id: string;
      kind: 'analysis' | 'tool' | 'status';
      title: string;
      detail?: string;
      state: 'running' | 'done' | 'failed' | 'waiting';
    }
  | {
      type: 'result';
      result: ReturnType<
        UserFacingResponseSanitizerService['toUserFacingAgentResponse']
      >;
    }
  | { type: 'error'; message: string };

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
  constructor(
    private readonly chat: SocialAgentChatService,
    private readonly userFacingSanitizer: UserFacingResponseSanitizerService,
  ) {}

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
  async routeMessage(
    @Req() req: FitMeetRequest,
    @Body() body: RouteMessageBody,
  ) {
    const result = await this.chat.routeMessage(req.user.id, body ?? {});
    return this.userFacingSanitizer.toUserFacingAgentResponse(
      result,
      result.permissionMode ?? AgentTaskPermissionMode.Confirm,
    );
  }

  @Post('messages')
  @HttpCode(200)
  async handleMessage(
    @Req() req: FitMeetRequest,
    @Body() body: RouteMessageBody,
  ) {
    const result = await this.chat.handleMessage(req.user.id, body ?? {});
    return this.userFacingSanitizer.toUserFacingAgentResponse(
      result,
      result.permissionMode ?? AgentTaskPermissionMode.Confirm,
    );
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
  async handleTaskMessage(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: RouteMessageBody,
  ) {
    const result = await this.chat.handleMessage(req.user.id, {
      ...(body ?? {}),
      taskId: id,
    });
    return this.userFacingSanitizer.toUserFacingAgentResponse(
      result,
      result.permissionMode ?? AgentTaskPermissionMode.Confirm,
    );
  }

  @Post('tasks/:id/actions')
  @HttpCode(200)
  async performTaskAction(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SocialAgentCardActionBody,
  ) {
    const result = await this.chat.performCardAction(req.user.id, id, body ?? {});
    return this.userFacingSanitizer.toUserFacingAgentResponse(
      result,
      result.permissionMode ?? AgentTaskPermissionMode.Confirm,
    );
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

  @Post('stream-user')
  async streamUserFacingRun(
    @Req() req: FitMeetRequest,
    @Body() body: RunBody,
    @Res() res: Response,
  ) {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const write = (event: string, data: UserFacingStreamEvent) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      await this.chat.runStream(req.user.id, body ?? {}, (payload) => {
        if (payload.type === 'result') {
          write('result', {
            type: 'result',
            result: this.userFacingSanitizer.toUserFacingAgentResponse(
              payload.result,
              this.userPermissionMode(body?.permissionMode),
            ),
          });
          return;
        }

        if (payload.type === 'error') {
          write('error', {
            type: 'error',
            message: payload.message,
          });
          return;
        }

        write('status', {
          type: 'status',
          lightStatus:
            payload.type === 'step'
              ? this.lightStatusFromStep(payload.step.label)
              : '正在理解你的需求',
        });
        if (payload.type === 'step') {
          write('progress', this.progressFromStep(payload.step));
        }
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

  private userPermissionMode(
    value: AgentTaskPermissionMode | undefined,
  ): AgentTaskPermissionMode {
    return value && Object.values(AgentTaskPermissionMode).includes(value)
      ? value
      : AgentTaskPermissionMode.Confirm;
  }

  private lightStatusFromStep(label: string): string {
    if (/Life Graph|画像|profile/i.test(label)) {
      return '正在结合你的 Life Graph';
    }
    if (/筛选|候选|匹配|search|candidate/i.test(label)) {
      return '正在筛选合适的人';
    }
    if (/时间|排除|rank/i.test(label)) {
      return '正在排除时间不合适的人';
    }
    if (/安全|边界|guardrail|risk/i.test(label)) {
      return '正在检查安全边界';
    }
    if (/开场白|message|opener/i.test(label)) {
      return '正在生成开场白';
    }
    if (/确认|approval|confirm/i.test(label)) {
      return '正在等待你确认';
    }
    if (/活动|约练|activity/i.test(label)) {
      return '正在创建约练计划';
    }
    return '正在理解你的需求';
  }

  private progressFromStep(step: {
    id: string;
    label: string;
    status: 'pending' | 'running' | 'done' | 'failed';
  }): UserFacingStreamEvent {
    const key = `${step.id} ${step.label}`.toLowerCase();
    const isTool =
      /tool|call|search|candidate|match|activity|message|opener|approval|confirm|life graph|profile|risk|guardrail|rank|filter/i.test(
        key,
      );
    return {
      type: 'progress',
      id: isTool ? 'tool' : 'analysis',
      kind: isTool ? 'tool' : 'analysis',
      title: isTool ? '正在调用工具' : '分析中',
      detail: this.lightStatusFromStep(step.label),
      state:
        step.status === 'done'
          ? 'done'
          : step.status === 'failed'
            ? 'failed'
            : 'running',
    };
  }
}
