import { parseSocialAgentThreadTaskId } from './social-agent-thread-id.util';

export type SocialCodexThreadId = `agent-task:${number}`;

export type SocialCodexRuntimeIdentity = {
  /**
   * Long-lived chat surface. A thread can contain many messages and can be
   * rebound to a task once a social/meet goal emerges.
   */
  threadId: SocialCodexThreadId | string;
  /**
   * FitMeet social/meet goal. Null means ordinary conversation without an
   * executable social task yet.
   */
  taskId: number | null;
  /** One model/tool execution attempt within a thread/task. */
  runId: string | null;
  /** Browser/client visible session used for restore and replay. */
  sessionId: string;
};

export type SocialCodexThreadModel = {
  kind: 'thread';
  id: SocialCodexRuntimeIdentity['threadId'];
  ownerUserId: number;
  boundTaskId: number | null;
  title: string;
};

export type SocialCodexTaskModel = {
  kind: 'task';
  id: number;
  ownerUserId: number;
  threadId: SocialCodexRuntimeIdentity['threadId'];
  taskType: string;
  goal: string;
};

export type SocialCodexRunModel = {
  kind: 'run';
  id: string;
  ownerUserId: number;
  threadId: SocialCodexRuntimeIdentity['threadId'];
  taskId: number | null;
  stage: string;
};

export type SocialCodexSessionModel = {
  kind: 'session';
  id: string;
  ownerUserId: number;
  activeThreadId: SocialCodexRuntimeIdentity['threadId'];
  activeTaskId: number | null;
  latestRunId: string | null;
};

export function socialCodexThreadIdForTask(taskId: number): SocialCodexThreadId {
  const normalized = normalizePositiveInteger(taskId);
  if (!normalized) {
    throw new Error('Social Codex thread id requires a positive task id.');
  }
  return `agent-task:${normalized}`;
}

export function socialCodexThreadTaskId(
  threadId: string | number | null | undefined,
): number | null {
  return parseSocialAgentThreadTaskId(threadId);
}

export function createSocialCodexRuntimeIdentity(input: {
  threadId?: string | number | null;
  taskId?: number | null;
  runId?: string | null;
}): SocialCodexRuntimeIdentity {
  const taskId =
    normalizePositiveInteger(input.taskId) ??
    socialCodexThreadTaskId(input.threadId) ??
    null;
  const threadId =
    typeof input.threadId === 'string' && input.threadId.trim()
      ? input.threadId.trim()
      : taskId
        ? socialCodexThreadIdForTask(taskId)
        : 'agent-task:0';
  const runId =
    typeof input.runId === 'string' && input.runId.trim()
      ? input.runId.trim()
      : null;
  return {
    threadId,
    taskId,
    runId,
    sessionId: `social-codex:${threadId}:${runId ?? 'latest'}`,
  };
}

function normalizePositiveInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.trunc(value);
}
