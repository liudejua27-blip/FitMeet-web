import { cleanDisplayText } from '../common/display-text.util';
import type { AgentTask } from './entities/agent-task.entity';

export function readSocialAgentConversationHistory(
  task: AgentTask,
  limit = 20,
): Array<Record<string, unknown>> {
  const memory = isRecord(task.memory) ? task.memory : {};
  const conversation = isRecord(memory.socialAgentConversation)
    ? memory.socialAgentConversation
    : {};
  return Array.isArray(conversation.turns)
    ? conversation.turns
        .filter((turn): turn is Record<string, unknown> => isRecord(turn))
        .slice(-limit)
    : [];
}

export function appendSocialAgentConversationTurn(
  task: AgentTask,
  turn: Record<string, unknown>,
  maxTurns = 60,
): void {
  const memory = isRecord(task.memory) ? task.memory : {};
  const conversation = isRecord(memory.socialAgentConversation)
    ? memory.socialAgentConversation
    : {};
  const turns = Array.isArray(conversation.turns)
    ? conversation.turns.filter((item): item is Record<string, unknown> =>
        isRecord(item),
      )
    : [];
  const last = turns.at(-1);
  const isDuplicate =
    cleanDisplayText(last?.role, '') === cleanDisplayText(turn.role, '') &&
    cleanDisplayText(last?.text, '') === cleanDisplayText(turn.text, '');
  task.memory = {
    ...memory,
    socialAgentConversation: {
      ...conversation,
      turns: (isDuplicate ? turns : [...turns, turn]).slice(-maxTurns),
      updatedAt: cleanDisplayText(turn.at, new Date().toISOString()),
    },
  };
}

export function buildSocialAgentLlmConversationHistory(
  task: AgentTask,
  limit = 12,
): Array<Record<string, unknown>> {
  return readSocialAgentConversationHistory(task, limit).map((turn) => ({
    role: cleanDisplayText(turn.role, ''),
    text: cleanDisplayText(turn.text ?? turn.content, ''),
  }));
}

export function summarizeSocialAgentTaskMemoryForLlm(
  task: AgentTask,
): Record<string, unknown> {
  const memory = isRecord(task.memory) ? task.memory : {};
  const taskMemory = isRecord(memory.taskMemory) ? memory.taskMemory : {};
  const socialAgentChat = isRecord(memory.socialAgentChat)
    ? memory.socialAgentChat
    : {};
  const shortTerm = isRecord(memory.shortTerm) ? memory.shortTerm : {};
  return {
    goal: cleanDisplayText(task.goal, ''),
    preferences: taskMemory.preferences ?? socialAgentChat.preferences ?? [],
    boundaries: taskMemory.boundaries ?? socialAgentChat.boundaries ?? [],
    activeEntities: taskMemory.activeEntities ?? {},
    candidateCount: Array.isArray(shortTerm.candidates)
      ? shortTerm.candidates.length
      : 0,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
