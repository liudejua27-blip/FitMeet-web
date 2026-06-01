import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  FitMeetAgentMemoryUpdate,
  FitMeetAgentMessage,
  FitMeetAgentPermissionMode,
  FitMeetAgentRun,
  FitMeetAgentRunStatus,
  FitMeetAgentRunStep,
  FitMeetAgentStepStatus,
  FitMeetAgentToolCall,
  FitMeetAgentToolStatus,
} from './entities/fitmeet-agent-runtime.entity';
import { cleanDisplayText } from '../common/display-text.util';

const HIGH_RISK_TOOLS = new Set([
  'fitmeet_send_friend_request',
  'fitmeet_send_message',
  'fitmeet_create_activity',
]);

@Injectable()
export class FitMeetAgentRuntimeService {
  private readonly logger = new Logger(FitMeetAgentRuntimeService.name);

  constructor(
    @InjectRepository(FitMeetAgentRun)
    private readonly runs: Repository<FitMeetAgentRun>,
    @InjectRepository(FitMeetAgentRunStep)
    private readonly steps: Repository<FitMeetAgentRunStep>,
    @InjectRepository(FitMeetAgentToolCall)
    private readonly toolCalls: Repository<FitMeetAgentToolCall>,
    @InjectRepository(FitMeetAgentMessage)
    private readonly messages: Repository<FitMeetAgentMessage>,
    @InjectRepository(FitMeetAgentMemoryUpdate)
    private readonly memoryUpdates: Repository<FitMeetAgentMemoryUpdate>,
  ) {}

  async startRun(input: {
    userId: number;
    agentTaskId?: number | null;
    userMessage: string;
    permissionMode?: string | null;
  }): Promise<FitMeetAgentRun | null> {
    try {
      const run = await this.runs.save(
        this.runs.create({
          userId: input.userId,
          agentTaskId: input.agentTaskId ?? null,
          userMessage: this.safeText(input.userMessage),
          permissionMode: this.normalizeMode(input.permissionMode),
          status: FitMeetAgentRunStatus.Running,
        }),
      );
      await this.messages.save(
        this.messages.create({
          runId: run.id,
          userId: input.userId,
          role: 'user',
          messageType: 'natural_language_request',
          content: this.safeText(input.userMessage),
          safeMetadata: {},
        }),
      );
      return run;
    } catch (error) {
      this.warn('agent_runtime.start_failed', error, input.userId);
      return null;
    }
  }

  async attachTask(runId: number | null | undefined, agentTaskId: number) {
    if (!runId) return;
    try {
      await this.runs.update({ id: runId }, { agentTaskId });
    } catch (error) {
      this.warn('agent_runtime.attach_task_failed', error);
    }
  }

  async recordStep(input: {
    runId?: number | null;
    userId: number;
    stepOrder: number;
    stepKey: string;
    title: string;
    status?: FitMeetAgentStepStatus;
    toolName?: string | null;
    requiresUserConfirmation?: boolean;
    safePayload?: Record<string, unknown>;
  }) {
    if (!input.runId) return null;
    try {
      return await this.steps.save(
        this.steps.create({
          runId: input.runId,
          userId: input.userId,
          stepOrder: input.stepOrder,
          stepKey: input.stepKey,
          title: this.safeText(input.title),
          status: input.status ?? FitMeetAgentStepStatus.Completed,
          toolName: input.toolName ?? null,
          requiresUserConfirmation: input.requiresUserConfirmation ?? false,
          safePayload: this.safePayload(input.safePayload ?? {}),
        }),
      );
    } catch (error) {
      this.warn('agent_runtime.step_write_failed', error, input.userId);
      return null;
    }
  }

  async recordToolCall(input: {
    runId?: number | null;
    userId: number;
    stepId?: number | null;
    toolName: string;
    status?: FitMeetAgentToolStatus;
    safeInput?: Record<string, unknown>;
    safeOutput?: Record<string, unknown>;
    errorCode?: string | null;
    errorMessage?: string | null;
    durationMs?: number | null;
  }) {
    if (!input.runId) return null;
    try {
      return await this.toolCalls.save(
        this.toolCalls.create({
          runId: input.runId,
          userId: input.userId,
          stepId: input.stepId ?? null,
          toolName: input.toolName,
          status: input.status ?? FitMeetAgentToolStatus.Succeeded,
          requiresUserConfirmation: HIGH_RISK_TOOLS.has(input.toolName),
          safeInput: this.safePayload(input.safeInput ?? {}),
          safeOutput: this.safePayload(input.safeOutput ?? {}),
          errorCode: input.errorCode ?? null,
          errorMessage: input.errorMessage
            ? this.safeText(input.errorMessage)
            : null,
          durationMs: input.durationMs ?? null,
        }),
      );
    } catch (error) {
      this.warn('agent_runtime.tool_call_write_failed', error, input.userId);
      return null;
    }
  }

  async recordMemoryUpdate(input: {
    runId?: number | null;
    userId: number;
    memoryType: string;
    source: string;
    safePayload: Record<string, unknown>;
    requiresUserConfirmation?: boolean;
  }) {
    if (!input.runId) return null;
    try {
      return await this.memoryUpdates.save(
        this.memoryUpdates.create({
          runId: input.runId,
          userId: input.userId,
          memoryType: input.memoryType,
          source: input.source,
          safePayload: this.safePayload(input.safePayload),
          requiresUserConfirmation: input.requiresUserConfirmation ?? true,
        }),
      );
    } catch (error) {
      this.warn(
        'agent_runtime.memory_update_write_failed',
        error,
        input.userId,
      );
      return null;
    }
  }

  async completeRun(input: {
    runId?: number | null;
    userId: number;
    status: FitMeetAgentRunStatus;
    assistantMessage: string;
    resultPayload?: Record<string, unknown>;
  }) {
    if (!input.runId) return;
    try {
      await this.messages.save(
        this.messages.create({
          runId: input.runId,
          userId: input.userId,
          role: 'assistant',
          messageType: 'final_answer',
          content: this.safeText(input.assistantMessage),
          safeMetadata: {},
        }),
      );
      await this.runs.update(
        { id: input.runId },
        {
          status: input.status,
          safeSummary: this.safeText(input.assistantMessage).slice(0, 500),
          resultPayload: this.safePayload(input.resultPayload ?? {}) as never,
          completedAt: new Date(),
        },
      );
    } catch (error) {
      this.warn('agent_runtime.complete_failed', error, input.userId);
    }
  }

  private normalizeMode(value?: string | null): FitMeetAgentPermissionMode {
    if (value === 'limited_auto') return FitMeetAgentPermissionMode.LimitedAuto;
    if (value === 'open') return FitMeetAgentPermissionMode.Open;
    return FitMeetAgentPermissionMode.Assisted;
  }

  private safeText(value: unknown) {
    return cleanDisplayText(value, '').slice(0, 5000);
  }

  private safePayload(payload: Record<string, unknown>) {
    const blocked = new Set([
      'rawPrompt',
      'chainOfThought',
      'hiddenReasoning',
      'password',
      'token',
      'accessToken',
      'phone',
      'email',
      'preciseLocation',
      'lat',
      'lng',
      'payment',
      'wallet',
    ]);
    return Object.fromEntries(
      Object.entries(payload).filter(([key]) => !blocked.has(key)),
    );
  }

  private warn(event: string, error: unknown, userId?: number) {
    this.logger.warn(
      JSON.stringify({
        event,
        userId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}
