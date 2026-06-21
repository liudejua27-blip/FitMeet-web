import { useCallback, type MutableRefObject } from 'react';

import type {
  SocialAgentReminderPreference,
  SocialAgentReminderPreferenceInput,
} from '../../api/socialAgentApi';
import type {
  FitMeetAssistantMessage,
  FitMeetAssistantRecovery,
} from './FitMeetAssistantUI.types';
import type { FitMeetToolActionInput } from '../assistant-ui/tool-ui-actions';
import type { Step } from './socialAgentThreadStore';
import type { AgentCheckpointRuntimeAction } from './useAgentCheckpointRuntime';
import { NON_BRANCH_RELOAD_PREFIX } from './useAgentSubmitRuntime';

type SetState<T> = (value: T | ((current: T) => T)) => void;

type SubmitAgentMessage = (event?: undefined, prompt?: string) => Promise<void> | void;
type ReloadLastUserMessageOptions = {
  createBranch?: boolean;
};

type UseAgentRuntimeActionsInput = {
  messages: FitMeetAssistantMessage[];
  isRunning: boolean;
  currentGoal: string;
  recovery: FitMeetAssistantRecovery | null;
  reminderPreference: SocialAgentReminderPreference | null;
  reminderSaving: boolean;
  branchReloadUserIdRef: MutableRefObject<string | null>;
  requestStop: () => void;
  submit: SubmitAgentMessage;
  runCheckpointStream: (
    checkpointId: number | string | null | undefined,
    action: AgentCheckpointRuntimeAction,
    decision?: 'approved' | 'rejected' | null,
    stepId?: string | null,
  ) => Promise<void>;
  toggleReminderRuntime: (
    preference: SocialAgentReminderPreference | null,
    saving: boolean,
  ) => Promise<void>;
  disableReminderRuntime: (
    preference: SocialAgentReminderPreference | null,
    saving: boolean,
  ) => Promise<void>;
  dismissReminderRuntime: (
    reminderId: number | string,
    preference: SocialAgentReminderPreference | null,
    saving: boolean,
  ) => Promise<void>;
  updateReminderSettingsRuntime: (
    preference: SocialAgentReminderPreference | null,
    saving: boolean,
    nextSettings: SocialAgentReminderPreferenceInput,
  ) => Promise<void>;
  settleStreamingAssistantAfterInterruption: () => void;
  setIsRunning: SetState<boolean>;
  setSteps: SetState<Step[]>;
};

export function useAgentRuntimeActions({
  messages,
  isRunning,
  currentGoal,
  recovery,
  reminderPreference,
  reminderSaving,
  branchReloadUserIdRef,
  requestStop,
  submit,
  runCheckpointStream,
  toggleReminderRuntime,
  disableReminderRuntime,
  dismissReminderRuntime,
  updateReminderSettingsRuntime,
  settleStreamingAssistantAfterInterruption,
  setIsRunning,
  setSteps,
}: UseAgentRuntimeActionsInput) {
  const stopRun = useCallback(() => {
    requestStop();
    settleStreamingAssistantAfterInterruption();
    setIsRunning(false);
    setSteps((current) =>
      current.map((step) => (step.status === 'running' ? { ...step, status: 'pending' } : step)),
    );
  }, [
    requestStop,
    setIsRunning,
    setSteps,
    settleStreamingAssistantAfterInterruption,
  ]);

  const reloadLastUserMessage = useCallback((options: ReloadLastUserMessageOptions = {}) => {
    if (!currentGoal || isRunning) return;
    const userMessageId = [...messages].reverse().find((message) => message.role === 'user')?.id;
    branchReloadUserIdRef.current = userMessageId
      ? options.createBranch === false
        ? `${NON_BRANCH_RELOAD_PREFIX}${userMessageId}`
        : userMessageId
      : null;
    void submit(undefined, currentGoal);
  }, [branchReloadUserIdRef, currentGoal, isRunning, messages, submit]);

  const retryRecovery = useCallback(() => {
    if (!recovery || isRunning) return;
    if (recovery.kind === 'checkpoint_available' && recovery.checkpoint) {
      void runCheckpointStream(
        recovery.checkpoint.checkpointId,
        recovery.checkpoint.action,
        null,
        recovery.checkpoint.stepId,
      );
      return;
    }
    if (!recovery.prompt) return;
    void submit(undefined, recovery.prompt);
  }, [isRunning, recovery, runCheckpointStream, submit]);

  const toggleReminders = useCallback(async () => {
    await toggleReminderRuntime(reminderPreference, reminderSaving);
  }, [reminderPreference, reminderSaving, toggleReminderRuntime]);

  const disableReminders = useCallback(async () => {
    await disableReminderRuntime(reminderPreference, reminderSaving);
  }, [disableReminderRuntime, reminderPreference, reminderSaving]);

  const dismissReminder = useCallback(
    async (reminderId: number | string) => {
      await dismissReminderRuntime(reminderId, reminderPreference, reminderSaving);
    },
    [dismissReminderRuntime, reminderPreference, reminderSaving],
  );

  const updateReminderSettings = useCallback(
    async (nextSettings: SocialAgentReminderPreferenceInput) => {
      await updateReminderSettingsRuntime(reminderPreference, reminderSaving, nextSettings);
    },
    [reminderPreference, reminderSaving, updateReminderSettingsRuntime],
  );

  const runCheckpointAction = useCallback(
    (action: AgentCheckpointRuntimeAction, input?: FitMeetToolActionInput) =>
      runCheckpointStream(input?.checkpointId, action, null, input?.stepId),
    [runCheckpointStream],
  );

  const resumeState = useCallback(
    (input?: FitMeetToolActionInput) => runCheckpointAction('resume', input),
    [runCheckpointAction],
  );

  const retryTool = useCallback(
    (input?: FitMeetToolActionInput) => runCheckpointAction('retry', input),
    [runCheckpointAction],
  );

  const replayState = useCallback(
    (input?: FitMeetToolActionInput) => runCheckpointAction('replay', input),
    [runCheckpointAction],
  );

  const forkState = useCallback(
    (input?: FitMeetToolActionInput) => runCheckpointAction('fork', input),
    [runCheckpointAction],
  );

  return {
    stopRun,
    reloadLastUserMessage,
    retryRecovery,
    toggleReminders,
    disableReminders,
    dismissReminder,
    updateReminderSettings,
    resumeState,
    retryTool,
    replayState,
    forkState,
  };
}
