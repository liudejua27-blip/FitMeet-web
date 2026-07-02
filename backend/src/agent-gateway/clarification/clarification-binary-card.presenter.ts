import type { FitMeetAlphaCard } from '../fitmeet-alpha-agent.types';

export type ClarificationBinaryCardData = {
  questionKey: string;
  questionText: string;
  inferredIntent?: 'workout' | 'friend' | 'travel' | 'profile';
  inferredSlots?: Record<string, unknown>;
  yesPatch?: Record<string, unknown>;
  noFallback?:
    | 'workout_intake'
    | 'friend_intake'
    | 'travel_intake'
    | 'casual_chat';
  confidence?: number;
};

export function buildClarificationBinaryCard(input: {
  taskId: number;
  questionKey: string;
  title?: string;
  body: string;
  inferredIntent?: 'workout' | 'friend' | 'travel' | 'profile';
  inferredSlots?: Record<string, unknown>;
  yesPatch?: Record<string, unknown>;
  noFallback?:
    | 'workout_intake'
    | 'friend_intake'
    | 'travel_intake'
    | 'casual_chat';
  confidence?: number;
}): FitMeetAlphaCard {
  return {
    id: `clarification:${input.questionKey}:${input.taskId}`,
    type: 'clarification_binary',
    schemaVersion: 'fitmeet.tool-ui.v1',
    schemaType: 'clarification.binary',
    title: input.title ?? '确认一下',
    body: input.body,
    status: 'waiting_confirmation',
    data: {
      schemaName: 'ClarificationBinaryCard',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'clarification.binary',
      taskId: input.taskId,
      questionKey: input.questionKey,
      questionText: input.body,
      inferredIntent: input.inferredIntent,
      inferredSlots: input.inferredSlots ?? {},
      yesPatch: input.yesPatch ?? {},
      noFallback: input.noFallback ?? null,
      confidence: input.confidence ?? null,
    },
    actions: [
      {
        id: 'yes',
        label: '是',
        action: 'clarification.yes',
        schemaAction: 'clarification.yes',
        requiresConfirmation: false,
        payload: {
          taskId: input.taskId,
          questionKey: input.questionKey,
          yesPatch: input.yesPatch ?? {},
        },
      },
      {
        id: 'no',
        label: '否',
        action: 'clarification.no',
        schemaAction: 'clarification.no',
        requiresConfirmation: false,
        payload: {
          taskId: input.taskId,
          questionKey: input.questionKey,
          noFallback: input.noFallback ?? null,
        },
      },
    ],
  };
}
