import { Injectable, Optional } from '@nestjs/common';
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
import type { SocialAgentBrainTurnDecision } from './social-agent-brain.service';
import { SocialAgentChatLlmService } from './social-agent-chat-llm.service';
import type {
  ExtractedProfileFields,
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

type MemoryContextBuilder = (
  task: AgentTask,
) => SocialAgentMemoryContext | null;

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
  ) {}

  async handleTurn(input: {
    ownerUserId: number;
    task: AgentTask;
    message: string;
    intent: SocialAgentIntentType;
    buildMemoryContext: MemoryContextBuilder;
    emit?: StreamEmit;
    signal?: AbortSignal | null;
  }): Promise<{
    assistantMessage: string;
    savedContext: boolean;
    profileUpdated: boolean;
    profileUpdateProposal?: LifeGraphProposalDto | null;
    task: AgentTask;
    assistantStreamed?: boolean;
  }> {
    const { ownerUserId, task, message, intent, buildMemoryContext } = input;

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
    const llmExtractedProfile = await this.chatLlm.extractProfileFieldsWithLlm(
      task,
      sourceMessage,
    );
    const plannedProfile = this.chatLlm.profileFieldsFromRecord(
      readSocialAgentConversationBrainToolArguments(
        task,
        SocialAgentToolName.UpdateProfileFromAgentContext,
      ),
    );
    const mergedProfile: ExtractedProfileFields = {
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
          nextStep: '等待用户确认是否保存 Life Graph 画像提案',
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
      let assistantStreamed = false;
      return {
        assistantMessage: await this.chatLlm.generateAgentBrainReply({
          message,
          task,
          intent,
          mode: 'profile_updated',
          extractedProfile: mergedProfile,
          sourceMessage,
          toolOutput: output,
          fallbackReply,
          memoryContext: buildMemoryContext(task),
          onDelta: input.emit
            ? async (delta) => {
                if (!delta) return;
                assistantStreamed = true;
                await input.emit?.({
                  type: 'assistant_delta',
                  messageId: `agent-message:${task.id}`,
                  delta,
                  source: 'llm',
                });
              }
            : undefined,
          signal: input.signal,
        }),
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
    let assistantStreamed = false;
    return {
      assistantMessage: await this.chatLlm.generateAgentBrainReply({
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
        memoryContext: buildMemoryContext(task),
        onDelta: input.emit
          ? async (delta) => {
              if (!delta) return;
              assistantStreamed = true;
              await input.emit?.({
                type: 'assistant_delta',
                messageId: `agent-message:${task.id}`,
                delta,
                source: 'llm',
              });
            }
          : undefined,
        signal: input.signal,
      }),
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
      '是否保存到你的 Life Graph？保存后我会用它提升匹配准确度；不保存也不会影响当前聊天。',
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
    if (!this.hasOpportunityIntensity(normalizedMessage, signals)) {
      missing.push('运动强度');
    }
    if (
      !this.hasOpportunityBoundary(normalizedMessage, extractedProfile, signals)
    ) {
      missing.push('社交边界');
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
      nextStep: '等待用户确认是否保存 Life Graph 画像提案',
      shouldSearchNow: false,
      profileSaved: false,
      waitingFor: 'life_graph_profile_confirmation',
      lastCompletedStep: 'life_graph_profile_proposed',
    });
  }

  private lifeGraphFieldLabel(fieldKey: string): string {
    const labels: Record<string, string> = {
      city: '城市',
      nearbyArea: '常活动区域',
      availableTimes: '可约时间',
      weekendAvailability: '周末可用时间',
      sportsPreferences: '运动偏好',
      currentSocialGoal: '当前目标',
      preferredSocialStyle: '社交方式',
      acceptsNightMeet: '是否接受晚上见面',
      publicPlaceOnly: '公开地点偏好',
    };
    return labels[fieldKey] ?? fieldKey;
  }

  private shouldSaveProfileFromMessage(message: string): boolean {
    return /(调用工具|保存|写入|存到|完善ai画像|完善AI画像|对，|对,|确认|可以保存)/i.test(
      message,
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
    const userTurns = readSocialAgentConversationHistory(task)
      .filter((turn) => cleanDisplayText(turn.role, '') === 'user')
      .map((turn) => cleanDisplayText(turn.text ?? turn.content, ''))
      .filter((text) => text && text !== current)
      .slice(-5)
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
        /(跑步|咖啡|健身|羽毛球|瑜伽|徒步|骑行|游泳|拍照|篮球|足球|网球)/g,
      ),
    ).map((match) => match[1]);
    if (interestMatches.length > 0)
      fields.interestTags = Array.from(new Set(interestMatches));
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
    const rejectMatch = text.match(
      /(?:不喜欢|不接受|不想|拒绝|避免)([^，。,.]{1,40})/,
    );
    if (rejectMatch) fields.rejectRules = rejectMatch[0];
    const privacyMatch = text.match(/(?:隐私|不公开|不透露)([^，。,.]{1,60})/);
    if (privacyMatch) fields.privacyBoundary = privacyMatch[0];
    return fields;
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
      : [];
    const memoryFields = Array.isArray(output.memoryFields)
      ? output.memoryFields
          .map((item) => cleanDisplayText(item, ''))
          .filter(Boolean)
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
      return `${key}: ${rendered}`;
    });
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

  private hasOpportunityIntensity(
    message: string,
    signals: Record<string, unknown> | null,
  ): boolean {
    return Boolean(
      /(轻松|低强度|中等|高强度|慢跑|快走|新手|入门|进阶|休闲|恢复|配速|强度|\d+\s*(?:km|公里|千米)|半马|全马|力量|拉伸)/i.test(
        message,
      ) ||
      this.hasAnyNamedValue(signals, [
        'intensity',
        'trainingIntensity',
        'fitnessLevel',
        'pace',
        'distance',
      ]),
    );
  }

  private hasOpportunityBoundary(
    message: string,
    extractedProfile: ExtractedProfileFields,
    signals: Record<string, unknown> | null,
  ): boolean {
    return Boolean(
      extractedProfile.privacyBoundary ||
      extractedProfile.rejectRules ||
      /(公共场所|公开地点|先线上|先聊|站内|不加微信|不交换|不透露|白天|边界|安全|女生|男生|同性|多人|不单独|不喝酒|AA|精确位置)/.test(
        message,
      ) ||
      this.hasAnyNamedValue(signals, [
        'publicPlaceOnly',
        'privacyBoundary',
        'rejectRules',
        'socialBoundary',
        'safetyBoundary',
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
