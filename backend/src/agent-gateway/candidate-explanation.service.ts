import { Injectable } from '@nestjs/common';

import {
  SceneRiskPolicyService,
  SocialSceneType,
} from './scene-risk-policy.service';

export interface CandidateExplanationInput {
  userProfile?: Record<string, unknown> | null;
  userRequest?: Record<string, unknown> | string | null;
  candidate?: Record<string, unknown> | null;
  matchScore?: number | null;
  matchReasons?: string[] | null;
  sceneType?: string | null;
  riskWarnings?: string[] | null;
  lifeGraphSignals?: {
    identitySignals?: Record<string, unknown>;
    socialIntentSignals?: Record<string, unknown>;
    lifestyleSignals?: Record<string, unknown>;
    fitnessSignals?: Record<string, unknown>;
    safetySignals?: Record<string, unknown>;
    missingCriticalFields?: Array<{ label?: string; fieldKey?: string }>;
  } | null;
}

export interface CandidateLifeGraphExplanation {
  usedSignals: string[];
  missingSignals: string[];
  boundaryNotes: string[];
  confidenceLevel: 'high' | 'medium' | 'low';
}

export interface CandidateExplanation {
  fitReasons: string[];
  suggestedOpener: string;
  awkwardPoints: string[];
  safeFirstStep: string;
  nextActionSuggestion: string;
  requiresConfirmation: boolean;
  lifeGraphExplanation?: CandidateLifeGraphExplanation;
}

@Injectable()
export class CandidateExplanationService {
  constructor(private readonly sceneRisk: SceneRiskPolicyService) {}

  explain(input: CandidateExplanationInput): CandidateExplanation {
    const requestText = this.textFromRequest(input.userRequest);
    const candidate = input.candidate ?? {};
    const displayName =
      this.string(candidate.displayName) ||
      this.string(candidate.nickname) ||
      'TA';
    const tags = this.stringList(
      candidate.commonTags ?? candidate.interestTags ?? candidate.tags,
    );
    const city = this.string(candidate.city);
    const reasons = this.stringList(input.matchReasons).filter(
      (item) => !/^匹配度\s*\d+/i.test(item),
    );
    const publicReasons = reasons.filter(
      (item) => !this.isEntertainmentDisclosure(item),
    );
    const sceneType = this.sceneRisk.normalizeScene(input.sceneType, requestText);
    const policy = this.sceneRisk.evaluate({
      sceneType,
      actionType: 'send_message',
      text: requestText,
      safetySignals: this.safetySignals(input.lifeGraphSignals),
    });
    const lifeGraphExplanation = this.lifeGraphExplanation(input.lifeGraphSignals);

    const fitReasons = this.fitReasons({
      displayName,
      city,
      tags,
      reasons: publicReasons,
      sceneType,
      matchScore: input.matchScore,
    });
    const awkwardPoints = this.awkwardPoints({
      sceneType,
      riskWarnings: this.stringList(input.riskWarnings),
      tags,
      reasons: publicReasons,
    });

    return {
      fitReasons,
      suggestedOpener: this.opener(displayName, sceneType, tags, city),
      awkwardPoints,
      safeFirstStep: this.safeFirstStep(sceneType),
      nextActionSuggestion: this.nextAction(sceneType, policy.requiresConfirmation),
      requiresConfirmation: policy.requiresConfirmation,
      lifeGraphExplanation,
    };
  }

  private lifeGraphExplanation(
    signals: CandidateExplanationInput['lifeGraphSignals'],
  ): CandidateLifeGraphExplanation | undefined {
    if (!signals) return undefined;
    const usedSignals: string[] = [];
    const boundaryNotes: string[] = [];
    const missingSignals = (signals.missingCriticalFields ?? [])
      .map((item) => this.string(item.label) || this.string(item.fieldKey))
      .filter(Boolean)
      .slice(0, 4);
    const identity = signals.identitySignals ?? {};
    const lifestyle = signals.lifestyleSignals ?? {};
    const fitness = signals.fitnessSignals ?? {};
    const social = signals.socialIntentSignals ?? {};
    const safety = signals.safetySignals ?? {};
    if (this.string(identity.nearbyArea)) usedSignals.push(`常活动区域：${this.string(identity.nearbyArea)}`);
    if (this.string(identity.city)) usedSignals.push(`城市：${this.string(identity.city)}`);
    if (this.textValue(lifestyle.availableTimes)) usedSignals.push(`可约时间：${this.textValue(lifestyle.availableTimes)}`);
    if (this.textValue(fitness.sportsPreferences)) usedSignals.push(`运动偏好：${this.textValue(fitness.sportsPreferences)}`);
    if (this.string(social.preferredSocialStyle)) usedSignals.push(`社交方式：${this.string(social.preferredSocialStyle)}`);
    if (safety.publicPlaceOnly === true) boundaryNotes.push('你设置了公共场所优先，第一次见面要选公开、人多、好离开的地点。');
    if (safety.locationSharingAllowed === false) boundaryNotes.push('你不允许共享精确定位，Agent 不会自动发送位置。');
    if (safety.acceptsNightMeet === false) boundaryNotes.push('你不接受夜间活动，建议优先改到白天。');
    if (safety.strictConfirmationRequired === true) boundaryNotes.push('你要求严格确认，发消息、加好友和见面都需要先确认。');
    const confidenceLevel =
      usedSignals.length >= 4 && missingSignals.length === 0
        ? 'high'
        : usedSignals.length >= 2
          ? 'medium'
          : 'low';
    return {
      usedSignals: usedSignals.slice(0, 6),
      missingSignals,
      boundaryNotes: boundaryNotes.slice(0, 4),
      confidenceLevel,
    };
  }

  private safetySignals(
    signals: CandidateExplanationInput['lifeGraphSignals'],
  ): Record<string, unknown> | null {
    return signals?.safetySignals ?? null;
  }

  private isEntertainmentDisclosure(value: string): boolean {
    return /星座|MBTI|mbti|算命|玄学|生日性格|塔罗|八字|生肖|血型|zodiac/i.test(
      value,
    );
  }

  private fitReasons(input: {
    displayName: string;
    city: string;
    tags: string[];
    reasons: string[];
    sceneType: SocialSceneType;
    matchScore?: number | null;
  }): string[] {
    const output = input.reasons.slice(0, 2);
    if (input.tags.length > 0) {
      output.push(`你们都提到 ${input.tags.slice(0, 2).join('、')}，开场不用硬聊，可以从共同兴趣轻轻切入。`);
    }
    if (input.city) {
      output.push(`${input.displayName} 的常活动城市在 ${input.city}，更适合先约公开、低压力的小范围见面。`);
    }
    if (output.length === 0) {
      output.push(this.defaultFitReason(input.sceneType, input.displayName));
    }
    return output.slice(0, 3);
  }

  private awkwardPoints(input: {
    sceneType: SocialSceneType;
    riskWarnings: string[];
    tags: string[];
    reasons: string[];
  }): string[] {
    const output = [...input.riskWarnings];
    switch (input.sceneType) {
      case 'fitness':
        output.push('健身强度、训练目标和是否需要教练式指导可能不一致，别一开始就安排高强度训练。');
        break;
      case 'walking':
        output.push('散步节奏和聊天密度可能不同，建议先约短时间、可提前结束的路线。');
        break;
      case 'photo':
        output.push('拍照审美、出片期待和肖像使用边界可能不同，先确认风格和是否公开发布。');
        break;
      case 'travel':
        output.push('旅游涉及时间、预算和安全边界，不能因为兴趣相同就直接确定同行。');
        break;
      case 'drinking':
        output.push('酒局容易出现边界不清、返程不便和安全感不足，建议先确认人数与地点。');
        break;
      case 'dating':
        output.push('相亲容易让对方感到被审视，开场别像面试，先确认关系目标和沟通节奏。');
        break;
      case 'renting':
        output.push('租房/合租涉及身份、押金和生活习惯，任何转账都要放到线下核验之后。');
        break;
      case 'mahjong':
      case 'poker':
        output.push('牌局要先确认是否涉钱、公开地点和娱乐边界，避免把轻松局变成压力局。');
        break;
      default:
        output.push('对方资料或时间偏好可能还不完整，先用一句轻量开场给彼此选择空间。');
    }
    return [...new Set(output)].slice(0, 3);
  }

  private opener(
    displayName: string,
    sceneType: SocialSceneType,
    tags: string[],
    city: string,
  ): string {
    const topic = tags[0] ? `也喜欢${tags[0]}` : this.sceneLabel(sceneType);
    const place = city ? `${city}附近` : '附近';
    switch (sceneType) {
      case 'fitness':
        return `你好 ${displayName}，看到你${topic}，我也想找个节奏舒服的约练搭子。你这周有没有适合先轻练 30 分钟的时间？`;
      case 'walking':
        return `你好 ${displayName}，看到你${topic}，感觉可以先从轻松散步开始。你更喜欢安静路线还是边走边聊？`;
      case 'photo':
        return `你好 ${displayName}，看到你${topic}，想先轻轻约个公开地点试拍。你更偏街拍、咖啡店还是公园感？`;
      case 'travel':
        return `你好 ${displayName}，看到你也在看旅行搭子。我先不急着定同行，想先对一下目的地、预算和安全边界，可以吗？`;
      case 'drinking':
        return `你好 ${displayName}，看到你也想找轻松小局。我这边更倾向公开地点、少量喝、可随时结束，你能接受这种节奏吗？`;
      case 'dating':
        return `你好 ${displayName}，看到你的节奏和我有些接近。先不正式相亲，方便从一次轻松咖啡聊天开始吗？`;
      case 'renting':
        return `你好 ${displayName}，看到你也在关注合租/租房。我想先确认区域、预算和作息边界，合适再约公开地点看房。`;
      case 'mahjong':
      case 'poker':
        return `你好 ${displayName}，看到你也想组个牌局。我先确认一下，是纯娱乐局吗？地点希望公开一点，大家都更安心。`;
      default:
        return `你好 ${displayName}，看到你${topic}，感觉可以先在${place}轻松聊聊时间和边界，不急着马上定见面。`;
    }
  }

  private safeFirstStep(sceneType: SocialSceneType): string {
    switch (sceneType) {
      case 'fitness':
        return '先站内聊训练目标和强度，第一次只约白天、公开健身房或操场，30-45 分钟即可。';
      case 'walking':
        return '先约白天公开路线，设置短时间散步，保留随时结束的空间。';
      case 'photo':
        return '先确认拍摄风格、公开地点、照片使用边界，第一次不去封闭或偏僻地点。';
      case 'travel':
        return '先只交换行程想法，不共享身份证件和精确住址，确认预算与退出方案后再考虑同行。';
      case 'drinking':
        return '先确认公开地点、人数、是否饮酒和返程方式，第一次避免深夜和私密空间。';
      case 'dating':
        return '第一次只选白天公开咖啡/餐厅，先站内沟通，不急着交换联系方式。';
      case 'renting':
        return '先核验房源和身份，公开地点见面看房，任何押金或转账都不要由 Agent 自动处理。';
      case 'mahjong':
      case 'poker':
        return '先确认纯娱乐、公开地点和不涉钱规则，再决定是否加入。';
      default:
        return '先在站内用轻量开场确认时间、地点和边界，第一次见面选择公开场所。';
    }
  }

  private nextAction(sceneType: SocialSceneType, requiresConfirmation: boolean) {
    const verb =
      sceneType === 'renting'
        ? '确认区域和预算'
        : sceneType === 'travel'
          ? '确认行程边界'
          : sceneType === 'drinking'
            ? '确认公开地点和返程'
            : '发送轻量开场';
    return requiresConfirmation ? `建议先由用户确认后再${verb}` : `可以先${verb}`;
  }

  private defaultFitReason(sceneType: SocialSceneType, displayName: string) {
    return `${displayName} 和这次${this.sceneLabel(sceneType)}需求有可对齐的地方，适合先从低压力沟通开始。`;
  }

  private sceneLabel(sceneType: SocialSceneType) {
    const labels: Record<SocialSceneType, string> = {
      general: '社交',
      fitness: '健身',
      walking: '散步',
      photo: '拍照',
      travel: '旅行',
      drinking: '酒局',
      dating: '相亲',
      renting: '租房',
      mahjong: '麻将',
      poker: '扑克',
    };
    return labels[sceneType];
  }

  private textFromRequest(value: CandidateExplanationInput['userRequest']) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return Object.values(value)
      .filter((item) => typeof item === 'string' || Array.isArray(item))
      .flatMap((item) => (Array.isArray(item) ? item : [item]))
      .join(' ');
  }

  private string(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private stringList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }

  private textValue(value: unknown): string {
    if (Array.isArray(value)) {
      return value.map((item) => this.string(item)).filter(Boolean).join('、');
    }
    return this.string(value);
  }
}
