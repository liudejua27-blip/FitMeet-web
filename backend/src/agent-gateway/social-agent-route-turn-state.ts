import { LifeGraphProposalDto } from '../life-graph/dto/life-graph.dto';
import type {
  SocialAgentActivityResult,
  SocialAgentAssistantMessageSource,
  SocialAgentAsyncRunSnapshot,
  SocialAgentIntentRouteResult,
} from './social-agent-chat.types';
import type { AgentLoopRun, SubagentHandoffResult } from './agent-loop.types';

export type SocialAgentRouteTurnState = {
  savedContext: boolean;
  profileUpdated: boolean;
  queuedRun: SocialAgentAsyncRunSnapshot | null;
  runMode: SocialAgentIntentRouteResult['runMode'];
  assistantMessage: string;
  assistantMessageSource?: SocialAgentAssistantMessageSource;
  activityResults: SocialAgentActivityResult[];
  profileUpdateProposal: LifeGraphProposalDto | null;
  assistantStreamed: boolean;
  agentLoop: AgentLoopRun | null;
  subagentHandoffs: SubagentHandoffResult[];
};

type ConversationTurnPatch = {
  assistantMessage?: string;
  assistantMessageSource?: SocialAgentAssistantMessageSource;
  savedContext: boolean;
  profileUpdated: boolean;
  profileUpdateProposal: LifeGraphProposalDto | null;
  assistantStreamed?: boolean;
};

type SearchTurnPatch = {
  assistantMessage?: string;
  savedContext: boolean;
  activityResults: SocialAgentActivityResult[];
  queuedRun: SocialAgentAsyncRunSnapshot | null;
  runMode: SocialAgentIntentRouteResult['runMode'];
};

export function createSocialAgentRouteTurnState(
  assistantMessage: string,
): SocialAgentRouteTurnState {
  return {
    savedContext: false,
    profileUpdated: false,
    queuedRun: null,
    runMode: null,
    assistantMessage,
    assistantMessageSource: 'fallback',
    activityResults: [],
    profileUpdateProposal: null,
    assistantStreamed: false,
    agentLoop: null,
    subagentHandoffs: [],
  };
}

export function applyConversationTurnState(
  state: SocialAgentRouteTurnState,
  patch: ConversationTurnPatch,
): SocialAgentRouteTurnState {
  return {
    ...state,
    assistantMessage: patch.assistantMessage ?? state.assistantMessage,
    assistantMessageSource:
      patch.assistantMessageSource ?? state.assistantMessageSource,
    savedContext: patch.savedContext || state.savedContext,
    profileUpdated: patch.profileUpdated,
    profileUpdateProposal: patch.profileUpdateProposal,
    assistantStreamed: patch.assistantStreamed ?? state.assistantStreamed,
  };
}

export const applyProfileTurnState = applyConversationTurnState;

export function applySearchTurnState(
  state: SocialAgentRouteTurnState,
  patch: SearchTurnPatch,
): SocialAgentRouteTurnState {
  return {
    ...state,
    assistantMessage: patch.assistantMessage ?? state.assistantMessage,
    savedContext: patch.savedContext || state.savedContext,
    activityResults: patch.activityResults,
    queuedRun: patch.queuedRun,
    runMode: patch.runMode,
  };
}
