import { BadRequestException, Injectable } from '@nestjs/common';

import { sanitizeCity } from '../common/city.util';
import { cleanDisplayText } from '../common/display-text.util';
import type { MatchedCandidateView } from '../match/match.service';
import { CreateSocialRequestDto } from '../social-requests/dto/create-social-request.dto';
import { AgentTask } from './entities/agent-task.entity';
import { CandidatePoolDebugReasons } from './social-agent-candidate-pool.service';
import {
  toSocialAgentChatCandidate,
  toSocialAgentDraftDto,
} from './social-agent-chat-result.presenter';
import type {
  SocialAgentCandidateSearchResult,
  SocialAgentRequestDraft,
} from './social-agent-chat.types';
import {
  SocialAgentToolExecutorService,
  SocialAgentToolName,
} from './social-agent-tool-executor.service';

@Injectable()
export class SocialAgentDraftSearchService {
  constructor(private readonly executor: SocialAgentToolExecutorService) {}

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

  async searchCandidates(
    task: AgentTask,
    draft: SocialAgentRequestDraft,
  ): Promise<SocialAgentCandidateSearchResult> {
    const input = draft.socialRequestId
      ? {
          socialRequestId: draft.socialRequestId,
          rawText: draft.rawText,
          limit: 10,
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
}
