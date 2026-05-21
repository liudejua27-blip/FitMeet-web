import { Injectable, Logger } from '@nestjs/common';
import { AIService } from '../ai/ai.service';
import { UserSocialRequest } from '../social-requests/social-request.entity';
import { UserSocialProfile } from '../users/user-social-profile.entity';
import { User } from '../users/user.entity';
import { MatchPrivacySanitizer } from './match-privacy-sanitizer.service';

export type MatchResultSource = 'profile_pool' | 'social_request' | 'public_intent';

export type MatchReasoningResult = {
  score: number;
  scoreBreakdown: Record<string, number>;
  matchedSignals: string[];
  publicReason: string;
  privateReason: string;
  riskWarning: string;
  riskWarnings: string[];
  suggestedOpener: string;
  nextAction: string;
  reasonerSource: 'deepseek' | 'fallback';
};

type SocialRequestReasoningInput = {
  request: UserSocialRequest;
  source: MatchResultSource;
  ownerProfile: UserSocialProfile | null;
  candidateUser: User;
  candidateProfile: UserSocialProfile | null;
  baseScore: number;
  scoreBreakdown: Record<string, number>;
  deterministicReasons: string[];
  commonTags: string[];
  riskWarnings: string[];
  distanceKm: number | null;
};

@Injectable()
export class AiMatchReasonerService {
  private readonly logger = new Logger(AiMatchReasonerService.name);

  constructor(
    private readonly ai: AIService,
    private readonly sanitizer: MatchPrivacySanitizer,
  ) {}

  async explainSocialRequestCandidate(
    input: SocialRequestReasoningInput,
  ): Promise<MatchReasoningResult> {
    const fallback = this.buildSocialRequestFallback(input);
    const safeRequest = this.sanitizer.sanitizeRequestForAi(input.request);
    const safeOwnerProfile = this.sanitizer.sanitizeProfileForAi(
      input.ownerProfile,
    );
    const safeCandidateProfile = this.sanitizer.sanitizeProfileForAi(
      input.candidateProfile,
    );
    const safeCandidateUser = this.sanitizer.sanitizeUserForAi(
      input.candidateUser,
      input.candidateProfile,
    );

    try {
      const aiScore = await this.ai.rescoreCompatibility({
        baseScore: input.baseScore,
        request: {
          title: safeRequest.title,
          city: safeRequest.city,
          activityType: safeRequest.activityType,
          interestTags: safeRequest.interestTags,
          timePreference: safeRequest.timePreference,
          socialGoal: safeRequest.socialGoal,
          personalityPreference: safeRequest.personalityPreference,
        },
        ownerProfile: safeOwnerProfile
          ? {
              city: safeOwnerProfile.city,
              publicTags: safeOwnerProfile.publicMatchTags,
              traits: safeOwnerProfile.traits,
              preferredTraits: safeOwnerProfile.privatePreferenceTags,
              availability: safeOwnerProfile.availableTimes,
            }
          : null,
        candidate: {
          nickname: safeCandidateUser.nickname,
          city: safeCandidateUser.city,
          publicTags: [
            ...safeCandidateUser.publicTags,
            ...(safeCandidateProfile?.publicMatchTags ?? []),
          ],
          traits: safeCandidateProfile?.traits ?? [],
          commonTags: input.commonTags,
          verified: safeCandidateUser.verified,
          acceptsAgentMessages: null,
        },
        deterministicReasons: input.deterministicReasons,
        scoreBreakdown: input.scoreBreakdown,
      });
      const content = await this.ai.generateCandidateMatchContent({
        request: {
          title: safeRequest.title,
          city: safeRequest.city,
          activityType: safeRequest.activityType,
          interestTags: safeRequest.interestTags,
          timePreference: safeRequest.timePreference,
          socialGoal: safeRequest.socialGoal,
        },
        candidate: {
          nickname: safeCandidateUser.nickname,
          city: safeCandidateUser.city,
          commonTags: input.commonTags,
          publicTags: [
            ...safeCandidateUser.publicTags,
            ...(safeCandidateProfile?.publicMatchTags ?? []),
          ],
          distanceKm: input.distanceKm,
          verified: safeCandidateUser.verified,
        },
        score: aiScore.score,
        deterministicReasons: input.deterministicReasons,
        riskWarnings: input.riskWarnings,
      });

      const riskWarnings = this.unique([
        ...content.riskWarnings,
        ...aiScore.riskWarnings,
        ...input.riskWarnings,
      ]).slice(0, 5);
      const matchedSignals = this.unique([
        ...input.commonTags,
        ...content.recommendationReasons,
      ]).slice(0, 8);

      return {
        score: aiScore.score,
        scoreBreakdown: {
          ...input.scoreBreakdown,
          aiSecondPass: aiScore.score - input.baseScore,
          aiConfidence: Math.round(aiScore.confidence * 100),
        },
        matchedSignals,
        publicReason:
          this.sanitizer.sanitizeText(aiScore.publicReason, 260) ||
          fallback.publicReason,
        privateReason:
          this.sanitizer.sanitizeText(aiScore.privateReason, 260) ||
          fallback.privateReason,
        riskWarning: this.sanitizer.sanitizeText(riskWarnings.join(' '), 320),
        riskWarnings,
        suggestedOpener:
          this.sanitizer.sanitizeText(content.icebreakerMessage, 140) ||
          fallback.suggestedOpener,
        nextAction: fallback.nextAction,
        reasonerSource:
          aiScore.source === 'deepseek' || content.source === 'deepseek'
            ? 'deepseek'
            : 'fallback',
      };
    } catch (error) {
      this.logger.warn(
        `AI match reasoning fallback used: ${(error as Error).message}`,
      );
      return fallback;
    }
  }

  buildSocialRequestFallback(
    input: SocialRequestReasoningInput,
  ): MatchReasoningResult {
    const nickname = input.candidateUser.name || '这位用户';
    const tags = this.unique(input.commonTags).slice(0, 3);
    const firstReason = input.deterministicReasons.find(Boolean);
    const publicReason = this.sanitizer.sanitizeText(
      firstReason ||
        (tags.length
          ? `共同兴趣：${tags.join('、')}，适合先用低压力方式确认时间和边界。`
          : '候选人通过城市、时间、活动类型和安全规则的确定性评分。'),
      260,
    );
    const riskWarnings = input.riskWarnings.length
      ? input.riskWarnings.map((item) => this.sanitizer.sanitizeText(item, 90))
      : ['先使用站内消息沟通，不交换手机号、微信或详细住址。'];
    return {
      score: Math.max(0, Math.min(100, Math.round(input.baseScore))),
      scoreBreakdown: { ...input.scoreBreakdown },
      matchedSignals: this.unique([...tags, ...input.deterministicReasons]).slice(
        0,
        8,
      ),
      publicReason,
      privateReason: '当前候选由后端硬过滤和 MatchService 规则评分产生，AI 仅参与解释和话术。',
      riskWarning: this.sanitizer.sanitizeText(riskWarnings.join(' '), 320),
      riskWarnings,
      suggestedOpener: this.sanitizer.sanitizeText(
        `${nickname} 你好，看到你和这次约练比较匹配。方便先在 FitMeet 上聊聊时间和公开地点吗？`,
        140,
      ),
      nextAction: 'owner_confirmation_required',
      reasonerSource: 'fallback',
    };
  }

  private unique(values: string[]): string[] {
    return Array.from(
      new Set(
        values
          .map((value) => (value ?? '').trim())
          .filter((value) => value.length > 0),
      ),
    );
  }
}
