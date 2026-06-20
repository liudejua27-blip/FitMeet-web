import { useCallback, useMemo, useReducer } from 'react';

import type {
  FitMeetAgentThreadSummary,
  SocialAgentProfileGateStatus,
  SocialAgentPermissionMode,
  SocialAgentReminderPreference,
  UserFacingAgentResponse,
} from '../../api/socialAgentApi';
import type {
  FitMeetAssistantMessage,
  FitMeetAssistantRecovery,
  FitMeetAssistantStep,
} from './FitMeetAssistantUI.types';

export type AgentConversationIntent = 'conversation' | 'social' | 'approval';
export type AgentThreadMessage = FitMeetAssistantMessage;
export type Step = FitMeetAssistantStep;
export type AgentMessageBranchState = NonNullable<AgentThreadMessage['branch']>;

export type AgentThreadSnapshot = {
  activeTaskId: number | null;
  activeThreadId: string | null;
  messages: AgentThreadMessage[];
  userResult: UserFacingAgentResponse | null;
  mode: SocialAgentPermissionMode;
  branchSelections: Record<string, number>;
  savedAt: number;
};

type StateUpdater<T> = T | ((current: T) => T);

export type SocialAgentThreadState = {
  messages: AgentThreadMessage[];
  steps: Step[];
  userResult: UserFacingAgentResponse | null;
  isRunning: boolean;
  mode: SocialAgentPermissionMode;
  activeTaskId: number | null;
  activeTaskStatus: string | null;
  sessionRestoring: boolean;
  recovery: FitMeetAssistantRecovery | null;
  threads: FitMeetAgentThreadSummary[];
  threadsLoading: boolean;
  activeThreadId: string | null;
  branchSelections: Record<string, number>;
  branchSyncStatus: Record<string, AgentMessageBranchState['syncStatus']>;
  reminderPreference: SocialAgentReminderPreference | null;
  profileGate: SocialAgentProfileGateStatus | null;
  reminderLoading: boolean;
  reminderSaving: boolean;
  reminderError: string | null;
};

type SocialAgentThreadAction =
  | { type: 'setMessages'; value: StateUpdater<AgentThreadMessage[]> }
  | { type: 'setSteps'; value: StateUpdater<Step[]> }
  | { type: 'setUserResult'; value: StateUpdater<UserFacingAgentResponse | null> }
  | { type: 'setIsRunning'; value: StateUpdater<boolean> }
  | { type: 'setMode'; value: StateUpdater<SocialAgentPermissionMode> }
  | { type: 'setActiveTaskId'; value: StateUpdater<number | null> }
  | { type: 'setActiveTaskStatus'; value: StateUpdater<string | null> }
  | { type: 'setSessionRestoring'; value: StateUpdater<boolean> }
  | { type: 'setRecovery'; value: StateUpdater<FitMeetAssistantRecovery | null> }
  | { type: 'setThreads'; value: StateUpdater<FitMeetAgentThreadSummary[]> }
  | { type: 'setThreadsLoading'; value: StateUpdater<boolean> }
  | { type: 'setActiveThreadId'; value: StateUpdater<string | null> }
  | { type: 'setBranchSelections'; value: StateUpdater<Record<string, number>> }
  | {
      type: 'setBranchSyncStatus';
      value: StateUpdater<Record<string, AgentMessageBranchState['syncStatus']>>;
    }
  | {
      type: 'setReminderPreference';
      value: StateUpdater<SocialAgentReminderPreference | null>;
    }
  | {
      type: 'setProfileGate';
      value: StateUpdater<SocialAgentProfileGateStatus | null>;
    }
  | { type: 'setReminderLoading'; value: StateUpdater<boolean> }
  | { type: 'setReminderSaving'; value: StateUpdater<boolean> }
  | { type: 'setReminderError'; value: StateUpdater<string | null> }
  | { type: 'resetConversationCore'; steps: Step[] };

export function createInitialSocialAgentThreadState(
  initialSteps: Step[],
): SocialAgentThreadState {
  return {
    messages: [],
    steps: initialSteps,
    userResult: null,
    isRunning: false,
    mode: 'limited_auto',
    activeTaskId: null,
    activeTaskStatus: null,
    sessionRestoring: false,
    recovery: null,
    threads: [],
    threadsLoading: false,
    activeThreadId: null,
    branchSelections: {},
    branchSyncStatus: {},
    reminderPreference: null,
    profileGate: null,
    reminderLoading: false,
    reminderSaving: false,
    reminderError: null,
  };
}

export function socialAgentThreadReducer(
  state: SocialAgentThreadState,
  action: SocialAgentThreadAction,
): SocialAgentThreadState {
  switch (action.type) {
    case 'setMessages':
      return { ...state, messages: applyUpdater(state.messages, action.value) };
    case 'setSteps':
      return { ...state, steps: applyUpdater(state.steps, action.value) };
    case 'setUserResult':
      return { ...state, userResult: applyUpdater(state.userResult, action.value) };
    case 'setIsRunning':
      return { ...state, isRunning: applyUpdater(state.isRunning, action.value) };
    case 'setMode':
      return { ...state, mode: applyUpdater(state.mode, action.value) };
    case 'setActiveTaskId':
      return { ...state, activeTaskId: applyUpdater(state.activeTaskId, action.value) };
    case 'setActiveTaskStatus':
      return {
        ...state,
        activeTaskStatus: applyUpdater(state.activeTaskStatus, action.value),
      };
    case 'setSessionRestoring':
      return {
        ...state,
        sessionRestoring: applyUpdater(state.sessionRestoring, action.value),
      };
    case 'setRecovery':
      return { ...state, recovery: applyUpdater(state.recovery, action.value) };
    case 'setThreads':
      return { ...state, threads: applyUpdater(state.threads, action.value) };
    case 'setThreadsLoading':
      return { ...state, threadsLoading: applyUpdater(state.threadsLoading, action.value) };
    case 'setActiveThreadId':
      return { ...state, activeThreadId: applyUpdater(state.activeThreadId, action.value) };
    case 'setBranchSelections':
      return {
        ...state,
        branchSelections: applyUpdater(state.branchSelections, action.value),
      };
    case 'setBranchSyncStatus':
      return {
        ...state,
        branchSyncStatus: applyUpdater(state.branchSyncStatus, action.value),
      };
    case 'setReminderPreference':
      return {
        ...state,
        reminderPreference: applyUpdater(state.reminderPreference, action.value),
      };
    case 'setProfileGate':
      return { ...state, profileGate: applyUpdater(state.profileGate, action.value) };
    case 'setReminderLoading':
      return {
        ...state,
        reminderLoading: applyUpdater(state.reminderLoading, action.value),
      };
    case 'setReminderSaving':
      return {
        ...state,
        reminderSaving: applyUpdater(state.reminderSaving, action.value),
      };
    case 'setReminderError':
      return { ...state, reminderError: applyUpdater(state.reminderError, action.value) };
    case 'resetConversationCore':
      return {
        ...state,
        messages: [],
        steps: action.steps,
        userResult: null,
        activeTaskId: null,
        activeTaskStatus: null,
        recovery: null,
        activeThreadId: null,
        branchSelections: {},
        branchSyncStatus: {},
      };
    default:
      return state;
  }
}

export function useSocialAgentThreadStore(initialSteps: Step[]) {
  const [state, dispatch] = useReducer(
    socialAgentThreadReducer,
    initialSteps,
    createInitialSocialAgentThreadState,
  );

  const setMessages = useCallback(
    (value: StateUpdater<AgentThreadMessage[]>) => dispatch({ type: 'setMessages', value }),
    [],
  );
  const setSteps = useCallback(
    (value: StateUpdater<Step[]>) => dispatch({ type: 'setSteps', value }),
    [],
  );
  const setUserResult = useCallback(
    (value: StateUpdater<UserFacingAgentResponse | null>) =>
      dispatch({ type: 'setUserResult', value }),
    [],
  );
  const setIsRunning = useCallback(
    (value: StateUpdater<boolean>) => dispatch({ type: 'setIsRunning', value }),
    [],
  );
  const setMode = useCallback(
    (value: StateUpdater<SocialAgentPermissionMode>) => dispatch({ type: 'setMode', value }),
    [],
  );
  const setActiveTaskId = useCallback(
    (value: StateUpdater<number | null>) => dispatch({ type: 'setActiveTaskId', value }),
    [],
  );
  const setActiveTaskStatus = useCallback(
    (value: StateUpdater<string | null>) =>
      dispatch({ type: 'setActiveTaskStatus', value }),
    [],
  );
  const setSessionRestoring = useCallback(
    (value: StateUpdater<boolean>) => dispatch({ type: 'setSessionRestoring', value }),
    [],
  );
  const setRecovery = useCallback(
    (value: StateUpdater<FitMeetAssistantRecovery | null>) =>
      dispatch({ type: 'setRecovery', value }),
    [],
  );
  const setThreads = useCallback(
    (value: StateUpdater<FitMeetAgentThreadSummary[]>) =>
      dispatch({ type: 'setThreads', value }),
    [],
  );
  const setThreadsLoading = useCallback(
    (value: StateUpdater<boolean>) => dispatch({ type: 'setThreadsLoading', value }),
    [],
  );
  const setActiveThreadId = useCallback(
    (value: StateUpdater<string | null>) => dispatch({ type: 'setActiveThreadId', value }),
    [],
  );
  const setBranchSelections = useCallback(
    (value: StateUpdater<Record<string, number>>) =>
      dispatch({ type: 'setBranchSelections', value }),
    [],
  );
  const setBranchSyncStatus = useCallback(
    (value: StateUpdater<Record<string, AgentMessageBranchState['syncStatus']>>) =>
      dispatch({ type: 'setBranchSyncStatus', value }),
    [],
  );
  const setReminderPreference = useCallback(
    (value: StateUpdater<SocialAgentReminderPreference | null>) =>
      dispatch({ type: 'setReminderPreference', value }),
    [],
  );
  const setProfileGate = useCallback(
    (value: StateUpdater<SocialAgentProfileGateStatus | null>) =>
      dispatch({ type: 'setProfileGate', value }),
    [],
  );
  const setReminderLoading = useCallback(
    (value: StateUpdater<boolean>) => dispatch({ type: 'setReminderLoading', value }),
    [],
  );
  const setReminderSaving = useCallback(
    (value: StateUpdater<boolean>) => dispatch({ type: 'setReminderSaving', value }),
    [],
  );
  const setReminderError = useCallback(
    (value: StateUpdater<string | null>) => dispatch({ type: 'setReminderError', value }),
    [],
  );
  const resetConversationCore = useCallback(
    (steps: Step[]) => dispatch({ type: 'resetConversationCore', steps }),
    [],
  );

  const actions = useMemo(
    () => ({
      setMessages,
      setSteps,
      setUserResult,
      setIsRunning,
      setMode,
      setActiveTaskId,
      setActiveTaskStatus,
      setSessionRestoring,
      setRecovery,
      setThreads,
      setThreadsLoading,
      setActiveThreadId,
      setBranchSelections,
      setBranchSyncStatus,
      setReminderPreference,
      setProfileGate,
      setReminderLoading,
      setReminderSaving,
      setReminderError,
      resetConversationCore,
    }),
    [
      resetConversationCore,
      setActiveTaskId,
      setActiveTaskStatus,
      setActiveThreadId,
      setBranchSelections,
      setBranchSyncStatus,
      setIsRunning,
      setMessages,
      setMode,
      setProfileGate,
      setRecovery,
      setReminderError,
      setReminderLoading,
      setReminderPreference,
      setReminderSaving,
      setSessionRestoring,
      setSteps,
      setThreads,
      setThreadsLoading,
      setUserResult,
    ],
  );

  return [state, actions] as const;
}

function applyUpdater<T>(current: T, updater: StateUpdater<T>): T {
  return typeof updater === 'function' ? (updater as (value: T) => T)(current) : updater;
}
