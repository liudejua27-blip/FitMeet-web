export type FitMeetLoopIntent =
  | 'workout'
  | 'friend'
  | 'travel'
  | 'profile'
  | 'casual';

export type FitMeetLoopDisposition =
  | 'accept_loop'
  | 'needs_arbitration'
  | 'handoff_legacy';

export type FitMeetLoopRouterResult = {
  intent: FitMeetLoopIntent;
  candidateIntent?: FitMeetLoopIntent;
  confidence: number;
  reason: string;
  disposition: FitMeetLoopDisposition;
};
