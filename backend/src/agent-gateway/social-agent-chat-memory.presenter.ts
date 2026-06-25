import { cleanDisplayText } from '../common/display-text.util';
import type { AgentTask } from './entities/agent-task.entity';
import { readSocialAgentTaskMemory } from './social-agent-memory.util';
import {
  SOCIAL_AGENT_DEFAULT_CONTEXT_TURNS,
  SOCIAL_AGENT_MAX_CONTEXT_TURNS,
  selectSocialAgentContextWindow,
} from './social-agent-context-window';

export function readSocialAgentConversationHistory(
  task: AgentTask,
  limit = SOCIAL_AGENT_DEFAULT_CONTEXT_TURNS,
): Array<Record<string, unknown>> {
  const memory = isRecord(task.memory) ? task.memory : {};
  const conversation = isRecord(memory.socialAgentConversation)
    ? memory.socialAgentConversation
    : {};
  return Array.isArray(conversation.turns)
    ? selectSocialAgentContextWindow(
        conversation.turns.filter((turn): turn is Record<string, unknown> =>
          isRecord(turn),
        ),
        limit,
      )
    : [];
}

export function appendSocialAgentConversationTurn(
  task: AgentTask,
  turn: Record<string, unknown>,
  maxTurns = SOCIAL_AGENT_MAX_CONTEXT_TURNS,
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

export function upsertLastSocialAgentAssistantConversationTurn(
  task: AgentTask,
  turn: Record<string, unknown>,
  maxTurns = SOCIAL_AGENT_MAX_CONTEXT_TURNS,
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
  const nextTurn = { ...turn, role: 'assistant' };
  const last = turns.at(-1);
  const nextTurns =
    cleanDisplayText(last?.role, '') === 'assistant'
      ? [...turns.slice(0, -1), nextTurn]
      : [...turns, nextTurn];
  task.memory = {
    ...memory,
    socialAgentConversation: {
      ...conversation,
      turns: nextTurns.slice(-maxTurns),
      updatedAt: cleanDisplayText(turn.at, new Date().toISOString()),
    },
  };
}

export function buildSocialAgentLlmConversationHistory(
  task: AgentTask,
  limit = SOCIAL_AGENT_DEFAULT_CONTEXT_TURNS,
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
  const taskMemory = readSocialAgentTaskMemory(task);
  const rawTaskMemory = isRecord(memory.taskMemory) ? memory.taskMemory : {};
  const socialAgentChat = isRecord(memory.socialAgentChat)
    ? memory.socialAgentChat
    : {};
  const shortTerm = isRecord(memory.shortTerm) ? memory.shortTerm : {};
  const pendingOpportunityDraft = recordMemoryValue(
    socialAgentChat.pendingOpportunityDraft,
    shortTerm.pendingOpportunityDraft,
  );
  const candidateActions = recordMemoryValue(
    shortTerm.candidateActions,
    rawTaskMemory.candidateActions,
    memory.candidateActions,
  );
  const pendingApprovals = arrayMemoryValue(
    rawTaskMemory.pendingApprovals,
    memory.pendingApprovals,
    shortTerm.pendingApprovals,
  );
  const lastSearch =
    shortTerm.hasSearched === true
      ? {
          intent: cleanDisplayText(shortTerm.lastSearchIntent, ''),
          at: cleanDisplayText(shortTerm.lastSearchAt, ''),
          candidateCount:
            typeof shortTerm.lastSearchCandidateCount === 'number'
              ? shortTerm.lastSearchCandidateCount
              : Array.isArray(shortTerm.candidates)
                ? shortTerm.candidates.length
                : 0,
          emptyReason: cleanDisplayText(shortTerm.lastSearchEmptyReason, ''),
          nextStep: cleanDisplayText(shortTerm.lastSearchNextStep, ''),
        }
      : null;
  const taskSlots = isRecord(memory.taskSlots)
    ? memory.taskSlots
    : isRecord(taskMemory.taskSlots)
      ? taskMemory.taskSlots
      : {};
  const taskSlotSummary = isRecord(memory.taskSlotSummary)
    ? memory.taskSlotSummary
    : isRecord(taskMemory.taskSlotSummary)
      ? taskMemory.taskSlotSummary
      : {};
  const knownTaskSlotConstraints = isRecord(memory.knownTaskSlotConstraints)
    ? memory.knownTaskSlotConstraints
    : isRecord(taskMemory.knownTaskSlotConstraints)
      ? taskMemory.knownTaskSlotConstraints
      : null;
  return {
    goal: cleanDisplayText(task.goal, ''),
    currentGoal: taskMemory.currentGoal,
    currentTask: taskMemory.currentTask,
    taskSlots,
    taskSlotSummary,
    knownTaskSlotConstraints,
    preferences: taskMemory.preferences ?? socialAgentChat.preferences ?? [],
    legacyPreferences: legacyMemoryValue(
      rawTaskMemory.preferences,
      socialAgentChat.preferences,
    ),
    boundaries: taskMemory.boundaries ?? socialAgentChat.boundaries ?? [],
    legacyBoundaries: legacyMemoryValue(
      rawTaskMemory.boundaries,
      socialAgentChat.boundaries,
    ),
    activeEntities: taskMemory.activeEntities ?? {},
    candidateState: taskMemory.candidateState,
    candidateActions: candidateActions ?? taskMemory.candidateState,
    activityState: taskMemory.activityState,
    pendingActions: taskMemory.pendingActions,
    pendingApprovals: pendingApprovals ?? taskMemory.pendingActions,
    pendingOpportunityDraft,
    stableProfileFacts: taskMemory.stableProfileFacts,
    lastUserMessages: taskMemory.lastUserMessages,
    lastSearch,
    candidateCount: Array.isArray(shortTerm.candidates)
      ? shortTerm.candidates.length
      : 0,
  };
}

function legacyMemoryValue(
  primary: unknown,
  secondary: unknown,
): unknown[] | Record<string, unknown> | null {
  const value = primary ?? secondary;
  if (Array.isArray(value)) {
    return value
      .map((item) => cleanDisplayText(item, ''))
      .filter(Boolean)
      .slice(0, 20);
  }
  if (isRecord(value)) return value;
  return null;
}

function recordMemoryValue(
  ...values: unknown[]
): Record<string, unknown> | null {
  for (const value of values) {
    if (isRecord(value)) return value;
  }
  return null;
}

function arrayMemoryValue(...values: unknown[]): unknown[] | null {
  for (const value of values) {
    if (Array.isArray(value)) return Array.from<unknown>(value);
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
