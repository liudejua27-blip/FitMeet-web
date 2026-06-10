import {
  Body,
  Controller,
  Get,
  HttpCode,
  Optional,
  Param,
  ParseIntPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';

import { CreateSocialRequestDto } from '../social-requests/dto/create-social-request.dto';
import { AgentTaskPermissionMode } from './entities/agent-task.entity';
import { UserFacingResponseSanitizerService } from './response-quality/user-facing-response-sanitizer.service';
import type {
  FitMeetRequest,
  SocialAgentConnectCandidateBody,
  SocialAgentReplanRunBody,
  SocialAgentRouteMessageBody,
  SocialAgentRunBody,
  SocialAgentSaveCandidateBody,
  SocialAgentSendMessageBody,
} from './social-agent-chat.controller.types';
import {
  lightStatusFromStep,
  lifecycleFromStep,
  lifecycleFromUserFacingResponse,
  progressFromStep,
  resolveUserPermissionMode,
  agentLoopStepStreamEvent,
  toolCallStreamEvent,
  userFacingStreamErrorEvent,
  type UserFacingStreamEvent,
} from './social-agent-chat-stream.presenter';
import { SocialAgentChatService } from './social-agent-chat.service';
import type { SocialAgentCardActionBody } from './social-agent-action.types';
import { SocialAgentCandidateCommandService } from './social-agent-candidate-command.service';
import { AgentObservabilityService } from './agent-observability.service';
import { SocialAgentStreamingResponseService } from './social-agent-streaming-response.service';

@Controller('social-agent/chat')
@UseGuards(AuthGuard('jwt'))
export class SocialAgentChatController {
  constructor(
    private readonly chat: SocialAgentChatService,
    private readonly candidateCommands: SocialAgentCandidateCommandService,
    private readonly userFacingSanitizer: UserFacingResponseSanitizerService,
    @Optional()
    private readonly streamingResponses?: SocialAgentStreamingResponseService,
    @Optional()
    private readonly observability?: AgentObservabilityService,
  ) {}

  @Post('run')
  run(@Req() req: FitMeetRequest, @Body() body: SocialAgentRunBody) {
    return this.chat.run(req.user.id, body ?? {});
  }

  @Post('run-async')
  @HttpCode(202)
  runQueued(@Req() req: FitMeetRequest, @Body() body: SocialAgentRunBody) {
    return this.chat.runQueued(req.user.id, body ?? {});
  }

  @Post('route-message')
  @HttpCode(200)
  async routeMessage(
    @Req() req: FitMeetRequest,
    @Body() body: SocialAgentRouteMessageBody,
  ) {
    const result = await this.chat.routeMessage(req.user.id, body ?? {});
    return this.userFacingSanitizer.toUserFacingAgentResponse(
      result,
      result.permissionMode ?? AgentTaskPermissionMode.Confirm,
    );
  }

  @Post('route-message/stream')
  async routeMessageStream(
    @Req() req: FitMeetRequest,
    @Body() body: SocialAgentRouteMessageBody,
    @Res() res: Response,
  ) {
    return this.streamUserFacingMessage(req, body ?? {}, res);
  }

  @Post('messages')
  @HttpCode(200)
  async handleMessage(
    @Req() req: FitMeetRequest,
    @Body() body: SocialAgentRouteMessageBody,
  ) {
    const result = await this.chat.handleMessage(req.user.id, body ?? {});
    return this.userFacingSanitizer.toUserFacingAgentResponse(
      result,
      result.permissionMode ?? AgentTaskPermissionMode.Confirm,
    );
  }

  @Post('messages/stream')
  async handleMessageStream(
    @Req() req: FitMeetRequest,
    @Body() body: SocialAgentRouteMessageBody,
    @Res() res: Response,
  ) {
    return this.streamUserFacingMessage(req, body ?? {}, res);
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
    @Body() body: SocialAgentRouteMessageBody,
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

  @Post('tasks/:id/messages/stream')
  async handleTaskMessageStream(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SocialAgentRouteMessageBody,
    @Res() res: Response,
  ) {
    return this.streamUserFacingMessage(
      req,
      {
        ...(body ?? {}),
        taskId: id,
      },
      res,
    );
  }

  @Post('tasks/:id/actions')
  @HttpCode(200)
  async performTaskAction(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SocialAgentCardActionBody,
  ) {
    const result = await this.chat.performCardAction(
      req.user.id,
      id,
      body ?? {},
    );
    return this.userFacingSanitizer.toUserFacingAgentResponse(
      result,
      result.permissionMode ?? AgentTaskPermissionMode.Confirm,
    );
  }

  @Post('tasks/:id/actions/stream')
  async performTaskActionStream(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SocialAgentCardActionBody,
    @Res() res: Response,
  ) {
    return this.streamUserFacingAction(req, id, body ?? {}, res);
  }

  @Post('stream')
  async streamRun(
    @Req() req: FitMeetRequest,
    @Body() body: SocialAgentRunBody,
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

    const signal = this.clientAbortSignal(req, res, 'run_stream');
    try {
      await this.chat.runStream(
        req.user.id,
        body ?? {},
        (payload) => {
          write(payload.type, payload);
        },
        { signal },
      );
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
    @Body() body: SocialAgentRunBody,
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

    const signal = this.clientAbortSignal(req, res, 'user_run_stream');
    let hasAssistantDelta = false;
    try {
      await this.chat.runStream(
        req.user.id,
        body ?? {},
        async (payload) => {
          if (payload.type === 'result') {
            const result = this.userFacingSanitizer.toUserFacingAgentResponse(
              payload.result,
              resolveUserPermissionMode(body?.permissionMode),
            );
            const lifecycle = lifecycleFromUserFacingResponse(result);
            if (!hasAssistantDelta) {
              await this.writeFallbackAssistantText(write, {
                text: result.assistantMessage,
                messageId: `agent-run:${payload.result.taskId}`,
                traceId: payload.result.traceId,
              });
              hasAssistantDelta = true;
            }
            this.writeApprovalRequiredEvents(
              write,
              result.pendingConfirmations,
            );
            write('result', {
              type: 'result',
              lifecycle,
              result,
            });
            return;
          }

          if (payload.type === 'assistant_delta') {
            if (payload.delta.trim()) hasAssistantDelta = true;
            write('assistant_delta', {
              type: 'assistant_delta',
              lifecycle: 'analyzing_intent',
              messageId: payload.messageId,
              delta: payload.delta,
              source: payload.source ?? 'llm',
            });
            return;
          }

          if (payload.type === 'assistant_done') {
            write('assistant_done', {
              type: 'assistant_done',
              lifecycle: 'completed',
              messageId: payload.messageId,
              source: payload.source ?? 'llm',
            });
            return;
          }

          if (payload.type === 'error') {
            write('error', userFacingStreamErrorEvent(payload.message));
            return;
          }

          write('status', {
            type: 'status',
            lifecycle:
              payload.type === 'step'
                ? lifecycleFromStep(payload.step.label)
                : 'received',
            lightStatus:
              payload.type === 'step'
                ? lightStatusFromStep(payload.step.label)
                : '正在理解你的需求',
            taskId: payload.type === 'task' ? payload.taskId : undefined,
          });
          if (payload.type === 'step') {
            write('agent_loop_step', agentLoopStepStreamEvent(payload.step));
            const toolEvent = toolCallStreamEvent(payload.step);
            if (toolEvent) write(toolEvent.type, toolEvent);
            write('progress', progressFromStep(payload.step));
          }
        },
        { signal },
      );
    } catch (error) {
      write('error', userFacingStreamErrorEvent(error));
    } finally {
      res.end();
    }
  }

  private async streamUserFacingMessage(
    req: FitMeetRequest,
    body: SocialAgentRouteMessageBody,
    res: Response,
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

    const signal = this.clientAbortSignal(req, res, 'message_stream');
    let hasAssistantDelta = false;
    try {
      write('status', {
        type: 'status',
        lifecycle: 'received',
        lightStatus: '正在理解你的需求',
      });
      const result = await this.chat.handleMessageStream(
        req.user.id,
        body,
        (payload) => {
          if (payload.type === 'assistant_delta') {
            if (payload.delta.trim()) hasAssistantDelta = true;
            write('assistant_delta', {
              type: 'assistant_delta',
              lifecycle: 'analyzing_intent',
              messageId: payload.messageId,
              delta: payload.delta,
              source: payload.source ?? 'llm',
            });
          }
          if (payload.type === 'assistant_done') {
            write('assistant_done', {
              type: 'assistant_done',
              lifecycle: 'completed',
              messageId: payload.messageId,
              source: payload.source ?? 'llm',
            });
          }
        },
        { signal },
      );
      const userFacing = this.userFacingSanitizer.toUserFacingAgentResponse(
        result,
        result.permissionMode ?? AgentTaskPermissionMode.Confirm,
      );
      const lifecycle = lifecycleFromUserFacingResponse(userFacing);
      if (!hasAssistantDelta) {
        await this.writeFallbackAssistantText(write, {
          text: userFacing.assistantMessage,
          messageId: `agent-message:${result.taskId ?? Date.now()}`,
          traceId: result.traceId,
        });
        hasAssistantDelta = true;
      }
      this.writeApprovalRequiredEvents(write, userFacing.pendingConfirmations);
      write('result', {
        type: 'result',
        lifecycle,
        result: userFacing,
      });
    } catch (error) {
      write('error', userFacingStreamErrorEvent(error));
    } finally {
      res.end();
    }
  }

  private async streamUserFacingAction(
    req: FitMeetRequest,
    taskId: number,
    body: SocialAgentCardActionBody,
    res: Response,
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

    const signal = this.clientAbortSignal(req, res, 'action_stream');
    let hasAssistantDelta = false;
    try {
      write('status', {
        type: 'status',
        lifecycle: 'received',
        lightStatus: '正在理解你的需求',
      });
      const result = await this.chat.performCardActionStream(
        req.user.id,
        taskId,
        body,
        (payload) => {
          if (payload.type === 'assistant_delta') {
            if (payload.delta.trim()) hasAssistantDelta = true;
            write('assistant_delta', {
              type: 'assistant_delta',
              lifecycle: 'analyzing_intent',
              messageId: payload.messageId,
              delta: payload.delta,
              source: payload.source ?? 'llm',
            });
          }
          if (payload.type === 'assistant_done') {
            write('assistant_done', {
              type: 'assistant_done',
              lifecycle: 'completed',
              messageId: payload.messageId,
              source: payload.source ?? 'llm',
            });
          }
          if (payload.type === 'step') {
            write('agent_loop_step', agentLoopStepStreamEvent(payload.step));
            const toolEvent = toolCallStreamEvent(payload.step);
            if (toolEvent) write(toolEvent.type, toolEvent);
            write('progress', progressFromStep(payload.step));
          }
        },
        { signal },
      );
      const userFacing = this.userFacingSanitizer.toUserFacingAgentResponse(
        result,
        result.permissionMode ?? AgentTaskPermissionMode.Confirm,
      );
      const lifecycle = lifecycleFromUserFacingResponse(userFacing);
      if (!hasAssistantDelta) {
        await this.writeFallbackAssistantText(write, {
          text: userFacing.assistantMessage,
          messageId: `agent-action:${result.taskId ?? taskId}`,
          traceId: result.traceId,
        });
        hasAssistantDelta = true;
      }
      this.writeApprovalRequiredEvents(write, userFacing.pendingConfirmations);
      write('result', {
        type: 'result',
        lifecycle,
        result: userFacing,
      });
    } catch (error) {
      write('error', userFacingStreamErrorEvent(error));
    } finally {
      res.end();
    }
  }

  private clientAbortSignal(
    req: FitMeetRequest,
    res: Response,
    streamName: string,
  ): AbortSignal {
    const controller = new AbortController();
    const startedAt = Date.now();
    this.observability?.recordSse({ streamName, status: 'started' });
    const abort = () => {
      if (!res.writableEnded) {
        this.observability?.recordSse({
          streamName,
          status: 'interrupted',
          latencyMs: Date.now() - startedAt,
          failureReason: 'client_disconnected',
        });
      }
      if (!controller.signal.aborted) controller.abort();
    };
    req.on?.('aborted', abort);
    res.on?.('close', abort);
    return controller.signal;
  }

  private writeApprovalRequiredEvents(
    write: (event: string, data: UserFacingStreamEvent) => void,
    pendingConfirmations: Array<{
      id: number | string | null;
      actionType: string;
      summary: string;
      riskLevel: string;
    }>,
  ): void {
    for (const item of pendingConfirmations) {
      write('approval_required', {
        type: 'approval_required',
        lifecycle: 'waiting_confirmation',
        approvalId: item.id,
        actionType: item.actionType,
        summary: item.summary,
        riskLevel: item.riskLevel,
      });
    }
  }

  private async writeFallbackAssistantText(
    write: (event: string, data: UserFacingStreamEvent) => void,
    input: { text?: string | null; messageId: string; traceId?: string | null },
  ): Promise<void> {
    const streaming =
      this.streamingResponses ?? new SocialAgentStreamingResponseService();
    await streaming.streamAssistantText({
      messageId: input.messageId,
      text: input.text ?? '',
      traceId: input.traceId,
      emit: (payload) => {
        if (payload.type === 'assistant_delta') {
          write('assistant_delta', {
            type: 'assistant_delta',
            lifecycle: 'analyzing_intent',
            messageId: payload.messageId,
            delta: payload.delta,
            source: 'fallback',
          });
        }
        if (payload.type === 'assistant_done') {
          write('assistant_done', {
            type: 'assistant_done',
            lifecycle: 'completed',
            messageId: payload.messageId,
            source: 'fallback',
          });
        }
      },
    });
  }

  @Post('tasks/:id/publish-social-request')
  @HttpCode(200)
  publishSocialRequest(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CreateSocialRequestDto & { socialRequestId?: number | null },
  ) {
    return this.candidateCommands.publishDraft(req.user.id, id, body);
  }

  @Post('tasks/:id/replan-run')
  @HttpCode(202)
  replanAndRefresh(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SocialAgentReplanRunBody,
  ) {
    return this.chat.replanAndRefresh(req.user.id, id, body ?? {});
  }

  @Post('tasks/:id/append-context')
  appendContext(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SocialAgentReplanRunBody,
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
    @Body() body: SocialAgentSaveCandidateBody,
  ) {
    return this.candidateCommands.saveCandidate(req.user.id, id, body ?? {});
  }

  @Post('tasks/:id/send-message')
  @HttpCode(200)
  sendMessage(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SocialAgentSendMessageBody,
  ) {
    return this.candidateCommands.sendCandidateMessage(
      req.user.id,
      id,
      body ?? {},
    );
  }

  @Post('tasks/:id/connect-candidate')
  @HttpCode(200)
  connectCandidate(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SocialAgentConnectCandidateBody,
  ) {
    return this.candidateCommands.connectCandidate(req.user.id, id, body ?? {});
  }
}
