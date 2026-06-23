import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { cleanDisplayText } from '../common/display-text.util';
import { sanitizeCity } from '../common/city.util';
import { LifeGraphProposalDto } from '../life-graph/dto/life-graph.dto';
import { LifeGraphService } from '../life-graph/life-graph.service';
import { AgentTask } from './entities/agent-task.entity';
import {
  mergeSocialAgentStableProfileFacts,
  recordSocialAgentMisunderstanding,
  rememberSocialAgentCurrentTask,
  transitionSocialAgentState,
} from './social-agent-memory.util';
import {
  readSocialAgentConversationBrainLastToolResult,
  readSocialAgentConversationBrainMode,
  readSocialAgentConversationBrainToolArguments,
  readSocialAgentConversationBrainToolNames,
  rememberSocialAgentConversationBrainToolResult,
} from './social-agent-chat-brain-memory.presenter';
import { readSocialAgentConversationHistory } from './social-agent-chat-memory.presenter';
import { socialAgentContextTurnLimit } from './social-agent-context-window';
import type { SocialAgentBrainTurnDecision } from './social-agent-brain.service';
import { SocialAgentChatLlmService } from './social-agent-chat-llm.service';
import type {
  ExtractedProfileFields,
  SocialAgentAssistantMessageSource,
  StreamEmit,
} from './social-agent-chat.types';
import type { SocialAgentMemoryContext } from './social-agent-memory-context.service';
import {
  SocialAgentToolExecutorService,
  SocialAgentToolName,
} from './social-agent-tool-executor.service';
import type {
  SocialAgentIntentRouterResult,
  SocialAgentIntentType,
} from './social-agent-intent-router.service';
import { SocialAgentMetricsService } from './social-agent-metrics.service';
import { buildRunScopedAssistantMessageId } from './social-agent-stream-message-id.util';

type MemoryContextBuilder = (
  task: AgentTask,
) => SocialAgentMemoryContext | null;
type TaskContextBuilder = (
  task: AgentTask,
  memoryContext: SocialAgentMemoryContext | null,
) => Record<string, unknown> | null;

@Injectable()
export class SocialAgentProfileEnrichmentService {
  constructor(
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    private readonly executor: SocialAgentToolExecutorService,
    private readonly chatLlm: SocialAgentChatLlmService,
    private readonly metrics: SocialAgentMetricsService,
    @Optional()
    private readonly lifeGraph?: LifeGraphService,
    @Optional()
    private readonly config?: ConfigService,
  ) {}

  async handleTurn(input: {
    ownerUserId: number;
    task: AgentTask;
    message: string;
    intent: SocialAgentIntentType;
    buildMemoryContext: MemoryContextBuilder;
    buildTaskContext?: TaskContextBuilder;
    traceId?: string | null;
    emit?: StreamEmit;
    signal?: AbortSignal | null;
  }): Promise<{
    assistantMessage: string;
    savedContext: boolean;
    profileUpdated: boolean;
    profileUpdateProposal?: LifeGraphProposalDto | null;
    task: AgentTask;
    assistantStreamed?: boolean;
    assistantMessageSource?: SocialAgentAssistantMessageSource;
  }> {
    const { ownerUserId, task, message, intent, buildMemoryContext } = input;
    const assistantMessageId = buildRunScopedAssistantMessageId({
      taskId: task.id,
      traceId: input.traceId,
    });

    if (this.shouldStartProfileCompletionMode(message, intent)) {
      transitionSocialAgentState(task, 'profile_detected', {
        objective: 'profile_completion',
        nextStep: '等待用户回答画像完善问题',
        shouldSearchNow: false,
        profileSaved: false,
        awaitingSearchConfirmation: false,
        waitingFor: 'profile_completion_answers',
        lastCompletedStep: 'profile_completion_questions_asked',
      });
      await this.taskRepo.save(task);
      return {
        assistantMessage: this.profileCompletionQuestionReply(task),
        assistantMessageSource: 'deterministic_route',
        savedContext: true,
        profileUpdated: false,
        profileUpdateProposal: null,
        task,
        assistantStreamed: false,
      };
    }

    if (this.isProfileMissingFieldsQuestion(message)) {
      return {
        assistantMessage: this.profileMissingFieldsReply(task),
        savedContext: true,
        profileUpdated: false,
        profileUpdateProposal: null,
        task,
      };
    }

    const sourceMessage =
      intent === 'profile_enrichment'
        ? message
        : this.findRecentProfileSourceMessage(task, message) || message;
    const extractedProfile = this.extractProfileFieldsFromConversation([
      sourceMessage,
    ]);
    const llmExtractedProfile = this.hasSufficientDeterministicProfileSignal(
      extractedProfile,
    )
      ? (this.recordDeterministicProfileExtraction(), {})
      : await this.chatLlm.extractProfileFieldsWithLlm(task, sourceMessage);
    const plannedProfile = this.chatLlm.profileFieldsFromRecord(
      readSocialAgentConversationBrainToolArguments(
        task,
        SocialAgentToolName.UpdateProfileFromAgentContext,
      ),
    );
    const pendingProfile = this.pendingExtractedProfile(task);
    const mergedProfile: ExtractedProfileFields = {
      ...pendingProfile,
      ...plannedProfile,
      ...extractedProfile,
      ...llmExtractedProfile,
    };
    this.rememberExtractedProfileInTaskMemory(
      task,
      mergedProfile,
      sourceMessage,
    );
    await this.taskRepo.save(task);

    if (this.lifeGraph && Object.keys(mergedProfile).length > 0) {
      const proposal = await this.lifeGraph.extractFromChat(ownerUserId, {
        message: sourceMessage,
        taskId: task.id,
        context: { intent, extractedProfile: mergedProfile },
      });
      if (proposal.proposedFields.length > 0) {
        rememberSocialAgentCurrentTask(task, {
          objective: 'profile_enrichment',
          nextStep: '等待用户确认是否保存画像更新建议',
          shouldSearchNow: false,
          profileSaved: false,
          waitingFor: 'life_graph_profile_confirmation',
          lastCompletedStep: 'life_graph_profile_proposed',
        });
        transitionSocialAgentState(task, 'profile_detected');
        await this.taskRepo.save(task);
        return {
          assistantMessage: this.lifeGraphProposalReply(proposal),
          savedContext: true,
          profileUpdated: false,
          profileUpdateProposal: proposal,
          task,
        };
      }
    }

    const shouldSave = this.shouldSaveProfileFromMessage(message);
    const brainMode = readSocialAgentConversationBrainMode(task);
    const brainWantsProfileTool = readSocialAgentConversationBrainToolNames(
      task,
    ).includes(SocialAgentToolName.UpdateProfileFromAgentContext);
    if (
      (shouldSave ||
        brainMode === 'profile_update_tool' ||
        brainWantsProfileTool) &&
      Object.keys(mergedProfile).length > 0
    ) {
      const call = await this.executor.executeToolAction(
        task.id,
        SocialAgentToolName.UpdateProfileFromAgentContext,
        {
          extractedProfile: mergedProfile,
          sourceMessage,
          taskId: task.id,
        },
        ownerUserId,
      );
      const output = this.isRecord(call.output) ? call.output : {};
      rememberSocialAgentConversationBrainToolResult(task, {
        name: SocialAgentToolName.UpdateProfileFromAgentContext,
        status: call.status,
        input: {
          extractedProfile: mergedProfile,
          sourceMessage,
        },
        output,
        error: call.error ?? null,
      });
      mergeSocialAgentStableProfileFacts(task, mergedProfile);
      transitionSocialAgentState(task, 'profile_saved', {
        objective: 'profile_enrichment',
        nextStep: '询问可约时间、边界要求，或等待用户确认开始搜索',
        shouldSearchNow: false,
        profileSaved: call.status === 'succeeded',
        awaitingSearchConfirmation: true,
        waitingFor: 'availability_boundaries_or_search_confirmation',
        lastCompletedStep: 'profile_saved',
      });
      await this.taskRepo.save(task);
      const fallbackReply = this.profileUpdatedReply(mergedProfile, output);
      const memoryContext = buildMemoryContext(task);
      const taskContext = input.buildTaskContext?.(task, memoryContext) ?? null;
      let assistantStreamed = false;
      const answer = await this.chatLlm.generateAgentBrainReplyWithSource({
        message,
        task,
        intent,
        mode: 'profile_updated',
        extractedProfile: mergedProfile,
        sourceMessage,
        toolOutput: output,
        fallbackReply,
        memoryContext,
        ...(taskContext ? { taskContext } : {}),
        conversationHistory: memoryContext?.shortTerm?.recentTurns ?? null,
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
      return {
        assistantMessage: answer.text,
        assistantMessageSource: assistantStreamed ? 'llm' : answer.source,
        savedContext: true,
        profileUpdated: call.status === 'succeeded',
        profileUpdateProposal: null,
        task,
        assistantStreamed,
      };
    }

    const fallbackReply = this.profileExtractionReply(
      mergedProfile,
      intent === 'correction_or_clarification',
    );
    rememberSocialAgentCurrentTask(task, {
      objective: 'profile_enrichment',
      nextStep: '询问是否保存画像，或继续补齐可约时间和边界',
      shouldSearchNow: false,
      profileSaved: false,
      awaitingSearchConfirmation: true,
      waitingFor: 'profile_save_or_more_profile_facts',
      lastCompletedStep: 'profile_extracted',
    });
    transitionSocialAgentState(task, 'profile_detected');
    await this.taskRepo.save(task);
    if (this.hasSufficientDeterministicProfileSignal(mergedProfile)) {
      this.recordDeterministicProfileReply();
      return {
        assistantMessage: fallbackReply,
        assistantMessageSource: 'deterministic_route',
        savedContext: true,
        profileUpdated: false,
        profileUpdateProposal: null,
        task,
        assistantStreamed: false,
      };
    }
    const memoryContext = buildMemoryContext(task);
    const taskContext = input.buildTaskContext?.(task, memoryContext) ?? null;
    let assistantStreamed = false;
    const answer = await this.chatLlm.generateAgentBrainReplyWithSource({
      message,
      task,
      intent,
      mode:
        intent === 'correction_or_clarification'
          ? 'profile_correction'
          : 'profile_extraction',
      extractedProfile: mergedProfile,
      sourceMessage,
      fallbackReply,
      memoryContext,
      ...(taskContext ? { taskContext } : {}),
      conversationHistory: memoryContext?.shortTerm?.recentTurns ?? null,
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
    return {
      assistantMessage: answer.text,
      assistantMessageSource: assistantStreamed ? 'llm' : answer.source,
      savedContext: true,
      profileUpdated: false,
      profileUpdateProposal: null,
      task,
      assistantStreamed,
    };
  }

  lifeGraphProposalReply(proposal: LifeGraphProposalDto): string {
    const lines = proposal.proposedFields.slice(0, 8).map((field) => {
      const value = Array.isArray(field.fieldValue)
        ? field.fieldValue.join('、')
        : safeUnknownText(field.fieldValue);
      return `- ${this.lifeGraphFieldLabel(field.fieldKey)}：${value}`;
    });
    return [
      '我识别到以下画像信息：',
      ...lines,
      '是否保存到你的个人信息？保存后我会用它提升匹配准确度；不保存也不会影响当前聊天。',
    ].join('\n');
  }

  async lifeGraphSearchClarification(
    ownerUserId: number,
    message: string,
  ): Promise<string | null> {
    const normalizedMessage = cleanDisplayText(message, '');
    if (
      !/找|匹配|推荐|搭子|约练|约跑|一起|认识|candidate|match|find/i.test(
        normalizedMessage,
      )
    ) {
      return null;
    }

    let signals: Record<string, unknown> | null = null;
    if (this.lifeGraph) {
      try {
        const nextSignals =
          await this.lifeGraph.getUnifiedMatchSignals(ownerUserId);
        signals = this.isRecord(nextSignals) ? nextSignals : null;
      } catch {
        signals = null;
      }
    }
    const extractedProfile = this.extractProfileFieldsFromConversation([
      normalizedMessage,
    ]);
    const missing: string[] = [];

    if (
      !this.hasOpportunityCityOrArea(
        normalizedMessage,
        extractedProfile,
        signals,
      )
    ) {
      missing.push('城市或常活动区域');
    }
    if (
      !this.hasOpportunityTime(normalizedMessage, extractedProfile, signals)
    ) {
      missing.push('方便的时间');
    }
    if (missing.length === 0) return null;
    const missingText = missing.slice(0, 4).join('、');
    return [
      '可以，我先把你的需求整理成一个安全的连接机会，再开始找人。',
      `还差：${missingText}。`,
      '你可以直接回复类似：“上海浦东，周末晚上，5km 慢跑，先站内聊，第一次只约公共场所”。',
      '补齐后我会先做候选召回、安全过滤和排序，只展示少量合适机会；发送邀请前一定会再让你确认。',
    ].join('\n');
  }

  async executeConversationBrainReadTools(
    ownerUserId: number,
    task: AgentTask,
    decision?: SocialAgentBrainTurnDecision,
  ): Promise<Array<Record<string, unknown>>> {
    if (!decision?.shouldExecuteTool) return [];
    const readTools = decision.tools.filter((tool) =>
      this.isConversationBrainReadTool(tool.name),
    );
    const results: Array<Record<string, unknown>> = [];
    for (const tool of readTools) {
      const toolName = this.executorToolForConversationBrainRead(tool.name);
      if (!toolName) continue;
      try {
        const call = await this.executor.executeToolAction(
          task.id,
          toolName,
          {
            ...tool.arguments,
            userId: ownerUserId,
          },
          ownerUserId,
        );
        const result = {
          name: tool.name,
          executorToolName: toolName,
          status: call.status,
          output: call.output,
          error: call.error,
        };
        results.push(result);
        rememberSocialAgentConversationBrainToolResult(task, result);
      } catch (error) {
        this.metrics.recordError('conversation_brain_read_tool_failed');
        const result = {
          name: tool.name,
          executorToolName: toolName,
          status: 'failed',
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        };
        results.push(result);
        rememberSocialAgentConversationBrainToolResult(task, result);
      }
    }
    return results;
  }

  rememberCurrentTaskFromBrain(
    task: AgentTask,
    route: SocialAgentIntentRouterResult,
  ): void {
    const brainMode = readSocialAgentConversationBrainMode(task);
    if (
      route.intent === 'profile_enrichment' ||
      route.intent === 'profile_enrichment_request' ||
      route.intent === 'correction_or_clarification' ||
      brainMode === 'profile_enrichment' ||
      brainMode === 'profile_correction' ||
      brainMode === 'profile_update_tool'
    ) {
      rememberSocialAgentCurrentTask(task, {
        objective: 'profile_enrichment',
        nextStep:
          brainMode === 'profile_update_tool'
            ? '保存画像后询问可约时间和边界要求'
            : '提取画像信息，询问是否保存或继续补齐',
        shouldSearchNow: false,
        awaitingSearchConfirmation: true,
        waitingFor:
          brainMode === 'profile_update_tool'
            ? 'profile_save'
            : 'profile_save_or_search_confirmation',
      });
      transitionSocialAgentState(
        task,
        route.intent === 'correction_or_clarification'
          ? 'user_correction'
          : 'profile_detected',
      );
      return;
    }
    if (route.intent === 'workflow_help') {
      rememberSocialAgentCurrentTask(task, {
        objective: 'workflow_help',
        nextStep: '解释直接发布需求和先完善画像两种路径',
        shouldSearchNow: false,
        awaitingSearchConfirmation: false,
        waitingFor: 'user_choice',
      });
      transitionSocialAgentState(task, 'workflow_help');
      return;
    }
    if (
      route.intent === 'social_search' ||
      route.intent === 'activity_search'
    ) {
      rememberSocialAgentCurrentTask(task, {
        objective: 'search',
        nextStep: '调用搜索工具并基于真实结果回复',
        shouldSearchNow: true,
        awaitingSearchConfirmation: false,
        waitingFor: 'search_results',
      });
      transitionSocialAgentState(task, 'search_started');
    }
  }

  recordProfileMisunderstanding(task: AgentTask, reason: string): void {
    recordSocialAgentMisunderstanding(task, reason || 'user_correction');
    transitionSocialAgentState(task, 'user_correction', {
      objective: 'profile_enrichment',
      nextStep: '重新理解上一段画像信息并继续补齐',
      shouldSearchNow: false,
      waitingFor: 'profile_repair',
    });
  }

  rememberLifeGraphProfileProposal(task: AgentTask): void {
    rememberSocialAgentCurrentTask(task, {
      objective: 'profile_enrichment',
      nextStep: '等待用户确认是否保存画像更新建议',
      shouldSearchNow: false,
      profileSaved: false,
      waitingFor: 'life_graph_profile_confirmation',
      lastCompletedStep: 'life_graph_profile_proposed',
    });
  }

  private lifeGraphFieldLabel(fieldKey: string): string {
    return this.profileFieldLabel(fieldKey);
  }

  private shouldSaveProfileFromMessage(message: string): boolean {
    return /(调用工具|保存|写入|存到|对，|对,|确认|可以保存)/i.test(message);
  }

  private shouldStartProfileCompletionMode(
    message: string,
    intent: SocialAgentIntentType,
  ): boolean {
    const text = cleanDisplayText(message, '');
    if (!text) return false;
    if (this.shouldSaveProfileFromMessage(text)) return false;
    if (
      intent !== 'profile_enrichment_request' &&
      !this.isProfileMissingFieldsQuestion(text)
    ) {
      return false;
    }
    if (
      !this.isProfileMissingFieldsQuestion(text) &&
      Object.keys(this.extractProfileFieldsFromConversation([text])).length > 0
    ) {
      return false;
    }
    return (
      this.isProfileMissingFieldsQuestion(text) ||
      /(帮我|可以|想|需要|继续|请你).{0,16}(完善|补充|整理|更新).{0,16}(画像|资料|偏好|信息)/i.test(
        text,
      ) ||
      /(完善|补充|整理|更新).{0,16}(画像|资料|偏好|信息)/i.test(text) ||
      /问我.{0,8}(几个问题|问题)/i.test(text)
    );
  }

  private isProfileMissingFieldsQuestion(message: string): boolean {
    return /(\u8fd8\u7f3a\u4ec0\u4e48|\u8fd8\u5dee\u4ec0\u4e48|\u7f3a\u54ea\u4e9b|\u7f3a\u5c11\u54ea\u4e9b|\u753b\u50cf.*\u7f3a|\u8d44\u6599.*\u7f3a|\u8fd8\u9700\u8981\u8865\u5145\u4ec0\u4e48)/i.test(
      message,
    );
  }

  private findRecentProfileSourceMessage(
    task: AgentTask,
    currentMessage: string,
  ): string | null {
    const current = cleanDisplayText(currentMessage, '');
    const userTurns = readSocialAgentConversationHistory(
      task,
      socialAgentContextTurnLimit(this.config),
    )
      .filter((turn) => cleanDisplayText(turn.role, '') === 'user')
      .map((turn) => cleanDisplayText(turn.text ?? turn.content, ''))
      .filter((text) => text && text !== current)
      .reverse();
    return (
      userTurns.find(
        (text) =>
          Object.keys(this.extractProfileFieldsFromConversation([text]))
            .length >= 2,
      ) ??
      userTurns[0] ??
      null
    );
  }

  private pendingExtractedProfile(task: AgentTask): ExtractedProfileFields {
    const memory = this.isRecord(task.memory) ? task.memory : {};
    const pending = this.isRecord(memory.pendingProfileEnrichment)
      ? memory.pendingProfileEnrichment
      : {};
    const extracted = this.isRecord(pending.extractedProfile)
      ? pending.extractedProfile
      : {};
    return this.chatLlm.profileFieldsFromRecord(extracted);
  }

  private extractProfileFieldsFromConversation(
    messages: string[],
  ): ExtractedProfileFields {
    const text = messages.map((item) => cleanDisplayText(item, '')).join('。');
    const fields: ExtractedProfileFields = {};
    const genderMatch = text.match(/(男生|女生|男|女)/);
    if (genderMatch)
      fields.gender = genderMatch[1].includes('女') ? '女' : '男';
    const ageMatch = text.match(
      /(?:^|[，。,.\s])(\d{1,2})\s*(?:岁)?(?:[，。,.\s]|$)/,
    );
    if (ageMatch) fields.ageRange = ageMatch[1];
    const heightMatch = text.match(/身高\s*(\d{2,3})\s*(?:cm|厘米)?/i);
    if (heightMatch) fields.height = `${heightMatch[1]}cm`;
    const weightMatch = text.match(/体重\s*(\d{2,3})\s*(?:kg|公斤|斤)?/i);
    if (weightMatch) fields.weight = `${weightMatch[1]}kg`;
    const zodiacMatch = text.match(
      /(白羊|金牛|双子|巨蟹|狮子|处女|天秤|天蝎|射手|摩羯|水瓶|双鱼)(?:座)?/,
    );
    if (zodiacMatch) fields.zodiac = `${zodiacMatch[1]}座`;
    const mbtiMatch = text.match(
      /\b(infp|enfp|intj|entj|intp|entp|isfp|istp|isfj|istj|esfp|estp|esfj|estj|infj|enfj)\b/i,
    );
    if (mbtiMatch) fields.mbti = mbtiMatch[1].toUpperCase();
    const cityMatch = text.match(
      /(青岛|北京|上海|深圳|广州|杭州|南京|成都|武汉|西安|重庆|苏州|厦门|天津|长沙|郑州|济南|宁波|合肥)/,
    );
    if (cityMatch) fields.city = sanitizeCity(cityMatch[1]);
    const schoolMatch = text.match(/([\u4e00-\u9fa5]{2,20}大学)/);
    if (schoolMatch) {
      fields.school = schoolMatch[1].replace(
        /^.*?(?=[\u4e00-\u9fa5]{2,8}大学$)/,
        '',
      );
      if (schoolMatch[1].includes('青岛大学')) fields.school = '青岛大学';
    }
    const nearbyMatch = text.match(
      /(?:常住在|住在|在)([^，。,.]{2,30}(?:区|大学|校区|附近))/,
    );
    if (nearbyMatch) fields.nearbyArea = nearbyMatch[1];
    const personalityMatch = text.match(/性格([^，。,.]{1,30})/);
    const personalityParts = [
      personalityMatch?.[1],
      typeof fields.mbti === 'string' ? fields.mbti : '',
    ].filter((item): item is string => Boolean(item));
    if (personalityParts.length > 0) {
      fields.personality = personalityParts.join('，');
      fields.traits = personalityParts;
    }
    const interestMatches = Array.from(
      text.matchAll(
        /(跑步|咖啡|健身|羽毛球|瑜伽|徒步|骑行|游泳|拍照|篮球|足球|网球|散步|编程|舞蹈|跳舞|Citywalk|citywalk|书店|电影|桌游|爬山|露营|飞盘)/g,
      ),
    ).map((match) => match[1]);
    if (interestMatches.length > 0)
      fields.interestTags = Array.from(
        new Set(
          interestMatches.map((item) =>
            item.toLowerCase() === 'citywalk' ? 'Citywalk' : item,
          ),
        ),
      );
    const timeMatch = text.match(
      /(周末[^，。,.]{0,12}|下午|晚上|工作日[^，。,.]{0,12})/,
    );
    if (timeMatch) fields.availableTimes = [timeMatch[1]];
    const targetMatch = text.match(/想(?:找|认识)([^，。,.]{1,30})/);
    if (targetMatch) {
      const target = targetMatch[1].trim().replace(/^(一个|个|一位|位)/, '');
      fields.socialGoal = `想认识${target}`;
      fields.targetPreference = target;
      fields.wantToMeet = [target];
      fields.preferredTraits = [target];
    }
    const publicTagPreference = this.extractPublicTagPreference(text);
    if (publicTagPreference) {
      const existing = Array.isArray(fields.preferredTraits)
        ? fields.preferredTraits
        : [];
      const targetPreferenceParts = Array.from(
        new Set(
          [fields.targetPreference, publicTagPreference]
            .map((item) => cleanDisplayText(item, ''))
            .filter(Boolean),
        ),
      );
      fields.targetPreference = targetPreferenceParts.join('，');
      fields.preferredTraits = Array.from(
        new Set([...existing, ...targetPreferenceParts]),
      );
    }
    const rejectMatch = text.match(
      /(?:不喜欢|不接受|不想|拒绝|避免)([^，。,.]{1,40})/,
    );
    if (rejectMatch) fields.rejectRules = rejectMatch[0];
    const privacyMatch = text.match(/(?:隐私|不公开|不透露)([^，。,.]{1,60})/);
    if (privacyMatch) fields.privacyBoundary = privacyMatch[0];
    const socialBoundary = this.extractSocialSafetyBoundary(text);
    if (socialBoundary) {
      fields.socialBoundary = socialBoundary;
      const existingPrivacyBoundary = cleanDisplayText(
        fields.privacyBoundary,
        '',
      );
      fields.privacyBoundary = existingPrivacyBoundary
        ? `${existingPrivacyBoundary}；${socialBoundary}`
        : socialBoundary;
    }
    return fields;
  }

  private recordDeterministicProfileExtraction(): void {
    this.metrics.recordDeterministicRouteReply(
      'profile_extraction.rule_based',
      { estimatedAvoidedLlmCalls: 1 },
    );
  }

  private recordDeterministicProfileReply(): void {
    this.metrics.recordDeterministicRouteReply(
      'profile_extraction.deterministic_reply',
      { estimatedAvoidedLlmCalls: 1 },
    );
  }

  private extractPublicTagPreference(text: string): string {
    const preferences = [
      /(?:公开资料|资料|标签|最好|优先)(?:里|中)?[^，。,.]{0,16}(舞蹈|跳舞|编程|程序员|摄影|瑜伽|羽毛球|跑步|健身)[^，。,.]{0,12}/,
      /(?:找|认识|希望|优先|最好)[^，。,.]{0,16}(女生|男生|同校|同城|校友|舞蹈生|程序员|编程相关|舞蹈相关)[^，。,.]{0,12}/,
    ]
      .map((pattern) => text.match(pattern)?.[0])
      .filter((item): item is string => Boolean(item))
      .map((item) =>
        cleanDisplayText(item, '')
          .replace(/^(想)?(?:找|认识|希望|优先|最好)/, '')
          .trim(),
      )
      .filter(Boolean);
    return Array.from(new Set(preferences)).slice(0, 3).join('，');
  }

  private extractSocialSafetyBoundary(text: string): string {
    const boundaries: string[] = [];
    if (/公共场所|公开场所|人多|校园内|校内|白天/.test(text)) {
      boundaries.push('第一次见面优先公共场所');
    }
    if (
      /站内聊|站内沟通|先聊天|先聊|不交换联系方式|不加微信|不留电话/.test(text)
    ) {
      boundaries.push('先站内沟通，不自动交换联系方式');
    }
    if (/不公开精确位置|不透露具体位置|模糊位置|位置保护/.test(text)) {
      boundaries.push('保护精确位置，只使用模糊区域');
    }
    return Array.from(new Set(boundaries)).join('；');
  }

  private hasSufficientDeterministicProfileSignal(
    fields: ExtractedProfileFields,
  ): boolean {
    const strongKeys = [
      'city',
      'school',
      'nearbyArea',
      'mbti',
      'zodiac',
      'ageRange',
      'height',
      'weight',
      'personality',
      'interestTags',
      'availableTimes',
      'targetPreference',
      'socialGoal',
      'privacyBoundary',
      'rejectRules',
      'socialBoundary',
      'preferredTraits',
    ];
    const strongSignals = strongKeys.filter((key) =>
      this.hasUsefulValue(fields[key]),
    );
    if (strongSignals.length >= 2) return true;
    return Boolean(
      fields.targetPreference &&
      (fields.city || fields.school || fields.nearbyArea),
    );
  }

  private rememberExtractedProfileInTaskMemory(
    task: AgentTask,
    extractedProfile: ExtractedProfileFields,
    sourceMessage: string,
  ): void {
    const memory = this.isRecord(task.memory) ? task.memory : {};
    task.memory = {
      ...memory,
      pendingProfileEnrichment: {
        extractedProfile,
        sourceMessage,
        updatedAt: new Date().toISOString(),
      },
    };
  }

  private isConversationBrainReadTool(toolName: string): boolean {
    return [
      'get_user_profile',
      'get_conversation_history',
      'get_conversation_messages',
      'get_candidate_detail',
    ].includes(cleanDisplayText(toolName, ''));
  }

  private executorToolForConversationBrainRead(
    toolName: string,
  ): SocialAgentToolName | null {
    switch (cleanDisplayText(toolName, '')) {
      case 'get_user_profile':
        return SocialAgentToolName.GetMyProfile;
      case 'get_conversation_history':
      case 'get_conversation_messages':
        return SocialAgentToolName.ReadTaskConversationMessages;
      case 'get_candidate_detail':
        return SocialAgentToolName.ExplainMatches;
      default:
        return null;
    }
  }

  private profileMissingFieldsReply(task: AgentTask): string {
    const lastToolResult =
      readSocialAgentConversationBrainLastToolResult(task) ?? {};
    const output = this.isRecord(lastToolResult.output)
      ? lastToolResult.output
      : {};
    const missingFields = Array.isArray(output.missingFields)
      ? output.missingFields
          .map((item) => cleanDisplayText(item, ''))
          .filter(Boolean)
      : [];
    const knownMissing =
      missingFields.length > 0
        ? `工具返回还缺：${missingFields.join('、')}。`
        : '目前画像主干已经有了，但关键约练条件还不够完整。';

    return [
      knownMissing,
      '建议再补：可约时间、具体活动类型、边界要求，以及是否只接受校内/公共场所。',
      '你可以直接按“时间 + 活动 + 边界”补一句，比如：周末下午，校园内咖啡或散步，只在公共场所。',
    ].join('\n');
  }

  private profileCompletionQuestionReply(task: AgentTask): string {
    const missingFields = this.profileCompletionMissingFields(task);
    const questionCount = 5;
    const missingLine =
      missingFields.length > 0
        ? `当前画像信息建议先补：${missingFields.join('、')}。`
        : '当前画像信息建议先补：当前目标、互动形式、时间地点、活动偏好和安全边界。';

    return [
      `我会先帮你补充 ${questionCount} 项关键画像信息，所有问题都可以跳过，或选“暂不确定”。`,
      missingLine,
      '本次不会推荐具体人物，不会生成联系文案，也不会替你执行外部动作；也不会直接搜索候选人。',
      '',
      '1. 你这次最想达成什么？',
      '   可选：找运动搭子 / 找轻松聊天的人 / 参加附近活动 / 暂不确定',
      '2. 你偏好的互动形式是什么？',
      '   可选：先站内沟通 / 低压力轻松聊 / 先运动后熟悉 / 暂不确定',
      '3. 你方便的时间和地点范围？',
      '   可选：今天晚上 / 周末下午 / 学校或公司附近 / 3 公里内 / 暂不确定',
      '4. 你更想参加哪类活动？',
      '   可选：跑步 / 羽毛球 / 散步 / 健身 / 暂不确定',
      '5. 有哪些必要的安全边界？',
      '   可选：只接受公共场所 / 不交换联系方式 / 不接受太晚见面 / 暂不确定',
      '',
      '你回答后，我会先生成结构化更新预览，由你选择“确认保存”“修改后保存”或“本次使用，不保存”。保存完成后，我再单独问你是否开始匹配。',
    ].join('\n');
  }

  private profileExtractionReply(
    extractedProfile: ExtractedProfileFields,
    corrected: boolean,
  ): string {
    const lines = this.profileFieldLines(extractedProfile);
    const intro = corrected
      ? '我理解了，刚才那段是你的画像信息，不是立即搜索需求。我先不搜索。'
      : '我已提取到这些画像信息，先不直接搜索候选人。';
    return [
      intro,
      lines.length > 0
        ? `已提取：${lines.join('；')}`
        : '我还没有提取到足够明确的画像字段。',
      '你要我把这些信息保存到 AI 画像里吗？保存后，我也可以继续问你可约时间、边界要求，再基于画像开始搜索。',
      '你也可以直接补充：城市/区域、兴趣、可约时间、想认识的人和边界。',
    ].join('\n');
  }

  private profileUpdatedReply(
    extractedProfile: ExtractedProfileFields,
    output: Record<string, unknown>,
  ): string {
    const updatedFields = Array.isArray(output.updatedFields)
      ? output.updatedFields
          .map((item) => cleanDisplayText(item, ''))
          .filter(Boolean)
          .map((item) => this.profileFieldLabel(item))
      : [];
    const memoryFields = Array.isArray(output.memoryFields)
      ? output.memoryFields
          .map((item) => cleanDisplayText(item, ''))
          .filter(Boolean)
          .map((item) => this.profileFieldLabel(item))
      : [];
    const lines = this.profileFieldLines(extractedProfile);
    return [
      '已帮你把刚才的信息写入 AI 画像。',
      updatedFields.length > 0
        ? `已保存到画像字段：${updatedFields.join('、')}`
        : '',
      memoryFields.length > 0
        ? `作为补充偏好记录：${memoryFields.join('、')}`
        : '',
      lines.length > 0 ? `本次识别：${lines.join('；')}` : '',
      '还缺少可约时间、明确边界和具体约练偏好。你可以继续补充，或者告诉我“现在开始搜索”。',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private profileFieldLines(fields: ExtractedProfileFields): string[] {
    return Object.entries(fields).map(([key, value]) => {
      const rendered = Array.isArray(value) ? value.join('、') : value;
      return `${this.profileFieldLabel(key)}：${rendered}`;
    });
  }

  private profileCompletionMissingFields(task: AgentTask): string[] {
    const lastToolResult =
      readSocialAgentConversationBrainLastToolResult(task) ?? {};
    const output = this.isRecord(lastToolResult.output)
      ? lastToolResult.output
      : {};
    const missingFields = Array.isArray(output.missingFields)
      ? output.missingFields
          .map((item) => cleanDisplayText(item, ''))
          .filter(Boolean)
      : [];
    return Array.from(
      new Set(
        missingFields
          .map((field) => this.profileFieldLabel(field))
          .filter(Boolean),
      ),
    ).slice(0, 5);
  }

  private profileFieldLabel(fieldKey: string): string {
    const labels: Record<string, string> = {
      gender: '性别',
      ageRange: '年龄',
      height: '身高',
      weight: '体重',
      zodiac: '星座',
      mbti: 'MBTI',
      city: '城市',
      school: '学校',
      nearbyArea: '常活动区域',
      personality: '性格',
      traits: '性格特点',
      interestTags: '兴趣和活动偏好',
      availableTimes: '可约时间',
      weekendAvailability: '周末可用时间',
      targetPreference: '想认识的人',
      socialGoal: '当前目标',
      currentSocialGoal: '当前目标',
      wantToMeet: '想认识的人',
      preferredTraits: '偏好特质',
      rejectRules: '不接受的情况',
      privacyBoundary: '隐私边界',
      socialBoundary: '安全边界',
      sportsPreferences: '运动偏好',
      preferredSocialStyle: '社交方式',
      acceptsNightMeet: '是否接受晚上见面',
      publicPlaceOnly: '公开地点偏好',
      activityPreference: '活动偏好',
      interactionStyle: '互动形式',
      locationRange: '地点范围',
      safetyBoundary: '安全边界',
      boundary: '安全边界',
      boundaries: '安全边界',
      可约时间: '可约时间',
      边界要求: '安全边界',
      活动偏好: '活动偏好',
      城市: '城市',
      常活动区域: '常活动区域',
      当前目标: '当前目标',
      互动形式: '互动形式',
      时间地点: '时间地点',
    };
    return labels[fieldKey] ?? '补充信息';
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private hasOpportunityCityOrArea(
    message: string,
    extractedProfile: ExtractedProfileFields,
    signals: Record<string, unknown> | null,
  ): boolean {
    return Boolean(
      extractedProfile.city ||
      extractedProfile.nearbyArea ||
      /(青岛|北京|上海|深圳|广州|杭州|南京|成都|武汉|西安|重庆|苏州|厦门|天津|长沙|郑州|济南|宁波|合肥|附近|周边|校区|公园|区|路|商圈)/.test(
        message,
      ) ||
      this.hasAnyNamedValue(signals, [
        'city',
        'nearbyArea',
        'location',
        'locationText',
        'activityArea',
      ]),
    );
  }

  private hasOpportunityTime(
    message: string,
    extractedProfile: ExtractedProfileFields,
    signals: Record<string, unknown> | null,
  ): boolean {
    return Boolean(
      extractedProfile.availableTimes ||
      /(周末|今晚|明天|后天|下午|晚上|早上|上午|中午|工作日|下班|午休|本周|这周|周[一二三四五六日天]|\d{1,2}\s*[点:：])/.test(
        message,
      ) ||
      this.hasAnyNamedValue(signals, [
        'availableTimes',
        'weekendAvailability',
        'timePreference',
        'preferredTime',
      ]),
    );
  }

  private hasAnyNamedValue(value: unknown, keys: string[], depth = 0): boolean {
    if (depth > 4 || value == null) return false;
    if (Array.isArray(value)) {
      return value.some((item) => this.hasAnyNamedValue(item, keys, depth + 1));
    }
    if (!this.isRecord(value)) return false;
    for (const [key, entry] of Object.entries(value)) {
      if (keys.includes(key) && this.hasUsefulValue(entry)) return true;
      if (this.hasAnyNamedValue(entry, keys, depth + 1)) return true;
    }
    return false;
  }

  private hasUsefulValue(value: unknown): boolean {
    if (value == null) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'string')
      return cleanDisplayText(value, '').length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return this.isRecord(value) && Object.keys(value).length > 0;
  }
}

function safeUnknownText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint' ||
    typeof value === 'symbol'
  ) {
    return String(value);
  }
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}
