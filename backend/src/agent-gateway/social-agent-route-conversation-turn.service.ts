import { Injectable } from '@nestjs/common';

import { AgentTask } from './entities/agent-task.entity';
import { LifeGraphProposalDto } from '../life-graph/dto/life-graph.dto';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';
import type { StreamEmit } from './social-agent-chat.types';
import type { LongTermMemorySnapshot } from './social-agent-long-term-memory.service';
import { shouldUseSocialAgentLlmDirectReply } from './social-agent-route-response.presenter';
import { SocialAgentChatLlmService } from './social-agent-chat-llm.service';
import { SocialAgentProfileEnrichmentService } from './social-agent-profile-enrichment.service';
import { SocialAgentRouteContextService } from './social-agent-route-context.service';

type HandleRouteConversationTurnInput = {
  ownerUserId: number;
  task: AgentTask;
  message: string;
  route: SocialAgentIntentRouterResult;
  profile: Record<string, unknown> | null;
  longTermSnapshot: LongTermMemorySnapshot | null;
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
    if (this.isProfileEnrichmentIntent(input.route)) {
      const handled = await this.profileEnrichment.handleTurn({
        ownerUserId: input.ownerUserId,
        task: input.task,
        message: input.message,
        intent: input.route.intent,
        buildMemoryContext: (currentTask) =>
          this.routeContext.buildMemoryContext(currentTask, null),
        emit: input.emit,
        signal: input.signal,
      });
      if (handled.assistantStreamed) {
        await input.emit?.({
          type: 'assistant_done',
          messageId: `agent-message:${handled.task.id}`,
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
      };
    }

    if (shouldUseSocialAgentLlmDirectReply(input.route)) {
      let assistantStreamed = false;
      const assistantMessage = await this.chatLlm.generateConversationalAnswer({
        message: input.message,
        route: input.route,
        profile: input.profile,
        task: input.task,
        longTermSnapshot: input.longTermSnapshot,
        memoryContext: this.routeContext.buildMemoryContext(
          input.task,
          input.longTermSnapshot,
        ),
        toolResults: input.brainToolResults,
        onDelta: input.emit
          ? async (delta) => {
              if (!delta) return;
              assistantStreamed = true;
              await input.emit?.({
                type: 'assistant_delta',
                messageId: `agent-message:${input.task.id}`,
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
          messageId: `agent-message:${input.task.id}`,
          source: 'llm',
        });
      }

      return {
        handled: true,
        task: input.task,
        assistantMessage,
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
}
