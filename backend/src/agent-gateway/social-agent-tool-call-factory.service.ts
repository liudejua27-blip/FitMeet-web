import { BadRequestException, Injectable } from '@nestjs/common';

import {
  AgentPermissionService,
  SocialAgentAction,
} from './agent-permission.service';
import { FitMeetAgentToolRegistryService } from './fitmeet-agent-tool-registry.service';
import {
  SocialAgentToolCallRecord,
  SocialAgentToolCallStatus,
  SocialAgentToolName,
} from './social-agent-tool.types';

type StepRecord = Record<string, unknown>;

@Injectable()
export class SocialAgentToolCallFactoryService {
  private toolCallSequence = 0;

  constructor(
    private readonly permissions: AgentPermissionService,
    private readonly toolRegistry: FitMeetAgentToolRegistryService,
  ) {}

  resolveToolName(step: StepRecord): SocialAgentToolName {
    const explicit = this.normalizeToolName(step.toolName ?? step.tool);
    if (explicit) return explicit;

    const action = this.permissions.normalizeAction(
      this.string(step.action ?? step.actionType) ?? '',
    );
    switch (action) {
      case SocialAgentAction.SearchProfiles:
        return SocialAgentToolName.SearchMatches;
      case SocialAgentAction.GenerateContent:
        return SocialAgentToolName.ExplainMatches;
      case SocialAgentAction.DraftMessage:
        return SocialAgentToolName.DraftOpener;
      case SocialAgentAction.SendMessage:
        return SocialAgentToolName.SendMessage;
      case SocialAgentAction.AddFriend:
        return SocialAgentToolName.AddFriend;
      case SocialAgentAction.SendInvite:
        return SocialAgentToolName.InviteActivity;
      case SocialAgentAction.FavoriteCandidate:
        return SocialAgentToolName.SaveCandidate;
      case SocialAgentAction.WriteInbox:
        return SocialAgentToolName.WriteInbox;
      case SocialAgentAction.OfflineMeet:
        return SocialAgentToolName.OfflineMeeting;
      case SocialAgentAction.Payment:
        return SocialAgentToolName.Payment;
      default:
        throw new BadRequestException(
          'step.toolName or step.action is required',
        );
    }
  }

  normalizeToolName(value: unknown): SocialAgentToolName | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    if (
      Object.values(SocialAgentToolName).includes(
        normalized as SocialAgentToolName,
      )
    ) {
      return normalized as SocialAgentToolName;
    }

    const executorToolName =
      this.toolRegistry.resolveExecutorToolName(normalized);
    return Object.values(SocialAgentToolName).includes(
      executorToolName as SocialAgentToolName,
    )
      ? (executorToolName as SocialAgentToolName)
      : null;
  }

  shouldExecuteStep(step: StepRecord): boolean {
    const status = this.string(step.status);
    return !['succeeded', 'failed', 'blocked', 'cancelled', 'skipped'].includes(
      status ?? '',
    );
  }

  hasNoRemainingExecutableSteps(plan: StepRecord[]): boolean {
    return plan.every((step) => !this.shouldExecuteStep(step));
  }

  withStepResult(
    step: StepRecord,
    call: SocialAgentToolCallRecord,
  ): StepRecord {
    return {
      ...step,
      status: call.status,
      toolCallId: call.id,
      output: call.output,
      error: call.error,
      completedAt: call.completedAt,
    };
  }

  buildToolCall(input: {
    id: string;
    stepId: string;
    toolName: SocialAgentToolName;
    status: SocialAgentToolCallStatus;
    input: Record<string, unknown>;
    output: Record<string, unknown> | null;
    error: Record<string, unknown> | null;
    startedAt: Date;
  }): SocialAgentToolCallRecord {
    const completedAt = new Date();
    return {
      id: input.id,
      stepId: input.stepId,
      toolName: input.toolName,
      status: input.status,
      input: input.input,
      output: input.output,
      error: input.error,
      startedAt: input.startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - input.startedAt.getTime(),
    };
  }

  safeToolCallId(
    taskId: number,
    toolName: SocialAgentToolName,
    startedAt: Date,
  ): string {
    this.toolCallSequence = (this.toolCallSequence + 1) % 1_000_000;
    const alias = toolName
      .split('_')
      .map((part) => part[0] ?? '')
      .join('')
      .slice(0, 12);
    return this.safeVarchar(
      `${alias || 'tool'}_${taskId}_${startedAt.getTime().toString(36)}_${this.toolCallSequence.toString(36)}`,
      80,
    );
  }

  safeVarchar(value: unknown, max = 80): string {
    let text: string;
    if (value == null) {
      text = '';
    } else if (typeof value === 'string') {
      text = value;
    } else if (typeof value === 'object') {
      try {
        text = JSON.stringify(value) ?? '';
      } catch {
        text = '[unserializable]';
      }
    } else if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      text = String(value);
    } else {
      text = '[unsupported]';
    }

    if (max <= 0) return '';
    return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
  }

  stepId(step: StepRecord): string {
    return this.string(step.id) || '';
  }

  stepInput(step: StepRecord): Record<string, unknown> {
    return this.isRecord(step.input) ? step.input : {};
  }

  private string(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
