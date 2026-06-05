import { socialAgentDebugApi, type SocialAgentTaskEvent } from '../api/socialAgentDebugApi';

export type AgentTaskDebugEvent = SocialAgentTaskEvent;

export async function loadAgentTaskEvents(taskId: number) {
  const result = await socialAgentDebugApi.getTaskEvents(taskId);
  return result.events;
}
