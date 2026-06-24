import { cleanDisplayText } from '../common/display-text.util';
import type {
  SocialAgentEventV2DisplayState,
  SocialAgentEventV2Stage,
  SocialAgentEventV2Type,
} from './social-agent-event-v2.types';

type PublicProcessTextContext = {
  type?: SocialAgentEventV2Type | null;
  stage?: SocialAgentEventV2Stage | null;
  state?: SocialAgentEventV2DisplayState | 'completed' | 'failed' | null;
  candidateCount?: number | null;
  activityCount?: number | null;
};

const INTERNAL_PROCESS_TEXT_RE =
  /\b(?:route_[a-z_]+|hydrate_context|planner|traceId|agentTrace|structuredIntent|tool[_\s.-]*(?:call|result|calls|results)(?:[_\s.-]*[a-z]+)?|raw\s*JSON|payload|runtime|stack|debug|internal|subagent|DeepSeek|OpenAI)\b|candidate_confirmation_check/i;
const INTERNAL_KEY_VALUE_FRAGMENT_RE =
  /\b(?:traceId|runId|payload|agentTrace|structuredIntent|planner|metadata|runtime|checkpointId|parentCheckpointId|resumeToken|idempotencyKey|rawJson|rawJSON|toolCallId|toolResultId)\s*[:=]\s*(?:"[^"]*"|'[^']*'|\{[^{}]{0,240}\}|\[[^\][]{0,240}\]|[^\s,;，。)）\]}]+)/gi;
const GENERIC_PROCESS_TITLE_RE = genericProcessTitlePattern();
const GENERIC_PROCESS_DETAIL_RE = genericProcessDetailPattern();
const DETECT_INTENT_TITLE_VALUES = new Set([
  '正在理解你的需求',
  '已理解你的需求',
]);
const CROSS_STAGE_GENERIC_DETAIL_RE =
  /^(?:(?:我们已经)?(?:正在|已)?理解你的需求|下一步处理|继续处理这一步|继续处理当前进度)/;

function genericProcessPattern(parts: string[][]) {
  return new RegExp(`^(${parts.map((item) => item.join('')).join('|')})$`);
}

function genericProcessTitlePattern() {
  return genericProcessPattern([
    ['这一步', '处理', '完成'],
    ['已完成', '这一步'],
    ['处理', '完成'],
    ['已处理'],
    ['正在', '处理'],
    ['正在', '处理', '这一步'],
    ['这次', '处理', '没有', '完成'],
    ['这一步', '没有', '完成'],
    ['这一步', '需要', '重试'],
    ['刚才', '连接', '不稳'],
    ['这次', '没有', '顺利', '完成'],
    ['暂时', '没有', '顺利', '完成'],
    ['已完成'],
    ['完成'],
    ['处理中'],
  ]);
}

function genericProcessDetailPattern() {
  return genericProcessPattern([
    ['处理中'],
    ['正在', '处理'],
    ['正在', '处理', '这一步'],
    ['已完成'],
    ['处理', '完成'],
    ['这一步', '处理', '完成'],
    ['已完成', '这一步'],
    ['这一步', '没有', '完成'],
    ['这一步', '需要', '重试'],
    ['刚才', '连接', '不稳'],
    ['可以', '稍后', '再试'],
    ['稍后', '再试'],
  ]);
}

export function sanitizeSocialCodexProcessTitle(
  value: unknown,
  context: PublicProcessTextContext = {},
): string {
  const cleaned = stripInternalKeyValueFragments(cleanDisplayText(value, ''));
  if (
    !cleaned ||
    INTERNAL_PROCESS_TEXT_RE.test(cleaned) ||
    GENERIC_PROCESS_TITLE_RE.test(cleaned.trim()) ||
    isKnownStageTitleForAnotherStage(cleaned, context)
  ) {
    return fallbackProcessTitle(context);
  }
  return cleaned.slice(0, 42);
}

export function sanitizeSocialCodexProcessDetail(
  value: unknown,
  context: PublicProcessTextContext = {},
): string | null {
  const cleaned = stripInternalKeyValueFragments(cleanDisplayText(value, ''));
  if (
    !cleaned ||
    INTERNAL_PROCESS_TEXT_RE.test(cleaned) ||
    GENERIC_PROCESS_DETAIL_RE.test(cleaned.trim()) ||
    isCrossStageGenericDetail(cleaned, context)
  ) {
    return fallbackProcessDetail(context);
  }
  return cleaned.slice(0, 96);
}

function stripInternalKeyValueFragments(value: string): string {
  return value
    .replace(INTERNAL_KEY_VALUE_FRAGMENT_RE, '')
    .replace(/([,;，。])\s*(?=[,;，。])/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function isKnownStageTitleForAnotherStage(
  value: string,
  context: PublicProcessTextContext,
): boolean {
  const cleaned = value.trim();
  if (!DETECT_INTENT_TITLE_VALUES.has(cleaned)) return false;
  if (!context.stage || context.stage === 'detect_social_intent') return false;
  return cleaned !== fallbackProcessTitle(context);
}

function isCrossStageGenericDetail(
  value: string,
  context: PublicProcessTextContext,
): boolean {
  if (!context.stage || context.stage === 'detect_social_intent') return false;
  return CROSS_STAGE_GENERIC_DETAIL_RE.test(value.trim());
}

function fallbackProcessTitle(context: PublicProcessTextContext): string {
  const done = context.state === 'done' || context.state === 'completed';
  const failed = context.state === 'failed';
  const waiting = context.state === 'waiting';

  if (context.type === 'run.failed' || failed) return '连接中断了，可以继续';
  if (
    context.type === 'run.completed' &&
    (!context.stage || context.stage === 'detect_social_intent')
  ) {
    return '已理解你的需求';
  }
  if (context.type === 'approval.required' || waiting) {
    return '需要你确认后继续';
  }
  if (context.type === 'approval.resolved') return '已处理你的确认';
  if (context.type === 'candidate_search.done') {
    if (
      typeof context.candidateCount === 'number' &&
      context.candidateCount > 0
    ) {
      return `找到 ${context.candidateCount} 个公开可发现的人`;
    }
    if (
      typeof context.activityCount === 'number' &&
      context.activityCount > 0
    ) {
      return `找到 ${context.activityCount} 个可参考活动`;
    }
    return '已筛选公开可发现的人';
  }

  switch (context.stage) {
    case 'hydrate_context':
      return done ? '已读取你的偏好' : '正在读取你的偏好';
    case 'profile_gate':
      return done ? '画像门槛已满足' : '匹配前还差一点人物画像';
    case 'slot_filling':
      return done ? '已记录你的关键信息' : '正在整理你的关键信息';
    case 'create_opportunity_card':
    case 'publish_to_discover':
      return done ? '这张约练卡可以发布到发现' : '正在补齐约练卡';
    case 'search_candidates':
    case 'rank_candidates':
      return done ? '已筛选公开可发现的人' : '正在筛选公开可发现的人';
    case 'safety_filter':
      return done ? '已检查安全边界' : '正在检查安全边界';
    case 'generate_opener':
      return done ? '已生成开场白' : '正在生成开场白';
    case 'send_invite':
      return done ? '邀请已准备好' : '正在准备邀请';
    case 'life_graph_writeback':
      return done ? '已整理资料变化建议' : '正在整理资料变化建议';
    case 'approval':
      return waiting
        ? '需要你确认后继续'
        : done
          ? '已处理你的确认'
          : '需要你确认后继续';
    case 'detect_social_intent':
    default:
      return done ? '已理解你的需求' : '正在理解你的需求';
  }
}

function fallbackProcessDetail(
  context: PublicProcessTextContext,
): string | null {
  if (context.type === 'run.failed' || context.state === 'failed') {
    return '我保留了这段需求，可以继续处理或补充一句新的要求。';
  }
  if (context.type === 'approval.required' || context.state === 'waiting') {
    return '确认前不会执行真实发布、邀请或联系动作。';
  }
  if (
    context.stage === 'search_candidates' ||
    context.stage === 'rank_candidates'
  ) {
    return '只使用公开可发现的信息，联系对方前仍需要你确认。';
  }
  if (context.stage === 'hydrate_context') {
    return '会结合最近对话、当前任务和已确认偏好。';
  }
  return null;
}
