import {
  Body,
  Controller,
  Get,
  HttpCode,
  Optional,
  Param,
  ParseIntPipe,
  Post,
  Query,
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
  SocialAgentCheckpointActionBody,
  SocialAgentMessageFeedbackBody,
  SocialAgentReplanRunBody,
  SocialAgentRouteMessageBody,
  SocialAgentRunBody,
  SocialAgentSaveCandidateBody,
  SocialAgentSendMessageBody,
  SocialAgentThreadUpdateBody,
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
import { SocialAgentFinalResponseService } from './social-agent-final-response.service';
import { SocialAgentMessageFeedbackService } from './social-agent-message-feedback.service';
import { SocialAgentThreadService } from './social-agent-thread.service';
import { SocialAgentProfileGateService } from './social-agent-profile-gate.service';
import {
  AgentRunCheckpointService,
  type AgentRunCheckpointAction,
} from './agent-run-checkpoint.service';

type LlmAssistantTextResult = {
  streamed: boolean;
  text: string | null;
};

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
    @Optional()
    private readonly finalResponses?: SocialAgentFinalResponseService,
    @Optional()
    private readonly messageFeedback?: SocialAgentMessageFeedbackService,
    @Optional()
    private readonly threads?: SocialAgentThreadService,
    @Optional()
    private readonly checkpoints?: AgentRunCheckpointService,
    @Optional()
    private readonly profileGate?: SocialAgentProfileGateService,
  ) {}

  @Get('threads')
  listThreads(@Req() req: FitMeetRequest, @Query('limit') limit?: string) {
    return this.requireThreads().list(req.user.id, Number(limit));
  }

  @Post('threads')
  @HttpCode(201)
  createThread(
    @Req() req: FitMeetRequest,
    @Body() body: SocialAgentThreadUpdateBody,
  ) {
    return this.requireThreads().create(req.user.id, body?.title);
  }

  @Get('threads/:id')
  getThread(@Req() req: FitMeetRequest, @Param('id', ParseIntPipe) id: number) {
    return this.requireThreads().get(req.user.id, id);
  }

  @Post('threads/:id')
  @HttpCode(200)
  updateThread(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SocialAgentThreadUpdateBody,
  ) {
    return this.requireThreads().update(
      req.user.id,
      id,
      body?.title,
      body?.branchSnapshot,
      body?.metadata,
    );
  }

  @Post('threads/:id/delete')
  @HttpCode(200)
  deleteThread(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.requireThreads().delete(req.user.id, id);
  }

  @Post('messages/:messageId/feedback')
  @HttpCode(200)
  submitMessageFeedback(
    @Req() req: FitMeetRequest,
    @Param('messageId') messageId: string,
    @Body() body: SocialAgentMessageFeedbackBody,
  ) {
    return this.requireMessageFeedback().submit(req.user.id, {
      messageId,
      value: body?.value === 'negative' ? 'negative' : 'positive',
      reason: body?.reason,
      taskId: body?.taskId,
      runId: body?.runId,
      traceId: body?.traceId,
      source: body?.source ?? 'agent_web',
      metadata: body?.metadata,
    });
  }

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

  @Get('profile-gate')
  getProfileGate(@Req() req: FitMeetRequest) {
    return this.requireProfileGate().getMinimumProfileStatus(req.user.id);
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

  @Post('checkpoints/:id/resume/stream')
  async resumeCheckpointStream(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SocialAgentCheckpointActionBody,
    @Res() res: Response,
  ) {
    return this.streamCheckpointAction(req, id, 'resume', body ?? {}, res);
  }

  @Post('checkpoints/:id/replay/stream')
  async replayCheckpointStream(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SocialAgentCheckpointActionBody,
    @Res() res: Response,
  ) {
    return this.streamCheckpointAction(req, id, 'replay', body ?? {}, res);
  }

  @Post('checkpoints/:id/retry/stream')
  async retryCheckpointStream(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SocialAgentCheckpointActionBody,
    @Res() res: Response,
  ) {
    return this.streamCheckpointAction(req, id, 'retry', body ?? {}, res);
  }

  @Post('checkpoints/:id/steps/:stepId/retry/stream')
  async retryCheckpointStepStream(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('stepId') stepId: string,
    @Body() body: SocialAgentCheckpointActionBody,
    @Res() res: Response,
  ) {
    return this.streamCheckpointStepAction(
      req,
      id,
      stepId,
      'retry',
      body ?? {},
      res,
    );
  }

  @Post('checkpoints/:id/steps/:stepId/replay/stream')
  async replayCheckpointStepStream(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('stepId') stepId: string,
    @Body() body: SocialAgentCheckpointActionBody,
    @Res() res: Response,
  ) {
    return this.streamCheckpointStepAction(
      req,
      id,
      stepId,
      'replay',
      body ?? {},
      res,
    );
  }

  @Post('checkpoints/:id/steps/:stepId/fork/stream')
  async forkCheckpointStepStream(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('stepId') stepId: string,
    @Body() body: SocialAgentCheckpointActionBody,
    @Res() res: Response,
  ) {
    return this.streamCheckpointStepAction(
      req,
      id,
      stepId,
      'fork',
      body ?? {},
      res,
    );
  }

  @Post('checkpoints/:id/fork/stream')
  async forkCheckpointStream(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SocialAgentCheckpointActionBody,
    @Res() res: Response,
  ) {
    return this.streamCheckpointAction(req, id, 'fork', body ?? {}, res);
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
    let hasAssistantDone = false;
    let wroteResult = false;
    try {
      await this.chat.runStream(
        req.user.id,
        body ?? {},
        async (payload) => {
          if (payload.type === 'result') {
            if (wroteResult) return;
            let streamResult = payload.result;
            if (!hasAssistantDelta) {
              const streamed = await this.writeLlmAssistantTextForResult(
                write,
                {
                  rawResult: streamResult as unknown as Record<string, unknown>,
                  userMessage: body?.goal ?? '',
                  messageId: `agent-run:${payload.result.taskId}`,
                  signal,
                },
              );
              hasAssistantDelta = streamed.streamed;
              if (streamed.streamed) {
                hasAssistantDone = true;
                streamResult = {
                  ...streamResult,
                  assistantMessage: streamed.text ?? '',
                  assistantStreamed: true,
                };
              } else {
                const result =
                  this.userFacingSanitizer.toUserFacingAgentResponse(
                    streamResult,
                    resolveUserPermissionMode(body?.permissionMode),
                  );
                await this.writeFallbackAssistantText(write, {
                  text: result.assistantMessage,
                  messageId: `agent-run:${streamResult.taskId}`,
                  traceId: streamResult.traceId,
                });
                hasAssistantDelta = true;
                hasAssistantDone = true;
              }
            }
            const result = this.userFacingSanitizer.toUserFacingAgentResponse(
              streamResult,
              resolveUserPermissionMode(body?.permissionMode),
            );
            const lifecycle = lifecycleFromUserFacingResponse(result);
            this.writeApprovalRequiredEvents(
              write,
              result.pendingConfirmations,
            );
            write('result', {
              type: 'result',
              lifecycle,
              result,
            });
            wroteResult = true;
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
            if (hasAssistantDone) return;
            write('assistant_done', {
              type: 'assistant_done',
              lifecycle: 'completed',
              messageId: payload.messageId,
              source: payload.source ?? 'llm',
            });
            hasAssistantDone = true;
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
      let streamResult = result;
      if (!hasAssistantDelta) {
        const streamed = await this.writeLlmAssistantTextForResult(write, {
          rawResult: streamResult as unknown as Record<string, unknown>,
          userMessage: body.message ?? '',
          messageId: `agent-message:${result.taskId ?? Date.now()}`,
          signal,
        });
        hasAssistantDelta = streamed.streamed;
        if (streamed.streamed) {
          streamResult = {
            ...streamResult,
            assistantMessage: streamed.text ?? '',
            assistantStreamed: true,
          };
        }
      }
      const userFacing = this.userFacingSanitizer.toUserFacingAgentResponse(
        streamResult,
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
      let streamResult = result;
      if (!hasAssistantDelta) {
        const streamed = await this.writeLlmAssistantTextForResult(write, {
          rawResult: streamResult as unknown as Record<string, unknown>,
          userMessage: this.actionUserMessage(body),
          messageId: `agent-action:${result.taskId ?? taskId}`,
          signal,
        });
        hasAssistantDelta = streamed.streamed;
        if (streamed.streamed) {
          streamResult = {
            ...streamResult,
            assistantMessage: streamed.text ?? '',
            assistantStreamed: true,
          };
        }
      }
      const userFacing = this.userFacingSanitizer.toUserFacingAgentResponse(
        streamResult,
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

  private async streamCheckpointAction(
    req: FitMeetRequest,
    checkpointId: number,
    action: AgentRunCheckpointAction,
    body: SocialAgentCheckpointActionBody,
    res: Response,
  ) {
    const plan = await this.requireCheckpoints().prepareAction({
      ownerUserId: req.user.id,
      checkpointId,
      action,
    });
    return this.streamUserFacingMessage(
      req,
      {
        message: plan.resumePrompt,
        taskId: plan.taskId,
        idempotencyKey: plan.idempotencyKey,
        clientContext: {
          source: 'web',
          threadId: plan.threadId,
          checkpointId: plan.checkpointId,
          parentCheckpointId: plan.parentCheckpointId,
          resumeCursor: plan.resumeCursor,
          interrupt: plan.interrupt,
          sourceCheckpointId:
            plan.resumeCursor.parentCheckpointId ?? checkpointId,
          sourceStepId: plan.resumeCursor.stepId ?? null,
          sourceStep: plan.sourceStep,
          stepScope: plan.stepScope,
          sideEffectPolicy: plan.sideEffectPolicy,
          resumeMode: this.resumeModeFor(action, body.decision ?? null),
          resumeIdempotencyKey: plan.idempotencyKey,
          checkpointAction: action,
          decision: body.decision ?? null,
        },
      },
      res,
    );
  }

  private async streamCheckpointStepAction(
    req: FitMeetRequest,
    checkpointId: number,
    stepId: string,
    action: Exclude<AgentRunCheckpointAction, 'resume'>,
    body: SocialAgentCheckpointActionBody,
    res: Response,
  ) {
    const plan = await this.requireCheckpoints().prepareStepAction({
      ownerUserId: req.user.id,
      checkpointId,
      stepId,
      action,
    });
    return this.streamUserFacingMessage(
      req,
      {
        message: plan.resumePrompt,
        taskId: plan.taskId,
        idempotencyKey: plan.idempotencyKey,
        clientContext: {
          source: 'web',
          threadId: plan.threadId,
          checkpointId: plan.checkpointId,
          parentCheckpointId: plan.parentCheckpointId,
          resumeCursor: plan.resumeCursor,
          interrupt: plan.interrupt,
          stepId,
          sourceCheckpointId:
            plan.resumeCursor.parentCheckpointId ?? checkpointId,
          sourceStepId: plan.resumeCursor.stepId ?? stepId,
          sourceStep: plan.sourceStep,
          stepScope: plan.stepScope,
          sideEffectPolicy: plan.sideEffectPolicy,
          resumeMode: this.resumeModeFor(action, body.decision ?? null),
          resumeIdempotencyKey: plan.idempotencyKey,
          checkpointAction: action,
          decision: body.decision ?? null,
        },
      },
      res,
    );
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

  private requireMessageFeedback(): SocialAgentMessageFeedbackService {
    if (!this.messageFeedback) {
      throw new Error('SocialAgentMessageFeedbackService is not configured');
    }
    return this.messageFeedback;
  }

  private requireThreads(): SocialAgentThreadService {
    if (!this.threads) {
      throw new Error('SocialAgentThreadService is not configured');
    }
    return this.threads;
  }

  private requireProfileGate(): SocialAgentProfileGateService {
    if (!this.profileGate) {
      throw new Error('SocialAgentProfileGateService is not configured.');
    }
    return this.profileGate;
  }

  private requireCheckpoints(): AgentRunCheckpointService {
    if (!this.checkpoints) {
      throw new Error('AgentRunCheckpointService is not configured');
    }
    return this.checkpoints;
  }

  private resumeModeFor(
    action: AgentRunCheckpointAction,
    decision: 'approved' | 'rejected' | null,
  ) {
    if (action !== 'resume') return action;
    if (decision === 'approved') return 'resume_after_approval';
    if (decision === 'rejected') return 'resume_after_rejection';
    return 'resume';
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

  private async writeLlmAssistantTextForResult(
    write: (event: string, data: UserFacingStreamEvent) => void,
    input: {
      rawResult: Record<string, unknown>;
      userMessage: string;
      messageId: string;
      signal?: AbortSignal | null;
    },
  ): Promise<LlmAssistantTextResult> {
    if (!this.finalResponses) return { streamed: false, text: null };
    const first = await this.tryWriteLlmAssistantText(write, input);
    if (first.streamed) return first;
    const compactRawResult = this.compactFinalResponseResult(input.rawResult);
    if (compactRawResult === input.rawResult) return first;
    return this.tryWriteLlmAssistantText(write, {
      ...input,
      rawResult: compactRawResult,
    });
  }

  private async tryWriteLlmAssistantText(
    write: (event: string, data: UserFacingStreamEvent) => void,
    input: {
      rawResult: Record<string, unknown>;
      userMessage: string;
      messageId: string;
      signal?: AbortSignal | null;
    },
  ): Promise<LlmAssistantTextResult> {
    let streamed = false;
    const streamedText: string[] = [];
    const fallbackReply = this.stringValue(input.rawResult.assistantMessage);
    const generated = await this.finalResponses?.generate(
      {
        userMessage: input.userMessage,
        intent: this.stringValue(input.rawResult.intent),
        route: input.rawResult,
        agentState: this.stringValue(input.rawResult.action),
        conversationHistory: [],
        memoryContext: null,
        taskContext: {
          taskId: input.rawResult.taskId ?? null,
          permissionMode: input.rawResult.permissionMode ?? null,
          traceId: input.rawResult.traceId ?? null,
        },
        plannerDecision: this.recordValue(input.rawResult.agentLoop),
        toolResults: this.toolResultsFromResult(input.rawResult),
        searchResults: this.recordValue(input.rawResult.searchResults),
        safetyRules: [
          '只输出用户可见回复，不暴露内部 JSON、工具名、traceId 或后端状态。',
          '高风险动作只能说明等待确认，不能说已经执行。',
          '如果前面是澄清、拦截或工具结果，要自然说明当前状态和下一步。',
        ],
        responseGoal: '把当前 Agent 结果改写成自然、连续、可追问的聊天回复。',
        fallbackReply,
      },
      {
        signal: input.signal,
        onDelta: (delta) => {
          if (!delta) return;
          streamed = true;
          streamedText.push(delta);
          write('assistant_delta', {
            type: 'assistant_delta',
            lifecycle: 'analyzing_intent',
            messageId: input.messageId,
            delta,
            source: 'llm',
          });
        },
      },
    );
    if (!streamed) return { streamed: false, text: null };
    write('assistant_done', {
      type: 'assistant_done',
      lifecycle: 'completed',
      messageId: input.messageId,
      source: 'llm',
    });
    return {
      streamed: true,
      text:
        (generated ?? streamedText.join('')).trim() || streamedText.join(''),
    };
  }

  private compactFinalResponseResult(
    result: Record<string, unknown>,
  ): Record<string, unknown> {
    const compact: Record<string, unknown> = {};
    for (const key of [
      'taskId',
      'traceId',
      'permissionMode',
      'assistantMessage',
      'intent',
      'action',
      'agentLoop',
      'pendingApproval',
      'pendingConfirmations',
      'profileUpdateProposal',
      'cards',
      'searchResults',
      'subagentHandoffs',
    ]) {
      if (key in result) compact[key] = result[key];
    }
    return compact;
  }

  private toolResultsFromResult(
    result: Record<string, unknown>,
  ): Array<Record<string, unknown>> {
    const values = [
      result.activityResults,
      result.pendingApproval,
      result.pendingConfirmations,
      result.profileUpdateProposal,
      result.queuedRun,
      result.subagentHandoffs,
      result.cards,
    ];
    return values
      .filter((value) => value !== undefined && value !== null)
      .map((value) => this.recordValue(value) ?? { value });
  }

  private recordValue(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : null;
  }

  private stringValue(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private actionUserMessage(body: SocialAgentCardActionBody): string {
    const record = body as Record<string, unknown>;
    return (
      this.stringValue(record.action) ||
      this.stringValue(record.command) ||
      this.stringValue(record.label) ||
      JSON.stringify(body ?? {})
    );
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
