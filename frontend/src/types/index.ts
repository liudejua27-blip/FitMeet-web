/** 约练活动 */
export interface Meet {
  id: number;
  userId?: number;
  title: string;
  type: string;
  sport: string;
  username: string;
  color: string;
  colorBg: string;
  time: string;
  loc: string;
  city?: string;
  address?: string;
  poiId?: string | null;
  lat?: number | null;
  lng?: number | null;
  dist: string;
  distanceMeters?: number;
  price: string;
  slots: number;
  maxSlots: number;
  level: string;
  desc: string;
  status?:
    | 'pending'
    | 'active'
    | 'matched'
    | 'activity_created'
    | 'completed'
    | 'cancelled';
  activityId?: number | null;
  participants: string[];
  participantDetails?: Array<{
    participantId: number;
    userId: number;
    name: string;
    avatar: string;
    color: string;
    status: 'pending' | 'active' | 'completed' | 'cancelled';
  }>;
  cert: boolean;
  rating: number;
  meetCount: number;
  feeType?: 'free';
  groupType?: '1v1' | 'small' | 'group';
  creatorType?: string;
  startAt?: string;
  autoCancelAt?: string;
  cancelReason?: string | null;
  createdAt?: string;
}

/** 好友 */
export interface Friend {
  id: number;
  name: string;
  avatar: string;
  color: string;
  status: 'online' | 'offline';
}

/** 用户资料 */
export interface UserProfile {
  id: number;
  name: string;
  avatar: string;
  color: string;
  gender: string;
  age: number;
  city: string;
  gym: string;
  bio: string;
  coverUrl?: string;
  singleCert: boolean;
  verified?: boolean;
  interestTags: string[];
  trainingDays: number;
  trainingCount: number;
  caloriesBurned: number;
  bestRecords: { name: string; value: string }[];
  meetCount?: number;
  followers: number;
  following: number;
}

/** 约练记录 */
export interface MeetRecord {
  id: number;
  title: string;
  sport: string;
  time: string;
  status: 'pending' | 'active' | 'completed' | 'cancelled';
  partner: string;
  loc: string;
}

export type SocialRequestRiskLevel = 'low' | 'medium' | 'high';
export type SocialRequestStatus =
  | 'active'
  | 'searching'
  | 'matched'
  | 'inactive'
  | 'completed'
  | 'closed'
  | 'cancelled';

export interface SocialCandidate {
  profile: {
    id: number;
    name: string;
    avatar: string;
    color: string;
    age: number;
    city: string;
    bio: string;
    verified: boolean;
    interestTags: string[];
  };
  score: number;
  reasonTags: string[];
  reasonText: string;
  nextAction: 'draft_invitation';
  suggestedMessage?: string;
  candidateRecordId?: number;
}

export interface PublicSocialIntent {
  id: string;
  userId?: number | null;
  linkedSocialRequestId?: number | null;
  mode: string;
  requestType: string;
  title: string;
  description: string;
  interestTags?: string[];
  city: string;
  loc: string;
  locationPreference?: string;
  socialGoal?: string;
  lat: number | null;
  lng: number | null;
  radiusKm: number;
  timePreference: string;
  riskLevel: SocialRequestRiskLevel;
  requiresUserConfirmation: boolean;
  matchedCount: number;
  matchSignal?: {
    score: number;
    confidence?: 'low' | 'medium' | 'high' | string;
    updatedAt?: string;
  };
  status: SocialRequestStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PublicSocialCandidate {
  profile: {
    id: number;
    name: string;
    avatar?: string;
    color?: string;
    age?: number;
    city?: string;
    bio?: string;
    verified?: boolean;
    interestTags?: string[];
    distanceKm?: number | null;
  };
  score: number;
  reasonTags: string[];
  reasonText: string;
  nextAction: 'draft_invitation' | string;
}

export interface PublicSocialIntentMatches {
  request: PublicSocialIntent;
  candidates: PublicSocialCandidate[];
  matchedBy: string;
}
