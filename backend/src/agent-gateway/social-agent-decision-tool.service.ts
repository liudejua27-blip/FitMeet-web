import { Injectable, Optional } from '@nestjs/common';

import { AgentPermissionService } from './agent-permission.service';
import { AgentL5RuntimeService } from './agent-l5-runtime.service';
import { AgentTask } from './entities/agent-task.entity';
import {
  toSocialAgentMessageArray,
  type SocialAgentLoopMemory,
} from './social-agent-loop-state';
import type { SocialAgentShortTermMemory } from './social-agent-memory.util';
import {
  buildFallbackSocialAgentNextAction,
  buildSocialAgentNextActionPrompt,
  normalizeSocialAgentNextActionDecision,
} from './social-agent-next-action-decision';
import { SocialAgentToolCallFactoryService } from './social-agent-tool-call-factory.service';
import { SocialAgentTaskMemoryService } from './social-agent-task-memory.service';
import { SocialAgentToolInputParserService } from './social-agent-tool-input-parser.service';
import { SocialAgentToolJsonModelService } from './social-agent-tool-json-model.service';
import { SocialAgentToolName } from './social-agent-tool.types';

export type SocialAgentDecisionToolMessageEvent = {
  eventType: string;
  input: {
    conversationId?: string | null;
    messageId?: string | null;
    fromUserId?: number | null;
    contentPreview?: string;
    metadata?: Record<string, unknown>;
  };
};

export type SocialAgentDecisionToolResult = {
  output: Record<string, unknown>;
  loopUpdates: Partial<SocialAgentLoopMemory>;
  shortTermUpdates: Partial<SocialAgentShortTermMemory>;
  messageEvent: SocialAgentDecisionToolMessageEvent;
};

export type SocialAgentLifeGraphWritebackProposal = {
  schemaVersion: 'fitmeet.life_graph.writeback.v1';
  source: 'counterpart_reply';
  status: 'pending_user_confirmation';
  sensitivityLevel: 'medium';
  taskId: number;
  candidateUserId: number | null;
  conversationId: string | null;
  messageId: string | null;
  proposedSignals: Array<{
    field: string;
    label: string;
    value: string;
    confidence: number;
  }>;
  confirmationBoundary: string;
  privacyBoundary: string;
  revokeHint: string;
};

type SocialAgentDecisionToolOptions = {
  signal?: AbortSignal | null;
};

@Injectable()
export class SocialAgentDecisionToolService {
  constructor(
    private readonly permissions: AgentPermissionService,
    private readonly toolJsonModel: SocialAgentToolJsonModelService,
    private readonly toolCallFactory: SocialAgentToolCallFactoryService,
    private readonly toolInput: SocialAgentToolInputParserService,
    private readonly taskMemory: SocialAgentTaskMemoryService,
    @Optional()
    private readonly l5Runtime?: AgentL5RuntimeService,
  ) {}

  async decideNextSocialAction(
    task: AgentTask,
    input: Record<string, unknown>,
    options: SocialAgentDecisionToolOptions = {},
  ): Promise<SocialAgentDecisionToolResult> {
    const loop = this.taskMemory.socialLoopMemory(task);
    const messages = toSocialAgentMessageArray(
      input.messages ?? loop.latestReceivedMessages,
    );
    const summary = this.toolInput.isRecord(input.summary)
      ? input.summary
      : (loop.replySummary ?? {});
    const decision = await this.toolJsonModel.callJson({
      purpose: 'decide_next_social_action',
      prompt: buildSocialAgentNextActionPrompt(
        task,
        messages,
        summary,
        loop,
        this.permissions.getAllowedActions(task.permissionMode),
      ),
      fallback: () =>
        buildFallbackSocialAgentNextAction(task, messages, summary, loop),
      taskId: task.id,
      signal: options.signal ?? null,
    });
    const safeDecision = normalizeSocialAgentNextActionDecision(
      task,
      decision,
      loop,
      this.permissions,
      (value) => this.toolCallFactory.normalizeToolName(value),
    );
    const lifeGraphWritebackProposal = this.buildLifeGraphWritebackProposal({
      task,
      loop,
      summary,
      decision: safeDecision,
    });
    const output = {
      ...safeDecision,
      lifeGraphWritebackProposal,
    };
    await this.persistDecisionState({
      task,
      loop,
      summary,
      decision: output,
      lifeGraphWritebackProposal,
    });

    return {
      output,
      loopUpdates: {
        nextActionDecision: output,
        lifeGraphWritebackProposal,
        sourceTool: SocialAgentToolName.DecideNextSocialAction,
      },
      shortTermUpdates: {
        nextActionDecision: output,
        lifeGraphWritebackProposal,
        currentStep: this.taskMemory.shortTermStep(
          'decide_next_social_action',
          '已决定下一步社交动作',
          'done',
        ),
      },
      messageEvent: {
        eventType: 'social_agent.next_action.decided',
        input: {
          conversationId: loop.conversationId ?? null,
          messageId: loop.lastReceivedMessageId ?? null,
          fromUserId: loop.targetUserId ?? null,
          contentPreview:
            this.toolInput.string(safeDecision.reason) ??
            `Next action: ${this.toolInput.string(safeDecision.nextAction) ?? 'stop'}`,
          metadata: {
            agentTaskId: task.id,
            summary,
            decision: output,
            lifeGraphWritebackProposal,
          },
        },
      },
    };
  }

  private async persistDecisionState(input: {
    task: AgentTask;
    loop: SocialAgentLoopMemory;
    summary: Record<string, unknown>;
    decision: Record<string, unknown>;
    lifeGraphWritebackProposal: SocialAgentLifeGraphWritebackProposal;
  }): Promise<void> {
    if (!this.l5Runtime) return;
    const toolName = this.toolInput.string(input.decision.toolName);
    const nextAction = this.toolInput.string(input.decision.nextAction);
    const actionInput = this.toolInput.isRecord(input.decision.input)
      ? input.decision.input
      : {};
    const targetUserId =
      this.toolInput.number(actionInput.targetUserId) ??
      this.toolInput.number(actionInput.invitedUserId) ??
      input.loop.targetUserId ??
      null;
    await this.l5Runtime.transitionMeetLoop({
      ownerUserId: input.task.ownerUserId,
      agentTaskId: input.task.id,
      activityId: null,
      candidateUserId: targetUserId,
      stage: 'reply_received',
      waitingFor: this.waitingForDecision(input.decision),
      state: {
        conversationId: input.loop.conversationId ?? null,
        targetUserId,
        candidateUserId: targetUserId,
        latestMessageId: input.loop.lastReceivedMessageId ?? null,
        replySummary: input.summary,
        nextAction: nextAction ?? null,
        toolName: toolName ?? null,
        decisionReason: this.toolInput.string(input.decision.reason) ?? null,
        confidence: input.decision.confidence ?? null,
        normalizedDecision: input.decision,
        lifeGraphWritebackProposal: input.lifeGraphWritebackProposal,
        loopStage: 'reply_received',
      },
      review: null,
    });
  }

  private buildLifeGraphWritebackProposal(input: {
    task: AgentTask;
    loop: SocialAgentLoopMemory;
    summary: Record<string, unknown>;
    decision: Record<string, unknown>;
  }): SocialAgentLifeGraphWritebackProposal {
    const targetUserId = input.loop.targetUserId ?? null;
    const replyIntent =
      this.toolInput.string(input.summary.intent) ??
      this.toolInput.string(input.decision.nextAction) ??
      'unknown';
    const nextAction =
      this.toolInput.string(input.decision.nextAction) ?? 'wait';
    const confidence =
      this.toolInput.number(input.decision.confidence) ??
      this.toolInput.number(input.summary.confidence) ??
      0.6;
    const replySummary = this.lifeGraphSafeReplySummary({
      summary: input.summary,
      decision: input.decision,
      replyIntent,
      nextAction,
    });

    return {
      schemaVersion: 'fitmeet.life_graph.writeback.v1',
      source: 'counterpart_reply',
      status: 'pending_user_confirmation',
      sensitivityLevel: 'medium',
      taskId: input.task.id,
      candidateUserId: targetUserId,
      conversationId: input.loop.conversationId ?? null,
      messageId: input.loop.lastReceivedMessageId ?? null,
      proposedSignals: [
        {
          field: 'meetLoop.counterpartIntent',
          label: '对方回复意图',
          value: replyIntent,
          confidence: this.clampConfidence(confidence),
        },
        {
          field: 'meetLoop.replySummary',
          label: '脱敏互动摘要',
          value: replySummary,
          confidence: this.clampConfidence(confidence * 0.9),
        },
        {
          field: 'meetLoop.nextSafeStep',
          label: '建议下一步',
          value: nextAction,
          confidence: this.clampConfidence(confidence),
        },
      ],
      confirmationBoundary: '这只是资料更新建议，确认前不会写入长期偏好。',
      privacyBoundary:
        '不保存对方私聊原文，只保存脱敏后的互动信号和下一步建议。',
      revokeHint: '确认后仍可在个人信息里撤回这次影响。',
    };
  }

  private clampConfidence(value: number): number {
    if (!Number.isFinite(value)) return 0.6;
    return Math.max(0, Math.min(1, Number(value.toFixed(2))));
  }

  private lifeGraphSafeReplySummary(input: {
    summary: Record<string, unknown>;
    decision: Record<string, unknown>;
    replyIntent: string;
    nextAction: string;
  }): string {
    const rawSummary = this.toolInput.string(input.summary.summary) ?? '';
    const rawReason = this.toolInput.string(input.decision.reason) ?? '';
    const candidate = rawSummary || rawReason;
    if (this.looksLikeRawCounterpartReply(candidate)) {
      return this.intentBasedReplySummary(input.replyIntent, input.nextAction);
    }
    const clean = candidate.replace(/\s+/g, ' ').trim();
    return (
      clean || this.intentBasedReplySummary(input.replyIntent, input.nextAction)
    );
  }

  private looksLikeRawCounterpartReply(value: string): boolean {
    const text = value.trim();
    if (!text) return false;
    if (/^对方回复[:：]/.test(text)) return true;
    if (/["“”'‘’]/.test(text)) return true;
    if (/[a-zA-Z][a-zA-Z\s,.!?'-]{12,}/.test(text)) return true;
    return (
      text.length > 36 && /(我|你|吗|可以|哪里|几点|路线|见|约)/.test(text)
    );
  }

  private intentBasedReplySummary(
    replyIntent: string,
    nextAction: string,
  ): string {
    if (replyIntent === 'accept') {
      return '对方表达了正向回应，适合在用户确认后继续站内沟通。';
    }
    if (replyIntent === 'decline') {
      return '对方表达了拒绝或暂缓，建议停止推进并等待用户下一步指示。';
    }
    if (replyIntent === 'ask_question') {
      return '对方提出了后续问题，适合先由用户确认回复边界。';
    }
    if (replyIntent === 'payment') {
      return '对方提到费用或支付相关内容，需要保持谨慎并交由用户确认。';
    }
    if (nextAction === 'reply_message') {
      return '对方有新回复，下一步可能需要用户确认后继续站内沟通。';
    }
    return '对方有新回复，等待用户确认是否更新画像信号。';
  }

  private waitingForDecision(decision: Record<string, unknown>): string {
    const toolName = this.socialAgentToolName(decision.toolName);
    const nextAction = this.toolInput.string(decision.nextAction);
    if (!toolName || nextAction === 'stop') return 'user_next_instruction';
    if (toolName === SocialAgentToolName.ReplyMessage) {
      return 'reply_message_execution_or_confirmation';
    }
    if (
      toolName === SocialAgentToolName.InviteActivity ||
      toolName === SocialAgentToolName.OfflineMeeting
    ) {
      return 'meet_loop_action_execution_or_confirmation';
    }
    if (
      toolName === SocialAgentToolName.ConnectCandidate ||
      toolName === SocialAgentToolName.AddFriend
    ) {
      return 'connection_action_confirmation';
    }
    if (toolName === SocialAgentToolName.Payment) {
      return 'payment_confirmation';
    }
    return 'tool_execution_or_confirmation';
  }

  private socialAgentToolName(value: unknown): SocialAgentToolName | null {
    if (typeof value !== 'string') return null;
    return Object.values(SocialAgentToolName).includes(
      value as SocialAgentToolName,
    )
      ? (value as SocialAgentToolName)
      : null;
  }
}
