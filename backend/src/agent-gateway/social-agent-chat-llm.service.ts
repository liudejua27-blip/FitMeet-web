import { Injectable, Logger, Optional } from '@nestjs/common';

import { cleanDisplayText } from '../common/display-text.util';
import { conversationalFallbackReply } from './social-agent-chat-replies';
import {
  buildSocialAgentAgentBrainMessages,
  buildSocialAgentDirectReplyMessages,
} from './social-agent-chat-llm-prompts';
import {
  buildSocialAgentAgentBrainFinalResponseInput,
  buildSocialAgentDirectReplyFinalResponseInput,
} from './social-agent-chat-final-response.presenter';
import { AgentTask } from './entities/agent-task.entity';
import { SocialAgentFinalResponseService } from './social-agent-final-response.service';
import { SocialAgentMetricsService } from './social-agent-metrics.service';
import { SocialAgentLongTermMemoryService } from './social-agent-long-term-memory.service';
import type { SocialAgentMemoryContext } from './social-agent-memory-context.service';
import type { ExtractedProfileFields } from './social-agent-chat.types';
import type {
  SocialAgentIntentRouterResult,
  SocialAgentIntentType,
} from './social-agent-intent-router.service';
import { SocialAgentChatDeepSeekClientService } from './social-agent-chat-deepseek-client.service';
import {
  buildSocialAgentProfileExtractionMessages,
  parseSocialAgentProfileExtractionContent,
  profileFieldsFromRecord,
} from './social-agent-profile-extraction.presenter';

type LongTermMemorySnapshot = Awaited<
  ReturnType<SocialAgentLongTermMemoryService['readSnapshot']>
>;

@Injectable()
export class SocialAgentChatLlmService {
  private readonly logger = new Logger(SocialAgentChatLlmService.name);

  constructor(
    private readonly metrics: SocialAgentMetricsService,
    private readonly deepSeek: SocialAgentChatDeepSeekClientService,
    @Optional()
    private readonly finalResponses?: SocialAgentFinalResponseService,
  ) {}

  async generateConversationalAnswer(input: {
    message: string;
    route: SocialAgentIntentRouterResult;
    profile: Record<string, unknown> | null;
    task: AgentTask;
    longTermSnapshot: LongTermMemorySnapshot | null;
    memoryContext: SocialAgentMemoryContext | null;
    toolResults?: Array<Record<string, unknown>>;
  }): Promise<string> {
    const fallbackReply = conversationalFallbackReply(
      input.message,
      input.route.intent,
    );
    if (this.finalResponses) {
      return this.finalResponses.generate(
        buildSocialAgentDirectReplyFinalResponseInput({
          ...input,
          fallbackReply,
        }),
      );
    }
    try {
      const answer = await this.callDeepSeekForDirectReply(input);
      if (answer) return answer;
    } catch (error) {
      this.metrics.recordError('social_agent_chat_deepseek_failed');
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.chat.deepseek_failed',
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
    return fallbackReply;
  }

  async generateAgentBrainReply(input: {
    message: string;
    task: AgentTask;
    intent: SocialAgentIntentType;
    mode: 'profile_extraction' | 'profile_correction' | 'profile_updated';
    extractedProfile: ExtractedProfileFields;
    sourceMessage: string;
    toolOutput?: Record<string, unknown>;
    fallbackReply: string;
    memoryContext: SocialAgentMemoryContext | null;
  }): Promise<string> {
    if (this.finalResponses) {
      return this.finalResponses.generate(
        buildSocialAgentAgentBrainFinalResponseInput(input),
      );
    }
    try {
      const answer = await this.callDeepSeekForAgentBrain(input);
      if (answer) return answer;
    } catch (error) {
      this.metrics.recordError('social_agent_brain_deepseek_failed');
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.brain.deepseek_failed',
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
    return input.fallbackReply;
  }

  async extractProfileFieldsWithLlm(
    task: AgentTask,
    sourceMessage: string,
  ): Promise<ExtractedProfileFields> {
    if (!cleanDisplayText(sourceMessage, '').trim()) return {};
    const useCase = 'profile_extraction' as const;

    try {
      const content = await this.deepSeek.complete({
        useCase,
        taskId: task.id,
        intent: 'profile_enrichment',
        fallbackTemperature: 0.15,
        responseFormat: { type: 'json_object' },
        messages: buildSocialAgentProfileExtractionMessages(
          task,
          sourceMessage,
        ),
      });
      if (!content) return {};
      return parseSocialAgentProfileExtractionContent(content);
    } catch {
      return {};
    }
  }

  profileFieldsFromRecord(
    value: Record<string, unknown>,
  ): ExtractedProfileFields {
    return profileFieldsFromRecord(value);
  }

  private async callDeepSeekForDirectReply(input: {
    message: string;
    route: SocialAgentIntentRouterResult;
    profile: Record<string, unknown> | null;
    task: AgentTask;
    longTermSnapshot: LongTermMemorySnapshot | null;
    memoryContext: SocialAgentMemoryContext | null;
  }): Promise<string | null> {
    const useCase =
      input.route.intent === 'casual_chat' ? 'casual_chat' : 'final_response';
    return this.deepSeek.complete({
      useCase,
      taskId: input.task.id,
      intent: input.route.intent,
      fallbackTemperature: 0.6,
      maxTokens: 700,
      messages: buildSocialAgentDirectReplyMessages(input),
    });
  }

  private async callDeepSeekForAgentBrain(input: {
    message: string;
    task: AgentTask;
    intent: SocialAgentIntentType;
    mode: 'profile_extraction' | 'profile_correction' | 'profile_updated';
    extractedProfile: ExtractedProfileFields;
    sourceMessage: string;
    toolOutput?: Record<string, unknown>;
  }): Promise<string | null> {
    const useCase = 'final_response' as const;
    return this.deepSeek.complete({
      useCase,
      taskId: input.task.id,
      intent: input.intent,
      fallbackTemperature: 0.6,
      maxTokens: 650,
      messages: buildSocialAgentAgentBrainMessages(input),
    });
  }
}
