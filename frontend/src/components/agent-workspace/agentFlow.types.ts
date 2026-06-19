import type { UserFacingAgentResponse } from '../../api/socialAgentApi';
import type { AntGuideState, AntGuideTarget } from '../agent/ant-guide';

export type AgentFlowPhase =
  | 'welcome'
  | 'inputFocused'
  | 'userSubmitted'
  | 'analyzingIntent'
  | 'discoveringScenes'
  | 'recommendationsReady'
  | 'generatingOpener'
  | 'openerReady'
  | 'safetyReminder'
  | 'awaitingConfirmation'
  | 'completed'
  | 'missingInfo'
  | 'failed';

export type AgentRightPanelState =
  | 'empty'
  | 'loadingRecommendations'
  | 'recommendations'
  | 'safety'
  | 'confirmation'
  | 'completed'
  | 'error';

export type AgentFlowAction =
  | 'focusInput'
  | 'submitGoal'
  | 'startAnalysis'
  | 'discoverScenes'
  | 'showRecommendations'
  | 'generateOpener'
  | 'regenerateOpener'
  | 'showSafetyReminder'
  | 'requestConfirmation'
  | 'confirmAction'
  | 'retry'
  | 'reset';

export interface AgentFlowPhaseConfig {
  antState: AntGuideState;
  antTarget: AntGuideTarget;
  title: string;
  description: string;
  recommendedDuration: number;
  rightPanelState: AgentRightPanelState;
  safetyCardVisible: boolean;
  confirmCardVisible: boolean;
  nextAllowedActions: AgentFlowAction[];
}

export type AgentFlowCallbacks = {
  onThinking?: () => void;
  onDiscovering?: () => void;
  onResult?: (result: UserFacingAgentResponse) => void;
  onSuccess?: (result: UserFacingAgentResponse) => void;
};
