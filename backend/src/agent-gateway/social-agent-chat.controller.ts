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
import { SocialAgentEventV2Service } from './social-agent-event-v2.service';
import { SocialAgentContextHydratorService } from './social-agent-context-hydrator.service';
import { SocialAgentEventStore } from './social-agent-event-store.service';
import type { SocialAgentEventV2Stage } from './social-agent-event-v2.types';
import { SocialAgentTaskMemoryStateMachineService } from './social-agent-task-memory-state-machine.service';
import type { UserFacingAgentResponse } from './user-facing-agent-response';
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
    @Optional()
    private readonly eventV2?: SocialAgentEventV2Service,
    @Optional()
    private readonly contextHydrator?: SocialAgentContextHydratorService,
    @Optional()
    private readonly eventStore?: SocialAgentEventStore,
    @Optional()
    private readonly taskSlotStateMachine?: SocialAgentTaskMemoryStateMachineService,
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
    const runId = this.runId(
      'run',
      req.user.id,
      body?.taskId ?? body?.clientContext?.threadId,
    );
    const v2 = this.v2Writer(
      write,
      req.user.id,
      body?.taskId ?? null,
      body?.clientContext?.threadId,
      runId,
    );
    let hasAssistantDelta = false;
    let hasAssistantDone = false;
    let wroteResult = false;
    try {
      await v2('run.started', 'detect_social_intent', '正在理解你的需求', {
        state: 'running',
        detail: '我会先识别这是普通聊天，还是需要进入约练/社交流程。',
      });
      await v2('visible_process.delta', 'hydrate_context', '正在读取你的偏好', {
        state: 'running',
        detail:
          '会读取最近对话、当前任务和 Life Graph 摘要，不展示内部思考链。',
      });
      await this.writeEarlySlotInferenceEvents(v2, body?.goal);
      if (
        await this.shouldEmitProfileGateV2(req.user.id, {
          text: body?.goal,
          taskId: body?.taskId ?? null,
          threadId: body?.clientContext?.threadId ?? null,
        })
      ) {
        await this.writeProfileGateV2Event(v2, req.user.id, {
          text: body.goal,
          taskId: body?.taskId ?? null,
          threadId: body?.clientContext?.threadId ?? null,
        });
      }
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
            const resultV2 = this.v2Writer(
              write,
              req.user.id,
              streamResult.taskId,
              body?.clientContext?.threadId ?? streamResult.taskId,
              runId,
            );
            await this.writeResultV2Events(resultV2, result);
            await this.writeContextEvents(
              resultV2,
              req.user.id,
              streamResult.taskId,
              runId,
            );
            await resultV2(
              'run.completed',
              lifecycle === 'waiting_confirmation'
                ? 'approval'
                : 'life_graph_writeback',
              lifecycle === 'waiting_confirmation'
                ? '发送邀请前需要你确认'
                : '这一步处理完成',
              {
                state:
                  lifecycle === 'waiting_confirmation' ? 'waiting' : 'done',
              },
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
            void v2('assistant.delta', 'detect_social_intent', '正在回复', {
              state: 'running',
              payload: {
                delta: payload.delta,
                messageId: payload.messageId ?? null,
              },
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
            void v2('run.failed', 'detect_social_intent', '这次处理没有完成', {
              state: 'failed',
              detail: '我已经保留当前对话，你可以继续补充。',
            });
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
            void v2(
              this.v2ToolType(payload.step.status),
              this.stageFromStep(payload.step.label),
              lightStatusFromStep(payload.step.label),
              {
                state:
                  payload.step.status === 'done'
                    ? 'done'
                    : payload.step.status === 'failed'
                      ? 'failed'
                      : 'running',
                detail: payload.step.detail,
              },
            );
            write('agent_loop_step', agentLoopStepStreamEvent(payload.step));
            const toolEvent = toolCallStreamEvent(payload.step);
            if (toolEvent) write(toolEvent.type, toolEvent);
            write('progress', progressFromStep(payload.step));
          }
        },
        { signal },
      );
    } catch (error) {
      await v2('run.failed', 'detect_social_intent', '这次处理没有完成', {
        state: 'failed',
        detail: '我已经保留当前对话，你可以继续补充。',
      });
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
    const runId = this.runId(
      'message',
      req.user.id,
      body.taskId ?? body.clientContext?.threadId,
    );
    const v2 = this.v2Writer(
      write,
      req.user.id,
      body.taskId ?? null,
      body.clientContext?.threadId,
      runId,
    );
    let hasAssistantDelta = false;
    try {
      await v2('run.started', 'detect_social_intent', '正在理解你的需求', {
        state: 'running',
      });
      await this.writeApprovalResolvedV2Event(v2, body);
      await v2('visible_process.delta', 'hydrate_context', '正在读取你的偏好', {
        state: 'running',
      });
      await this.writeEarlySlotInferenceEvents(v2, body.message);
      if (
        await this.shouldEmitProfileGateV2(req.user.id, {
          text: body.message,
          taskId: body.taskId ?? null,
          threadId: body.clientContext?.threadId ?? null,
        })
      ) {
        await this.writeProfileGateV2Event(v2, req.user.id, {
          text: body.message,
          taskId: body.taskId ?? null,
          threadId: body.clientContext?.threadId ?? null,
        });
      }
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
            void v2('assistant.delta', 'detect_social_intent', '正在回复', {
              state: 'running',
              payload: {
                delta: payload.delta,
                messageId: payload.messageId ?? null,
              },
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
            void v2(
              this.v2ToolType(payload.step.status),
              this.stageFromStep(payload.step.label),
              lightStatusFromStep(payload.step.label),
              {
                state:
                  payload.step.status === 'done'
                    ? 'done'
                    : payload.step.status === 'failed'
                      ? 'failed'
                      : 'running',
                detail: payload.step.detail,
              },
            );
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
      const resultV2 = this.v2Writer(
        write,
        req.user.id,
        result.taskId ?? null,
        body.clientContext?.threadId ?? result.taskId ?? null,
        runId,
      );
      await this.writeResultV2Events(resultV2, userFacing);
      await this.writeContextEvents(resultV2, req.user.id, result.taskId, runId);
      await resultV2(
        'run.completed',
        lifecycle === 'waiting_confirmation'
          ? 'approval'
          : 'life_graph_writeback',
        lifecycle === 'waiting_confirmation'
          ? '发送邀请前需要你确认'
          : '这一步处理完成',
        {
          state: lifecycle === 'waiting_confirmation' ? 'waiting' : 'done',
        },
      );
      write('result', {
        type: 'result',
        lifecycle,
        result: userFacing,
      });
    } catch (error) {
      await v2('run.failed', 'detect_social_intent', '这次处理没有完成', {
        state: 'failed',
        detail: '我已经保留当前对话，你可以继续补充。',
      });
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
    const runId = this.runId('action', req.user.id, taskId);
    const v2 = this.v2Writer(write, req.user.id, taskId, taskId, runId);
    let hasAssistantDelta = false;
    try {
      await v2('run.started', 'detect_social_intent', '正在处理你的选择', {
        state: 'running',
      });
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
            void v2('assistant.delta', 'detect_social_intent', '正在回复', {
              state: 'running',
              payload: {
                delta: payload.delta,
                messageId: payload.messageId ?? null,
              },
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
            void v2(
              this.v2ToolType(payload.step.status),
              this.stageFromStep(payload.step.label),
              lightStatusFromStep(payload.step.label),
              {
                state:
                  payload.step.status === 'done'
                    ? 'done'
                    : payload.step.status === 'failed'
                      ? 'failed'
                      : 'running',
                detail: payload.step.detail,
              },
            );
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
      const resultV2 = this.v2Writer(
        write,
        req.user.id,
        result.taskId ?? taskId,
        result.taskId ?? taskId,
        runId,
      );
      await this.writeResultV2Events(resultV2, userFacing);
      await this.writeContextEvents(
        resultV2,
        req.user.id,
        result.taskId ?? taskId,
        runId,
      );
      await resultV2(
        'run.completed',
        lifecycle === 'waiting_confirmation'
          ? 'approval'
          : 'life_graph_writeback',
        lifecycle === 'waiting_confirmation'
          ? '发送邀请前需要你确认'
          : '这一步处理完成',
        {
          state: lifecycle === 'waiting_confirmation' ? 'waiting' : 'done',
        },
      );
      write('result', {
        type: 'result',
        lifecycle,
        result: userFacing,
      });
    } catch (error) {
      await v2('run.failed', 'detect_social_intent', '这次处理没有完成', {
        state: 'failed',
        detail: '我已经保留当前对话，你可以继续补充。',
      });
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

  private runId(prefix: string, userId: number, taskOrThread: unknown): string {
    return [
      'social-codex',
      prefix,
      String(userId),
      this.runIdPart(taskOrThread),
      String(Date.now()),
      Math.random().toString(36).slice(2, 8),
    ].join(':');
  }

  private runIdPart(value: unknown): string {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value))
      return String(value);
    return 'new';
  }

  private v2Writer(
    write: (event: string, data: UserFacingStreamEvent) => void,
    userId: number,
    taskId: number | null,
    threadId: string | number | null | undefined,
    runId: string,
  ) {
    return async (
      type: Parameters<SocialAgentEventV2Service['envelope']>[0]['type'],
      stage: SocialAgentEventV2Stage,
      title: string,
      options: {
        state: 'running' | 'done' | 'waiting' | 'failed';
        detail?: string;
        payload?: Record<string, unknown>;
      },
    ) => {
      const event = (this.eventV2 ?? new SocialAgentEventV2Service()).envelope({
        type,
        userId,
        threadId,
        taskId,
        runId,
        stage,
        visibility: 'user_visible',
        display: {
          title,
          detail: options.detail,
          state: options.state,
        },
        payload: options.payload,
      });
      write(event.type, event);
      if (event.type !== 'assistant.delta') {
        await this.eventStore?.appendEventByTaskId(userId, event.taskId, event);
      }
      return event;
    };
  }

  private async writeContextEvents(
    v2: ReturnType<SocialAgentChatController['v2Writer']>,
    userId: number,
    taskId: number | null,
    runId: string,
  ): Promise<void> {
    if (!taskId) return;
    const context = await this.contextHydrator
      ?.hydrateContext({ userId, taskId, threadId: taskId })
      .catch(() => null);
    const slots = context?.taskSlots ?? {};
    const lifeGraphFactProposals = context?.lifeGraphFactProposals ?? [];
    const lifeGraphFactDisplaySummaries =
      context?.lifeGraphFactDisplaySummaries ?? [];
    const lifeGraphGovernanceSummary = context?.lifeGraphGovernanceSummary ?? {
      total: lifeGraphFactProposals.length,
      autoSaveCount: 0,
      confirmationRequiredCount: 0,
      blockedCount: 0,
      sensitiveCount: 0,
      expiringFactKeys: [],
    };
    const summary = Object.entries(slots)
      .filter(([, slot]) => slot && typeof slot === 'object' && 'value' in slot)
      .map(([key, slot]) => [key, (slot as { value?: unknown }).value]);
    const previousSlotValues = await this.previousSlotEventValues(
      userId,
      taskId,
    );
    const newSlots = Object.fromEntries(
      summary.filter(([key]) => !previousSlotValues.has(String(key))),
    );
    const modifiedSlots = Object.fromEntries(
      summary.filter(([key, value]) => {
        const previous = previousSlotValues.get(String(key));
        return previous !== undefined && previous !== String(value);
      }),
    );
    if (summary.length > 0) {
      if (Object.keys(newSlots).length > 0) {
        await v2('slot.completed', 'slot_filling', '已记录你的关键信息', {
          state: 'done',
          detail: Object.values(newSlots)
            .map((value) => String(value))
            .filter(Boolean)
            .slice(0, 4)
            .join('、'),
          payload: { slots: this.pickSlots(slots, Object.keys(newSlots)) },
        });
      }
      if (Object.keys(modifiedSlots).length > 0) {
        await v2('slot.filled', 'slot_filling', '已更新你的关键信息', {
          state: 'done',
          detail: Object.values(modifiedSlots)
            .map((value) => String(value))
            .filter(Boolean)
            .slice(0, 4)
            .join('、'),
          payload: {
            slots: this.pickSlots(slots, Object.keys(modifiedSlots)),
          },
        });
      }
      if (
        Object.keys(newSlots).length > 0 ||
        Object.keys(modifiedSlots).length > 0
      ) {
        await v2('memory.saved', 'hydrate_context', '这些信息下次会继续使用', {
          state: 'done',
          detail: lifeGraphFactProposals.length
            ? `已整理 ${lifeGraphGovernanceSummary.total} 条长期偏好建议：${lifeGraphGovernanceSummary.autoSaveCount} 条可低风险保留，${lifeGraphGovernanceSummary.confirmationRequiredCount} 条需你确认。`
            : undefined,
          payload: {
            taskId,
            runId,
            saved: ['task_slots', 'recent_messages'],
            lifeGraphFacts: lifeGraphFactDisplaySummaries,
            lifeGraphGovernanceSummary,
          },
        });
      }
    }
  }

  private async writeEarlySlotInferenceEvents(
    v2: ReturnType<SocialAgentChatController['v2Writer']>,
    message: unknown,
  ): Promise<void> {
    if (!this.taskSlotStateMachine || typeof message !== 'string') return;
    const slots = this.taskSlotStateMachine.extractSlotsFromUserMessage(message);
    const summary = Object.entries(slots)
      .filter(([, slot]) => slot?.value && slot.state !== 'inferred')
      .map(([key, slot]) => [key, slot.value]);
    if (summary.length === 0) return;
    await v2('slot.filled', 'slot_filling', '已记录你补充的信息', {
      state: 'done',
      detail: summary
        .map(([, value]) => String(value))
        .filter(Boolean)
        .slice(0, 4)
        .join('、'),
      payload: {
        slots: this.pickSlots(slots, summary.map(([key]) => String(key))),
        provisional: true,
      },
    });
  }

  private async previousSlotEventValues(
    userId: number,
    taskId: number,
  ): Promise<Map<string, string>> {
    const values = new Map<string, string>();
    const events = await this.eventStore
      ?.listSocialCodexEventsByTask(taskId, userId, { take: 2000 })
      .catch(() => []);
    for (const event of events ?? []) {
      if (event.type !== 'slot.completed' && event.type !== 'slot.filled') {
        continue;
      }
      const slots = this.recordValue(event.payload?.slots);
      if (!slots) continue;
      for (const [key, slot] of Object.entries(slots)) {
        const value = this.recordValue(slot)?.value;
        if (value != null) values.set(key, String(value));
      }
    }
    return values;
  }

  private pickSlots(
    slots: Record<string, unknown>,
    keys: string[],
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(slots, key)) {
        out[key] = slots[key];
      }
    }
    return out;
  }

  private async writeProfileGateV2Event(
    v2: ReturnType<SocialAgentChatController['v2Writer']>,
    userId: number,
    input?: {
      text?: string | null;
      taskId?: number | null;
      threadId?: string | number | null;
    },
  ): Promise<void> {
    if (!this.profileGate) return;
    const taskId =
      this.positiveNumber(input?.taskId) ?? this.positiveNumber(input?.threadId);
    const context = taskId
      ? await this.contextHydrator
          ?.hydrateContext({ userId, taskId, threadId: taskId })
          .catch(() => null)
      : null;
    const status = await (typeof this.profileGate.getMinimumProfileStatusWithTaskSlots ===
    'function'
      ? this.profileGate.getMinimumProfileStatusWithTaskSlots(userId, context?.taskSlots)
      : this.profileGate.getMinimumProfileStatus(userId)
    ).catch(() => null);
    if (!status) return;
    await v2(
      status.passed ? 'tool.done' : 'tool.progress',
      'profile_gate',
      status.passed ? '画像门槛已满足' : '匹配前还差一点人物画像',
      {
        state: status.passed ? 'done' : 'waiting',
        detail: status.passed
          ? '普通聊天可以继续；进入匹配、发布或邀请前也已满足最低画像要求。'
          : `还需要补充：${status.nextActions.slice(0, 3).join('、') || '城市、兴趣、时间或边界'}`,
        payload: {
          passed: status.passed,
          missing: status.missing,
          profileCompleteness: status.profileCompleteness,
          canEnterMatchPool: status.canEnterMatchPool,
        },
      },
    );
  }

  private async shouldEmitProfileGateV2(
    userId: number,
    input: {
      text?: string | null;
      taskId?: number | null;
      threadId?: string | number | null;
    },
  ): Promise<boolean> {
    if (this.hasExplicitSocialExecutionIntent(input.text)) return true;
    const taskId =
      this.positiveNumber(input.taskId) ?? this.positiveNumber(input.threadId);
    if (!taskId || !this.contextHydrator) return false;
    const context = await this.contextHydrator
      .hydrateContext({ userId, taskId, threadId: taskId })
      .catch(() => null);
    const slots = context?.taskSlots;
    if (!slots || typeof slots !== 'object') return false;
    return ['activity', 'time_window', 'location_text', 'geo_area'].some(
      (key) => {
        const slot = this.recordValue((slots as Record<string, unknown>)[key]);
        return Boolean(slot?.value);
      },
    );
  }

  private hasExplicitSocialExecutionIntent(text: unknown): boolean {
    const normalized =
      typeof text === 'string' ? text.trim().toLowerCase() : '';
    if (!normalized) return false;
    if (
      /(找人|找.*搭子|搭子|约练|约人|约局|活动|认识新朋友|匹配|推荐.*人|候选|加好友|发邀请|邀请|发布到发现|发到发现|discover|meet)/i.test(
        normalized,
      )
    ) {
      return true;
    }
    const hasActivity =
      /(散步|跑步|羽毛球|篮球|健身|徒步|爬山|骑行|游泳|瑜伽|飞盘|网球|乒乓|咖啡|吃饭|电影)/i.test(
        normalized,
      );
    const hasTime =
      /(周末|今天|明天|今晚|上午|下午|晚上|中午|早上|[0-9一二三四五六七八九十]+点)/i.test(
        normalized,
      );
    const hasPlace =
      /(附近|大学|公园|商场|体育馆|健身房|校区|区|市|青岛|上海|北京|深圳|广州|杭州|成都|武汉|南京)/i.test(
        normalized,
      );
    return hasActivity && hasTime && hasPlace;
  }

  private async writeApprovalResolvedV2Event(
    v2: ReturnType<SocialAgentChatController['v2Writer']>,
    body: SocialAgentRouteMessageBody,
  ): Promise<void> {
    const decision = body.clientContext?.decision;
    if (decision !== 'approved' && decision !== 'rejected') return;
    const checkpointId =
      this.positiveNumber(body.clientContext?.checkpointId) ??
      this.positiveNumber(body.clientContext?.sourceCheckpointId) ??
      this.positiveNumber(body.clientContext?.resumeCursor?.checkpointId);
    await v2(
      'approval.resolved',
      'approval',
      decision === 'approved' ? '已确认这一步' : '已取消这一步',
      {
        state: 'done',
        detail:
          decision === 'approved'
            ? '我会从同一个任务继续处理，不会重新询问已确认的信息。'
            : '我不会执行刚才的高风险动作，会继续保留当前对话。',
        payload: {
          decision,
          checkpointId,
          resumeCursor: this.publicResumeCursor(
            body.clientContext?.resumeCursor,
          ),
          checkpointAction: body.clientContext?.checkpointAction ?? null,
        },
      },
    );
  }

  private async writeResultV2Events(
    v2: ReturnType<SocialAgentChatController['v2Writer']>,
    result: UserFacingAgentResponse,
  ): Promise<void> {
    if (
      result.safeStatus.boundaryNotes.length > 0 ||
      result.safeStatus.level !== 'low'
    ) {
      await v2('safety_check.done', 'safety_filter', '已检查安全边界', {
        state: result.safeStatus.blocked ? 'failed' : 'done',
        detail:
          result.safeStatus.boundaryNotes.slice(0, 2).join('；') ||
          `风险等级：${result.safeStatus.level}`,
        payload: {
          level: result.safeStatus.level,
          blocked: result.safeStatus.blocked,
          requiredConfirmations: result.safeStatus.requiredConfirmations,
        },
      });
    }

    const candidateCount = result.cards.filter((card) =>
      this.isCandidateCard(card),
    ).length;
    if (candidateCount > 0) {
      await v2(
        'candidate_search.started',
        'search_candidates',
        '正在筛选公开可发现的人',
        {
          state: 'running',
          detail: '只会使用公开资料、公开动态、活动报名和公开约练意图。',
        },
      );
      await v2(
        'candidate_search.done',
        'rank_candidates',
        `找到 ${candidateCount} 个公开可发现的人`,
        {
          state: 'done',
          detail: '我只会展示公开可发现的信息，联系对方前仍需要你确认。',
          payload: { candidateCount },
        },
      );
    }

    const activityCount = result.cards.filter((card) =>
      this.isActivityCard(card),
    ).length;
    if (activityCount > 0) {
      await v2(
        'candidate_search.started',
        'search_candidates',
        '正在查找可参考活动',
        {
          state: 'running',
          detail: '会先整理公开活动，再让你决定是否继续。',
        },
      );
      await v2(
        'candidate_search.done',
        'search_candidates',
        `找到 ${activityCount} 个可参考活动`,
        {
          state: 'done',
          detail: '你可以先查看详情，再决定是否发起邀请。',
          payload: { activityCount },
        },
      );
    }

    const opportunity = result.cards.find((card) =>
      this.isOpportunityCard(card),
    );
    if (opportunity) {
      await v2(
        'opportunity_card.created',
        'create_opportunity_card',
        '这张约练卡可以发布到发现',
        {
          state: 'done',
          detail: this.cardTitle(opportunity) || '发布前会先让你确认公开内容。',
          payload: {
            cardId: this.cardId(opportunity),
            schemaType: this.cardSchemaType(opportunity),
          },
        },
      );
    }

    if (result.lifeGraphWritebackProposal) {
      await v2('memory.saved', 'life_graph_writeback', '已整理画像变化建议', {
        state: 'waiting',
        detail: '确认前不会写入长期 Life Graph，你可以修改或忽略。',
        payload: {
          proposal: result.lifeGraphWritebackProposal,
        },
      });
    }

    for (const item of result.pendingConfirmations) {
      const itemPayload = this.recordValue(item.payload)
        ? (item.payload as Record<string, unknown>)
        : {};
      const checkpointId =
        this.positiveNumber(itemPayload.checkpointId) ??
        this.positiveNumber(itemPayload.resumeCheckpointId) ??
        result.runtime?.checkpointId ??
        null;
      const dryRunPreview = this.recordValue(itemPayload.dryRunPreview)
        ? itemPayload.dryRunPreview
        : this.recordValue(itemPayload.socialCodex) &&
            this.recordValue(
              (itemPayload.socialCodex as Record<string, unknown>)
                .dryRunPreview,
            )
          ? (itemPayload.socialCodex as Record<string, unknown>).dryRunPreview
          : null;
      await v2('approval.required', 'approval', '发送邀请前需要你确认', {
        state: 'waiting',
        detail: item.summary,
        payload: {
          approvalId: item.id,
          checkpointId,
          actionType: item.actionType,
          riskLevel: item.riskLevel,
          ...(dryRunPreview ? { dryRunPreview } : {}),
          ...itemPayload,
        },
      });
    }
  }

  private isCandidateCard(card: unknown): boolean {
    return (
      this.cardType(card) === 'candidate_card' ||
      this.cardSchemaType(card) === 'social_match.candidate'
    );
  }

  private isActivityCard(card: unknown): boolean {
    const schema = this.cardSchemaType(card);
    return (
      schema === 'social_match.activity' ||
      this.cardType(card) === 'activity_card'
    );
  }

  private isOpportunityCard(card: unknown): boolean {
    const schema = this.cardSchemaType(card);
    if (
      schema === 'opportunity.card' ||
      schema === 'social_request.opportunity'
    ) {
      return true;
    }
    const record = this.recordValue(card);
    const data = this.recordValue(record?.data);
    return Boolean(data?.opportunity || data?.opportunityCard === true);
  }

  private cardType(card: unknown): string {
    const record = this.recordValue(card);
    return this.stringValue(record?.type);
  }

  private cardSchemaType(card: unknown): string {
    const record = this.recordValue(card);
    const data = this.recordValue(record?.data);
    return (
      this.stringValue(record?.schemaType) || this.stringValue(data?.schemaType)
    );
  }

  private cardTitle(card: unknown): string {
    const record = this.recordValue(card);
    const data = this.recordValue(record?.data);
    const opportunity = this.recordValue(data?.opportunity);
    return (
      this.stringValue(record?.title) ||
      this.stringValue(data?.title) ||
      this.stringValue(opportunity?.title)
    );
  }

  private cardId(card: unknown): string | null {
    const record = this.recordValue(card);
    return this.stringValue(record?.id) || null;
  }

  private stageFromStep(label: string): SocialAgentEventV2Stage {
    if (/Life Graph|画像|profile/i.test(label)) return 'profile_gate';
    if (/筛选|候选|匹配|search|candidate/i.test(label))
      return 'search_candidates';
    if (/时间|排除|rank/i.test(label)) return 'rank_candidates';
    if (/安全|边界|guardrail|risk/i.test(label)) return 'safety_filter';
    if (/开场白|message|opener/i.test(label)) return 'generate_opener';
    if (/确认|approval|confirm/i.test(label)) return 'approval';
    if (/活动|约练|activity/i.test(label)) return 'create_opportunity_card';
    return 'detect_social_intent';
  }

  private v2ToolType(status: 'pending' | 'running' | 'done' | 'failed') {
    if (status === 'done') return 'tool.done' as const;
    if (status === 'failed') return 'run.failed' as const;
    return status === 'pending'
      ? ('tool.started' as const)
      : ('tool.progress' as const);
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

  private positiveNumber(value: unknown): number | null {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  }

  private publicResumeCursor(value: unknown): Record<string, unknown> | null {
    const cursor = this.recordValue(value);
    if (!cursor) return null;
    const out: Record<string, unknown> = {};
    const threadId = this.stringValue(cursor.threadId);
    const action = this.stringValue(cursor.action);
    const stepId = this.stringValue(cursor.stepId);
    const checkpointId = this.positiveNumber(cursor.checkpointId);
    const parentCheckpointId = this.positiveNumber(cursor.parentCheckpointId);
    if (threadId) out.threadId = threadId;
    if (checkpointId) out.checkpointId = checkpointId;
    out.parentCheckpointId = parentCheckpointId;
    if (action) out.action = action;
    if (stepId) out.stepId = stepId;
    return out;
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
