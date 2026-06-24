export function buildRunScopedAssistantMessageId(input: {
  taskId?: number | string | null;
  runId?: number | string | null;
  traceId?: number | string | null;
  fallback?: string | null;
}): string {
  const task = stableMessageIdPart(input.taskId, 'task');
  const scope =
    stableMessageIdPart(input.runId, '') ||
    stableMessageIdPart(input.traceId, '') ||
    stableMessageIdPart(input.fallback, '') ||
    `local-${Date.now().toString(36)}`;
  return `agent-message:${task}:${scope}`;
}

function stableMessageIdPart(
  value: number | string | null | undefined,
  fallback: string,
): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim();
  if (!normalized) return fallback;
  return normalized.replace(/[^a-zA-Z0-9:_-]/g, '-').slice(0, 120);
}
