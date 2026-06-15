/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, type ReactNode } from 'react';

import type { ToolUISchemaAction } from './tool-ui-schema';

export type FitMeetToolActionInput = {
  messageId?: string;
  stepId?: string;
  taskId?: number | string | null;
  cardId?: string | null;
  action?: string | null;
  checkpointAction?: 'resume' | 'retry' | 'replay' | 'fork' | null;
  checkpointEndpoint?: string | null;
  checkpointMethod?: string | null;
  idempotencyKey?: string | null;
  schemaAction?: ToolUISchemaAction | null;
  payload?: Record<string, unknown>;
  approvalId?: number | string | null;
  checkpointId?: number | string | null;
};

export type FitMeetToolUIActions = {
  onApproveApproval?: (input: FitMeetToolActionInput) => Promise<void> | void;
  onRejectApproval?: (input: FitMeetToolActionInput) => Promise<void> | void;
  onResumeState?: (input: FitMeetToolActionInput) => Promise<void> | void;
  onRetryTool?: (input: FitMeetToolActionInput) => Promise<void> | void;
  onReplayState?: (input: FitMeetToolActionInput) => Promise<void> | void;
  onForkState?: (input: FitMeetToolActionInput) => Promise<void> | void;
  onCardAction?: (input: FitMeetToolActionInput) => Promise<void> | void;
};

const FitMeetToolUIActionsContext = createContext<FitMeetToolUIActions>({});

export function FitMeetToolUIActionsProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: FitMeetToolUIActions;
}) {
  return (
    <FitMeetToolUIActionsContext.Provider value={value}>
      {children}
    </FitMeetToolUIActionsContext.Provider>
  );
}

export function useFitMeetToolUIActions() {
  return useContext(FitMeetToolUIActionsContext);
}
