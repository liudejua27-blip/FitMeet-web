import { BadRequestException, Injectable } from '@nestjs/common';

import { sanitizeCity } from '../common/city.util';
import { cleanDisplayText } from '../common/display-text.util';
import type { MatchedCandidateView } from '../match/match.service';
import { CreateSocialRequestDto } from '../social-requests/dto/create-social-request.dto';
import { AgentTask } from './entities/agent-task.entity';
import { CandidatePoolDebugReasons } from './social-agent-candidate-pool.service';
import {
  buildSocialAgentRequestDraft,
  toSocialAgentChatCandidate,
  toSocialAgentDraftDto,
  toSocialAgentPublishDto,
} from './social-agent-chat-result.presenter';
import type {
  SocialAgentCandidateSearchResult,
  SocialAgentChatCandidate,
  SocialAgentRequestDraft,
} from './social-agent-chat.types';
import {
  SocialAgentToolExecutorService,
  SocialAgentToolName,
} from './social-agent-tool-executor.service';
import { readSocialAgentTaskMemory } from './social-agent-memory.util';

@Injectable()
export class SocialAgentDraftSearchService {
  constructor(private readonly executor: SocialAgentToolExecutorService) {}

  async refreshDraftAndCandidates(input: {
    task: AgentTask;
    goal: string;
    refreshTask?: () => Promise<AgentTask>;
  }): Promise<{
    task: AgentTask;
    draft: SocialAgentRequestDraft;
    searchResult: SocialAgentCandidateSearchResult;
    candidates: SocialAgentChatCandidate[];
  }> {
    const draftResult = await this.generateDraftWithTool(
      input.task,
      input.goal,
    );
    let task = input.refreshTask ? await input.refreshTask() : input.task;
    const draft = buildSocialAgentRequestDraft({
      agentTaskId: task.id,
      draft: draftResult.draft,
      card: draftResult.card,
      profileUsed: draftResult.profileUsed,
    });
    draft.socialRequestId = await this.createPrivateDraftRequest(task, draft);
    task = input.refreshTask ? await input.refreshTask() : task;
    const searchResult = await this.searchCandidates(task, draft);
    task = input.refreshTask ? await input.refreshTask() : task;
    return {
      task,
      draft,
      searchResult,
      candidates: searchResult.candidates,
    };
  }

  async generateDraftWithTool(
    task: AgentTask,
    goal: string,
  ): Promise<{
    draft: CreateSocialRequestDto;
    card: unknown;
    profileUsed: unknown;
  }> {
    const call = await this.executor.executeToolAction(
      task.id,
      SocialAgentToolName.CreateSocialRequest,
      {
        mode: 'ai_draft',
        rawText: goal,
        goal,
        metadata: {
          agentTaskId: task.id,
          source: 'social_agent_chat',
        },
      },
      task.ownerUserId,
    );
    if (call.status !== 'succeeded') {
      throw new BadRequestException(
        cleanDisplayText(call.error?.message, '生成约练草稿失败'),
      );
    }
    const output = this.isRecord(call.output) ? call.output : {};
    if (!this.isRecord(output.draft)) {
      throw new BadRequestException('生成约练草稿失败：缺少 draft');
    }
    return {
      draft: output.draft as unknown as CreateSocialRequestDto,
      card: output.card,
      profileUsed: output.profileUsed,
    };
  }

  async createPrivateDraftRequest(
    task: AgentTask,
    draft: SocialAgentRequestDraft,
  ): Promise<number> {
    const call = await this.executor.executeToolAction(
      task.id,
      SocialAgentToolName.CreateSocialRequest,
      {
        ...toSocialAgentDraftDto(draft),
        mode: 'private_draft',
        metadata: {
          ...(draft.metadata ?? {}),
          agentTaskId: task.id,
          source: 'social_agent_chat',
          publishPolicy: 'requires_user_confirmation',
        },
      },
      task.ownerUserId,
    );
    if (call.status !== 'succeeded') {
      throw new BadRequestException(
        cleanDisplayText(call.error?.message, '创建私有约练草稿失败'),
      );
    }
    const output = this.isRecord(call.output) ? call.output : {};
    const socialRequestId = this.number(output.socialRequestId ?? output.id);
    if (!socialRequestId) {
      throw new BadRequestException(
        '创建私有约练草稿失败：缺少 socialRequestId',
      );
    }
    return socialRequestId;
  }

  async autoPublishDraftIfAllowed(
    task: AgentTask,
    draft: SocialAgentRequestDraft,
  ): Promise<SocialAgentDraftAutoPublishResult> {
    const gate = this.evaluateAutoPublishGate(task, draft);
    if (!gate.allowed) {
      return {
        autoPublished: false,
        synced: false,
        publicIntentId: null,
        discoverHref: null,
        publishPolicy: gate.publishPolicy,
        blockedReason: gate.reason,
      };
    }

    if (!draft.socialRequestId) {
      return {
        autoPublished: false,
        synced: false,
        publicIntentId: null,
        discoverHref: null,
        publishPolicy: 'blocked_missing_social_request_id',
        blockedReason: 'missing_social_request_id',
      };
    }

    const call = await this.executor.executeToolAction(
      task.id,
      SocialAgentToolName.CreateSocialRequest,
      {
        ...toSocialAgentPublishDto(task.id, draft),
        socialRequestId: draft.socialRequestId,
        mode: 'publish',
        publish: true,
        syncPublicIntent: true,
        metadata: {
          ...(draft.metadata ?? {}),
          socialRequestId: draft.socialRequestId,
          agentTaskId: task.id,
          source: 'social_agent_chat',
          visibilityConsent: true,
          autoPublished: true,
          publishPolicy: 'auto_after_first_public_authorization',
          confirmationSource: 'minimum_profile_gate_public_authorization',
        },
      },
      task.ownerUserId,
    );

    if (call.status !== 'succeeded') {
      return {
        autoPublished: false,
        synced: false,
        publicIntentId: null,
        discoverHref: null,
        publishPolicy: 'auto_publish_failed_keep_private_draft',
        blockedReason: cleanDisplayText(call.error?.message, 'publish_failed'),
      };
    }

    const output = this.isRecord(call.output) ? call.output : {};
    const publicIntentId = cleanDisplayText(output.publicIntentId, '') || null;
    return {
      autoPublished: Boolean(publicIntentId),
      synced: output.synced === true,
      publicIntentId,
      discoverHref: publicIntentId ? `/public-intent/${publicIntentId}` : null,
      publishPolicy: 'auto_after_first_public_authorization',
      blockedReason: null,
    };
  }

  async searchCandidates(
    task: AgentTask,
    draft: SocialAgentRequestDraft,
  ): Promise<SocialAgentCandidateSearchResult> {
    const safetyPolicy = buildCandidateSearchSafetyPolicy(task, draft);
    const input = draft.socialRequestId
      ? {
          socialRequestId: draft.socialRequestId,
          rawText: draft.rawText,
          limit: 10,
          safetyPolicy,
        }
      : {
          city: sanitizeCity(draft.city),
          activityType: cleanDisplayText(draft.activityType, ''),
          interestTags: Array.isArray(draft.interestTags)
            ? draft.interestTags
            : [],
          radiusKm: typeof draft.radiusKm === 'number' ? draft.radiusKm : 5,
          safetyRequirement: draft.safetyRequirement,
          rawText: draft.rawText,
          limit: 10,
          safetyPolicy,
        };
    const call = await this.executor.executeToolAction(
      task.id,
      SocialAgentToolName.SearchMatches,
      input,
      task.ownerUserId,
    );
    if (call.status !== 'succeeded') {
      throw new BadRequestException(
        cleanDisplayText(call.error?.message, '检索候选人失败'),
      );
    }
    const matchedCandidates = this.readMatchedCandidates(call.output);
    const output = this.isRecord(call.output) ? call.output : {};
    const emptyReason =
      cleanDisplayText(output.emptyReason, '') === 'no_real_candidates'
        ? 'no_real_candidates'
        : null;
    const message = cleanDisplayText(output.message, '') || null;
    const debugReasons = this.isRecord(output.debugReasons)
      ? (output.debugReasons as CandidatePoolDebugReasons)
      : null;
    const socialRequestId = draft.socialRequestId ?? null;
    return {
      candidates: matchedCandidates.map((candidate) =>
        toSocialAgentChatCandidate(
          draft.agentTaskId,
          socialRequestId,
          candidate,
        ),
      ),
      emptyReason,
      message,
      debugReasons,
    };
  }

  private readMatchedCandidates(output: unknown): MatchedCandidateView[] {
    const record = this.isRecord(output) ? output : {};
    const candidates = Array.isArray(record.candidates)
      ? record.candidates
      : Array.isArray(record.value)
        ? record.value
        : [];
    return candidates.filter((candidate): candidate is MatchedCandidateView =>
      this.isRecord(candidate),
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private number(value: unknown): number | null {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
  }

  private evaluateAutoPublishGate(
    task: AgentTask,
    draft: SocialAgentRequestDraft,
  ): {
    allowed: boolean;
    publishPolicy: string;
    reason: string | null;
  } {
    const memory = readSocialAgentTaskMemory(task);
    const text = [
      draft.rawText,
      draft.title,
      draft.description,
      draft.city,
      draft.activityType,
      ...(Array.isArray(draft.interestTags) ? draft.interestTags : []),
    ]
      .filter(Boolean)
      .join(' ');
    const hasPublicConsent =
      draft.metadata?.visibilityConsent === true ||
      draft.metadata?.publicActivityAllowed === true ||
      memory.boundaries.publicActivityAllowed === true ||
      containsPublicPublishConsent(text);
    if (!hasPublicConsent) {
      return {
        allowed: false,
        publishPolicy: 'requires_user_confirmation',
        reason: 'missing_public_visibility_consent',
      };
    }

    if (containsSensitivePublishInfo(text)) {
      return {
        allowed: false,
        publishPolicy: 'requires_confirmation_sensitive_content',
        reason: 'sensitive_or_precise_info_detected',
      };
    }

    return {
      allowed: true,
      publishPolicy: 'auto_after_first_public_authorization',
      reason: null,
    };
  }
}

export type SocialAgentDraftAutoPublishResult = {
  autoPublished: boolean;
  synced: boolean;
  publicIntentId: string | null;
  discoverHref: string | null;
  publishPolicy: string;
  blockedReason: string | null;
};

function containsPublicPublishConsent(text: string): boolean {
  return /(可以|愿意|同意|授权|允许).{0,8}(公开|发现页|公开发起|公开活动|发布到发现|同步到发现)/i.test(
    text,
  );
}

function containsSensitivePublishInfo(text: string): boolean {
  return /(\b1[3-9]\d{9}\b|微信|vx|wechat|手机号|电话|身份证|门牌|单元|楼栋|具体地址|精确位置|联系方式|加我|私聊我|转账|支付|红包)/i.test(
    text,
  );
}

function buildCandidateSearchSafetyPolicy(
  task: AgentTask,
  draft: SocialAgentRequestDraft,
) {
  return {
    policyVersion: 'fitmeet.candidate-search.v1',
    source: 'social_agent_chat',
    taskId: task.id,
    socialRequestId: draft.socialRequestId ?? null,
    candidateEligibility: {
      profileDiscoverable: true,
      agentCanRecommendMe: true,
      publicOrAuthorizedSourceOnly: true,
      excludeBlockedUsers: true,
      excludeComplaintRisk: true,
      excludeUnsafeMeetRisk: true,
    },
    privacy: {
      redactPreciseLocation: true,
      redactContactInfo: true,
      exposeOnlyPublicProfileFields: true,
      noPrivateLifeGraphLeakage: true,
    },
    rankingSignals: [
      'city_or_distance',
      'interests',
      'time_overlap',
      'social_boundary',
      'activity_intensity',
      'relationship_goal',
      'public_life_graph_preferences',
    ],
    sideEffectPolicy: 'search_only_no_contact_without_approval',
    approvalPolicy:
      'send_message_add_friend_connect_create_activity_publish_require_checkpoint',
  };
}
