import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 用户社交画像（用于 AI 社交助手 / 候选人匹配）。
 *
 * 单表、与 `users` 一一对应（`userId` 作为主键 + 外键），保持登录/用户表完全独立，
 * 不影响现有功能。所有字段均带默认值；从未保存过画像的用户读取时返回空对象。
 */
@Entity('user_social_profiles')
export class UserSocialProfile {
  @PrimaryColumn()
  userId: number;

  /** 性别（自报，可为空） */
  @Column({ default: '' })
  gender: string;

  /** AI 画像展示昵称 */
  @Column({ default: '' })
  nickname: string;

  /** 年龄段，例如 '18-24' / '25-34' */
  @Column({ default: '' })
  ageRange: string;

  /** 常驻城市 */
  @Column({ default: '' })
  city: string;

  /** 星座（自报或 AI 根据生日/描述推断，可为空） */
  @Column({ default: '' })
  zodiac: string;

  /** MBTI（自报或 AI 推断，可为空） */
  @Column({ default: '' })
  mbti: string;

  /** 性格标签，例如 ['外向', '目标感强'] */
  @Column('simple-array', { default: '' })
  traits: string[];

  /** 社交风格，例如 '主动型' / '慢热型' */
  @Column({ default: '' })
  socialStyle: string;

  /** 沟通风格，例如 '直接、高效、偏理性' */
  @Column({ default: '' })
  communicationStyle: string;

  /** 常活动的区/商圈，例如 '朝阳-三里屯' */
  @Column({ default: '' })
  nearbyArea: string;

  /** 健身目标，例如 ['减脂', '增肌'] */
  @Column('simple-array', { default: '' })
  fitnessGoals: string[];

  /** 兴趣标签 */
  @Column('simple-array', { default: '' })
  interestTags: string[];

  /** 生活方式标签，例如 ['科技', '创业', '摄影'] */
  @Column('simple-array', { default: '' })
  lifestyleTags: string[];

  /** 适合出现的社交场景，例如 ['同城约练', '创业社交'] */
  @Column('simple-array', { default: '' })
  socialScenes: string[];

  /** 希望认识的人，例如 ['健身搭子', 'AI 创业伙伴'] */
  @Column('simple-array', { default: '' })
  wantToMeet: string[];

  /** 偏好的对方特质 */
  @Column('simple-array', { default: '' })
  preferredTraits: string[];

  /** 需要避开的特质或行为 */
  @Column('simple-array', { default: '' })
  avoidTraits: string[];

  /** 关系目标，例如 ['交朋友', '找搭子', '拓展人脉'] */
  @Column('simple-array', { default: '' })
  relationshipGoals: string[];

  /** 开放度，例如 low / medium / high */
  @Column({ default: '' })
  openness: string;

  /** 可约时间段，例如 ['工作日晚上', '周末下午'] */
  @Column('simple-array', { default: '' })
  availableTimes: string[];

  /** 工作日可用时间 */
  @Column({ default: '' })
  weekdayAvailability: string;

  /** 周末可用时间 */
  @Column({ default: '' })
  weekendAvailability: string;

  /** 社交偏好（自由文本），例如 '安静、慢热、尊重边界' */
  @Column({ default: '' })
  socialPreference: string;

  /** 拒绝规则（自由文本），例如 '不接受夜间私人场所约见' */
  @Column({ default: '' })
  rejectRules: string;

  /** 隐私边界（自由文本），例如 '不公开手机号 / 工作单位' */
  @Column({ default: '' })
  privacyBoundary: string;

  /** 是否进入资料发现池 */
  @Column({ default: false })
  profileDiscoverable: boolean;

  /** 是否允许代理把我推荐给别人 */
  @Column({ default: false })
  agentCanRecommendMe: boolean;

  /** 是否允许代理在我确认后发起聊天 */
  @Column({ default: false })
  agentCanStartChatAfterApproval: boolean;

  /** 是否隐藏敏感标签，只在私密匹配逻辑中保留 */
  @Column({ default: true })
  hideSensitiveTags: boolean;

  /** AI 生成的人物卡摘要 */
  @Column({ type: 'text', default: '' })
  aiSummary: string;

  /** DeepSeek / fallback 生成的完整结构化人物卡 */
  @Column({ type: 'jsonb', default: {} })
  aiProfileCard: Record<string, unknown>;

  /** Structured matching signals. Sensitive tags are private-only. */
  @Column({ type: 'jsonb', default: {} })
  matchSignals: Record<string, unknown>;

  /**
   * Per-user decisions on sensitive private tags (wealth / income / looks /
   * status / relationship / contact / precise location / identity-bearing
   * info). Shape:
   *   { [tag]: { status, category, decidedAt } }
   *   status in { 'pending', 'confirmed', 'rejected', 'hidden' }
   * Only tags whose status is 'confirmed' may participate in matching.
   */
  @Column({ type: 'jsonb', default: {} })
  sensitiveTagDecisions: Record<
    string,
    { status: string; category?: string; decidedAt?: string }
  >;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
