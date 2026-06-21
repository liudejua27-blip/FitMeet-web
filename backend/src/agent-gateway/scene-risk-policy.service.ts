import { Injectable } from '@nestjs/common';

export type SceneRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type SocialSceneType =
  | 'general'
  | 'fitness'
  | 'walking'
  | 'photo'
  | 'travel'
  | 'drinking'
  | 'dating'
  | 'renting'
  | 'mahjong'
  | 'poker';

export type SceneActionType =
  | 'chat'
  | 'profile'
  | 'search_candidates'
  | 'generate_opener'
  | 'send_message'
  | 'add_friend'
  | 'create_workout'
  | 'create_activity'
  | 'offline_meeting'
  | 'share_location'
  | 'precise_location'
  | 'payment'
  | 'wallet'
  | 'contact_exchange';

export type CanonicalPermissionMode =
  | 'manual_confirm'
  | 'limited_auto'
  | 'open'
  | 'lab';

export interface SceneRiskPolicyInput {
  sceneType?: string | null;
  actionType?: string | null;
  text?: string | null;
  permissionMode?: string | null;
  involvesMoney?: boolean | null;
  preciseLocation?: boolean | null;
  safetySignals?: {
    publicPlaceOnly?: boolean | null;
    acceptsNightMeet?: boolean | null;
    locationSharingAllowed?: boolean | null;
    strictConfirmationRequired?: boolean | null;
    realNameRequired?: boolean | null;
  } | null;
}

export interface SceneRiskPolicyResult {
  riskLevel: SceneRiskLevel;
  requiresConfirmation: boolean;
  requiresDoubleConfirmation: boolean;
  blockedActions: string[];
  safetyPrompts: string[];
  sceneType: SocialSceneType;
  actionType: SceneActionType;
  permissionMode: CanonicalPermissionMode;
}

const LOW_ACTIONS = new Set<SceneActionType>([
  'chat',
  'profile',
  'search_candidates',
  'generate_opener',
]);

const MEDIUM_ACTIONS = new Set<SceneActionType>([
  'send_message',
  'add_friend',
  'create_workout',
  'create_activity',
]);

const DOUBLE_CONFIRM_SCENES = new Set<SocialSceneType>([
  'drinking',
  'dating',
  'renting',
  'travel',
]);

const STRICT_CONFIRM_SCENES = new Set<SocialSceneType>(['fitness', 'walking']);

@Injectable()
export class SceneRiskPolicyService {
  evaluate(input: SceneRiskPolicyInput): SceneRiskPolicyResult {
    const text = `${input.text ?? ''} ${input.sceneType ?? ''} ${input.actionType ?? ''}`;
    const sceneType = this.normalizeScene(input.sceneType, text);
    const actionType = this.normalizeAction(input.actionType, text);
    const permissionMode = this.normalizePermissionMode(input.permissionMode);
    const involvesMoney =
      input.involvesMoney === true || this.hasMoneySignal(text);
    const preciseLocation =
      input.preciseLocation === true ||
      /精确定位|实时定位|共享位置|当前位置|定位共享/i.test(text);

    let riskLevel = this.baseRisk(actionType);
    const safetyPrompts: string[] = [];
    const blockedActions: string[] = [];
    const safetySignals = input.safetySignals ?? {};

    if (
      actionType === 'payment' ||
      actionType === 'wallet' ||
      actionType === 'contact_exchange' ||
      actionType === 'precise_location' ||
      (actionType === 'share_location' && preciseLocation)
    ) {
      riskLevel = 'critical';
      blockedActions.push('auto_execute');
      safetyPrompts.push(
        '支付、钱包、精确定位和交换联系方式必须由用户亲自确认，Agent 不能自动执行。',
      );
    }

    if (
      (actionType === 'precise_location' || actionType === 'share_location') &&
      safetySignals.locationSharingAllowed === false
    ) {
      riskLevel = 'critical';
      blockedActions.push('auto_execute', 'precise_location');
      safetyPrompts.push(
        '你的 Life Graph 不允许共享精确定位，Agent 不能自动发送位置。',
      );
    }

    if (safetySignals.publicPlaceOnly && actionType === 'offline_meeting') {
      riskLevel = this.maxRisk(riskLevel, 'high');
      safetyPrompts.push(
        '你的 Life Graph 设置了公共场所优先，第一次见面必须选择公开、人多、好离开的地点。',
      );
    }

    if (
      safetySignals.acceptsNightMeet === false &&
      /夜间|晚上|今晚|深夜|night|evening/i.test(text) &&
      (actionType === 'offline_meeting' ||
        actionType === 'create_activity' ||
        actionType === 'create_workout' ||
        actionType === 'send_message')
    ) {
      riskLevel = this.maxRisk(riskLevel, 'high');
      safetyPrompts.push(
        '你的 Life Graph 显示不接受夜间活动，夜间约见需要高风险提醒并建议改到白天。',
      );
    }

    if (
      safetySignals.strictConfirmationRequired &&
      !LOW_ACTIONS.has(actionType)
    ) {
      riskLevel = this.maxRisk(riskLevel, 'medium');
      safetyPrompts.push(
        '你的 Life Graph 要求严格确认，所有关键社交动作都需要进入待确认。',
      );
    }

    if (actionType === 'offline_meeting') {
      riskLevel = this.maxRisk(riskLevel, 'high');
      safetyPrompts.push('线下见面前需要确认公开地点、时间窗口和退出方式。');
    }

    if (DOUBLE_CONFIRM_SCENES.has(sceneType)) {
      riskLevel = this.maxRisk(riskLevel, 'high');
      safetyPrompts.push(this.doubleConfirmPrompt(sceneType));
    }

    if (STRICT_CONFIRM_SCENES.has(sceneType) && !LOW_ACTIONS.has(actionType)) {
      riskLevel = this.maxRisk(riskLevel, 'medium');
      safetyPrompts.push(
        '健身、散步属于线下同伴场景，发消息、约练和见面都需要先让用户确认。',
      );
    }

    if (
      (sceneType === 'mahjong' || sceneType === 'poker') &&
      !LOW_ACTIONS.has(actionType)
    ) {
      if (involvesMoney) {
        riskLevel = this.maxRisk(riskLevel, 'high');
        safetyPrompts.push(
          '麻将/扑克涉及金钱时必须提示高风险，并确认只在公开合规地点进行。',
        );
      } else {
        riskLevel = this.maxRisk(riskLevel, 'medium');
        safetyPrompts.push(
          '麻将/扑克需要先确认是否涉钱、是否公开地点、是否只是娱乐局。',
        );
      }
    }

    const requiresDoubleConfirmation =
      DOUBLE_CONFIRM_SCENES.has(sceneType) && !LOW_ACTIONS.has(actionType);
    const requiresConfirmation = this.requiresConfirmation({
      permissionMode,
      riskLevel,
      actionType,
      sceneType,
      requiresDoubleConfirmation,
    });
    const lifeGraphRequiresConfirmation =
      Boolean(safetySignals.strictConfirmationRequired) &&
      !LOW_ACTIONS.has(actionType);

    if (permissionMode === 'lab') {
      blockedActions.push('execute_real_action');
      safetyPrompts.push(
        '实验室模式只模拟结果，不会真实发消息、加好友、创建活动、共享定位或支付。',
      );
    }

    return {
      riskLevel,
      requiresConfirmation:
        requiresConfirmation || lifeGraphRequiresConfirmation,
      requiresDoubleConfirmation,
      blockedActions: [...new Set(blockedActions)],
      safetyPrompts: [...new Set(safetyPrompts)],
      sceneType,
      actionType,
      permissionMode,
    };
  }

  normalizePermissionMode(mode?: string | null): CanonicalPermissionMode {
    const raw = (mode ?? '').toString().trim().toLowerCase();
    if (raw === 'limited_auto' || raw === 'normal' || raw === 'standard') {
      return 'limited_auto';
    }
    if (raw === 'open' || raw === 'auto') return 'open';
    if (raw === 'lab' || raw === 'sandbox_internal' || raw === 'sandbox') {
      return 'lab';
    }
    return 'manual_confirm';
  }

  normalizeScene(sceneType?: string | null, text = ''): SocialSceneType {
    const raw = `${sceneType ?? ''} ${text}`.toLowerCase();
    if (/健身|约练|撸铁|gym|fitness|workout|跑步|运动/.test(raw))
      return 'fitness';
    if (/散步|walk|walking/.test(raw)) return 'walking';
    if (/拍照|摄影|photo|camera/.test(raw)) return 'photo';
    if (/旅游|旅行|出游|travel|trip/.test(raw)) return 'travel';
    if (/酒|喝一杯|酒局|bar|drink|drinking/.test(raw)) return 'drinking';
    if (/相亲|约会|dating|date/.test(raw)) return 'dating';
    if (/租房|合租|室友|rent|roommate/.test(raw)) return 'renting';
    if (/麻将|mahjong/.test(raw)) return 'mahjong';
    if (/扑克|德州|poker|cards/.test(raw)) return 'poker';
    return 'general';
  }

  normalizeAction(actionType?: string | null, text = ''): SceneActionType {
    const raw = `${actionType ?? ''} ${text}`.toLowerCase();
    if (/wallet|钱包/.test(raw)) return 'wallet';
    if (/payment|pay|支付|付款|转账/.test(raw)) return 'payment';
    if (/precise_location|精确定位|实时定位/.test(raw))
      return 'precise_location';
    if (/share_location|定位|位置共享/.test(raw)) return 'share_location';
    if (/contact_exchange|phone|wechat|微信|手机号|联系方式/.test(raw))
      return 'contact_exchange';
    if (/offline|meet|见面|线下/.test(raw)) return 'offline_meeting';
    if (/add_friend|friend|connect|加好友|好友/.test(raw)) return 'add_friend';
    if (
      /send_message|confirm_send|send_invite|message|invite|发消息|私信|聊天|发送|邀请/.test(
        raw,
      )
    )
      return 'send_message';
    if (/create_workout|workout|约练/.test(raw)) return 'create_workout';
    if (/create_activity|invite_activity|join_activity|活动|报名/.test(raw)) {
      return 'create_activity';
    }
    if (/draft|opener|开场白/.test(raw)) return 'generate_opener';
    if (/search|match|候选|搜索|匹配/.test(raw)) return 'search_candidates';
    if (/profile|画像|整理/.test(raw)) return 'profile';
    return 'chat';
  }

  private baseRisk(actionType: SceneActionType): SceneRiskLevel {
    if (LOW_ACTIONS.has(actionType)) return 'low';
    if (MEDIUM_ACTIONS.has(actionType)) return 'medium';
    if (actionType === 'offline_meeting') return 'high';
    return 'critical';
  }

  private requiresConfirmation(input: {
    permissionMode: CanonicalPermissionMode;
    riskLevel: SceneRiskLevel;
    actionType: SceneActionType;
    sceneType: SocialSceneType;
    requiresDoubleConfirmation: boolean;
  }): boolean {
    if (input.permissionMode === 'lab') return false;
    if (input.riskLevel === 'critical') return true;
    if (input.permissionMode === 'manual_confirm')
      return !LOW_ACTIONS.has(input.actionType);
    if (input.permissionMode === 'limited_auto')
      return !LOW_ACTIONS.has(input.actionType);
    if (input.permissionMode === 'open') return input.riskLevel !== 'low';
    return true;
  }

  private maxRisk(left: SceneRiskLevel, right: SceneRiskLevel): SceneRiskLevel {
    const order: SceneRiskLevel[] = ['low', 'medium', 'high', 'critical'];
    return order.indexOf(left) >= order.indexOf(right) ? left : right;
  }

  private hasMoneySignal(text: string): boolean {
    return /钱|金额|押金|AA|转账|付款|支付|赌|筹码|牌费|房租|deposit|money|cash|fee/i.test(
      text,
    );
  }

  private doubleConfirmPrompt(sceneType: SocialSceneType): string {
    switch (sceneType) {
      case 'drinking':
        return '酒局需要双确认：先确认是否喝酒、人数、公开地点，再确认返程和退出方式。';
      case 'dating':
        return '相亲/约会需要双确认：先确认关系目标和边界，再确认公开见面地点。';
      case 'renting':
        return '租房/合租需要双确认：先确认身份与房源真实性，再避免提前转账或私下交易。';
      case 'travel':
        return '旅游同行需要双确认：先确认行程、预算和安全边界，再确认是否同行。';
      default:
        return '该场景需要双确认后再推进。';
    }
  }
}
