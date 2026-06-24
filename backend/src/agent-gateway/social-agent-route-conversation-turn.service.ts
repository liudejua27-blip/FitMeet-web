import { Injectable } from '@nestjs/common';

import { AgentTask } from './entities/agent-task.entity';
import { LifeGraphProposalDto } from '../life-graph/dto/life-graph.dto';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';
import type { SocialAgentRouteMessageBody } from './social-agent-chat.types';
import type { StreamEmit } from './social-agent-chat.types';
import type { SocialAgentAssistantMessageSource } from './social-agent-chat.types';
import type { FitMeetAlphaCard } from './fitmeet-alpha-agent.types';
import type { SocialAgentHydratedContext } from './social-agent-context-hydrator.service';
import type { LongTermMemorySnapshot } from './social-agent-long-term-memory.service';
import type { SocialAgentMemoryContext } from './social-agent-memory-context.service';
import {
  shouldUseSocialAgentLlmDirectReply,
  socialAgentAssistantMessageForRoute,
} from './social-agent-route-response.presenter';
import { SocialAgentChatLlmService } from './social-agent-chat-llm.service';
import { SocialAgentMetricsService } from './social-agent-metrics.service';
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
  cards?: FitMeetAlphaCard[];
  assistantStreamed?: boolean;
  assistantMessageSource?: SocialAgentAssistantMessageSource;
};

@Injectable()
export class SocialAgentRouteConversationTurnService {
  constructor(
    private readonly chatLlm: SocialAgentChatLlmService,
    private readonly profileEnrichment: SocialAgentProfileEnrichmentService,
    private readonly routeContext: SocialAgentRouteContextService,
    private readonly metrics?: SocialAgentMetricsService,
  ) {}

  async handle(
    input: HandleRouteConversationTurnInput,
  ): Promise<HandleRouteConversationTurnResult> {
    const assistantMessageId = buildRunScopedAssistantMessageId({
      taskId: input.task.id,
      traceId: input.traceId,
    });
    const forceProfileMissingFieldsReply =
      !this.isProfileEnrichmentIntent(input.route) &&
      input.brainToolResults.length === 0 &&
      this.isProfileMissingFieldsQuestion(input.message);
    if (
      this.isProfileEnrichmentIntent(input.route) ||
      forceProfileMissingFieldsReply
    ) {
      const handled = await this.profileEnrichment.handleTurn({
        ownerUserId: input.ownerUserId,
        task: input.task,
        message: input.message,
        intent: forceProfileMissingFieldsReply
          ? 'profile_enrichment_request'
          : input.route.intent,
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
        cards: handled.cards ?? [],
        assistantStreamed: handled.assistantStreamed,
        assistantMessageSource: handled.assistantMessageSource,
      };
    }

    const deterministicReply = this.lowCostStaticRouteReply(input);
    if (deterministicReply) {
      this.metrics?.recordDeterministicRouteReply(input.route.intent);
      return {
        handled: true,
        task: input.task,
        assistantMessage: deterministicReply,
        assistantMessageSource: 'deterministic_route',
        assistantStreamed: false,
        savedContext: false,
        profileUpdated: false,
        profileUpdateProposal: null,
        cards: [],
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
        cards: [],
      };
    }

    return {
      handled: false,
      task: input.task,
      savedContext: false,
      profileUpdated: false,
      profileUpdateProposal: null,
      cards: [],
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

  private lowCostStaticRouteReply(
    input: HandleRouteConversationTurnInput,
  ): string | null {
    if (input.brainToolResults.length > 0) return null;
    if (
      input.route.intent === 'product_help' &&
      this.isStaticProductHelpQuestion(input.message)
    ) {
      return socialAgentAssistantMessageForRoute({
        route: input.route,
        task: input.task,
        message: input.message,
      });
    }
    if (
      input.route.intent === 'workflow_help' &&
      this.isStaticWorkflowHelpQuestion(input.message)
    ) {
      return socialAgentAssistantMessageForRoute({
        route: input.route,
        task: input.task,
        message: input.message,
      });
    }
    if (
      input.route.intent === 'casual_chat' &&
      this.isLowCostCasualMessage(input.message)
    ) {
      return socialAgentAssistantMessageForRoute({
        route: input.route,
        task: input.task,
        message: input.message,
      });
    }
    return null;
  }

  private isLowCostCasualMessage(message: string): boolean {
    const normalized = message.trim();
    if (!normalized) return false;
    if (
      /^(你好|您好|hi|hello|hey|在吗|在不在|哈喽|嗨)[!！。,.，\s]*$/i.test(
        normalized,
      )
    ) {
      return true;
    }
    if (
      /^(谢谢|感谢|多谢|辛苦了|好的|好|行|可以|明白|知道了)[!！。,.，\s]*$/i.test(
        normalized,
      )
    ) {
      return true;
    }
    return this.isStaticProductHelpQuestion(normalized);
  }

  private isStaticProductHelpQuestion(message: string): boolean {
    return /(你.*(能做什么|可以做什么|可以干什么|都可以干什么|有什么功能|会什么|能帮我什么)|功能介绍|使用说明|fitmeet.*(是什么|怎么用)|社交助理.*(是什么|能做什么)|人物画像是什么|AI画像是什么|ai画像是什么|画像是什么|什么是人物画像|低压力社交|低压力.*社交|轻松社交|无压力社交|社交压力小|压力小.*社交)/i.test(
      message,
    );
  }

  private isStaticWorkflowHelpQuestion(message: string): boolean {
    return /(先.*画像.*约练|先.*完善.*画像|直接发布需求|怎么开始约练|下一步|需要怎么做|流程|怎么找|如何找|怎么约|如何约)/i.test(
      message,
    );
  }

  private isProfileMissingFieldsQuestion(message: string): boolean {
    return /(还缺什么|还差什么|缺哪些|缺少哪些|画像.*缺|资料.*缺|还需要补充什么|画像.*还要.*补|画像.*需要.*补|我的画像.*什么)/i.test(
      message,
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
