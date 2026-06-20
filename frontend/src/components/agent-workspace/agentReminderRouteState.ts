export type AgentReminderRouteState = {
  id: number | string | null;
  taskId: number | string | null;
  message: string;
  source: string | null;
  context: Record<string, unknown> | null;
};

export function readAgentReminderRouteState(state: unknown): AgentReminderRouteState | null {
  if (!isRecord(state)) return null;
  const reminder = state.agentReminder;
  if (!isRecord(reminder)) return null;
  const message = typeof reminder.message === 'string' ? reminder.message.trim() : '';
  if (!message) return null;
  return {
    id:
      typeof reminder.id === 'number' || typeof reminder.id === 'string'
        ? reminder.id
        : null,
    taskId:
      typeof reminder.taskId === 'number' || typeof reminder.taskId === 'string'
        ? reminder.taskId
        : null,
    message,
    source: typeof reminder.source === 'string' ? reminder.source : null,
    context: isRecord(reminder.context) ? reminder.context : null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
