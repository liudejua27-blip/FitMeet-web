import type { FitMeetAlphaAgentName } from './fitmeet-alpha-agent.types';

export const FITMEET_SUBAGENT_WORKER_REQUIRED_QUEUES = [
  'fitmeet.subagent.life-graph-agent',
  'fitmeet.subagent.social-match-agent',
  'fitmeet.subagent.meet-loop-agent',
  'fitmeet.subagent.math-agent',
] as const;

export const FITMEET_SUBAGENT_WORKER_DEFAULT_QUEUE_CSV =
  FITMEET_SUBAGENT_WORKER_REQUIRED_QUEUES.join(',');

export function parseFitMeetSubagentWorkerQueueList(
  value: string | null | undefined,
): string[] {
  return `${value ?? ''}`
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function fitMeetSubagentQueueNameForAgent(
  agent: FitMeetAlphaAgentName,
): string {
  if (agent === 'Life Graph Agent') return 'fitmeet.subagent.life-graph-agent';
  if (agent === 'Match Agent') return 'fitmeet.subagent.social-match-agent';
  if (agent === 'Agent Brain') return 'fitmeet.subagent.math-agent';
  return 'fitmeet.subagent.meet-loop-agent';
}

export function fitMeetSubagentQueueNameForWorkerTool(
  toolName: string | null | undefined,
): string | null {
  if (
    toolName === 'life_graph_conversation_turn' ||
    toolName === 'life_graph_profile_turn'
  ) {
    return 'fitmeet.subagent.life-graph-agent';
  }
  if (toolName === 'social_match_search_turn') {
    return 'fitmeet.subagent.social-match-agent';
  }
  if (toolName === 'meet_loop_action_turn') {
    return 'fitmeet.subagent.meet-loop-agent';
  }
  return null;
}
