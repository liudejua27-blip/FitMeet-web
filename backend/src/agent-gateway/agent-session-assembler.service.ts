import { Injectable } from '@nestjs/common';

import {
  cleanDisplayText,
  sanitizeForDisplay,
} from '../common/display-text.util';
import { AgentTask } from './entities/agent-task.entity';
import {
  ApprovalRiskLevel,
  ApprovalType,
  type AgentApprovalRequest,
} from './entities/agent-approval-request.entity';
import { rememberSocialAgentShortTerm } from './social-agent-memory.util';
import { inferSocialAgentThreadTitle } from './social-agent-thread-title.util';
import type {
  SocialAgentActivityResult,
  SocialAgentAsyncRunSnapshot,
  SocialAgentChatReplanRunResult,
  SocialAgentChatRunResult,
  SocialAgentSessionMessage,
  SocialAgentSessionSnapshot,
  SocialAgentSessionTaskSummary,
  SocialAgentPendingApprovalSnapshot,
} from './social-agent-chat.types';

@Injectable()
export class AgentSessionAssemblerService {
  emptySession(
    restoredAt = new Date().toISOString(),
  ): SocialAgentSessionSnapshot {
    return {
      hasSession: false,
      activeTaskId: null,
      task: null,
      messages: [],
      events: [],
      result: null,
      latestRun: null,
      pendingApprovals: [],
      candidateActions: {},
      restoredAt,
    };
  }

  buildSessionSnapshot(input: {
    task: AgentTask;
    events: Array<Record<string, unknown>>;
    result: SocialAgentChatRunResult | SocialAgentChatReplanRunResult | null;
    latestRun: SocialAgentAsyncRunSnapshot | null;
    pendingApprovals: SocialAgentPendingApprovalSnapshot[];
    conversationHistory: Array<Record<string, unknown>>;
    restoredAt?: string;
  }): SocialAgentSessionSnapshot {
    return {
      hasSession: true,
      activeTaskId: input.task.id,
      task: this.toSessionTaskSummary(input.task),
      messages: this.buildSessionMessages({
        task: input.task,
        result: input.result,
        pendingApprovals: input.pendingApprovals,
        conversationHistory: input.conversationHistory,
      }),
      events: input.events,
      result: input.result,
      latestRun: input.latestRun,
      pendingApprovals: input.pendingApprovals,
      candidateActions: this.readCandidateActions(input.task),
      restoredAt: input.restoredAt ?? new Date().toISOString(),
    };
  }

  toSessionTaskSummary(task: AgentTask): SocialAgentSessionTaskSummary {
    return {
      id: task.id,
      status: task.status,
      title: inferSocialAgentThreadTitle({
        title: task.title,
        goal: task.goal,
        firstMessage: this.firstUserMessageFromTask(task),
      }),
      goal: cleanDisplayText(task.goal, ''),
      permissionMode: task.permissionMode,
      statusReason: cleanDisplayText(task.statusReason, '') || null,
      updatedAt: this.isoDate(task.updatedAt),
      createdAt: this.isoDate(task.createdAt),
    };
  }

  buildSessionMessages(input: {
    task: AgentTask;
    result: SocialAgentChatRunResult | SocialAgentChatReplanRunResult | null;
    pendingApprovals: SocialAgentPendingApprovalSnapshot[];
    conversationHistory: Array<Record<string, unknown>>;
  }): SocialAgentSessionMessage[] {
    const messages = input.conversationHistory
      .map((turn, index) => this.toSessionMessage(turn, index))
      .filter((message): message is SocialAgentSessionMessage => !!message);

    const goal = cleanDisplayText(input.task.goal, '');
    if (goal && !messages.some((message) => message.role === 'user')) {
      messages.unshift({
        id: `task_${input.task.id}_goal`,
        role: 'user',
        content: goal,
        createdAt: this.isoDate(input.task.createdAt),
      });
    }

    const finalAssistantMessage = input.result
      ? cleanDisplayText(input.result.assistantMessage, '')
      : '';
    if (
      finalAssistantMessage &&
      !messages.some(
        (message) =>
          message.role === 'assistant' &&
          cleanDisplayText(message.content, '') === finalAssistantMessage,
      )
    ) {
      messages.push({
        id: `task_${input.task.id}_latest_result`,
        role: 'assistant',
        content: finalAssistantMessage,
        createdAt: this.isoDate(input.task.updatedAt),
        ...(input.result?.assistantMessageSource
          ? { assistantMessageSource: input.result.assistantMessageSource }
          : {}),
      });
    }

    for (const approval of input.pendingApprovals) {
      const exists = messages.some(
        (message) => message.pendingApproval?.id === approval.id,
      );
      if (exists) continue;
      messages.push({
        id: `task_${input.task.id}_approval_${approval.id}`,
        role: 'assistant',
        kind: 'approval',
        content: approval.summary,
        createdAt: approval.expiresAt,
        pendingApproval: approval,
      });
    }

    return messages.slice(-80);
  }

  toPendingApprovalSnapshot(
    approval: AgentApprovalRequest,
  ): SocialAgentPendingApprovalSnapshot {
    return {
      id: approval.id,
      type: approval.type,
      actionType: cleanDisplayText(approval.actionType, approval.type),
      summary: cleanDisplayText(approval.summary, '待确认动作'),
      riskLevel: approval.riskLevel,
      payload: sanitizeForDisplay(approval.payload) as Record<string, unknown>,
      expiresAt: approval.expiresAt ? approval.expiresAt.toISOString() : null,
    };
  }

  normalizePendingApprovalSnapshot(
    value: unknown,
  ): SocialAgentPendingApprovalSnapshot | undefined {
    if (!this.isRecord(value)) return undefined;
    const id = this.number(value.id);
    if (!id) return undefined;
    const type = Object.values(ApprovalType).includes(
      value.type as ApprovalType,
    )
      ? (value.type as ApprovalType)
      : ApprovalType.Custom;
    const riskLevel = Object.values(ApprovalRiskLevel).includes(
      value.riskLevel as ApprovalRiskLevel,
    )
      ? (value.riskLevel as ApprovalRiskLevel)
      : ApprovalRiskLevel.Low;
    return {
      id,
      type,
      actionType: cleanDisplayText(value.actionType, type),
      summary: cleanDisplayText(value.summary, '待确认动作'),
      riskLevel,
      payload: this.isRecord(value.payload)
        ? (sanitizeForDisplay(value.payload) as Record<string, unknown>)
        : {},
      expiresAt: cleanDisplayText(value.expiresAt, '') || null,
    };
  }

  readActivityResults(value: unknown): SocialAgentActivityResult[] {
    if (!Array.isArray(value)) return [];
    return value
      .filter((item): item is Record<string, unknown> => this.isRecord(item))
      .map((item) => sanitizeForDisplay(item) as SocialAgentActivityResult);
  }

  readCandidateActions(
    task: AgentTask,
  ): Record<string, Record<string, unknown>> {
    const memory = this.isRecord(task.memory) ? task.memory : {};
    const shortTerm = this.isRecord(memory.shortTerm) ? memory.shortTerm : {};
    const taskMemory = this.isRecord(memory.taskMemory)
      ? memory.taskMemory
      : {};
    const actions = this.mergeCandidateActionSources(
      taskMemory.candidateState,
      taskMemory.candidateActions,
      memory.candidateState,
      memory.candidateActions,
      shortTerm.candidateState,
      shortTerm.candidateActions,
    );
    const out: Record<string, Record<string, unknown>> = {};
    for (const [key, value] of Object.entries(actions)) {
      if (!this.isRecord(value)) continue;
      out[key] = sanitizeForDisplay(value) as Record<string, unknown>;
    }
    return out;
  }

  rememberCandidateAction(
    task: AgentTask,
    targetUserId: number,
    patch: Record<string, unknown>,
  ): void {
    const previous = this.readCandidateActions(task);
    const key = String(targetUserId);
    const sanitizedPatch = sanitizeForDisplay(patch) as Record<string, unknown>;
    rememberSocialAgentShortTerm(task, {
      candidateActions: {
        ...previous,
        [key]: {
          ...(previous[key] ?? {}),
          ...sanitizedPatch,
          targetUserId,
          updatedAt: new Date().toISOString(),
        },
      },
    });
  }

  private toSessionMessage(
    turn: Record<string, unknown>,
    index: number,
  ): SocialAgentSessionMessage | null {
    const role = cleanDisplayText(turn.role, '');
    if (role !== 'user' && role !== 'assistant') return null;
    const content = cleanDisplayText(
      turn.text ?? turn.content ?? turn.message,
      '',
    );
    if (!content) return null;
    const pendingApproval = this.normalizePendingApprovalSnapshot(
      turn.pendingApproval,
    );
    const activityResults = this.readActivityResults(turn.activityResults);
    const kindRaw = cleanDisplayText(turn.kind, '');
    const kind = pendingApproval
      ? 'approval'
      : kindRaw === 'risk'
        ? 'risk'
        : undefined;
    const assistantMessageSource =
      role === 'assistant'
        ? this.assistantMessageSource(
            turn.assistantMessageSource ?? turn.messageSource ?? turn.source,
          )
        : undefined;
    return {
      id:
        cleanDisplayText(turn.id, '') ||
        `turn_${index}_${cleanDisplayText(turn.at ?? turn.createdAt, '') || 'memory'}`,
      role,
      kind,
      content,
      createdAt: cleanDisplayText(turn.at ?? turn.createdAt, '') || null,
      ...(assistantMessageSource ? { assistantMessageSource } : {}),
      ...(activityResults.length > 0 ? { activityResults } : {}),
      ...(pendingApproval ? { pendingApproval } : {}),
    };
  }

  private firstUserMessageFromTask(task: AgentTask): string | null {
    const memory = this.isRecord(task.memory) ? task.memory : {};
    const conversation = this.isRecord(memory.socialAgentConversation)
      ? memory.socialAgentConversation
      : {};
    const turns = Array.isArray(conversation.turns) ? conversation.turns : [];
    for (const turn of turns) {
      if (!this.isRecord(turn)) continue;
      if (cleanDisplayText(turn.role, '') !== 'user') continue;
      const text = cleanDisplayText(
        turn.text ?? turn.content ?? turn.message,
        '',
      );
      if (text) return text;
    }
    return null;
  }

  private isoDate(value: Date | string | null | undefined): string {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string' && value) return value;
    return new Date(0).toISOString();
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }

  private mergeCandidateActionSources(
    ...sources: unknown[]
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const source of sources) {
      if (!this.isRecord(source)) continue;
      Object.assign(out, source);
    }
    return out;
  }

  private number(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private assistantMessageSource(
    value: unknown,
  ):
    | 'llm'
    | 'fallback'
    | 'deterministic_route'
    | 'deterministic_action'
    | undefined {
    return value === 'llm' ||
      value === 'fallback' ||
      value === 'deterministic_route' ||
      value === 'deterministic_action'
      ? value
      : undefined;
  }
}
