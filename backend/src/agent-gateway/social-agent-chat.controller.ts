import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
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

import { cleanDisplayText } from '../common/display-text.util';
import { CreateSocialRequestDto } from '../social-requests/dto/create-social-request.dto';
import { AgentTaskPermissionMode } from './entities/agent-task.entity';
import { UserFacingResponseSanitizerService } from './response-quality/user-facing-response-sanitizer.service';
import type {
  FitMeetRequest,
  SocialAgentConnectCandidateBody,
  SocialAgentCheckpointActionBody,
  SocialAgentFeedbackEventBody,
  SocialAgentMessageFeedbackBody,
  SocialAgentReplanRunBody,
  SocialAgentRouteMessageBody,
  SocialAgentRunBody,
  SocialAgentSaveCandidateBody,
  SocialAgentSendMessageBody,
  SocialAgentThreadUpdateBody,
  SocialAgentUserInterestEventBody,
} from './social-agent-chat.controller.types';
import {
  lightStatusFromStep,
  lifecycleFromStep,
  lifecycleFromUserFacingResponse,
  progressFromStep,
  resolveUserPermissionMode,
  agentLoopStepStreamEvent,
  toolCallStreamEvent,
  shouldStreamFallbackAssistantText,
  userFacingStreamErrorEvent,
  type UserFacingStreamEvent,
} from './social-agent-chat-stream.presenter';
import { SocialAgentChatService } from './social-agent-chat.service';
import type {
  SocialAgentAssistantMessageSource,
  SocialAgentChatRunResult,
  SocialAgentIntentRouteResult,
} from './social-agent-chat.types';
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
import { SocialAgentTaskMemoryStateMachineService } from './social-agent-task-memory-state-machine.service';
import { SocialAgentMessageLogService } from './social-agent-message-log.service';
import { SocialAgentTaskLifecycleService } from './social-agent-task-lifecycle.service';
import { SocialAgentUserInterestEventService } from './social-agent-user-interest-event.service';
import { SocialAgentFeedbackEventService } from './social-agent-feedback-event.service';
import type { SocialAgentUserInterestEventType } from './entities/social-agent-user-interest-event.entity';
import {
  SocialCodexEventPipelineService,
  type SocialCodexEventWriter,
} from './social-codex-event-pipeline.service';
import { parseSocialAgentThreadTaskId } from './social-agent-thread-id.util';
import {
  AgentRunCheckpointService,
  type AgentRunCheckpointAction,
} from './agent-run-checkpoint.service';
import { buildRunScopedAssistantMessageId } from './social-agent-stream-message-id.util';
import { readSocialAgentStoredRun } from './social-agent-chat-run.presenter';

type LlmAssistantTextResult = {
  streamed: boolean;
  text: string | null;
  source?: SocialAgentAssistantMessageSource;
};

type StreamUserFacingMessageOptions = {
  prepared?: boolean;
  signal?: AbortSignal;
  runIdPrefix?: string;
};

type UserFacingConversationIntent = 'conversation' | 'social' | 'approval';

type InitialRunCopyInput = {
  conversationIntent?: UserFacingConversationIntent | null;
  clientContext?: {
    conversationIntent?: UserFacingConversationIntent | null;
  } | null;
};

type FinalResponseHydratedContext = {
  conversationHistory: Array<Record<string, unknown>>;
  memoryContext: Record<string, unknown> | null;
  taskContextPatch: Record<string, unknown>;
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
    @Optional()
    private readonly socialCodexEvents?: SocialCodexEventPipelineService,
    @Optional()
    private readonly messageLog?: SocialAgentMessageLogService,
    @Optional()
    private readonly taskLifecycle?: SocialAgentTaskLifecycleService,
    @Optional()
    private readonly interestEvents?: SocialAgentUserInterestEventService,
    @Optional()
    private readonly agentFeedbackEvents?: SocialAgentFeedbackEventService,
  ) {}

  private initialRunCopy(input?: InitialRunCopyInput | null) {
    const intent =
      input?.conversationIntent ??
      input?.clientContext?.conversationIntent ??
      null;
    if (intent === 'conversation') {
      return {
        title: '正在理解你的需求',
        detail: '会直接回复，不触发社交工具。',
      };
    }
    if (intent === 'approval') {
      return {
        title: '正在恢复待确认步骤',
        detail: '确认前不会执行高风险动作。',
      };
    }
    return {
      title: '正在理解你的需求',
      detail: '会结合最近对话和已确认偏好，整理成自然回复。',
    };
  }

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
  getThread(@Req() req: FitMeetRequest, @Param('id') id: string) {
    return this.requireThreads().get(req.user.id, this.threadTaskIdParam(id));
  }

  @Post('threads/:id')
  @HttpCode(200)
  updateThread(
    @Req() req: FitMeetRequest,
    @Param('id') id: string,
    @Body() body: SocialAgentThreadUpdateBody,
  ) {
    return this.requireThreads().update(
      req.user.id,
      this.threadTaskIdParam(id),
      body?.title,
      body?.branchSnapshot,
      body?.metadata,
    );
  }

  @Post('threads/:id/delete')
  @HttpCode(200)
  deleteThread(@Req() req: FitMeetRequest, @Param('id') id: string) {
    return this.requireThreads().delete(
      req.user.id,
      this.threadTaskIdParam(id),
    );
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

  @Post('interest-events')
  @HttpCode(200)
  async recordInterestEvent(
    @Req() req: FitMeetRequest,
    @Body() body: SocialAgentUserInterestEventBody,
  ) {
    const eventType = this.interestEventType(body?.eventType);
    if (!eventType) {
      throw new BadRequestException(
        'Unsupported social agent interest event type',
      );
    }
    const event = await this.requireInterestEvents().recordEvent({
      ownerUserId: req.user.id,
      agentTaskId: this.positiveNumber(body?.taskId),
      eventType,
      targetUserId: this.positiveNumber(body?.targetUserId),
      candidateRecordId: this.positiveNumber(body?.candidateRecordId),
      socialRequestId: this.positiveNumber(body?.socialRequestId),
      activityId: this.positiveNumber(body?.activityId),
      weight: Number.isFinite(body?.weight) ? Number(body?.weight) : null,
      activityTags: this.stringList(body?.activityTags),
      candidatePreferenceTags: this.stringList(body?.candidatePreferenceTags),
      city: this.stringValue(body?.city),
      locationText: this.stringValue(body?.locationText),
      timeWindow: this.stringValue(body?.timeWindow),
      source: this.stringValue(body?.source) || 'agent_web',
      dedupeKey: this.stringValue(body?.dedupeKey),
      metadata: this.recordValue(body?.metadata),
    });
    return {
      ok: true,
      recorded: Boolean(event),
      eventId: event?.id ?? null,
    };
  }

  @Post('feedback-events')
  @HttpCode(200)
  submitAgentFeedbackEvent(
    @Req() req: FitMeetRequest,
    @Body() body: SocialAgentFeedbackEventBody,
  ) {
    return this.requireAgentFeedbackEvents().submit(req.user.id, body ?? {});
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
  @Header('X-FitMeet-Agent-Compatibility', 'legacy-json')
  @Header('X-FitMeet-Agent-Preferred-Protocol', 'social-agent-event-v2')
  async routeMessage(
    @Req() req: FitMeetRequest,
    @Body() body: SocialAgentRouteMessageBody,
  ) {
    await this.recordInlineCorrectionIfNeeded(req.user.id, body ?? {});
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
  @Header('X-FitMeet-Agent-Compatibility', 'legacy-json')
  @Header('X-FitMeet-Agent-Preferred-Protocol', 'social-agent-event-v2')
  async handleMessage(
    @Req() req: FitMeetRequest,
    @Body() body: SocialAgentRouteMessageBody,
  ) {
    await this.recordInlineCorrectionIfNeeded(req.user.id, body ?? {});
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
  @Header('X-FitMeet-Agent-Compatibility', 'legacy-json')
  @Header('X-FitMeet-Agent-Preferred-Protocol', 'social-agent-event-v2')
  async handleTaskMessage(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SocialAgentRouteMessageBody,
  ) {
    await this.recordInlineCorrectionIfNeeded(req.user.id, {
      ...(body ?? {}),
      taskId: id,
    });
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
  @Header('X-FitMeet-Agent-Compatibility', 'legacy-json')
  @Header('X-FitMeet-Agent-Preferred-Protocol', 'social-agent-event-v2')
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
    this.prepareSseResponse(res);

    const write = (event: string, data: unknown) =>
      this.writeSseEvent(res, event, data);

    const signal = this.clientAbortSignal(req, res, 'run_stream');
    const runId = this.runId(
      'legacy-run',
      req.user.id,
      body?.taskId ?? body?.clientContext?.threadId,
    );
    const initialThreadId = this.eventThreadId(
      body?.taskId,
      body?.clientContext?.threadId,
    );
    const socialCodexEvents = this.socialCodexEventPipeline();
    const v2 = socialCodexEvents.createWriter({
      write: write as (event: string, data: UserFacingStreamEvent) => void,
      userId: req.user.id,
      taskId: body?.taskId ?? null,
      threadId: initialThreadId,
      runId,
    });
    let wroteResult = false;
    let taskBoundInitialTraceTaskId = body?.taskId ?? null;
    try {
      const initialCopy = this.initialRunCopy(body);
      await socialCodexEvents.writeRunStarted(
        v2,
        initialCopy.title,
        initialCopy.detail,
      );
      await socialCodexEvents.writeHydrateContext(v2);
      await socialCodexEvents.writeEarlySlotInferenceEvents(v2, body?.goal, {
        taskId: body?.taskId ?? null,
        threadId: initialThreadId,
      });
      await socialCodexEvents.writeProfileGateIfNeeded(v2, req.user.id, {
        text: body?.goal,
        taskId: body?.taskId ?? null,
        threadId: initialThreadId,
      });
      await this.chat.runStream(
        req.user.id,
        body ?? {},
        async (payload) => {
          if (
            payload.type === 'task' &&
            taskBoundInitialTraceTaskId !== payload.taskId
          ) {
            taskBoundInitialTraceTaskId = payload.taskId;
            await this.writeTaskBoundInitialTrace({
              socialCodexEvents,
              write: write as (
                event: string,
                data: UserFacingStreamEvent,
              ) => void,
              userId: req.user.id,
              taskId: payload.taskId,
              threadId: this.eventThreadId(
                payload.taskId,
                body?.clientContext?.threadId,
              ),
              runId,
              text: body?.goal,
            });
          }
          if (payload.type === 'assistant_delta') {
            const messageId = this.legacyAssistantMessageId({
              messageId: payload.messageId,
              taskId: taskBoundInitialTraceTaskId ?? body?.taskId ?? null,
              runId,
            });
            write('assistant_delta', {
              ...payload,
              messageId,
            });
            await this.writeSocialCodexAssistantDelta({
              socialCodexEvents,
              v2,
              delta: payload.delta,
              messageId,
              source: payload.source,
            });
            return;
          }
          if (payload.type === 'assistant_done') {
            const messageId = this.legacyAssistantMessageId({
              messageId: payload.messageId,
              taskId: taskBoundInitialTraceTaskId ?? body?.taskId ?? null,
              runId,
            });
            write('assistant_done', {
              ...payload,
              messageId,
            });
            return;
          }
          write(payload.type, payload);
          if (payload.type === 'step') {
            await socialCodexEvents.writeStep(v2, payload.step);
          }
          if (payload.type === 'result' && !wroteResult) {
            const userFacing =
              this.userFacingSanitizer.toUserFacingAgentResponse(
                payload.result,
                resolveUserPermissionMode(body?.permissionMode),
              );
            const lifecycle = lifecycleFromUserFacingResponse(userFacing);
            const resultV2 = socialCodexEvents.createWriter({
              write: write as (
                event: string,
                data: UserFacingStreamEvent,
              ) => void,
              userId: req.user.id,
              taskId: payload.result.taskId ?? body?.taskId ?? null,
              threadId: this.eventThreadId(
                payload.result.taskId ?? body?.taskId,
                body?.clientContext?.threadId,
              ),
              runId,
            });
            await socialCodexEvents.writeResultEvents(resultV2, userFacing);
            await socialCodexEvents.writeContextEvents(
              resultV2,
              req.user.id,
              payload.result.taskId ?? body?.taskId ?? null,
              runId,
              this.eventThreadId(
                payload.result.taskId ?? body?.taskId,
                body?.clientContext?.threadId,
              ),
            );
            await socialCodexEvents.writeRunCompleted(resultV2, lifecycle);
            wroteResult = true;
          }
        },
        { signal },
      );
    } catch (error) {
      await socialCodexEvents.writeRunFailed(v2);
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
    this.prepareSseResponse(res);

    const write = (event: string, data: UserFacingStreamEvent) =>
      this.writeSseEvent(res, event, data);

    const signal = this.clientAbortSignal(req, res, 'user_run_stream');
    const runId = this.runId(
      'run',
      req.user.id,
      body?.taskId ?? body?.clientContext?.threadId,
    );
    const initialThreadId = this.eventThreadId(
      body?.taskId,
      body?.clientContext?.threadId,
    );
    const socialCodexEvents = this.socialCodexEventPipeline();
    const v2 = socialCodexEvents.createWriter({
      write,
      userId: req.user.id,
      taskId: body?.taskId ?? null,
      threadId: initialThreadId,
      runId,
    });
    let hasAssistantDelta = false;
    let hasAssistantDone = false;
    let wroteResult = false;
    let streamedAssistantMessageId: string | null = null;
    let taskBoundInitialTraceTaskId = body?.taskId ?? null;
    try {
      const initialCopy = this.initialRunCopy(body);
      await socialCodexEvents.writeRunStarted(
        v2,
        initialCopy.title,
        initialCopy.detail,
      );
      await socialCodexEvents.writeHydrateContext(v2);
      await socialCodexEvents.writeEarlySlotInferenceEvents(v2, body?.goal, {
        taskId: body?.taskId ?? null,
        threadId: initialThreadId,
      });
      await socialCodexEvents.writeProfileGateIfNeeded(v2, req.user.id, {
        text: body?.goal,
        taskId: body?.taskId ?? null,
        threadId: initialThreadId,
      });
      await this.chat.runStream(
        req.user.id,
        body ?? {},
        async (payload) => {
          if (
            payload.type === 'task' &&
            taskBoundInitialTraceTaskId !== payload.taskId
          ) {
            taskBoundInitialTraceTaskId = payload.taskId;
            await this.writeTaskBoundInitialTrace({
              socialCodexEvents,
              write,
              userId: req.user.id,
              taskId: payload.taskId,
              threadId: this.eventThreadId(
                payload.taskId,
                body?.clientContext?.threadId,
              ),
              runId,
              text: body?.goal,
            });
          }
          if (payload.type === 'result') {
            if (wroteResult) return;
            let streamResult = payload.result;
            const assistantMessageId =
              streamedAssistantMessageId ??
              buildRunScopedAssistantMessageId({
                taskId: payload.result.taskId ?? body?.taskId ?? null,
                runId,
              });
            if (!hasAssistantDelta) {
              const assistantV2 = socialCodexEvents.createWriter({
                write,
                userId: req.user.id,
                taskId: payload.result.taskId ?? body?.taskId ?? null,
                threadId: this.eventThreadId(
                  payload.result.taskId ?? body?.taskId,
                  body?.clientContext?.threadId,
                ),
                runId,
              });
              const streamed = await this.writeLlmAssistantTextForResult(
                write,
                {
                  rawResult: streamResult as unknown as Record<string, unknown>,
                  userMessage: body?.goal ?? '',
                  messageId: assistantMessageId,
                  userId: req.user.id,
                  taskId: payload.result.taskId ?? body?.taskId ?? null,
                  threadId: this.eventThreadId(
                    payload.result.taskId ?? body?.taskId,
                    body?.clientContext?.threadId,
                  ),
                  signal,
                  socialCodexEvents,
                  v2: assistantV2,
                },
              );
              hasAssistantDelta = streamed.streamed;
              if (streamed.streamed) {
                hasAssistantDone = true;
                streamResult = {
                  ...streamResult,
                  assistantMessage: streamed.text ?? '',
                  assistantStreamed: true,
                  assistantMessageSource: 'llm',
                };
              } else {
                const result =
                  this.userFacingSanitizer.toUserFacingAgentResponse(
                    streamResult,
                    resolveUserPermissionMode(body?.permissionMode),
                  );
                const wroteFallback = await this.writeFallbackAssistantText(
                  write,
                  {
                    text: result.assistantMessage,
                    messageId: assistantMessageId,
                    traceId: streamResult.traceId,
                    socialCodexEvents,
                    v2: assistantV2,
                  },
                );
                hasAssistantDelta = wroteFallback;
                hasAssistantDone = wroteFallback;
                streamResult = wroteFallback
                  ? {
                      ...streamResult,
                      assistantMessageSource: 'fallback',
                    }
                  : {
                      ...streamResult,
                      assistantMessageSource: streamed.source ?? 'fallback',
                    };
              }
            }
            streamResult = this.withAssistantRuntimeAnchor(
              streamResult,
              runId,
              assistantMessageId,
            );
            await this.persistFinalRunAssistantMemory(
              req.user.id,
              streamResult,
            );
            const result = this.userFacingSanitizer.toUserFacingAgentResponse(
              streamResult,
              resolveUserPermissionMode(body?.permissionMode),
            );
            const lifecycle = lifecycleFromUserFacingResponse(result);
            this.writeApprovalRequiredEvents(
              write,
              result.pendingConfirmations,
            );
            const resultV2 = socialCodexEvents.createWriter({
              write,
              userId: req.user.id,
              taskId: streamResult.taskId,
              threadId: this.eventThreadId(
                streamResult.taskId,
                body?.clientContext?.threadId,
              ),
              runId,
            });
            await socialCodexEvents.writeResultEvents(resultV2, result);
            await socialCodexEvents.writeContextEvents(
              resultV2,
              req.user.id,
              streamResult.taskId,
              runId,
              this.eventThreadId(
                streamResult.taskId,
                body?.clientContext?.threadId,
              ),
            );
            await socialCodexEvents.writeRunCompleted(resultV2, lifecycle);
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
            const messageId = this.legacyAssistantMessageId({
              messageId: payload.messageId,
              taskId: taskBoundInitialTraceTaskId ?? body?.taskId ?? null,
              runId,
            });
            streamedAssistantMessageId = messageId;
            write('assistant_delta', {
              type: 'assistant_delta',
              lifecycle: 'analyzing_intent',
              messageId,
              delta: payload.delta,
              source: payload.source ?? 'llm',
            });
            void this.writeSocialCodexAssistantDelta({
              socialCodexEvents,
              v2,
              delta: payload.delta,
              messageId,
              source: payload.source,
            });
            return;
          }

          if (payload.type === 'assistant_done') {
            if (hasAssistantDone) return;
            const messageId = this.legacyAssistantMessageId({
              messageId: payload.messageId ?? streamedAssistantMessageId,
              taskId: taskBoundInitialTraceTaskId ?? body?.taskId ?? null,
              runId,
            });
            streamedAssistantMessageId = messageId;
            write('assistant_done', {
              type: 'assistant_done',
              lifecycle: 'completed',
              messageId,
              source: payload.source ?? 'llm',
            });
            hasAssistantDone = true;
            return;
          }

          if (payload.type === 'error') {
            void socialCodexEvents.writeRunFailed(v2);
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
            threadId:
              payload.type === 'task'
                ? (this.eventThreadId(
                    payload.taskId,
                    body?.clientContext?.threadId,
                  ) ?? undefined)
                : undefined,
          });
          if (payload.type === 'step') {
            void socialCodexEvents.writeStep(v2, payload.step);
            write('agent_loop_step', agentLoopStepStreamEvent(payload.step));
            const toolEvent = toolCallStreamEvent(payload.step);
            if (toolEvent) write(toolEvent.type, toolEvent);
            write('progress', progressFromStep(payload.step));
          }
        },
        { signal, deferAssistantMessageLog: true },
      );
    } catch (error) {
      await socialCodexEvents.writeRunFailed(v2);
      write('error', userFacingStreamErrorEvent(error));
    } finally {
      res.end();
    }
  }

  private async streamUserFacingMessage(
    req: FitMeetRequest,
    body: SocialAgentRouteMessageBody,
    res: Response,
    options: StreamUserFacingMessageOptions = {},
  ) {
    if (!options.prepared) this.prepareSseResponse(res);

    const write = (event: string, data: UserFacingStreamEvent) =>
      this.writeSseEvent(res, event, data);

    const signal =
      options.signal ?? this.clientAbortSignal(req, res, 'message_stream');
    const runId = this.runId(
      options.runIdPrefix ?? 'message',
      req.user.id,
      body.taskId ?? body.clientContext?.threadId,
    );
    const initialThreadId = this.eventThreadId(
      body.taskId,
      body.clientContext?.threadId,
    );
    const socialCodexEvents = this.socialCodexEventPipeline();
    const v2 = socialCodexEvents.createWriter({
      write,
      userId: req.user.id,
      taskId: body.taskId ?? null,
      threadId: initialThreadId,
      runId,
    });
    let hasAssistantDelta = false;
    let streamedAssistantMessageId: string | null = null;
    let taskBoundInitialTraceTaskId = body.taskId ?? null;
    try {
      await this.recordInlineCorrectionIfNeeded(req.user.id, body);
      const initialCopy = this.initialRunCopy(body);
      await socialCodexEvents.writeRunStarted(
        v2,
        initialCopy.title,
        initialCopy.detail,
      );
      await socialCodexEvents.writeApprovalResolved(v2, {
        decision: body.clientContext?.decision,
        approvalId:
          body.clientContext?.approvalId ??
          body.clientContext?.interrupt?.payload?.approvalRequestId ??
          null,
        checkpointId: body.clientContext?.checkpointId,
        sourceCheckpointId: body.clientContext?.sourceCheckpointId,
        resumeCursor: body.clientContext?.resumeCursor ?? null,
        checkpointAction: body.clientContext?.checkpointAction ?? null,
      });
      await socialCodexEvents.writeHydrateContext(v2);
      await socialCodexEvents.writeEarlySlotInferenceEvents(v2, body.message, {
        taskId: body.taskId ?? null,
        threadId: initialThreadId,
      });
      await socialCodexEvents.writeProfileGateIfNeeded(v2, req.user.id, {
        text: body.message,
        taskId: body.taskId ?? null,
        threadId: initialThreadId,
      });
      write('status', {
        type: 'status',
        lifecycle: 'received',
        lightStatus: initialCopy.title,
        taskId: body.taskId ?? undefined,
        threadId: initialThreadId ?? undefined,
      });
      const result = await this.chat.handleMessageStream(
        req.user.id,
        body,
        (payload) => {
          if (payload.type === 'assistant_delta') {
            if (payload.delta.trim()) hasAssistantDelta = true;
            const messageId = this.legacyAssistantMessageId({
              messageId: payload.messageId,
              taskId: taskBoundInitialTraceTaskId ?? body.taskId ?? null,
              runId,
            });
            streamedAssistantMessageId = messageId;
            write('assistant_delta', {
              type: 'assistant_delta',
              lifecycle: 'analyzing_intent',
              messageId,
              delta: payload.delta,
              source: payload.source ?? 'llm',
            });
            void this.writeSocialCodexAssistantDelta({
              socialCodexEvents,
              v2,
              delta: payload.delta,
              messageId,
              source: payload.source,
            });
          }
          if (payload.type === 'assistant_done') {
            const messageId = this.legacyAssistantMessageId({
              messageId: payload.messageId ?? streamedAssistantMessageId,
              taskId: taskBoundInitialTraceTaskId ?? body.taskId ?? null,
              runId,
            });
            streamedAssistantMessageId = messageId;
            write('assistant_done', {
              type: 'assistant_done',
              lifecycle: 'completed',
              messageId,
              source: payload.source ?? 'llm',
            });
          }
          if (payload.type === 'step') {
            void socialCodexEvents.writeStep(v2, payload.step);
            write('agent_loop_step', agentLoopStepStreamEvent(payload.step));
            const toolEvent = toolCallStreamEvent(payload.step);
            if (toolEvent) write(toolEvent.type, toolEvent);
            write('progress', progressFromStep(payload.step));
          }
        },
        { signal, deferAssistantMessageLog: true },
      );
      let streamResult:
        | SocialAgentIntentRouteResult
        | SocialAgentChatRunResult = result;
      let routeAssistantAlreadyPersistedByRun = false;
      if (result.taskId && taskBoundInitialTraceTaskId !== result.taskId) {
        taskBoundInitialTraceTaskId = result.taskId;
        await this.writeTaskBoundInitialTrace({
          socialCodexEvents,
          write,
          userId: req.user.id,
          taskId: result.taskId,
          threadId: this.eventThreadId(
            result.taskId,
            body.clientContext?.threadId,
          ),
          runId,
          text: body.message,
        });
      }
      const queuedRunResult = await this.waitForQueuedRunResult({
        ownerUserId: req.user.id,
        result,
        signal,
        maxWaitMs: this.queuedRunInlineWaitMs(body),
      });
      if (queuedRunResult) {
        streamResult = queuedRunResult;
        routeAssistantAlreadyPersistedByRun = true;
        write('status', {
          type: 'status',
          lifecycle: 'completed',
          lightStatus: '已找到可继续处理的结果',
          taskId: queuedRunResult.taskId ?? result.taskId ?? undefined,
          threadId:
            this.eventThreadId(
              queuedRunResult.taskId ?? result.taskId,
              body.clientContext?.threadId,
            ) ?? undefined,
        });
      }
      const assistantV2 = socialCodexEvents.createWriter({
        write,
        userId: req.user.id,
        taskId: streamResult.taskId ?? result.taskId ?? body.taskId ?? null,
        threadId: this.eventThreadId(
          streamResult.taskId ?? result.taskId ?? body.taskId,
          body.clientContext?.threadId,
        ),
        runId,
      });
      if (!hasAssistantDelta) {
        const assistantMessageId = buildRunScopedAssistantMessageId({
          taskId: streamResult.taskId ?? result.taskId ?? body.taskId ?? null,
          runId,
        });
        if (this.shouldUseDeterministicRouteReply(streamResult)) {
          streamResult = {
            ...streamResult,
            assistantMessageSource:
              streamResult.assistantMessageSource ?? 'deterministic_route',
          };
        } else {
          const streamed = await this.writeLlmAssistantTextForResult(write, {
            rawResult: streamResult as unknown as Record<string, unknown>,
            userMessage: body.message ?? '',
            messageId: assistantMessageId,
            userId: req.user.id,
            taskId: streamResult.taskId ?? result.taskId ?? body.taskId ?? null,
            threadId: this.eventThreadId(
              streamResult.taskId ?? result.taskId ?? body.taskId,
              body.clientContext?.threadId,
            ),
            signal,
            socialCodexEvents,
            v2: assistantV2,
          });
          hasAssistantDelta = streamed.streamed;
          if (streamed.streamed) {
            streamedAssistantMessageId = assistantMessageId;
            streamResult = {
              ...streamResult,
              assistantMessage: streamed.text ?? '',
              assistantStreamed: true,
              assistantMessageSource: 'llm',
            };
          } else {
            streamResult = {
              ...streamResult,
              assistantMessageSource: streamed.source ?? 'fallback',
            };
          }
        }
      }
      const assistantMessageId =
        streamedAssistantMessageId ??
        buildRunScopedAssistantMessageId({
          taskId: streamResult.taskId ?? result.taskId ?? body.taskId ?? null,
          runId,
        });
      streamResult = this.withAssistantRuntimeAnchor(
        streamResult,
        runId,
        assistantMessageId,
      );
      const userFacing = this.userFacingSanitizer.toUserFacingAgentResponse(
        streamResult,
        result.permissionMode ?? AgentTaskPermissionMode.Confirm,
      );
      const lifecycle = lifecycleFromUserFacingResponse(userFacing);
      if (!hasAssistantDelta) {
        const wroteFallback = await this.writeFallbackAssistantText(write, {
          text: userFacing.assistantMessage,
          messageId: assistantMessageId,
          traceId: result.traceId,
          socialCodexEvents,
          v2: assistantV2,
        });
        hasAssistantDelta = wroteFallback;
      }
      if (!routeAssistantAlreadyPersistedByRun) {
        await this.persistFinalRouteAssistantMemory(
          req.user.id,
          streamResult as SocialAgentIntentRouteResult,
        );
      }
      this.writeApprovalRequiredEvents(write, userFacing.pendingConfirmations);
      const resultV2 = socialCodexEvents.createWriter({
        write,
        userId: req.user.id,
        taskId: streamResult.taskId ?? result.taskId ?? null,
        threadId: this.eventThreadId(
          streamResult.taskId ?? result.taskId,
          body.clientContext?.threadId,
        ),
        runId,
      });
      await socialCodexEvents.writeResultEvents(resultV2, userFacing);
      await socialCodexEvents.writeContextEvents(
        resultV2,
        req.user.id,
        streamResult.taskId ?? result.taskId,
        runId,
        this.eventThreadId(
          streamResult.taskId ?? result.taskId,
          body.clientContext?.threadId,
        ),
      );
      await socialCodexEvents.writeRunCompleted(resultV2, lifecycle);
      write('result', {
        type: 'result',
        lifecycle,
        result: userFacing,
      });
    } catch (error) {
      await socialCodexEvents.writeRunFailed(v2);
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
    this.prepareSseResponse(res);

    const write = (event: string, data: UserFacingStreamEvent) =>
      this.writeSseEvent(res, event, data);

    const signal = this.clientAbortSignal(req, res, 'action_stream');
    const runId = this.runId('action', req.user.id, taskId);
    const actionThreadId =
      this.eventThreadId(taskId, body.clientContext?.threadId) ??
      `agent-task:${taskId}`;
    const socialCodexEvents = this.socialCodexEventPipeline();
    const v2 = socialCodexEvents.createWriter({
      write,
      userId: req.user.id,
      taskId,
      threadId: actionThreadId,
      runId,
    });
    let hasAssistantDelta = false;
    let streamedAssistantMessageId: string | null = null;
    try {
      await socialCodexEvents.writeRunStarted(
        v2,
        '正在确认你的选择',
        '会先确认当前动作和安全边界，再继续处理。',
      );
      await socialCodexEvents.writeHydrateContext(v2);
      write('status', {
        type: 'status',
        lifecycle: 'received',
        lightStatus: '正在理解你的需求',
        taskId,
        threadId: actionThreadId,
      });
      const result = await this.chat.performCardActionStream(
        req.user.id,
        taskId,
        body,
        (payload) => {
          if (payload.type === 'assistant_delta') {
            if (payload.delta.trim()) hasAssistantDelta = true;
            const messageId = this.legacyAssistantMessageId({
              messageId: payload.messageId,
              taskId,
              runId,
            });
            streamedAssistantMessageId = messageId;
            write('assistant_delta', {
              type: 'assistant_delta',
              lifecycle: 'analyzing_intent',
              messageId,
              delta: payload.delta,
              source: payload.source ?? 'llm',
            });
            void this.writeSocialCodexAssistantDelta({
              socialCodexEvents,
              v2,
              delta: payload.delta,
              messageId,
              source: payload.source,
            });
          }
          if (payload.type === 'assistant_done') {
            const messageId = this.legacyAssistantMessageId({
              messageId: payload.messageId ?? streamedAssistantMessageId,
              taskId,
              runId,
            });
            streamedAssistantMessageId = messageId;
            write('assistant_done', {
              type: 'assistant_done',
              lifecycle: 'completed',
              messageId,
              source: payload.source ?? 'llm',
            });
          }
          if (payload.type === 'step') {
            void socialCodexEvents.writeStep(v2, payload.step);
            write('agent_loop_step', agentLoopStepStreamEvent(payload.step));
            const toolEvent = toolCallStreamEvent(payload.step);
            if (toolEvent) write(toolEvent.type, toolEvent);
            write('progress', progressFromStep(payload.step));
          }
        },
        { signal },
      );
      let streamResult = result;
      const assistantV2 = socialCodexEvents.createWriter({
        write,
        userId: req.user.id,
        taskId: result.taskId ?? taskId,
        threadId: actionThreadId,
        runId,
      });
      if (!hasAssistantDelta) {
        const assistantMessageId = buildRunScopedAssistantMessageId({
          taskId: result.taskId ?? taskId,
          runId,
        });
        if (this.shouldUseDeterministicCardActionReply(body, streamResult)) {
          streamResult = {
            ...streamResult,
            assistantMessageSource: 'deterministic_action',
          };
        } else {
          const streamed = await this.writeLlmAssistantTextForResult(write, {
            rawResult: streamResult as unknown as Record<string, unknown>,
            userMessage: this.actionUserMessage(body),
            messageId: assistantMessageId,
            userId: req.user.id,
            taskId: result.taskId ?? taskId,
            threadId: actionThreadId,
            signal,
            socialCodexEvents,
            v2: assistantV2,
          });
          hasAssistantDelta = streamed.streamed;
          if (streamed.streamed) {
            streamedAssistantMessageId = assistantMessageId;
            streamResult = {
              ...streamResult,
              assistantMessage: streamed.text ?? '',
              assistantStreamed: true,
              assistantMessageSource: 'llm',
            };
          } else {
            streamResult = {
              ...streamResult,
              assistantMessageSource: streamed.source ?? 'fallback',
            };
          }
        }
      }
      const assistantMessageId =
        streamedAssistantMessageId ??
        buildRunScopedAssistantMessageId({
          taskId: result.taskId ?? taskId,
          runId,
        });
      streamResult = this.withAssistantRuntimeAnchor(
        streamResult,
        runId,
        assistantMessageId,
      );
      const userFacing = this.userFacingSanitizer.toUserFacingAgentResponse(
        streamResult,
        result.permissionMode ?? AgentTaskPermissionMode.Confirm,
      );
      const lifecycle = lifecycleFromUserFacingResponse(userFacing);
      if (!hasAssistantDelta) {
        const wroteFallback = await this.writeFallbackAssistantText(write, {
          text: userFacing.assistantMessage,
          messageId: assistantMessageId,
          traceId: result.traceId,
          socialCodexEvents,
          v2: assistantV2,
        });
        hasAssistantDelta = wroteFallback;
      }
      await this.persistFinalRouteAssistantMemory(req.user.id, streamResult, {
        replaceLastAssistantTurn: true,
      });
      this.writeApprovalRequiredEvents(write, userFacing.pendingConfirmations);
      const resultV2 = socialCodexEvents.createWriter({
        write,
        userId: req.user.id,
        taskId: result.taskId ?? taskId,
        threadId: actionThreadId,
        runId,
      });
      await socialCodexEvents.writeResultEvents(resultV2, userFacing);
      await socialCodexEvents.writeContextEvents(
        resultV2,
        req.user.id,
        result.taskId ?? taskId,
        runId,
        actionThreadId,
      );
      await socialCodexEvents.writeRunCompleted(resultV2, lifecycle);
      write('result', {
        type: 'result',
        lifecycle,
        result: userFacing,
      });
    } catch (error) {
      await socialCodexEvents.writeRunFailed(v2);
      write('error', userFacingStreamErrorEvent(error));
    } finally {
      res.end();
    }
  }

  private prepareSseResponse(res: Response) {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
  }

  private writeSseEvent(res: Response, event: string, data: unknown) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    (res as Response & { flush?: () => void }).flush?.();
  }

  private async streamCheckpointAction(
    req: FitMeetRequest,
    checkpointId: number,
    action: AgentRunCheckpointAction,
    body: SocialAgentCheckpointActionBody,
    res: Response,
  ) {
    this.prepareSseResponse(res);
    const write = (event: string, data: UserFacingStreamEvent) =>
      this.writeSseEvent(res, event, data);
    const signal = this.clientAbortSignal(
      req,
      res,
      `checkpoint_${action}_stream`,
    );
    const socialCodexEvents = this.socialCodexEventPipeline();
    const runId = this.runId(`checkpoint-${action}`, req.user.id, checkpointId);
    const v2 = socialCodexEvents.createWriter({
      write,
      userId: req.user.id,
      taskId: null,
      threadId: `checkpoint:${checkpointId}`,
      runId,
    });
    try {
      await socialCodexEvents.writeRunStarted(
        v2,
        this.checkpointActionTitle(action),
        '会接着刚才的进度继续处理，不会重复执行已经完成的动作。',
      );
      await socialCodexEvents.writeCheckpointRestore(v2, action);
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
            approvalId: plan.interrupt?.payload?.approvalRequestId ?? null,
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
        { prepared: true, signal, runIdPrefix: `checkpoint-${action}` },
      );
    } catch (error) {
      await socialCodexEvents.writeRunFailed(v2);
      write('error', userFacingStreamErrorEvent(error));
      res.end();
    }
  }

  private async streamCheckpointStepAction(
    req: FitMeetRequest,
    checkpointId: number,
    stepId: string,
    action: Exclude<AgentRunCheckpointAction, 'resume'>,
    body: SocialAgentCheckpointActionBody,
    res: Response,
  ) {
    this.prepareSseResponse(res);
    const write = (event: string, data: UserFacingStreamEvent) =>
      this.writeSseEvent(res, event, data);
    const signal = this.clientAbortSignal(
      req,
      res,
      `checkpoint_step_${action}_stream`,
    );
    const socialCodexEvents = this.socialCodexEventPipeline();
    const runId = this.runId(
      `checkpoint-step-${action}`,
      req.user.id,
      `${checkpointId}:${stepId}`,
    );
    const v2 = socialCodexEvents.createWriter({
      write,
      userId: req.user.id,
      taskId: null,
      threadId: `checkpoint:${checkpointId}`,
      runId,
    });
    try {
      await socialCodexEvents.writeRunStarted(
        v2,
        this.checkpointActionTitle(action),
        '会接着刚才的进度继续处理，不会重复执行已经完成的动作。',
      );
      await socialCodexEvents.writeCheckpointRestore(v2, action);
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
            approvalId: plan.interrupt?.payload?.approvalRequestId ?? null,
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
        {
          prepared: true,
          signal,
          runIdPrefix: `checkpoint-step-${action}`,
        },
      );
    } catch (error) {
      await socialCodexEvents.writeRunFailed(v2);
      write('error', userFacingStreamErrorEvent(error));
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

  private requireMessageFeedback(): SocialAgentMessageFeedbackService {
    if (!this.messageFeedback) {
      throw new Error('SocialAgentMessageFeedbackService is not configured');
    }
    return this.messageFeedback;
  }

  private requireInterestEvents(): SocialAgentUserInterestEventService {
    if (!this.interestEvents) {
      throw new Error('SocialAgentUserInterestEventService is not configured');
    }
    return this.interestEvents;
  }

  private requireAgentFeedbackEvents(): SocialAgentFeedbackEventService {
    if (!this.agentFeedbackEvents) {
      throw new Error('SocialAgentFeedbackEventService is not configured');
    }
    return this.agentFeedbackEvents;
  }

  private async recordInlineCorrectionIfNeeded(
    ownerUserId: number,
    body: SocialAgentRouteMessageBody,
  ) {
    const message = cleanDisplayText(body?.message, '').trim();
    if (!this.isUserCorrectionMessage(message)) return;
    const taskId = parseSocialAgentThreadTaskId(
      body?.taskId ?? body?.clientContext?.threadId,
    );
    if (!taskId) return;
    if (!this.agentFeedbackEvents) return;
    await this.agentFeedbackEvents
      .submit(ownerUserId, {
        taskId,
        feedbackType: 'task_correction',
        reasonCode: 'other',
        freeText: message,
        source: 'agent_chat_correction',
        metadata: {
          conversationIntent: body?.conversationIntent ?? null,
          threadId: body?.clientContext?.threadId ?? null,
        },
      })
      .catch(() => undefined);
  }

  private isUserCorrectionMessage(message: string): boolean {
    return (
      /不是\s*[^，,。；;]{1,40}\s*[，, ]?\s*是\s*[^，,。；;]{1,40}/.test(
        message,
      ) ||
      /不要太远|别太远|太远|近一点|附近就好|附近即可|附近优先/.test(message) ||
      /不要公开|不想公开|别公开|只私下|不要发到发现/.test(message)
    );
  }

  private interestEventType(
    value: unknown,
  ): SocialAgentUserInterestEventType | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    const allowed = new Set<SocialAgentUserInterestEventType>([
      'view_profile',
      'save_candidate',
      'skip_candidate',
      'more_like_this',
      'generate_opener',
      'send_invite',
      'invite_accepted',
      'connect_candidate',
      'discover_click',
      'activity_complete',
      'review_positive',
      'review_negative',
      'chat_topic',
    ]);
    return allowed.has(normalized as SocialAgentUserInterestEventType)
      ? (normalized as SocialAgentUserInterestEventType)
      : null;
  }

  private requireThreads(): SocialAgentThreadService {
    if (!this.threads) {
      throw new Error('SocialAgentThreadService is not configured');
    }
    return this.threads;
  }

  private threadTaskIdParam(value: unknown): number {
    const taskId = parseSocialAgentThreadTaskId(value);
    if (!taskId) {
      throw new BadRequestException('Invalid social agent thread id');
    }
    return taskId;
  }

  private eventThreadId(
    taskId: unknown,
    fallbackThreadId?: unknown,
  ): string | number | null {
    const parsedTaskId = parseSocialAgentThreadTaskId(taskId);
    if (parsedTaskId) return `agent-task:${parsedTaskId}`;
    const parsedFallbackTaskId = parseSocialAgentThreadTaskId(fallbackThreadId);
    if (parsedFallbackTaskId) return `agent-task:${parsedFallbackTaskId}`;
    if (typeof fallbackThreadId === 'string' && fallbackThreadId.trim()) {
      return fallbackThreadId.trim();
    }
    if (
      typeof fallbackThreadId === 'number' &&
      Number.isFinite(fallbackThreadId)
    ) {
      return fallbackThreadId;
    }
    return null;
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

  private checkpointActionTitle(action: AgentRunCheckpointAction) {
    if (action === 'fork') return '正在换一种方案';
    if (action === 'replay') return '正在重新整理';
    if (action === 'retry') return '正在继续处理';
    return '正在恢复进度';
  }

  private queuedRunInlineWaitMs(body: SocialAgentRouteMessageBody): number {
    const intent =
      body.conversationIntent ?? body.clientContext?.conversationIntent ?? null;
    if (intent === 'conversation') return 0;
    return 18_000;
  }

  private async waitForQueuedRunResult(input: {
    ownerUserId: number;
    result: SocialAgentIntentRouteResult;
    signal?: AbortSignal | null;
    maxWaitMs: number;
  }): Promise<SocialAgentChatRunResult | null> {
    if (input.maxWaitMs <= 0) return null;
    const queuedRun = input.result.queuedRun;
    if (!queuedRun?.runId || !queuedRun.taskId || !this.taskLifecycle) {
      return null;
    }

    const deadline = Date.now() + input.maxWaitMs;
    while (Date.now() < deadline) {
      if (input.signal?.aborted) return null;
      const task = await this.taskLifecycle
        .assertTaskOwner(queuedRun.taskId, input.ownerUserId)
        .catch(() => null);
      if (!task) return null;
      const stored = readSocialAgentStoredRun(
        task,
        queuedRun.runId,
        (_id, label) => label,
      );
      if (
        stored?.status === 'completed' &&
        this.isChatRunResult(stored.result)
      ) {
        return stored.result;
      }
      if (stored?.status === 'failed') return null;
      await this.sleep(400, input.signal);
    }
    return null;
  }

  private isChatRunResult(value: unknown): value is SocialAgentChatRunResult {
    if (!this.recordValue(value)) return false;
    const result = value as Partial<SocialAgentChatRunResult>;
    return (
      typeof result.assistantMessage === 'string' &&
      typeof result.taskId === 'number' &&
      Array.isArray(result.visibleSteps) &&
      Array.isArray(result.candidates)
    );
  }

  private sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
    if (signal?.aborted) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
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

  private socialCodexEventPipeline(): SocialCodexEventPipelineService {
    return (
      this.socialCodexEvents ??
      new SocialCodexEventPipelineService(
        this.eventV2,
        this.eventStore,
        this.taskSlotStateMachine,
        this.contextHydrator,
        this.profileGate,
      )
    );
  }

  private async writeTaskBoundInitialTrace(input: {
    socialCodexEvents: SocialCodexEventPipelineService;
    write: (event: string, data: UserFacingStreamEvent) => void;
    userId: number;
    taskId: number;
    threadId: string | number | null;
    runId: string;
    text?: string | null;
  }) {
    const writer = input.socialCodexEvents.createWriter({
      write: input.write,
      userId: input.userId,
      taskId: input.taskId,
      threadId: input.threadId ?? `agent-task:${input.taskId}`,
      runId: input.runId,
    });
    await input.socialCodexEvents.writeRunStarted(writer);
    await input.socialCodexEvents.writeHydrateContext(writer);
    await input.socialCodexEvents.writeEarlySlotInferenceEvents(
      writer,
      input.text,
      {
        taskId: input.taskId,
        threadId: input.threadId ?? `agent-task:${input.taskId}`,
      },
    );
    await input.socialCodexEvents.writeProfileGateIfNeeded(
      writer,
      input.userId,
      {
        text: input.text,
        taskId: input.taskId,
        threadId: input.threadId ?? `agent-task:${input.taskId}`,
      },
    );
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

  private legacyAssistantMessageId(input: {
    messageId?: string | null;
    taskId?: number | string | null;
    runId: string;
  }): string {
    const raw = cleanDisplayText(input.messageId, '').trim();
    if (raw && raw.includes(input.runId)) return raw;
    return buildRunScopedAssistantMessageId({
      taskId: input.taskId ?? null,
      runId: input.runId,
      fallback: raw || null,
    });
  }

  private async writeFallbackAssistantText(
    write: (event: string, data: UserFacingStreamEvent) => void,
    input: {
      text?: string | null;
      messageId: string;
      traceId?: string | null;
      socialCodexEvents?: SocialCodexEventPipelineService | null;
      v2?: SocialCodexEventWriter | null;
    },
  ): Promise<boolean> {
    if (!shouldStreamFallbackAssistantText(input.text)) return false;
    const streaming =
      this.streamingResponses ?? new SocialAgentStreamingResponseService();
    return streaming.streamAssistantText({
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
      userId: number;
      taskId?: number | string | null;
      threadId?: string | number | null;
      signal?: AbortSignal | null;
      socialCodexEvents?: SocialCodexEventPipelineService | null;
      v2?: SocialCodexEventWriter | null;
    },
  ): Promise<LlmAssistantTextResult> {
    if (!this.finalResponses) return { streamed: false, text: null };
    const deterministicSource = this.deterministicAssistantMessageSource(
      input.rawResult,
    );
    if (deterministicSource) {
      return { streamed: false, text: null, source: deterministicSource };
    }
    const hydratedContext = await this.hydrateFinalResponseContext({
      userId: input.userId,
      taskId:
        input.taskId ?? this.identifierValue(input.rawResult.taskId) ?? null,
      threadId:
        input.threadId ??
        this.identifierValue(input.rawResult.threadId) ??
        null,
    });
    const first = await this.tryWriteLlmAssistantText(write, {
      ...input,
      ...hydratedContext,
    });
    if (first.streamed) return first;
    const compactRawResult = this.compactFinalResponseResult(input.rawResult);
    if (compactRawResult === input.rawResult) return first;
    return this.tryWriteLlmAssistantText(write, {
      ...input,
      ...hydratedContext,
      rawResult: compactRawResult,
    });
  }

  private async tryWriteLlmAssistantText(
    write: (event: string, data: UserFacingStreamEvent) => void,
    input: {
      rawResult: Record<string, unknown>;
      userMessage: string;
      messageId: string;
      conversationHistory: Array<Record<string, unknown>>;
      memoryContext: Record<string, unknown> | null;
      taskContextPatch: Record<string, unknown>;
      signal?: AbortSignal | null;
      socialCodexEvents?: SocialCodexEventPipelineService | null;
      v2?: SocialCodexEventWriter | null;
    },
  ): Promise<LlmAssistantTextResult> {
    let streamed = false;
    const streamedText: string[] = [];
    const rawFallbackReply = this.stringValue(input.rawResult.assistantMessage);
    const fallbackReply = shouldStreamFallbackAssistantText(rawFallbackReply)
      ? rawFallbackReply
      : '';
    const generated = await this.finalResponses?.generate(
      {
        userMessage: input.userMessage,
        intent: this.stringValue(input.rawResult.intent),
        route: input.rawResult,
        agentState: this.stringValue(input.rawResult.action),
        conversationHistory: input.conversationHistory,
        memoryContext: input.memoryContext,
        taskContext: {
          ...input.taskContextPatch,
          taskId:
            input.rawResult.taskId ?? input.taskContextPatch.taskId ?? null,
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
          if (input.socialCodexEvents && input.v2) {
            void this.writeSocialCodexAssistantDelta({
              socialCodexEvents: input.socialCodexEvents,
              v2: input.v2,
              delta,
              messageId: input.messageId,
              source: 'llm',
            });
          }
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
      source: 'llm',
    };
  }

  private deterministicAssistantMessageSource(
    result: Record<string, unknown>,
  ): SocialAgentAssistantMessageSource | null {
    const source = this.stringValue(result.assistantMessageSource);
    return source === 'deterministic_route' || source === 'deterministic_action'
      ? source
      : null;
  }

  private shouldUseDeterministicRouteReply(
    result: SocialAgentIntentRouteResult | SocialAgentChatRunResult,
  ): boolean {
    const record = result as unknown as Record<string, unknown>;
    const source = this.stringValue(record.assistantMessageSource);
    if (source === 'deterministic_route' || source === 'deterministic_action') {
      return true;
    }

    const deterministicCardSchemaTypes = new Set([
      'loop.choice',
      'clarification.binary',
      'workout.intake',
      'workout.draft',
      'social_match.candidate',
      'social_match.activity',
      'meet_loop.timeline',
      'safety.approval',
    ]);
    const cards = Array.isArray(record.cards) ? record.cards : [];
    return cards.some((card) => {
      if (!card || typeof card !== 'object') return false;
      const cardRecord = card as Record<string, unknown>;
      const dataRecord = this.recordValue(cardRecord.data);
      const schemaType =
        this.stringValue(cardRecord.schemaType) ||
        this.stringValue(dataRecord?.schemaType);
      return deterministicCardSchemaTypes.has(schemaType);
    });
  }

  private async writeSocialCodexAssistantDelta(input: {
    socialCodexEvents: SocialCodexEventPipelineService;
    v2: SocialCodexEventWriter;
    delta: string;
    messageId?: string | null;
    source?: string | null;
  }): Promise<void> {
    if (input.source === 'fallback') return;
    await input.socialCodexEvents.writeAssistantDelta(
      input.v2,
      input.delta,
      input.messageId ?? null,
      'llm',
    );
  }

  private async hydrateFinalResponseContext(input: {
    userId: number;
    taskId?: number | string | null;
    threadId?: string | number | null;
  }): Promise<FinalResponseHydratedContext> {
    const empty: FinalResponseHydratedContext = {
      conversationHistory: [],
      memoryContext: null,
      taskContextPatch: {},
    };
    if (!this.contextHydrator) return empty;
    const hydrated = await this.contextHydrator
      .hydrateContext({
        userId: input.userId,
        taskId: this.positiveNumber(input.taskId),
        threadId: input.threadId ?? null,
      })
      .catch(() => null);
    if (!hydrated) return empty;
    const memoryContext = this.recordValue({
      taskMemory: hydrated.taskMemory,
      taskSlots: hydrated.taskSlots,
      lifeGraphSummary: hydrated.lifeGraphSummary,
      lifeGraphGovernanceSummary: hydrated.lifeGraphGovernanceSummary,
      lifeGraphFactDisplaySummaries: hydrated.lifeGraphFactDisplaySummaries,
      pendingApprovals: hydrated.pendingApprovals,
      candidateActions: hydrated.candidateActions,
    });
    return {
      conversationHistory: hydrated.recentMessages,
      memoryContext,
      taskContextPatch: {
        taskId: hydrated.taskId,
        threadId: hydrated.threadId,
        taskSlots: hydrated.taskSlots,
        pendingApprovals: hydrated.pendingApprovals,
        candidateActions: hydrated.candidateActions,
      },
    };
  }

  private async persistFinalRunAssistantMemory(
    ownerUserId: number,
    result: SocialAgentChatRunResult,
  ): Promise<void> {
    if (!this.messageLog || !this.taskLifecycle) return;
    const taskId = this.positiveNumber(result.taskId);
    if (!taskId) return;
    const task = await this.taskLifecycle
      .assertTaskOwner(taskId, ownerUserId)
      .catch(() => null);
    if (!task) return;
    await this.messageLog
      .recordAssistantRunMessage(task, result.assistantMessage, result)
      .catch(() => undefined);
  }

  private async persistFinalRouteAssistantMemory(
    ownerUserId: number,
    result: SocialAgentIntentRouteResult,
    options: { replaceLastAssistantTurn?: boolean } = {},
  ): Promise<void> {
    if (!this.messageLog || !this.taskLifecycle) return;
    const taskId = this.positiveNumber(result.taskId);
    if (!taskId) return;
    const task = await this.taskLifecycle
      .assertTaskOwner(taskId, ownerUserId)
      .catch(() => null);
    if (!task) return;
    await this.messageLog
      .recordAssistantMessage(task, result.assistantMessage, result, options)
      .catch(() => undefined);
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

  private stringList(value: unknown): string[] | null {
    if (!Array.isArray(value)) return null;
    const values = value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
    return values.length ? [...new Set(values)].slice(0, 20) : null;
  }

  private identifierValue(value: unknown): string | number | null {
    return typeof value === 'string' || typeof value === 'number'
      ? value
      : null;
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

  private shouldUseDeterministicCardActionReply(
    body: SocialAgentCardActionBody,
    result: SocialAgentIntentRouteResult,
  ): boolean {
    const action = this.normalizedLowCostCardAction(body.action);
    if (!action) return false;
    if (!cleanDisplayText(result.assistantMessage, '').trim()) return false;
    if (result.pendingApproval) return false;
    const pendingConfirmations = (
      result as { pendingConfirmations?: unknown[] }
    ).pendingConfirmations;
    if (
      Array.isArray(pendingConfirmations) &&
      pendingConfirmations.length > 0
    ) {
      return false;
    }
    if (
      result.shouldSearch ||
      result.shouldReplan ||
      result.shouldQueueRun ||
      result.runMode
    ) {
      return false;
    }
    return true;
  }

  private normalizedLowCostCardAction(
    action: string | null | undefined,
  ): string | null {
    const normalized = cleanDisplayText(action, '').trim().toLowerCase();
    if (!normalized) return null;
    const lowCostAliases: Record<string, string> = {
      save_candidate: 'candidate.like',
      favorite_candidate: 'candidate.like',
      bookmark_candidate: 'candidate.like',
      collect_candidate: 'candidate.like',
      generate_opener: 'candidate.generate_opener',
      draft_opener: 'candidate.generate_opener',
      regenerate_opener: 'opener.regenerate',
      rewrite_opener: 'opener.regenerate',
      view_profile: 'candidate.view_detail',
      view_candidate: 'candidate.view_detail',
      view_user: 'candidate.view_detail',
      open_profile: 'candidate.view_detail',
      view_detail: 'candidate.view_detail',
      see_more: 'candidate.more_like_this',
      more_like_this: 'candidate.more_like_this',
      expand_radius: 'candidate.more_like_this',
      relax_preference: 'candidate.more_like_this',
      filter_school: 'candidate.more_like_this',
      filter_gender_female: 'candidate.more_like_this',
      refine_request: 'candidate.more_like_this',
      skip_candidate: 'candidate.skip',
      dislike_candidate: 'candidate.skip',
      reject_opener: 'opener.reject',
      view_activity: 'activity.view_detail',
      skip_publish: 'activity.skip_publish',
      change_time: 'activity.modify_time',
      modify_activity: 'activity.modify_time',
      change_location: 'activity.modify_location',
    };
    const canonical = lowCostAliases[normalized] ?? normalized;
    return new Set([
      'candidate.view_detail',
      'candidate.more_like_this',
      'candidate.skip',
      'candidate.like',
      'candidate.generate_opener',
      'opener.regenerate',
      'opener.reject',
      'activity.view_detail',
      'activity.modify_time',
      'activity.modify_location',
      'activity.skip_publish',
    ]).has(canonical)
      ? canonical
      : null;
  }

  private withAssistantRuntimeAnchor<
    T extends { runtime?: Record<string, unknown> | null },
  >(result: T, runId: string, messageId: string): T {
    return {
      ...result,
      runtime: {
        ...(result.runtime ?? {}),
        runId,
        messageId,
      },
    };
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
