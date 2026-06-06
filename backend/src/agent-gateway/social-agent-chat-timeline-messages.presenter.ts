import {
  cleanDisplayText,
  sanitizeForDisplay,
} from '../common/display-text.util';
import type { AgentTask } from './entities/agent-task.entity';
import { AgentTaskEventType } from './entities/agent-task.entity';
import type {
  SocialAgentActivityResult,
  SocialAgentChatReplanRunResult,
  SocialAgentChatRunResult,
  SocialAgentPendingApprovalSnapshot,
  SocialAgentSessionMessage,
  SocialAgentTimelineMessage,
} from './social-agent-chat.types';
import { readSocialAgentTimelineCandidates } from './social-agent-chat-timeline-candidates.presenter';

export function buildSocialAgentTimelineMessages(input: {
  task: AgentTask;
  result: SocialAgentChatRunResult | SocialAgentChatReplanRunResult | null;
  pendingApprovals: SocialAgentPendingApprovalSnapshot[];
  events: Array<Record<string, unknown>>;
  sessionMessages: SocialAgentSessionMessage[];
}): SocialAgentTimelineMessage[] {
  const { task, events, sessionMessages } = input;
  const memoryMessages = sessionMessages.map(
    (message): SocialAgentTimelineMessage => ({
      id: cleanDisplayText(message.id, `task_${task.id}_memory_message`),
      role: message.role,
      kind:
        message.kind === 'approval' || message.kind === 'risk'
          ? message.kind
          : 'text',
      text: cleanDisplayText(message.content, ''),
      createdAt: message.createdAt,
      ...(message.activityResults?.length
        ? { activityResults: message.activityResults }
        : {}),
      ...(message.pendingApproval
        ? { pendingApproval: message.pendingApproval }
        : {}),
    }),
  );
  const eventMessages = events
    .map((event) => timelineMessageFromEvent(task, event))
    .filter((message): message is SocialAgentTimelineMessage => !!message);

  return dedupeTimelineMessages([...memoryMessages, ...eventMessages])
    .sort(
      (a, b) => Date.parse(a.createdAt ?? '') - Date.parse(b.createdAt ?? ''),
    )
    .slice(-120);
}

function timelineMessageFromEvent(
  task: AgentTask,
  event: Record<string, unknown>,
): SocialAgentTimelineMessage | null {
  const rawEventType = cleanDisplayText(event.eventType, '');
  const eventType = normalizeAgentTaskEventType(rawEventType);
  const payload = isRecord(event.payload) ? event.payload : {};
  const id = `event_${numberValue(event.id) ?? rawEventType}_${
    timelineCreatedAt(payload, event) ?? 'unknown'
  }`;
  const createdAt = timelineCreatedAt(payload, event);
  const summary = cleanDisplayText(event.summary, '');

  if (eventType === AgentTaskEventType.SocialAgentMessageUser) {
    const text = cleanDisplayText(payload.message, summary);
    if (!text) return null;
    return { id, role: 'user', kind: 'text', text, createdAt };
  }

  if (eventType === AgentTaskEventType.SocialAgentMessageAssistant) {
    const text = cleanDisplayText(payload.message, summary);
    if (!text) return null;
    const pendingApproval = normalizePendingApprovalSnapshot(
      payload.pendingApproval,
    );
    const activityResults = readSocialAgentActivityResults(
      payload.activityResults,
    );
    return {
      id,
      role: 'assistant',
      kind: pendingApproval
        ? 'approval'
        : activityResults.length > 0
          ? 'activityResults'
          : cleanDisplayText(payload.riskAdvice, '')
            ? 'risk'
            : 'text',
      text,
      createdAt,
      ...(activityResults.length > 0 ? { activityResults } : {}),
      ...(pendingApproval ? { pendingApproval } : {}),
    };
  }

  if (eventType === AgentTaskEventType.SocialAgentCandidatesReturned) {
    const candidates = readSocialAgentTimelineCandidates(
      task,
      payload.candidates,
    );
    const activityResults = readSocialAgentActivityResults(
      payload.activityResults,
    );
    const text =
      cleanDisplayText(payload.message, '') ||
      summary ||
      (candidates.length > 0 ? '已返回候选卡片' : '没有找到候选卡片');
    return {
      id,
      role: 'assistant',
      kind:
        candidates.length === 0 && activityResults.length > 0
          ? 'activityResults'
          : 'candidates',
      text,
      createdAt,
      candidates,
      activityResults,
    };
  }

  if (
    eventType === AgentTaskEventType.ToolCalled ||
    eventType === AgentTaskEventType.ToolReturned ||
    eventType === AgentTaskEventType.ToolFailed
  ) {
    const toolName = cleanDisplayText(payload.toolName ?? payload.tool, '');
    return {
      id,
      role: 'system',
      kind: 'tool',
      text: summary || toolName || rawEventType,
      createdAt,
      toolCalls: [
        sanitizeForDisplay({
          id: cleanDisplayText(event.toolCallId, '') || id,
          stepId: cleanDisplayText(event.stepId, '') || null,
          toolName,
          status:
            cleanDisplayText(payload.status, '') ||
            (eventType === AgentTaskEventType.ToolCalled
              ? 'running'
              : eventType === AgentTaskEventType.ToolFailed
                ? 'failed'
                : 'succeeded'),
          output: isRecord(payload.output) ? payload.output : null,
          error: isRecord(payload.error) ? payload.error : null,
          createdAt,
        }) as Record<string, unknown>,
      ],
    };
  }

  if (
    eventType === AgentTaskEventType.GoalUnderstood ||
    eventType === AgentTaskEventType.PlanGenerated ||
    eventType === AgentTaskEventType.PlanUpdated ||
    eventType === AgentTaskEventType.StepStarted ||
    eventType === AgentTaskEventType.StepCompleted ||
    eventType === AgentTaskEventType.SocialAgentContextAppended ||
    eventType === AgentTaskEventType.SocialAgentReplanQueued ||
    eventType === AgentTaskEventType.SocialAgentReplanStarted ||
    eventType === AgentTaskEventType.SocialAgentReplanCompleted ||
    eventType === AgentTaskEventType.SocialAgentReplanFailed ||
    eventType === AgentTaskEventType.SocialAgentLlmTimeout
  ) {
    return {
      id,
      role: 'system',
      kind: 'status',
      text: summary || rawEventType,
      createdAt,
    };
  }

  return null;
}

function readSocialAgentActivityResults(
  value: unknown,
): SocialAgentActivityResult[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item) => {
      const source: SocialAgentActivityResult['source'] =
        cleanDisplayText(item.source, '') === 'activity'
          ? 'activity'
          : 'public_intent';
      return {
        id: cleanDisplayText(item.id, ''),
        source,
        isRealData: item.isRealData === true,
        activityId: numberValue(item.activityId),
        publicIntentId: cleanDisplayText(item.publicIntentId, '') || null,
        title: cleanDisplayText(item.title, '活动'),
        description: cleanDisplayText(item.description, ''),
        city: cleanDisplayText(item.city, ''),
        loc: cleanDisplayText(item.loc ?? item.locationName, ''),
        requestType: cleanDisplayText(item.requestType ?? item.type, ''),
        interestTags: stringList(item.interestTags),
        timePreference: cleanDisplayText(item.timePreference, ''),
        ownerUserId: numberValue(item.ownerUserId),
        status: cleanDisplayText(item.status, ''),
        createdAt: cleanDisplayText(item.createdAt, '') || null,
        matchScore: numberValue(item.matchScore) ?? undefined,
        matchReasons: stringList(item.matchReasons),
      };
    })
    .filter((item) => item.id || item.activityId || item.publicIntentId);
}

function normalizePendingApprovalSnapshot(
  value: unknown,
): SocialAgentPendingApprovalSnapshot | undefined {
  if (!isRecord(value)) return undefined;
  const id = numberValue(value.id);
  const type = cleanDisplayText(value.type, '');
  const actionType = cleanDisplayText(value.actionType, '');
  if (!id || !type || !actionType) return undefined;
  return {
    id,
    type: type as SocialAgentPendingApprovalSnapshot['type'],
    actionType,
    summary: cleanDisplayText(value.summary, ''),
    riskLevel: cleanDisplayText(
      value.riskLevel,
      'medium',
    ) as SocialAgentPendingApprovalSnapshot['riskLevel'],
    payload: isRecord(value.payload) ? value.payload : {},
    expiresAt: cleanDisplayText(value.expiresAt, '') || null,
  };
}

function normalizeAgentTaskEventType(
  value: unknown,
): AgentTaskEventType | null {
  const text = cleanDisplayText(value, '');
  if (!text) return null;
  const knownValues: string[] = Object.values(AgentTaskEventType);
  return knownValues.includes(text) ? (text as AgentTaskEventType) : null;
}

function timelineCreatedAt(
  payload: Record<string, unknown>,
  event: Record<string, unknown>,
): string | null {
  return (
    cleanDisplayText(payload.createdAt ?? payload.at ?? event.createdAt, '') ||
    null
  );
}

function dedupeTimelineMessages(
  messages: SocialAgentTimelineMessage[],
): SocialAgentTimelineMessage[] {
  const seen = new Set<string>();
  const out: SocialAgentTimelineMessage[] = [];
  for (const message of messages) {
    const textKey = `${message.role}:${message.kind}:${
      message.createdAt ?? ''
    }:${cleanDisplayText(message.text, '').slice(0, 50)}`;
    const key =
      message.kind === 'tool' || message.kind === 'status'
        ? message.id
        : textKey;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(message);
  }
  return out;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => cleanDisplayText(item, ''))
        .filter(Boolean)
        .slice(0, 20)
    : [];
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
