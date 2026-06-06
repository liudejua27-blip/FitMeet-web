import { LifeGraphProposalDto } from '../life-graph/dto/life-graph.dto';
import type {
  SocialAgentActivityResult,
  SocialAgentAsyncRunSnapshot,
  SocialAgentIntentRouteResult,
} from './social-agent-chat.types';

export type SocialAgentRouteTurnState = {
  savedContext: boolean;
  profileUpdated: boolean;
  queuedRun: SocialAgentAsyncRunSnapshot | null;
  runMode: SocialAgentIntentRouteResult['runMode'];
  assistantMessage: string;
  activityResults: SocialAgentActivityResult[];
  profileUpdateProposal: LifeGraphProposalDto | null;
};

type ConversationTurnPatch = {
  assistantMessage?: string;
  savedContext: boolean;
  profileUpdated: boolean;
  profileUpdateProposal: LifeGraphProposalDto | null;
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
    activityResults: [],
    profileUpdateProposal: null,
  };
}

export function applyConversationTurnState(
  state: SocialAgentRouteTurnState,
  patch: ConversationTurnPatch,
): SocialAgentRouteTurnState {
  return {
    ...state,
    assistantMessage: patch.assistantMessage ?? state.assistantMessage,
    savedContext: patch.savedContext,
    profileUpdated: patch.profileUpdated,
    profileUpdateProposal: patch.profileUpdateProposal,
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
