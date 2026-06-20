export function socialCodexThreadIdForTask(taskId: unknown): string | null {
  const parsed = socialCodexTaskIdFromThreadId(taskId);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return `agent-task:${Math.trunc(parsed)}`;
}

export function socialCodexThreadIdOrExisting(
  threadId: string | null | undefined,
  taskId: unknown,
): string | null {
  const trimmed = typeof threadId === 'string' ? threadId.trim() : '';
  const normalizedThreadId = socialCodexThreadIdForTask(trimmed);
  if (normalizedThreadId) return normalizedThreadId;
  if (trimmed) return trimmed;
  return socialCodexThreadIdForTask(taskId);
}

export function socialCodexTaskIdFromThreadId(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return Number.NaN;
  const text = value.trim();
  if (/^\d+$/.test(text)) return Number(text);
  const match = text.match(/^(?:agent-task|social-thread|task|thread):(\d+)$/i);
  return match ? Number(match[1]) : Number.NaN;
}
