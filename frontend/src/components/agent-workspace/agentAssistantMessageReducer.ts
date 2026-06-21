import type { UserFacingAgentResponse } from '../../api/socialAgentApi';
import type { AgentThreadMessage } from './socialAgentThreadStore';
import { mergeUniqueAgentCards } from './agentCardIdentity';
import {
  collapseRepeatedAssistantTextBlocks,
  isSameAssistantAnswerSurface,
  normalizeAssistantTextForMerge,
} from './assistantTextDedupe';

export type AssistantRunMessageAnchor = {
  runId?: string | null;
  messageId?: string | null;
};

const ASSISTANT_PLACEHOLDER = '\u200b';

export function findSingleRunAssistantMessageIndex(
  messages: AgentThreadMessage[],
  anchor: AssistantRunMessageAnchor,
): number {
  const anchorKeys = assistantRunKeysFromAnchor(anchor);
  if (anchorKeys.length === 0) return -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== 'assistant') continue;
    if (assistantRunKeysFromMessage(message).some((key) => anchorKeys.includes(key))) {
      return index;
    }
  }
  return -1;
}

export function reduceSingleRunAssistantMessages(
  messages: AgentThreadMessage[],
): AgentThreadMessage[] {
  const next: AgentThreadMessage[] = [];
  const keyToIndex = new Map<string, number>();
  let changed = false;

  for (const message of messages) {
    const keys =
      message.role === 'assistant' ? assistantRunKeysFromMessage(message) : [];
    const existingIndex = keys
      .map((key) => keyToIndex.get(key))
      .find((index): index is number => typeof index === 'number');

    const previousIndex = next.length - 1;
    const previous = previousIndex >= 0 ? next[previousIndex] : null;
    if (
      existingIndex === undefined &&
      message.role === 'assistant' &&
      previous?.role === 'assistant' &&
      shouldMergeAdjacentAssistantWithoutRunKey(previous, message)
    ) {
      changed = true;
      const merged = mergeSingleRunAssistantMessage(previous, message);
      next[previousIndex] = merged;
      for (const key of assistantRunKeysFromMessage(merged)) {
        keyToIndex.set(key, previousIndex);
      }
      continue;
    }

    if (existingIndex === undefined) {
      const index = next.length;
      next.push(message);
      for (const key of keys) keyToIndex.set(key, index);
      continue;
    }

    changed = true;
    const merged = mergeSingleRunAssistantMessage(next[existingIndex], message);
    next[existingIndex] = merged;
    for (const key of assistantRunKeysFromMessage(merged)) {
      keyToIndex.set(key, existingIndex);
    }
  }

  return changed ? next : messages;
}

function shouldMergeAdjacentAssistantWithoutRunKey(
  existing: AgentThreadMessage,
  incoming: AgentThreadMessage,
): boolean {
  const existingKeys = assistantRunKeysFromMessage(existing);
  const incomingKeys = assistantRunKeysFromMessage(incoming);
  if (existingKeys.length > 0 || incomingKeys.length > 0) return false;
  const left = existing.content === ASSISTANT_PLACEHOLDER ? '' : existing.content;
  const right = incoming.content === ASSISTANT_PLACEHOLDER ? '' : incoming.content;
  const leftNorm = normalizeAssistantText(left);
  const rightNorm = normalizeAssistantText(right);
  if (!leftNorm || !rightNorm) return existing.status === 'streaming' || incoming.status === 'streaming';
  return isSameAssistantAnswerSurface(left, right);
}

function mergeSingleRunAssistantMessage(
  existing: AgentThreadMessage,
  incoming: AgentThreadMessage,
): AgentThreadMessage {
  const branchable =
    existing.branchable === false || incoming.branchable === false
      ? false
      : incoming.branchable ?? existing.branchable;
  return {
    ...existing,
    ...incoming,
    id: existing.id,
    role: 'assistant',
    content: mergeSingleRunAssistantText(existing.content, incoming.content, incoming),
    status:
      incoming.result && incoming.status === 'done'
        ? 'done'
        : mergeAssistantStatus(existing.status, incoming.status),
    result: mergeUserFacingResults(existing.result ?? null, incoming.result ?? null),
    taskId: incoming.taskId ?? existing.taskId,
    runId: incoming.runId ?? existing.runId ?? null,
    messageId: incoming.messageId ?? existing.messageId ?? null,
    traceId: incoming.traceId ?? existing.traceId ?? null,
    branch: branchable === false ? undefined : existing.branch ?? incoming.branch,
    createsBranch:
      branchable === false ? false : existing.createsBranch || incoming.createsBranch,
    branchable,
  };
}

function mergeSingleRunAssistantText(
  existing: string,
  incoming: string,
  incomingMessage: AgentThreadMessage,
) {
  const left = existing === ASSISTANT_PLACEHOLDER ? '' : existing;
  const right = incoming === ASSISTANT_PLACEHOLDER ? '' : incoming;
  const leftNorm = normalizeAssistantText(left);
  const rightNorm = normalizeAssistantText(right);
  if (!leftNorm) return collapseRepeatedRunText(right);
  if (!rightNorm) return collapseRepeatedRunText(left);
  if (leftNorm === rightNorm) return collapseRepeatedRunText(left);
  if (leftNorm.includes(rightNorm)) return collapseRepeatedRunText(left);
  if (rightNorm.includes(leftNorm)) return collapseRepeatedRunText(right);
  if (incomingMessage.status === 'done' || incomingMessage.result) {
    return collapseRepeatedRunText(right);
  }
  return collapseRepeatedRunText(`${left}${right}`);
}

function mergeAssistantStatus(
  left: AgentThreadMessage['status'],
  right: AgentThreadMessage['status'],
) {
  if (right === 'error' || left === 'error') return 'error';
  if (right === 'done' || left === 'done') return 'done';
  if (right === 'streaming' || left === 'streaming') return 'streaming';
  return right ?? left;
}

function mergeUserFacingResults(
  existing: UserFacingAgentResponse | null,
  incoming: UserFacingAgentResponse | null,
) {
  if (!existing) return sanitizeMergedUserFacingResult(incoming);
  if (!incoming) return sanitizeMergedUserFacingResult(existing);
  return {
    ...existing,
    ...incoming,
    assistantMessage: collapseRepeatedRunText(incoming.assistantMessage || existing.assistantMessage),
    cards: mergeUniqueAgentCards(existing.cards, incoming.cards),
    pendingConfirmations: mergePendingConfirmations(
      existing.pendingConfirmations,
      incoming.pendingConfirmations,
    ),
  };
}

function sanitizeMergedUserFacingResult(result: UserFacingAgentResponse | null) {
  if (!result) return null;
  return {
    ...result,
    assistantMessage: collapseRepeatedRunText(result.assistantMessage),
  };
}

function mergePendingConfirmations(
  existing: UserFacingAgentResponse['pendingConfirmations'],
  incoming: UserFacingAgentResponse['pendingConfirmations'],
) {
  const seen = new Set<string>();
  const merged: UserFacingAgentResponse['pendingConfirmations'] = [];
  for (const confirmation of [...existing, ...incoming]) {
    const key = pendingConfirmationKey(confirmation);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    merged.push(confirmation);
  }
  return merged;
}

function pendingConfirmationKey(
  confirmation: UserFacingAgentResponse['pendingConfirmations'][number],
) {
  const id = stringFromUnknown(confirmation.id);
  if (id) return `approval:${id}`;
  const actionType = stringFromUnknown(confirmation.actionType);
  const targetKey = pendingConfirmationTargetKey(confirmation);
  if (actionType || targetKey) {
    return ['pending', actionType, targetKey].filter(Boolean).join(':');
  }
  return null;
}

function pendingConfirmationTargetKey(
  confirmation: UserFacingAgentResponse['pendingConfirmations'][number],
) {
  const record = confirmation as unknown as Record<string, unknown>;
  const payload = isRecord(record.payload) ? record.payload : {};
  const candidateRecordId = firstStringFromUnknown(
    record.candidateRecordId,
    payload.candidateRecordId,
    payload.socialRequestCandidateId,
  );
  if (candidateRecordId) return `candidate:${candidateRecordId}`;
  const targetUserId = firstStringFromUnknown(
    record.targetUserId,
    payload.targetUserId,
    payload.candidateUserId,
    payload.userId,
  );
  if (targetUserId) return `target:${targetUserId}`;
  const opportunityId = firstStringFromUnknown(
    record.opportunityId,
    record.activityId,
    record.publicIntentId,
    payload.opportunityId,
    payload.activityId,
    payload.publicIntentId,
    payload.socialRequestId,
  );
  if (opportunityId) return `opportunity:${opportunityId}`;
  const taskId = firstStringFromUnknown(record.taskId, payload.taskId);
  if (taskId) return `task:${taskId}`;
  return null;
}

function assistantRunKeysFromMessage(message: AgentThreadMessage) {
  return assistantRunKeysFromAnchor({
    runId: message.runId,
    messageId: message.messageId,
  });
}

function assistantRunKeysFromAnchor(anchor: AssistantRunMessageAnchor) {
  const keys: string[] = [];
  const runId = normalizeAnchorValue(anchor.runId);
  const messageId = normalizeAnchorValue(anchor.messageId);
  if (messageId) keys.push(`message:${messageId}`);
  if (runId) keys.push(`run:${runId}`);
  return keys;
}

function normalizeAnchorValue(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeAssistantText(value: string) {
  return normalizeAssistantTextForMerge(value);
}

function collapseRepeatedRunText(value: string) {
  return collapseRepeatedAssistantTextBlocks(value);
}

function stringFromUnknown(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function firstStringFromUnknown(...values: unknown[]) {
  for (const value of values) {
    const text = stringFromUnknown(value);
    if (text) return text;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
