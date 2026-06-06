import { cleanDisplayText } from '../common/display-text.util';
import type { AgentTask } from './entities/agent-task.entity';
import type {
  SocialAgentSessionMessage,
  SocialAgentTimelineMessage,
} from './social-agent-chat.types';
import { timelineMessageFromEvent } from './social-agent-chat-timeline-events.presenter';

export function buildSocialAgentTimelineMessages(input: {
  task: AgentTask;
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
