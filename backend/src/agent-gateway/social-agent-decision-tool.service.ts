import { Injectable } from '@nestjs/common';

import { AgentPermissionService } from './agent-permission.service';
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

export type SocialAgentDecisionToolInboxEvent = {
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
  inboxEvent: SocialAgentDecisionToolInboxEvent;
};

@Injectable()
export class SocialAgentDecisionToolService {
  constructor(
    private readonly permissions: AgentPermissionService,
    private readonly toolJsonModel: SocialAgentToolJsonModelService,
    private readonly toolCallFactory: SocialAgentToolCallFactoryService,
    private readonly toolInput: SocialAgentToolInputParserService,
    private readonly taskMemory: SocialAgentTaskMemoryService,
  ) {}

  async decideNextSocialAction(
    task: AgentTask,
    input: Record<string, unknown>,
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
    });
    const safeDecision = normalizeSocialAgentNextActionDecision(
      task,
      decision,
      loop,
      this.permissions,
      (value) => this.toolCallFactory.normalizeToolName(value),
    );

    return {
      output: safeDecision,
      loopUpdates: {
        nextActionDecision: safeDecision,
        sourceTool: SocialAgentToolName.DecideNextSocialAction,
      },
      shortTermUpdates: {
        nextActionDecision: safeDecision,
        currentStep: this.taskMemory.shortTermStep(
          'decide_next_social_action',
          '已决定下一步社交动作',
          'done',
        ),
      },
      inboxEvent: {
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
            decision: safeDecision,
          },
        },
      },
    };
  }
}
