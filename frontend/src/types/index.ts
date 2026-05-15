/** 动态/帖子 */
export interface Post {
  id: number;
  userId?: number;
  title?: string;
  type: string;
  sport: string;
  dist: string;
  distanceMeters?: number;
  username: string;
  gender: string;
  age: number;
  city: string;
  loc?: string;
  address?: string;
  poiId?: string | null;
  lat?: number | null;
  lng?: number | null;
  color: string;
  colorBg: string;
  emoji: string;
  text: string;
  tags: string[];
  likes: number;
  comments: number;
  viewCount: number;
  slots: string | null;
  cert: boolean;
  saved?: boolean;
  liked?: boolean;
  images?: { url: string; width: number; height: number }[];
  videoUrl?: string;
  level?: string;
  sourceId?: number;
  createdAt?: string;
  mock?: boolean;
}

/** 约练活动 */
export interface Meet {
  id: number;
  userId?: number;
  clubId?: number | null;
  clubName?: string;
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
  creatorType?: 'find-coach' | 'coach-mode' | 'peer';
  startAt?: string;
  autoCancelAt?: string;
  cancelReason?: string | null;
  createdAt?: string;
  mock?: boolean;
}

/** 圈子 / 俱乐部 */
export interface Club {
  id: number;
  name: string;
  city: string;
  sportType: string;
  description: string;
  coverUrl: string;
  joinPolicy: 'open' | 'approval';
  announcement: string;
  memberCount: number;
  meetCount: number;
  ownerId: number;
  ownerName: string;
  myStatus?: 'pending' | 'active' | 'rejected';
  myRole?: 'owner' | 'manager' | 'member';
  pendingCount?: number;
  members?: ClubMember[];
  createdAt?: string;
  updatedAt?: string;
}

/** 圈子成员 */
export interface ClubMember {
  id: number;
  clubId: number;
  userId: number;
  role: 'owner' | 'manager' | 'member';
  status: 'pending' | 'active' | 'rejected';
  name: string;
  avatar: string;
  color: string;
  createdAt?: string;
}

/** 教练 */
export interface Coach {
  id: number;
  userId?: number;
  name: string;
  cover: string;
  coverBg: string;
  color: string;
  specialty: string;
  experience: string;
  tags: string[];
  specialtyCode: string;
  rating: number;
  reviews: number;
  students: number;
  sessions: number;
  price: number;
  unit: string;
  cert: boolean;
  desc: string;
  followers: number;
  works: string[];
  reviewList?: Review[];
  income?: number;
}

/** 分类 */
export interface Category {
  id: string;
  label: string;
}

/** 好友 */
export interface Friend {
  id: number;
  name: string;
  avatar: string;
  color: string;
  status: 'online' | 'offline';
}

/** 评价 */
export interface Review {
  id: number;
  username: string;
  avatar: string;
  color: string;
  rating: number;
  text: string;
  date: string;
  tags?: string[];
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
  // 健身档案
  trainingDays: number;
  trainingCount: number;
  caloriesBurned: number;
  bestRecords: { name: string; value: string }[];
  // 教练资料 (可选)
  isCoach: boolean;
  coachSpecialty?: string;
  coachExperience?: string;
  coachPrice?: number;
  coachRating?: number;
  coachStudents?: number;
  coachCerts?: string[];
  coachIncome?: number;
  // 统计
  followers: number;
  following: number;
  posts: number;
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

/** 评论 */
export interface Comment {
  id: number;
  username: string;
  avatar: string;
  color: string;
  text: string;
  time: string;
  likes: number;
}

export interface AiDelegateProfile {
  id?: number;
  userId: number;
  enabled: boolean;
  privacyConsent: boolean;
  autoChatEnabled: boolean;
  dailyAutoChatLimit: number;
  preferredName: string;
  city: string;
  favoriteSports: string[];
  interests: string;
  workExperience: string;
  idealPartner: string;
  trainingGoals: string;
  boundaries: string;
  availability: string;
}

export interface AiMatchCandidate {
  userId: number;
  name: string;
  avatar: string;
  color: string;
  city: string;
  favoriteSports: string[];
  idealPartner: string;
  trainingGoals: string;
  availability: string;
  score: number;
  reasons: string[];
  sharedSports: string[];
  autoChatEnabled?: boolean;
  autopilotStatus?: 'idle' | 'contacted';
  autopilotConversationId?: string | null;
  contactCardSent?: boolean;
  contactedAt?: string | null;
}

export interface AiMatchSession {
  id: number;
  targetUserId: number;
  targetName: string;
  score: number;
  status: 'review' | 'approved' | 'rejected';
  summary: string;
  reasons: string[];
  transcript: Array<{ speaker: string; text: string }>;
  canApproveFriend: boolean;
  requiresUserConfirmation: boolean;
}

export interface AiAutopilotHistoryItem {
  id: number;
  targetUserId: number;
  targetName: string;
  targetAvatar: string;
  targetColor: string;
  score: number;
  status: 'review' | 'approved' | 'rejected';
  conversationId: string | null;
  contactCardSent: boolean;
  contactedAt: string;
  summary: string;
  reasons: string[];
}

export interface AiAutopilotRunResult {
  limit: number;
  usedToday: number;
  remaining: number;
  contacted: AiAutopilotHistoryItem[];
  skipped: string[];
}

export type SocialRequestRiskLevel = 'low' | 'medium' | 'high';
export type SocialRequestStatus = 'searching' | 'matched' | 'closed' | 'cancelled';

export interface SocialRequest {
  id: number;
  userId: number;
  agentConnectionId: number | null;
  requestType: string;
  title: string;
  description: string;
  city: string;
  loc: string;
  lat: number | null;
  lng: number | null;
  radiusKm: number;
  timePreference: string;
  visibility: string;
  riskLevel: SocialRequestRiskLevel;
  requiresUserConfirmation: boolean;
  filters: Record<string, unknown>;
  candidateUserIds: number[];
  matchedCount: number;
  status: SocialRequestStatus;
  createdAt: string;
  updatedAt: string;
}

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
    source?: string;
    mode: 'public';
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
    filters: Record<string, unknown>;
    candidateUserIds: number[];
    matchedCount: number;
    status: SocialRequestStatus;
    createdAt: string;
    updatedAt: string;
  }
