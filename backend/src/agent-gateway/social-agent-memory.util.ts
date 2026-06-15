import { AgentTask } from './entities/agent-task.entity';
import { cleanDisplayText } from '../common/display-text.util';

export type SocialAgentShortTermStep = Record<string, unknown> & {
  id: string;
  label: string;
  status: string;
  updatedAt: string;
};

export type SocialAgentShortTermTurn = Record<string, unknown> & {
  role: 'user' | 'assistant' | 'tool' | 'system';
  text: string;
  intent?: string;
  action?: string;
  at: string;
};

export type SocialAgentShortTermAction = Record<string, unknown> & {
  action: string;
  intent?: string;
  status: string;
  at: string;
};

export type SocialAgentShortTermMemory = Record<string, unknown> & {
  taskId?: number;
  currentGoal?: string;
  permissionMode?: string;
  currentStatus?: string;
  recentTurns?: SocialAgentShortTermTurn[];
  lastAgentActions?: SocialAgentShortTermAction[];
  currentStep?: SocialAgentShortTermStep | null;
  steps?: SocialAgentShortTermStep[];
  candidates?: Record<string, unknown>[];
  displayedCandidates?: Record<string, unknown>[];
  hasSearched?: boolean;
  lastSearchAt?: string;
  lastSearchIntent?: string;
  lastSearchCandidateCount?: number;
  misunderstandingDetected?: boolean;
  misunderstandingReason?: string;
  sentMessages?: Record<string, unknown>[];
  receivedReplies?: Record<string, unknown>[];
  updatedAt?: string;
};

export function rememberSocialAgentShortTerm(
  task: AgentTask,
  updates: Partial<SocialAgentShortTermMemory>,
): SocialAgentShortTermMemory {
  const memory = isRecord(task.memory) ? task.memory : {};
  const previous = isRecord(memory.shortTerm)
    ? (memory.shortTerm as SocialAgentShortTermMemory)
    : {};
  const next: SocialAgentShortTermMemory = {
    ...previous,
    ...updates,
    taskId: task.id,
    currentGoal: task.goal,
    permissionMode: task.permissionMode,
    currentStatus: task.status,
    updatedAt: new Date().toISOString(),
  };
  task.memory = {
    ...memory,
    shortTerm: next,
  };
  return next;
}

export function shortTermMemoryList<T extends Record<string, unknown>>(
  task: AgentTask,
  key: keyof Pick<
    SocialAgentShortTermMemory,
    'steps' | 'candidates' | 'sentMessages' | 'receivedReplies'
  >,
): T[] {
  const memory = isRecord(task.memory) ? task.memory : {};
  const shortTerm = isRecord(memory.shortTerm)
    ? (memory.shortTerm as SocialAgentShortTermMemory)
    : {};
  const value = shortTerm[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

export function appendShortTermMemoryItem<T extends Record<string, unknown>>(
  task: AgentTask,
  key: keyof Pick<
    SocialAgentShortTermMemory,
    'steps' | 'sentMessages' | 'receivedReplies'
  >,
  item: T,
  limit = 20,
): T[] {
  const id = typeof item.id === 'string' ? item.id : null;
  const previous = shortTermMemoryList<T>(task, key).filter(
    (entry) => !id || entry.id !== id,
  );
  return [...previous, item].slice(-limit);
}

export function appendSocialAgentShortTermTurn(
  task: AgentTask,
  turn: Omit<SocialAgentShortTermTurn, 'at'> & { at?: string },
  limit = 20,
): SocialAgentShortTermMemory {
  const memory = isRecord(task.memory) ? task.memory : {};
  const shortTerm = isRecord(memory.shortTerm)
    ? (memory.shortTerm as SocialAgentShortTermMemory)
    : {};
  const turns = Array.isArray(shortTerm.recentTurns)
    ? shortTerm.recentTurns.filter(isRecord)
    : [];
  return rememberSocialAgentShortTerm(task, {
    recentTurns: [
      ...turns,
      {
        ...turn,
        text: cleanDisplayText(turn.text, '').slice(0, 500),
        at: turn.at ?? new Date().toISOString(),
      },
    ].slice(-limit) as SocialAgentShortTermTurn[],
  });
}

export function recordSocialAgentShortTermAction(
  task: AgentTask,
  action: Omit<SocialAgentShortTermAction, 'at'> & { at?: string },
  limit = 20,
): SocialAgentShortTermMemory {
  const memory = isRecord(task.memory) ? task.memory : {};
  const shortTerm = isRecord(memory.shortTerm)
    ? (memory.shortTerm as SocialAgentShortTermMemory)
    : {};
  const actions = Array.isArray(shortTerm.lastAgentActions)
    ? shortTerm.lastAgentActions.filter(isRecord)
    : [];
  return rememberSocialAgentShortTerm(task, {
    lastAgentActions: [
      ...actions,
      {
        ...action,
        at: action.at ?? new Date().toISOString(),
      },
    ].slice(-limit) as SocialAgentShortTermAction[],
  });
}

export function recordSocialAgentSearchMemory(
  task: AgentTask,
  input: {
    intent: string;
    candidates?: Record<string, unknown>[];
    candidateCount?: number;
  },
): SocialAgentShortTermMemory {
  const candidates = input.candidates ?? [];
  return rememberSocialAgentShortTerm(task, {
    hasSearched: true,
    lastSearchAt: new Date().toISOString(),
    lastSearchIntent: input.intent,
    lastSearchCandidateCount: input.candidateCount ?? candidates.length,
    displayedCandidates: candidates.slice(-20),
  });
}

export function recordSocialAgentMisunderstanding(
  task: AgentTask,
  reason: string,
): SocialAgentShortTermMemory {
  return rememberSocialAgentShortTerm(task, {
    misunderstandingDetected: true,
    misunderstandingReason: reason,
  });
}

// -----------------------------------------------------------------------------
// Short-term structured task memory (per-task, per-conversation).
// Stored under `task.memory.taskMemory` to avoid colliding with existing
// `memory.shortTerm` (execution telemetry) and `memory.socialAgentConversation`
// (raw chat turns).
// -----------------------------------------------------------------------------

export type SocialAgentActiveEntities = {
  city: string;
  activityType: string;
  targetGender: string;
  timePreference: string;
  locationPreference: string;
};

export type SocialAgentPreferences = {
  interests: string[];
  socialStyle: string;
  communicationStyle: string;
  preferredTraits: string[];
};

export type SocialAgentBoundaries = {
  excludedGenders: string[];
  acceptsStrangers: boolean | null;
  publicActivityAllowed: boolean | null;
  noNightMeet: boolean;
  publicPlaceOnly: boolean;
  noAutoMessage: boolean;
  noContactExchange: boolean;
};

export type SocialAgentCandidateState = {
  recommendedIds: number[];
  savedIds: number[];
  messagedIds: number[];
  rejectedIds: number[];
};

export type SocialAgentActivityState = {
  recommendedIds: string[];
  joinedIds: string[];
  dismissedIds: string[];
};

export type SocialAgentPendingActionMemo = {
  id: number;
  type: string;
  actionType: string;
  summary: string;
  riskLevel: string;
  at: string;
  payload?: Record<string, unknown>;
};

export type SocialAgentUserMessageMemo = {
  text: string;
  intent: string;
  at: string;
};

export type SocialAgentState =
  | 'idle'
  | 'casual_chatting'
  | 'profile_building'
  | 'profile_saved'
  | 'workflow_guiding'
  | 'searching_candidates'
  | 'showing_candidates'
  | 'waiting_confirmation'
  | 'messaging_candidate'
  | 'activity_planning'
  | 'error_recovery';

export type SocialAgentStateTransitionReason =
  | 'user_message'
  | 'casual_chat'
  | 'workflow_help'
  | 'profile_detected'
  | 'profile_saved'
  | 'user_correction'
  | 'search_started'
  | 'candidates_returned'
  | 'activity_search_returned'
  | 'confirmation_required'
  | 'message_action'
  | 'activity_planning'
  | 'activity_confirmed'
  | 'activity_checked_in'
  | 'activity_completed'
  | 'life_graph_updated'
  | 'error'
  | 'reset';

export type SocialAgentTaskMemory = {
  currentGoal: string;
  activeEntities: SocialAgentActiveEntities;
  preferences: SocialAgentPreferences;
  boundaries: SocialAgentBoundaries;
  candidateState: SocialAgentCandidateState;
  activityState: SocialAgentActivityState;
  pendingActions: SocialAgentPendingActionMemo[];
  lastUserMessages: SocialAgentUserMessageMemo[];
  currentTask: {
    state: SocialAgentState;
    previousState: SocialAgentState | '';
    stateReason: SocialAgentStateTransitionReason | '';
    stateUpdatedAt: string;
    objective: string;
    nextStep: string;
    shouldSearchNow: boolean;
    profileSaved: boolean;
    awaitingSearchConfirmation: boolean;
    waitingFor: string;
    lastCompletedStep: string;
    clarificationAskedFields: string[];
    clarificationMissingFields: string[];
    clarificationTurns: number;
    clarificationAskedAt: string;
  };
  stableProfileFacts: Record<string, string | string[]>;
  updatedAt: string;
};

const TASK_MEMORY_MESSAGE_LIMIT = 20;
const TASK_MEMORY_PENDING_ACTION_LIMIT = 10;

function defaultTaskMemory(): SocialAgentTaskMemory {
  return {
    currentGoal: '',
    activeEntities: {
      city: '',
      activityType: '',
      targetGender: '',
      timePreference: '',
      locationPreference: '',
    },
    preferences: {
      interests: [],
      socialStyle: '',
      communicationStyle: '',
      preferredTraits: [],
    },
    boundaries: {
      excludedGenders: [],
      acceptsStrangers: null,
      publicActivityAllowed: null,
      noNightMeet: false,
      publicPlaceOnly: false,
      noAutoMessage: false,
      noContactExchange: false,
    },
    candidateState: {
      recommendedIds: [],
      savedIds: [],
      messagedIds: [],
      rejectedIds: [],
    },
    activityState: { recommendedIds: [], joinedIds: [], dismissedIds: [] },
    pendingActions: [],
    lastUserMessages: [],
    currentTask: {
      state: 'idle',
      previousState: '',
      stateReason: '',
      stateUpdatedAt: new Date(0).toISOString(),
      objective: '',
      nextStep: '',
      shouldSearchNow: false,
      profileSaved: false,
      awaitingSearchConfirmation: false,
      waitingFor: '',
      lastCompletedStep: '',
      clarificationAskedFields: [],
      clarificationMissingFields: [],
      clarificationTurns: 0,
      clarificationAskedAt: '',
    },
    stableProfileFacts: {},
    updatedAt: new Date(0).toISOString(),
  };
}

export function readSocialAgentTaskMemory(
  task: AgentTask,
): SocialAgentTaskMemory {
  const memory = isRecord(task.memory) ? task.memory : {};
  const stored = isRecord(memory.taskMemory) ? memory.taskMemory : {};
  const base = defaultTaskMemory();
  return {
    currentGoal:
      typeof stored.currentGoal === 'string'
        ? stored.currentGoal
        : base.currentGoal,
    activeEntities: {
      ...base.activeEntities,
      ...(isRecord(stored.activeEntities)
        ? coerceStringMap(stored.activeEntities)
        : {}),
    },
    preferences: {
      ...base.preferences,
      ...(isRecord(stored.preferences)
        ? coercePreferences(stored.preferences)
        : {}),
    },
    boundaries: {
      ...base.boundaries,
      ...(isRecord(stored.boundaries)
        ? coerceBoundaries(stored.boundaries)
        : {}),
    },
    candidateState: {
      ...base.candidateState,
      ...(isRecord(stored.candidateState)
        ? coerceNumberLists(stored.candidateState)
        : {}),
    },
    activityState: {
      ...base.activityState,
      ...(isRecord(stored.activityState)
        ? coerceStringLists(stored.activityState)
        : {}),
    },
    pendingActions: Array.isArray(stored.pendingActions)
      ? stored.pendingActions.filter(isRecord).map((entry) => ({
          id: typeof entry.id === 'number' ? entry.id : 0,
          type: typeof entry.type === 'string' ? entry.type : '',
          actionType:
            typeof entry.actionType === 'string' ? entry.actionType : '',
          summary: typeof entry.summary === 'string' ? entry.summary : '',
          riskLevel:
            typeof entry.riskLevel === 'string' ? entry.riskLevel : 'low',
          at:
            typeof entry.at === 'string' ? entry.at : new Date(0).toISOString(),
          payload: isRecord(entry.payload) ? entry.payload : undefined,
        }))
      : base.pendingActions,
    lastUserMessages: Array.isArray(stored.lastUserMessages)
      ? stored.lastUserMessages.filter(isRecord).map((entry) => ({
          text: typeof entry.text === 'string' ? entry.text : '',
          intent: typeof entry.intent === 'string' ? entry.intent : '',
          at:
            typeof entry.at === 'string' ? entry.at : new Date(0).toISOString(),
        }))
      : base.lastUserMessages,
    currentTask: {
      ...base.currentTask,
      ...(isRecord(stored.currentTask)
        ? {
            objective:
              typeof stored.currentTask.objective === 'string'
                ? stored.currentTask.objective
                : base.currentTask.objective,
            nextStep:
              typeof stored.currentTask.nextStep === 'string'
                ? stored.currentTask.nextStep
                : base.currentTask.nextStep,
            shouldSearchNow: stored.currentTask.shouldSearchNow === true,
            state: isSocialAgentState(stored.currentTask.state)
              ? stored.currentTask.state
              : base.currentTask.state,
            previousState: isSocialAgentState(stored.currentTask.previousState)
              ? stored.currentTask.previousState
              : '',
            stateReason: isSocialAgentStateReason(
              stored.currentTask.stateReason,
            )
              ? stored.currentTask.stateReason
              : '',
            stateUpdatedAt:
              typeof stored.currentTask.stateUpdatedAt === 'string'
                ? stored.currentTask.stateUpdatedAt
                : base.currentTask.stateUpdatedAt,
            profileSaved: stored.currentTask.profileSaved === true,
            awaitingSearchConfirmation:
              stored.currentTask.awaitingSearchConfirmation === true,
            waitingFor:
              typeof stored.currentTask.waitingFor === 'string'
                ? stored.currentTask.waitingFor
                : base.currentTask.waitingFor,
            lastCompletedStep:
              typeof stored.currentTask.lastCompletedStep === 'string'
                ? stored.currentTask.lastCompletedStep
                : base.currentTask.lastCompletedStep,
            clarificationAskedFields: Array.isArray(
              stored.currentTask.clarificationAskedFields,
            )
              ? stored.currentTask.clarificationAskedFields
                  .filter((item): item is string => typeof item === 'string')
                  .slice(0, 20)
              : base.currentTask.clarificationAskedFields,
            clarificationMissingFields: Array.isArray(
              stored.currentTask.clarificationMissingFields,
            )
              ? stored.currentTask.clarificationMissingFields
                  .filter((item): item is string => typeof item === 'string')
                  .slice(0, 20)
              : base.currentTask.clarificationMissingFields,
            clarificationTurns:
              typeof stored.currentTask.clarificationTurns === 'number' &&
              Number.isFinite(stored.currentTask.clarificationTurns)
                ? Math.max(0, Math.floor(stored.currentTask.clarificationTurns))
                : base.currentTask.clarificationTurns,
            clarificationAskedAt:
              typeof stored.currentTask.clarificationAskedAt === 'string'
                ? stored.currentTask.clarificationAskedAt
                : base.currentTask.clarificationAskedAt,
          }
        : {}),
    },
    stableProfileFacts: isRecord(stored.stableProfileFacts)
      ? coerceProfileFacts(stored.stableProfileFacts)
      : base.stableProfileFacts,
    updatedAt:
      typeof stored.updatedAt === 'string' ? stored.updatedAt : base.updatedAt,
  };
}

export function writeSocialAgentTaskMemory(
  task: AgentTask,
  next: SocialAgentTaskMemory,
): void {
  const memory = isRecord(task.memory) ? task.memory : {};
  task.memory = {
    ...memory,
    taskMemory: { ...next, updatedAt: new Date().toISOString() },
  };
}

export function appendSocialAgentUserMemo(
  task: AgentTask,
  text: string,
  intent: string,
): SocialAgentTaskMemory {
  const memory = readSocialAgentTaskMemory(task);
  const trimmed = (text ?? '').trim();
  if (!trimmed) {
    writeSocialAgentTaskMemory(task, memory);
    return memory;
  }
  const entry: SocialAgentUserMessageMemo = {
    text: trimmed.slice(0, 240),
    intent,
    at: new Date().toISOString(),
  };
  memory.lastUserMessages = [...memory.lastUserMessages, entry].slice(
    -TASK_MEMORY_MESSAGE_LIMIT,
  );
  writeSocialAgentTaskMemory(task, memory);
  return memory;
}

export function mergeSocialAgentActiveEntities(
  task: AgentTask,
  entities: Partial<SocialAgentActiveEntities>,
  goal?: string,
): SocialAgentTaskMemory {
  const memory = readSocialAgentTaskMemory(task);
  const next = { ...memory.activeEntities };
  for (const key of Object.keys(memory.activeEntities) as Array<
    keyof SocialAgentActiveEntities
  >) {
    const value = entities[key];
    if (typeof value === 'string' && value.trim()) {
      next[key] = value.trim();
    }
  }
  memory.activeEntities = next;
  const goalTrimmed = (goal ?? '').trim();
  if (goalTrimmed) memory.currentGoal = goalTrimmed.slice(0, 240);
  writeSocialAgentTaskMemory(task, memory);
  return memory;
}

export function mergeSocialAgentPreferences(
  task: AgentTask,
  message: string,
): SocialAgentTaskMemory {
  const memory = readSocialAgentTaskMemory(task);
  const text = (message ?? '').trim();
  if (!text) {
    writeSocialAgentTaskMemory(task, memory);
    return memory;
  }
  const interests = extractInterestKeywords(text);
  if (interests.length > 0) {
    memory.preferences.interests = mergeUnique(
      memory.preferences.interests,
      interests,
      16,
    );
  }
  if (/(慢热|内向|安静)/.test(text))
    memory.preferences.socialStyle = 'slow_warm';
  else if (/(外向|健谈|社牛|话多)/.test(text))
    memory.preferences.socialStyle = 'outgoing';
  if (/(简短|直接|少寒暄)/.test(text))
    memory.preferences.communicationStyle = 'concise';
  else if (/(详细|聊得久|喜欢聊)/.test(text))
    memory.preferences.communicationStyle = 'verbose';
  const traits = extractTraitKeywords(text);
  if (traits.length > 0) {
    memory.preferences.preferredTraits = mergeUnique(
      memory.preferences.preferredTraits,
      traits,
      12,
    );
  }
  writeSocialAgentTaskMemory(task, memory);
  return memory;
}

export function mergeSocialAgentBoundaries(
  task: AgentTask,
  message: string,
): SocialAgentTaskMemory {
  const memory = readSocialAgentTaskMemory(task);
  const text = (message ?? '').trim();
  if (!text) {
    writeSocialAgentTaskMemory(task, memory);
    return memory;
  }
  if (/(不要夜间|别夜间|不晚上|不要晚上)/.test(text))
    memory.boundaries.noNightMeet = true;
  if (/(公开场所|公共场合|公开地点)/.test(text))
    memory.boundaries.publicPlaceOnly = true;
  if (/(接受陌生人|可以接受陌生人|愿意认识陌生人|可以认识陌生人)/.test(text))
    memory.boundaries.acceptsStrangers = true;
  if (
    /(不接受陌生人|不要陌生人|别推荐陌生人|不要推荐陌生人|只推荐熟人)/.test(
      text,
    )
  )
    memory.boundaries.acceptsStrangers = false;
  if (/(可以公开发起活动|愿意公开发起活动|可以公开活动|公开发起)/.test(text))
    memory.boundaries.publicActivityAllowed = true;
  if (
    /(不公开发起活动|不要公开发起活动|别公开发起活动|不公开活动|不公开发起)/.test(
      text,
    )
  )
    memory.boundaries.publicActivityAllowed = false;
  if (/(不要自动发消息|不要自动私信|别自动发)/.test(text))
    memory.boundaries.noAutoMessage = true;
  if (/(不要联系方式|不交换联系方式|不留电话|不留微信)/.test(text)) {
    memory.boundaries.noContactExchange = true;
  }
  const excluded: string[] = [];
  if (/不要(?:推荐)?男(?:生|性|的)/.test(text)) excluded.push('male');
  if (/不要(?:推荐)?女(?:生|性|的)/.test(text)) excluded.push('female');
  if (excluded.length > 0) {
    memory.boundaries.excludedGenders = mergeUnique(
      memory.boundaries.excludedGenders,
      excluded,
      4,
    );
  }
  writeSocialAgentTaskMemory(task, memory);
  return memory;
}

export function recordSocialAgentPendingAction(
  task: AgentTask,
  action: SocialAgentPendingActionMemo,
): SocialAgentTaskMemory {
  const memory = readSocialAgentTaskMemory(task);
  const dedup = memory.pendingActions.filter((item) => item.id !== action.id);
  memory.pendingActions = [...dedup, action].slice(
    -TASK_MEMORY_PENDING_ACTION_LIMIT,
  );
  writeSocialAgentTaskMemory(task, memory);
  return memory;
}

export function clearSocialAgentPendingAction(
  task: AgentTask,
  actionId: number,
): SocialAgentTaskMemory {
  const memory = readSocialAgentTaskMemory(task);
  memory.pendingActions = memory.pendingActions.filter(
    (item) => item.id !== actionId,
  );
  writeSocialAgentTaskMemory(task, memory);
  return memory;
}

export function recordSocialAgentRecommendedCandidates(
  task: AgentTask,
  ids: number[],
): SocialAgentTaskMemory {
  const memory = readSocialAgentTaskMemory(task);
  const cleaned = ids.filter((id) => Number.isFinite(id) && id > 0);
  if (cleaned.length > 0) {
    memory.candidateState.recommendedIds = mergeUnique(
      memory.candidateState.recommendedIds,
      cleaned,
      40,
    );
  }
  writeSocialAgentTaskMemory(task, memory);
  return memory;
}

export function rememberSocialAgentCurrentTask(
  task: AgentTask,
  patch: Partial<SocialAgentTaskMemory['currentTask']>,
): SocialAgentTaskMemory {
  const memory = readSocialAgentTaskMemory(task);
  memory.currentTask = {
    ...memory.currentTask,
    ...patch,
  };
  writeSocialAgentTaskMemory(task, memory);
  return memory;
}

export function transitionSocialAgentState(
  task: AgentTask,
  reason: SocialAgentStateTransitionReason,
  patch: Partial<SocialAgentTaskMemory['currentTask']> = {},
): SocialAgentTaskMemory {
  const memory = readSocialAgentTaskMemory(task);
  const previousState = memory.currentTask.state || 'idle';
  const nextState = stateForTransition(previousState, reason, patch);
  memory.currentTask = {
    ...memory.currentTask,
    ...patch,
    state: nextState,
    previousState,
    stateReason: reason,
    stateUpdatedAt: new Date().toISOString(),
  };
  writeSocialAgentTaskMemory(task, memory);
  return memory;
}

export function stateForTransition(
  previous: SocialAgentState,
  reason: SocialAgentStateTransitionReason,
  patch: Partial<SocialAgentTaskMemory['currentTask']> = {},
): SocialAgentState {
  if (patch.state && isSocialAgentState(patch.state)) return patch.state;
  switch (reason) {
    case 'casual_chat':
      return 'casual_chatting';
    case 'workflow_help':
      return 'workflow_guiding';
    case 'profile_detected':
      return 'profile_building';
    case 'profile_saved':
      return 'profile_saved';
    case 'user_correction':
      return 'error_recovery';
    case 'search_started':
      return 'searching_candidates';
    case 'candidates_returned':
    case 'activity_search_returned':
      return patch.waitingFor === 'search_refinement'
        ? 'error_recovery'
        : 'showing_candidates';
    case 'confirmation_required':
      return 'waiting_confirmation';
    case 'message_action':
      return 'messaging_candidate';
    case 'activity_planning':
      return 'activity_planning';
    case 'activity_confirmed':
    case 'activity_checked_in':
    case 'activity_completed':
      return 'activity_planning';
    case 'life_graph_updated':
      return 'profile_saved';
    case 'error':
      return 'error_recovery';
    case 'reset':
      return 'idle';
    case 'user_message':
    default:
      return previous || 'idle';
  }
}

export function mergeSocialAgentStableProfileFacts(
  task: AgentTask,
  facts: Record<string, unknown>,
): SocialAgentTaskMemory {
  const memory = readSocialAgentTaskMemory(task);
  memory.stableProfileFacts = {
    ...memory.stableProfileFacts,
    ...coerceProfileFacts(facts),
  };
  writeSocialAgentTaskMemory(task, memory);
  return memory;
}

function extractInterestKeywords(text: string): string[] {
  const tags = [
    '拍照',
    '跑步',
    '徒步',
    '骑行',
    '羽毛球',
    '篮球',
    '足球',
    '健身',
    '瑜伽',
    '游泳',
    '咖啡',
    '咖啡聊天',
    '散步',
    '爬山',
    '旅行',
    '电影',
    '展览',
    '读书',
    '弹琴',
    '吃饭',
  ];
  return tags.filter((tag) => text.includes(tag));
}

function extractTraitKeywords(text: string): string[] {
  const traits = [
    '靠谱',
    '健谈',
    '安静',
    '阳光',
    '内向',
    '外向',
    '幽默',
    '认真',
    '佛系',
    '主动',
    '低压力',
    '随和',
  ];
  return traits.filter((trait) => text.includes(trait));
}

function mergeUnique<T>(prev: T[], next: T[], limit: number): T[] {
  const result: T[] = [];
  for (const value of [...prev, ...next]) {
    if (!result.includes(value)) result.push(value);
  }
  return result.slice(-limit);
}

function coerceStringMap(
  input: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

function coercePreferences(
  input: Record<string, unknown>,
): Partial<SocialAgentPreferences> {
  const out: Partial<SocialAgentPreferences> = {};
  if (Array.isArray(input.interests)) {
    out.interests = input.interests.filter(
      (v): v is string => typeof v === 'string',
    );
  }
  if (typeof input.socialStyle === 'string')
    out.socialStyle = input.socialStyle;
  if (typeof input.communicationStyle === 'string')
    out.communicationStyle = input.communicationStyle;
  if (Array.isArray(input.preferredTraits)) {
    out.preferredTraits = input.preferredTraits.filter(
      (v): v is string => typeof v === 'string',
    );
  }
  return out;
}

function coerceBoundaries(
  input: Record<string, unknown>,
): Partial<SocialAgentBoundaries> {
  const out: Partial<SocialAgentBoundaries> = {};
  if (Array.isArray(input.excludedGenders)) {
    out.excludedGenders = input.excludedGenders.filter(
      (v): v is string => typeof v === 'string',
    );
  }
  if (typeof input.noNightMeet === 'boolean')
    out.noNightMeet = input.noNightMeet;
  if (typeof input.publicPlaceOnly === 'boolean')
    out.publicPlaceOnly = input.publicPlaceOnly;
  if (typeof input.acceptsStrangers === 'boolean')
    out.acceptsStrangers = input.acceptsStrangers;
  if (typeof input.publicActivityAllowed === 'boolean')
    out.publicActivityAllowed = input.publicActivityAllowed;
  if (typeof input.noAutoMessage === 'boolean')
    out.noAutoMessage = input.noAutoMessage;
  if (typeof input.noContactExchange === 'boolean')
    out.noContactExchange = input.noContactExchange;
  return out;
}

function coerceNumberLists(
  input: Record<string, unknown>,
): Partial<SocialAgentCandidateState> {
  const out: Partial<SocialAgentCandidateState> = {};
  for (const key of [
    'recommendedIds',
    'savedIds',
    'messagedIds',
    'rejectedIds',
  ] as const) {
    const value = input[key];
    if (Array.isArray(value)) {
      out[key] = value.filter(
        (v): v is number => typeof v === 'number' && Number.isFinite(v),
      );
    }
  }
  return out;
}

function coerceStringLists(
  input: Record<string, unknown>,
): Partial<SocialAgentActivityState> {
  const out: Partial<SocialAgentActivityState> = {};
  for (const key of ['recommendedIds', 'joinedIds', 'dismissedIds'] as const) {
    const value = input[key];
    if (Array.isArray(value)) {
      out[key] = value.filter((v): v is string => typeof v === 'string');
    }
  }
  return out;
}

function coerceProfileFacts(
  input: Record<string, unknown>,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string' && value.trim()) {
      out[key] = value.trim();
      continue;
    }
    if (
      Array.isArray(value) &&
      value.every((item) => typeof item === 'string')
    ) {
      const list = value.map((item) => item.trim()).filter(Boolean);
      if (list.length > 0) out[key] = list;
    }
  }
  return out;
}

function isSocialAgentState(value: unknown): value is SocialAgentState {
  return (
    typeof value === 'string' &&
    [
      'idle',
      'casual_chatting',
      'profile_building',
      'profile_saved',
      'workflow_guiding',
      'searching_candidates',
      'showing_candidates',
      'waiting_confirmation',
      'messaging_candidate',
      'activity_planning',
      'error_recovery',
    ].includes(value)
  );
}

function isSocialAgentStateReason(
  value: unknown,
): value is SocialAgentStateTransitionReason {
  return (
    typeof value === 'string' &&
    [
      'user_message',
      'casual_chat',
      'workflow_help',
      'profile_detected',
      'profile_saved',
      'user_correction',
      'search_started',
      'candidates_returned',
      'activity_search_returned',
      'confirmation_required',
      'message_action',
      'activity_planning',
      'activity_confirmed',
      'activity_checked_in',
      'activity_completed',
      'life_graph_updated',
      'error',
      'reset',
    ].includes(value)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
