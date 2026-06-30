import { cleanDisplayText } from '../../common/display-text.util';
import type { AgentTask } from '../entities/agent-task.entity';
import {
  buildSocialAgentLlmConversationHistory,
  summarizeSocialAgentTaskMemoryForLlm,
} from '../social-agent-chat-memory.presenter';

export type LoopLlmContext = {
  taskId: number;
  taskGoal: string;
  currentGoal: string;
  currentMessage: string;
  recentConversation: Array<{ role: string; text: string }>;
  recentUserMessages: string[];
  activeEntities: unknown;
  preferences: unknown;
  boundaries: unknown;
  taskSlots: unknown;
  taskSlotSummary: unknown;
  knownTaskSlotConstraints: unknown;
  loopMemory: {
    workoutLoop: unknown;
    friendLoop: unknown;
    travelLoop: unknown;
  };
  interpretationPolicy: string[];
};

export function buildLoopLlmContext(input: {
  task: AgentTask | null | undefined;
  message: string;
  limit?: number;
}): LoopLlmContext {
  const task = input.task ?? null;
  const currentMessage = cleanDisplayText(input.message, '').trim();
  const memory = record(task?.memory);
  const summary = task
    ? summarizeSocialAgentTaskMemoryForLlm(task)
    : emptyMemorySummary();
  const recentConversation = ensureCurrentUserTurn(
    task ? buildSocialAgentLlmConversationHistory(task, input.limit ?? 8) : [],
    currentMessage,
  );

  return {
    taskId: task?.id ?? 0,
    taskGoal: cleanDisplayText(task?.goal, ''),
    currentGoal: cleanDisplayText(summary.currentGoal, ''),
    currentMessage,
    recentConversation,
    recentUserMessages: recentConversation
      .filter((turn) => turn.role === 'user')
      .map((turn) => turn.text)
      .filter(Boolean)
      .slice(-(input.limit ?? 8)),
    activeEntities: summary.activeEntities ?? {},
    preferences: summary.preferences ?? {},
    boundaries: summary.boundaries ?? {},
    taskSlots: summary.taskSlots ?? {},
    taskSlotSummary: summary.taskSlotSummary ?? {},
    knownTaskSlotConstraints: summary.knownTaskSlotConstraints ?? null,
    loopMemory: {
      workoutLoop: memory.workoutLoop ?? null,
      friendLoop: memory.friendLoop ?? null,
      travelLoop: memory.travelLoop ?? null,
    },
    interpretationPolicy: [
      'Use recentConversation and loopMemory to resolve short follow-ups, pronouns, ellipsis, and words like 附近, 这个, 就是, 搭子, 继续.',
      'Treat the current message as the latest user intent, but do not ignore previous user turns in the same task.',
      'Only extract or clarify. Never publish, match, send messages, add friends, save profile, or perform side effects.',
    ],
  };
}

function ensureCurrentUserTurn(
  turns: Array<Record<string, unknown>>,
  currentMessage: string,
): Array<{ role: string; text: string }> {
  const normalized = turns
    .map((turn) => ({
      role: cleanDisplayText(turn.role, ''),
      text: cleanDisplayText(turn.text ?? turn.content, '').slice(0, 500),
    }))
    .filter((turn) => turn.role && turn.text);
  if (!currentMessage) return normalized;
  const last = normalized.at(-1);
  if (last?.role === 'user' && last.text === currentMessage) {
    return normalized;
  }
  return [...normalized, { role: 'user', text: currentMessage.slice(0, 500) }];
}

function emptyMemorySummary(): Record<string, unknown> {
  return {
    currentGoal: '',
    activeEntities: {},
    preferences: {},
    boundaries: {},
    taskSlots: {},
    taskSlotSummary: {},
    knownTaskSlotConstraints: null,
  };
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
