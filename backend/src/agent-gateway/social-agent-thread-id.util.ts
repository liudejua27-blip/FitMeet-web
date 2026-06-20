export function parseSocialAgentThreadTaskId(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? Math.trunc(value) : null;
  }
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number(text);
  const match = text.match(/^(?:agent-task|social-thread|task|thread):(\d+)$/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeTaskBoundSocialAgentEvent(
  value: unknown,
  taskId: number,
): unknown {
  if (!isRecord(value)) return value;
  const eventTaskId =
    typeof value.taskId === 'number' && Number.isFinite(value.taskId)
      ? Math.trunc(value.taskId)
      : null;
  const threadId = typeof value.threadId === 'string' ? value.threadId : '';
  const parsedThreadTaskId = parseSocialAgentThreadTaskId(threadId);
  if (eventTaskId === taskId && parsedThreadTaskId === taskId) return value;

  return {
    ...value,
    taskId,
    threadId:
      parsedThreadTaskId === taskId || eventTaskId === taskId
        ? threadId
        : `agent-task:${taskId}`,
  };
}
