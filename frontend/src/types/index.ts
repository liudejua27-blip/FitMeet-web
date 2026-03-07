/** 动态/帖子 */
export interface Post {
  id: number;
  userId?: number;
  title?: string;
  type: string;
  sport: string;
  dist: string;
  username: string;
  gender: string;
  age: number;
  city: string;
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
  images?: { url: string; width: number; height: number; }[];
  videoUrl?: string;
  level?: string;
}

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
  dist: string;
  price: string;
  slots: number;
  maxSlots: number;
  level: string;
  desc: string;
  participants: string[];
  cert: boolean;
  rating: number;
  meetCount: number;
  feeType?: 'free' | 'aa' | 'paid';
  groupType?: '1v1' | 'small' | 'group';
  creatorType?: 'find-coach' | 'coach-mode';
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

/** 虚拟礼物 */
export interface VirtualGift {
  id: string;
  name: string;
  emoji: string;
  price: number;
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
