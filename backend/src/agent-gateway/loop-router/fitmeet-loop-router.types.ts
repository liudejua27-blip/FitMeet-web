export type FitMeetLoopIntent =
  | 'workout'
  | 'friend'
  | 'travel'
  | 'profile'
  | 'casual';

export type FitMeetLoopRouterResult = {
  intent: FitMeetLoopIntent;
  confidence: number;
  reason: string;
};
