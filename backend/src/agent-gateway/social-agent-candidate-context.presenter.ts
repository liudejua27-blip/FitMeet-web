import { cleanDisplayText } from '../common/display-text.util';
import type { AgentTask } from './entities/agent-task.entity';
import { readSocialAgentStoredCandidateSummaries } from './social-agent-chat-session.presenter';
import { readSocialAgentTaskMemory } from './social-agent-memory.util';

export function hasSocialAgentSearchContext(task: AgentTask): boolean {
  if (hasSocialAgentSearchResultContext(task)) return true;
  return hasCompletedSearchSlots(task);
}

export function hasSocialAgentSearchResultContext(task: AgentTask): boolean {
  if (readSocialAgentStoredCandidateSummaries(task).length > 0) return true;
  const result = isRecord(task.result) ? task.result : {};
  const chatRun = isRecord(result.chatRun) ? result.chatRun : {};
  if (
    positiveNumber(chatRun.socialRequestId) ||
    positiveNumber(chatRun.candidateCount) ||
    isRecord(chatRun.socialRequestDraft)
  ) {
    return true;
  }
  return false;
}

export function socialAgentCandidateFollowupReply(
  task: AgentTask,
  message: string,
): string {
  const candidates = readSocialAgentStoredCandidateSummaries(task);
  if (candidates.length === 0) {
    return '我还没有可参考的候选人。你可以先告诉我想找谁或找什么活动，我再开始匹配。';
  }
  const candidate = selectCandidate(candidates, message);
  const name = cleanDisplayText(
    candidate.nickname,
    `用户 #${cleanDisplayText(candidate.userId, '')}`,
  );
  const reasons = Array.isArray(candidate.reasons)
    ? candidate.reasons
        .map((item) => cleanDisplayText(item, ''))
        .filter(Boolean)
    : [];
  const risk = isRecord(candidate.risk) ? candidate.risk : {};
  const rawWarnings = Array.isArray(candidate.riskWarnings)
    ? candidate.riskWarnings
    : Array.isArray(risk.warnings)
      ? risk.warnings
      : [];
  const warnings = rawWarnings
    .map((item) => cleanDisplayText(item, ''))
    .filter(Boolean);
  if (/(为什么|推荐理由|匹配)/.test(message)) {
    return reasons.length > 0
      ? `${name} 的主要匹配点是：${reasons.slice(0, 3).join('；')}。是否联系仍需要你确认。`
      : `${name} 与你的时间、地点或兴趣边界较接近。是否联系仍需要你确认。`;
  }
  if (/(靠谱吗|安全|风险)/.test(message)) {
    return warnings.length > 0
      ? `${name} 有这些需要注意的点：${warnings.slice(0, 2).join('；')}。建议先站内聊，并选择公开地点。`
      : `${name} 当前没有明显风险提示，但我仍建议先站内聊、公开地点见面，发送消息或加好友都需要你手动确认。`;
  }
  return `${name} 当前是我优先参考的候选。你可以问“为什么匹配”，也可以点击候选卡片上的确认按钮执行收藏、发送或加好友。`;
}

function selectCandidate(
  candidates: Array<Record<string, unknown>>,
  message: string,
): Record<string, unknown> {
  const index = /第二个|第二/.test(message)
    ? 1
    : /第三个|第三/.test(message)
      ? 2
      : 0;
  return candidates[Math.min(index, candidates.length - 1)] ?? candidates[0];
}

function positiveNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function hasCompletedSearchSlots(task: AgentTask): boolean {
  const memory = readSocialAgentTaskMemory(task);
  const slots = isRecord(memory.taskSlots) ? memory.taskSlots : {};
  const hasActivity = hasUsableSearchSlot(slots.activity);
  const hasTime = hasUsableSearchSlot(slots.time_window);
  const hasLocation =
    hasUsableSearchSlot(slots.location_text) ||
    hasUsableSearchSlot(slots.geo_area, { allowInferred: true });
  return hasActivity && hasTime && hasLocation;
}

function hasUsableSearchSlot(
  slot: unknown,
  options: { allowInferred?: boolean } = {},
): boolean {
  if (!isRecord(slot)) return false;
  if (!cleanDisplayText(slot.value, '')) return false;
  const state = cleanDisplayText(slot.state, '');
  if (options.allowInferred && state === 'inferred') return true;
  return ['answered', 'confirmed', 'completed', 'modified'].includes(state);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
