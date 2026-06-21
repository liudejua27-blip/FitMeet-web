import { Injectable } from '@nestjs/common';

import { AgentTask } from './entities/agent-task.entity';
import { LifeGraphProposalDto } from '../life-graph/dto/life-graph.dto';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';
import type { SocialAgentRouteMessageBody } from './social-agent-chat.types';
import type { StreamEmit } from './social-agent-chat.types';
import type { SocialAgentAssistantMessageSource } from './social-agent-chat.types';
import type { SocialAgentHydratedContext } from './social-agent-context-hydrator.service';
import type { LongTermMemorySnapshot } from './social-agent-long-term-memory.service';
import type { SocialAgentMemoryContext } from './social-agent-memory-context.service';
import { shouldUseSocialAgentLlmDirectReply } from './social-agent-route-response.presenter';
import { SocialAgentChatLlmService } from './social-agent-chat-llm.service';
import { SocialAgentProfileEnrichmentService } from './social-agent-profile-enrichment.service';
import { SocialAgentRouteContextService } from './social-agent-route-context.service';
import { buildRunScopedAssistantMessageId } from './social-agent-stream-message-id.util';

type HandleRouteConversationTurnInput = {
  ownerUserId: number;
  task: AgentTask;
  traceId?: string | null;
  message: string;
  route: SocialAgentIntentRouterResult;
  profile: Record<string, unknown> | null;
  longTermSnapshot: LongTermMemorySnapshot | null;
  hydratedContext?: SocialAgentHydratedContext | null;
  brainToolResults: Array<Record<string, unknown>>;
  emit?: StreamEmit;
  signal?: AbortSignal | null;
};

type HandleRouteConversationTurnResult = {
  handled: boolean;
  task: AgentTask;
  assistantMessage?: string;
  savedContext: boolean;
  profileUpdated: boolean;
  profileUpdateProposal: LifeGraphProposalDto | null;
  assistantStreamed?: boolean;
  assistantMessageSource?: SocialAgentAssistantMessageSource;
};

@Injectable()
export class SocialAgentRouteConversationTurnService {
  constructor(
    private readonly chatLlm: SocialAgentChatLlmService,
    private readonly profileEnrichment: SocialAgentProfileEnrichmentService,
    private readonly routeContext: SocialAgentRouteContextService,
  ) {}

  async handle(
    input: HandleRouteConversationTurnInput,
  ): Promise<HandleRouteConversationTurnResult> {
    const assistantMessageId = buildRunScopedAssistantMessageId({
      taskId: input.task.id,
      traceId: input.traceId,
    });
    if (this.isProfileEnrichmentIntent(input.route)) {
      const handled = await this.profileEnrichment.handleTurn({
        ownerUserId: input.ownerUserId,
        task: input.task,
        message: input.message,
        intent: input.route.intent,
        buildMemoryContext: (currentTask) =>
          this.buildMemoryContext(currentTask, input),
        buildTaskContext: (currentTask, memoryContext) =>
          this.buildTaskContext(currentTask, input, memoryContext) ?? null,
        traceId: input.traceId ?? null,
        emit: input.emit,
        signal: input.signal,
      });
      if (handled.assistantStreamed) {
        await input.emit?.({
          type: 'assistant_done',
          messageId: assistantMessageId,
          source: 'llm',
        });
      }

      return {
        handled: true,
        task: handled.task,
        assistantMessage: handled.assistantMessage,
        savedContext: handled.savedContext,
        profileUpdated: handled.profileUpdated,
        profileUpdateProposal: handled.profileUpdateProposal ?? null,
        assistantStreamed: handled.assistantStreamed,
        assistantMessageSource: handled.assistantMessageSource,
      };
    }

    if (shouldUseSocialAgentLlmDirectReply(input.route)) {
      let assistantStreamed = false;
      const memoryContext = this.buildMemoryContext(input.task, input);
      const taskContext = this.buildTaskContext(
        input.task,
        input,
        memoryContext,
      );
      const answer = await this.chatLlm.generateConversationalAnswerWithSource({
        message: input.message,
        ...(input.traceId ? { traceId: input.traceId } : {}),
        route: input.route,
        profile: input.profile,
        task: input.task,
        longTermSnapshot: input.longTermSnapshot,
        memoryContext,
        ...(taskContext ? { taskContext } : {}),
        conversationHistory: input.hydratedContext?.recentMessages ?? null,
        toolResults: input.brainToolResults,
        onDelta: input.emit
          ? async (delta) => {
              if (!delta) return;
              assistantStreamed = true;
              await input.emit?.({
                type: 'assistant_delta',
                messageId: assistantMessageId,
                delta,
                source: 'llm',
              });
            }
          : undefined,
        signal: input.signal,
      });
      if (assistantStreamed) {
        await input.emit?.({
          type: 'assistant_done',
          messageId: assistantMessageId,
          source: 'llm',
        });
      }

      return {
        handled: true,
        task: input.task,
        assistantMessage: answer.text,
        assistantMessageSource: assistantStreamed ? 'llm' : answer.source,
        assistantStreamed,
        savedContext: false,
        profileUpdated: false,
        profileUpdateProposal: null,
      };
    }

    return {
      handled: false,
      task: input.task,
      savedContext: false,
      profileUpdated: false,
      profileUpdateProposal: null,
    };
  }

  private isProfileEnrichmentIntent(
    route: SocialAgentIntentRouterResult,
  ): boolean {
    return (
      route.intent === 'profile_enrichment' ||
      route.intent === 'profile_enrichment_request' ||
      route.intent === 'correction_or_clarification'
    );
  }

  private buildMemoryContext(
    task: AgentTask,
    input: Pick<
      HandleRouteConversationTurnInput,
      'longTermSnapshot' | 'hydratedContext'
    >,
  ) {
    return input.hydratedContext
      ? this.routeContext.buildMemoryContext(
          task,
          input.longTermSnapshot,
          input.hydratedContext,
        )
      : this.routeContext.buildMemoryContext(task, input.longTermSnapshot);
  }

  private buildTaskContext(
    task: AgentTask,
    input: Pick<
      HandleRouteConversationTurnInput,
      'message' | 'longTermSnapshot' | 'hydratedContext'
    >,
    memoryContext: SocialAgentMemoryContext | null,
  ): Record<string, unknown> | undefined {
    if (!input.hydratedContext) return undefined;
    return this.routeContext.buildTaskContext({
      task,
      body: { message: input.message } as SocialAgentRouteMessageBody,
      longTermSnapshot: input.longTermSnapshot,
      memoryContext,
      hydratedContext: input.hydratedContext,
    });
  }
}
