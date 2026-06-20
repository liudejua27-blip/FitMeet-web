import { useSyncExternalStore } from 'react';

export type CheckpointActionRuntimeState = {
  busyKey: string | null;
  completedKey: string | null;
  failedKey: string | null;
  error: string | null;
};

export const EMPTY_CHECKPOINT_ACTION_STATE: CheckpointActionRuntimeState = {
  busyKey: null,
  completedKey: null,
  failedKey: null,
  error: null,
};

const checkpointActionRuntimeState = new Map<string, CheckpointActionRuntimeState>();
const checkpointActionRuntimeListeners = new Set<() => void>();

function checkpointActionRuntimeKey(
  messageId: string,
  checkpointId: number | string | null | undefined,
  stepId: string | null | undefined,
) {
  if (checkpointId !== null && checkpointId !== undefined && String(checkpointId).length > 0) {
    return `checkpoint:${checkpointId}:${stepId ?? 'run'}`;
  }
  return `message:${messageId}:${stepId ?? 'run'}`;
}

function subscribeCheckpointActionRuntime(listener: () => void) {
  checkpointActionRuntimeListeners.add(listener);
  return () => checkpointActionRuntimeListeners.delete(listener);
}

function emitCheckpointActionRuntimeChange() {
  checkpointActionRuntimeListeners.forEach((listener) => listener());
}

function readCheckpointActionRuntimeState(key: string): CheckpointActionRuntimeState {
  return checkpointActionRuntimeState.get(key) ?? EMPTY_CHECKPOINT_ACTION_STATE;
}

export function setCheckpointActionRuntimeState(
  key: string,
  patch: Partial<CheckpointActionRuntimeState>,
) {
  checkpointActionRuntimeState.set(key, {
    ...readCheckpointActionRuntimeState(key),
    ...patch,
  });
  emitCheckpointActionRuntimeChange();
}

export function useCheckpointActionRuntimeState(
  messageId: string,
  checkpointId: number | string | null | undefined,
  stepId: string | null | undefined,
) {
  const key = checkpointActionRuntimeKey(messageId, checkpointId, stepId);
  const state = useSyncExternalStore(
    subscribeCheckpointActionRuntime,
    () => readCheckpointActionRuntimeState(key),
    () => EMPTY_CHECKPOINT_ACTION_STATE,
  );
  return [key, state] as const;
}
