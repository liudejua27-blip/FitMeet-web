import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { EntityManager, Repository } from 'typeorm';
import {
  CandidateSearchIndex,
  CandidateSearchIndexSourceType,
  CandidateSearchIndexStatus,
} from '../agent-gateway/entities/candidate-search-index.entity';
import dataSource from '../database/data-source';
import { DemandType } from '../demands/demand.entity';
import { UserSocialProfile } from '../users/user-social-profile.entity';
import { User } from '../users/user.entity';

type SeedOptions = {
  batch: string;
  count: number;
  cleanup: boolean;
  help: boolean;
};

type CandidateTemplate = {
  name: string;
  city: string;
  area: string;
  lat: number;
  lng: number;
  gender: 'male' | 'female';
  age: number;
  demandTypes: DemandType[];
  activities: string[];
  interests: string[];
  lifestyleTags: string[];
  scenes: string[];
  goals: string[];
  timeBuckets: string[];
  summary: string;
  safetyNote: string;
};

type SeedSummary = {
  batch: string;
  seedKind: string;
  users: number;
  profiles: number;
  indexRows: number;
};

const DEFAULT_BATCH = 'demand-candidate-v1';
const DEFAULT_COUNT = 20;
const MAX_COUNT = 100;
const EMAIL_DOMAIN = 'ourfitmeet.local';
const SEED_KIND = 'demand_candidate_pool';
const NOW = () => new Date();

const TEMPLATES: CandidateTemplate[] = [
  tpl(
    '青岛',
    '市南区',
    36.0649,
    120.3826,
    'female',
    26,
    [DemandType.Workout],
    ['羽毛球', '健身房综合训练'],
    ['运动', '羽毛球', '规律训练'],
    ['下班后运动'],
    ['同城约练', '公开场所运动'],
    ['找约练搭子'],
    ['工作日晚上', '周末下午'],
    '青岛市南区羽毛球和健身搭子，偏好公共场馆。',
    '先约公共场馆，确认时间后再见面。',
  ),
  tpl(
    '青岛',
    '崂山区',
    36.1073,
    120.4688,
    'male',
    29,
    [DemandType.Workout],
    ['跑步', '健身'],
    ['跑步', '夜跑', '海边路线'],
    ['规律作息'],
    ['同城约练'],
    ['找跑步搭子'],
    ['工作日晚上', '周末上午'],
    '崂山区下班后跑步候选，适合轻松配速。',
    '夜跑建议选择人多路线。',
  ),
  tpl(
    '青岛',
    '黄岛区',
    35.9607,
    120.1782,
    'female',
    25,
    [DemandType.Buddy],
    ['电影', '咖啡'],
    ['电影', '咖啡', '商场'],
    ['周末社交'],
    ['电影搭子', '饭搭子'],
    ['找搭子'],
    ['周末下午', '周末晚上'],
    '黄岛电影和咖啡搭子，适合先站内确认影片。',
    '首次见面选择商场或影院。',
  ),
  tpl(
    '青岛',
    '李沧区',
    36.1602,
    120.4324,
    'male',
    34,
    [DemandType.Service, DemandType.Help],
    ['开锁', '维修', '本地求助'],
    ['开锁', '维修', '家电', '本地资源'],
    ['本地服务'],
    ['服务推荐', '临时求助'],
    ['提供可靠服务线索'],
    ['全天', '紧急'],
    '青岛本地开锁和维修服务候选，可协助确认师傅资质。',
    '上门前核验身份，不提前转账。',
  ),
  tpl(
    '上海',
    '徐汇区',
    31.1836,
    121.4368,
    'female',
    27,
    [DemandType.Workout, DemandType.Buddy],
    ['羽毛球', '普拉提'],
    ['羽毛球', '展览', '咖啡'],
    ['下班后运动'],
    ['同城约练', '展览搭子'],
    ['找运动/展览搭子'],
    ['工作日晚上', '周末下午'],
    '徐汇羽毛球和展览候选，时间多在下班后。',
    '先确认公共场地和时间。',
  ),
  tpl(
    '上海',
    '静安区',
    31.2296,
    121.459,
    'male',
    31,
    [DemandType.Buddy, DemandType.Activity],
    ['电影', '展览', '咖啡'],
    ['电影', '独立展览', '咖啡馆'],
    ['城市生活'],
    ['电影搭子', '展览搭子'],
    ['找周末活动搭子'],
    ['周末下午', '周末晚上'],
    '静安电影展览搭子，适合城市活动推荐。',
    '线下活动先在公开场所见面。',
  ),
  tpl(
    '上海',
    '浦东新区',
    31.2304,
    121.5444,
    'female',
    30,
    [DemandType.Housing, DemandType.Help],
    ['租房', '合租', '看房'],
    ['租房', '通勤', '室友'],
    ['工作稳定'],
    ['找房', '合租'],
    ['找靠谱室友'],
    ['工作日晚上', '周末上午'],
    '浦东租房/合租候选，重视通勤和作息匹配。',
    '看房不要提前私下转账。',
  ),
  tpl(
    '北京',
    '海淀区',
    39.9599,
    116.2981,
    'male',
    24,
    [DemandType.Buddy, DemandType.Workout],
    ['学习搭子', '篮球'],
    ['学习', '篮球', '校园'],
    ['学生友好'],
    ['学习搭子', '同城约练'],
    ['找学习/运动搭子'],
    ['工作日下午', '周末下午'],
    '海淀学习和篮球搭子，适合校园周边。',
    '首次约在校园或公共球场。',
  ),
  tpl(
    '北京',
    '朝阳区',
    39.9219,
    116.4436,
    'female',
    28,
    [DemandType.Activity, DemandType.Buddy],
    ['展览', '咖啡', '城市漫步'],
    ['展览', '摄影', '咖啡'],
    ['周末探索'],
    ['展览搭子', '城市漫步'],
    ['找周末活动搭子'],
    ['周末下午'],
    '朝阳展览和城市漫步候选，偏好轻松节奏。',
    '公开场所见面，提前确认路线。',
  ),
  tpl(
    '北京',
    '通州区',
    39.9025,
    116.6564,
    'male',
    36,
    [DemandType.Service],
    ['搬家', '维修', '摄影'],
    ['搬家', '维修', '本地服务'],
    ['本地资源'],
    ['服务推荐'],
    ['提供服务线索'],
    ['周末上午', '紧急'],
    '通州搬家维修服务候选，可帮助筛选报价。',
    '核验服务方资质，保留平台沟通记录。',
  ),
  tpl(
    '深圳',
    '南山区',
    22.5333,
    113.9304,
    'female',
    29,
    [DemandType.Workout, DemandType.Buddy],
    ['健身', '跑步', '咖啡'],
    ['健身', '跑步', '咖啡'],
    ['科技从业'],
    ['同城约练', '咖啡搭子'],
    ['找运动搭子'],
    ['工作日晚上'],
    '南山健身跑步候选，适合下班后约练。',
    '先确认场馆和强度。',
  ),
  tpl(
    '深圳',
    '福田区',
    22.541,
    114.05,
    'male',
    33,
    [DemandType.Service, DemandType.Activity],
    ['摄影', '课程', '活动'],
    ['摄影', '技能课程', '演出'],
    ['城市活动'],
    ['活动推荐', '服务推荐'],
    ['找活动/服务资源'],
    ['周末下午', '周末晚上'],
    '福田摄影和活动资源候选，适合找课程或演出。',
    '付费服务先确认合同或平台保障。',
  ),
  tpl(
    '杭州',
    '西湖区',
    30.2592,
    120.1303,
    'female',
    27,
    [DemandType.Travel, DemandType.Buddy],
    ['旅行', '摄影', '咖啡'],
    ['旅行', '摄影', '周边游'],
    ['轻旅行'],
    ['找旅伴', '咖啡搭子'],
    ['找周边游旅伴'],
    ['周末上午', '周末下午'],
    '西湖周边游和摄影旅伴候选。',
    '旅行同行建议开启真人认证后再约。',
  ),
  tpl(
    '杭州',
    '滨江区',
    30.2083,
    120.2119,
    'male',
    30,
    [DemandType.Housing, DemandType.Buddy],
    ['租房', '学习', '健身'],
    ['租房', '合租', '健身'],
    ['规律作息'],
    ['找房', '学习搭子'],
    ['找室友/学习搭子'],
    ['工作日晚上'],
    '滨江租房和学习候选，重视作息和通勤。',
    '合租前确认身份和合同。',
  ),
  tpl(
    '成都',
    '锦江区',
    30.657,
    104.083,
    'female',
    28,
    [DemandType.Buddy, DemandType.Activity],
    ['饭搭子', '电影', '展览'],
    ['美食', '电影', '展览'],
    ['轻松社交'],
    ['饭搭子', '电影搭子'],
    ['找城市生活搭子'],
    ['周末下午', '周末晚上'],
    '锦江饭搭子和电影候选，适合周末轻社交。',
    '首次聚餐选公开餐厅。',
  ),
  tpl(
    '成都',
    '高新区',
    30.5558,
    104.0668,
    'male',
    32,
    [DemandType.Workout, DemandType.Service],
    ['健身', '维修', '技能服务'],
    ['健身', '维修', '课程'],
    ['效率型'],
    ['同城约练', '服务推荐'],
    ['找健身或服务资源'],
    ['工作日晚上', '周末上午'],
    '高新区健身和技能服务候选。',
    '服务先确认价格和边界。',
  ),
  tpl(
    '广州',
    '天河区',
    23.1291,
    113.3612,
    'female',
    26,
    [DemandType.Activity, DemandType.Buddy],
    ['演出', '咖啡', '城市漫步'],
    ['演出', '咖啡', '摄影'],
    ['城市活动'],
    ['活动搭子'],
    ['找周末活动搭子'],
    ['周末晚上'],
    '天河演出咖啡搭子，适合活动推荐。',
    '夜间活动注意返程安全。',
  ),
  tpl(
    '南京',
    '玄武区',
    32.0603,
    118.7972,
    'male',
    35,
    [DemandType.Help, DemandType.Service],
    ['临时帮忙', '维修', '本地信息'],
    ['本地资源', '维修', '求助'],
    ['社区友好'],
    ['本地求助'],
    ['提供本地帮助'],
    ['全天', '紧急'],
    '南京本地求助候选，可提供维修和信息线索。',
    '涉及上门服务先核验身份。',
  ),
  tpl(
    '武汉',
    '武昌区',
    30.5542,
    114.3159,
    'female',
    23,
    [DemandType.Buddy, DemandType.Workout],
    ['学习搭子', '跑步', '咖啡'],
    ['学习', '跑步', '咖啡'],
    ['学生友好'],
    ['学习搭子', '同城约练'],
    ['找学习监督搭子'],
    ['工作日晚上', '周末上午'],
    '武昌学习跑步候选，适合互相监督。',
    '先在线确认节奏和目标。',
  ),
  tpl(
    '西安',
    '雁塔区',
    34.2134,
    108.948,
    'male',
    29,
    [DemandType.Travel, DemandType.Activity],
    ['旅行', '展览', '摄影'],
    ['旅行', '历史', '摄影'],
    ['文化探索'],
    ['找旅伴', '展览搭子'],
    ['找短途出行搭子'],
    ['周末上午', '周末下午'],
    '雁塔旅行和展览候选，适合短途同行。',
    '出行前确认身份、行程和费用分摊。',
  ),
];

function tpl(
  city: string,
  area: string,
  lat: number,
  lng: number,
  gender: 'male' | 'female',
  age: number,
  demandTypes: DemandType[],
  activities: string[],
  interests: string[],
  lifestyleTags: string[],
  scenes: string[],
  goals: string[],
  timeBuckets: string[],
  summary: string,
  safetyNote: string,
): CandidateTemplate {
  return {
    name: `${city}${area}${activities[0]}候选`,
    city,
    area,
    lat,
    lng,
    gender,
    age,
    demandTypes,
    activities,
    interests,
    lifestyleTags,
    scenes,
    goals,
    timeBuckets,
    summary,
    safetyNote,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  assertSeedTarget();

  const seedKey = sanitizeSeedKey(options.batch);
  await dataSource.initialize();
  try {
    if (options.cleanup) {
      const summary = await dataSource.transaction((manager) =>
        cleanupSeedData(manager, seedKey),
      );
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    const passwordHash = await bcrypt.hash(randomUUID(), 10);
    const summary = await dataSource.transaction((manager) =>
      seedDemandCandidates(manager, options.count, seedKey, passwordHash),
    );
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await dataSource.destroy();
  }
}

async function seedDemandCandidates(
  manager: EntityManager,
  count: number,
  seedKey: string,
  passwordHash: string,
): Promise<SeedSummary> {
  const boundedCount = Math.min(Math.max(1, count), MAX_COUNT);
  const users = manager.getRepository(User);
  const profiles = manager.getRepository(UserSocialProfile);
  const searchIndex = manager.getRepository(CandidateSearchIndex);
  const summary: SeedSummary = {
    batch: seedKey,
    seedKind: SEED_KIND,
    users: 0,
    profiles: 0,
    indexRows: 0,
  };

  for (let index = 1; index <= boundedCount; index += 1) {
    const template = TEMPLATES[(index - 1) % TEMPLATES.length];
    const serial = String(index).padStart(2, '0');
    const email = `fitmeet.demand+${seedKey}-${serial}@${EMAIL_DOMAIN}`;
    const displayName = `${template.name} ${serial}`;
    const user = await upsertUser(users, {
      email,
      passwordHash,
      displayName,
      template,
      index,
    });
    summary.users += 1;

    const profile = await upsertProfile(profiles, {
      userId: user.id,
      displayName,
      template,
      seedKey,
      index,
    });
    summary.profiles += 1;

    await upsertSearchIndex(
      searchIndex,
      buildProfileIndex(profile, user, template, seedKey, index),
    );
    summary.indexRows += 1;
  }

  return summary;
}

async function upsertUser(
  users: Repository<User>,
  input: {
    email: string;
    passwordHash: string;
    displayName: string;
    template: CandidateTemplate;
    index: number;
  },
): Promise<User> {
  const existing = await users.findOne({ where: { email: input.email } });
  const entity = existing ?? users.create({ email: input.email });
  entity.password = input.passwordHash;
  entity.name = input.displayName;
  entity.avatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(input.displayName)}`;
  entity.color = colorFor(input.index);
  entity.gender = input.template.gender;
  entity.age = input.template.age;
  entity.dateOfBirth = null;
  entity.city = input.template.city;
  entity.lat = input.template.lat;
  entity.lng = input.template.lng;
  entity.locationUpdatedAt = NOW();
  entity.acceptNearbyMatch = true;
  entity.gym = input.template.area;
  entity.bio = input.template.summary;
  entity.coverUrl = null;
  entity.singleCert = true;
  entity.verified = true;
  entity.interestTags = uniqueStrings([
    ...input.template.activities,
    ...input.template.interests,
    ...input.template.lifestyleTags,
  ]);
  entity.trainingDays = 30 + input.index;
  entity.trainingCount = 6 + input.index;
  entity.caloriesBurned = 1000 + input.index * 80;
  entity.bestRecords = [];
  entity.trustScore = 70 + (input.index % 20);
  entity.socialTrustCount = 2 + (input.index % 5);
  entity.onboardingCompletedAt = NOW();
  entity.onboardingVersion = 1;
  return users.save(entity);
}

async function upsertProfile(
  profiles: Repository<UserSocialProfile>,
  input: {
    userId: number;
    displayName: string;
    template: CandidateTemplate;
    seedKey: string;
    index: number;
  },
): Promise<UserSocialProfile> {
  const existing = await profiles.findOne({ where: { userId: input.userId } });
  const entity = existing ?? profiles.create({ userId: input.userId });
  entity.profileVersion = (entity.profileVersion ?? 0) + 1;
  entity.gender = input.template.gender;
  entity.nickname = input.displayName;
  entity.primaryPurpose = input.template.demandTypes[0];
  entity.defaultMatchRadiusKm = 12;
  entity.ageRange = ageRangeFor(input.template.age);
  entity.city = input.template.city;
  entity.locale = 'zh-CN';
  entity.countryCode = 'CN';
  entity.timeZone = 'Asia/Shanghai';
  entity.utcOffsetMinutes = 480;
  entity.geoHash = '';
  entity.zodiac = '';
  entity.mbti = '';
  entity.traits = uniqueStrings([
    '守时',
    '边界清晰',
    ...input.template.lifestyleTags,
  ]);
  entity.socialStyle = '先站内确认，再线下见面';
  entity.communicationStyle = '直接、尊重边界';
  entity.nearbyArea = input.template.area;
  entity.fitnessGoals = uniqueStrings(input.template.activities);
  entity.interestTags = uniqueStrings(input.template.interests);
  entity.lifestyleTags = uniqueStrings(input.template.lifestyleTags);
  entity.socialScenes = uniqueStrings(input.template.scenes);
  entity.wantToMeet = uniqueStrings(input.template.goals);
  entity.preferredTraits = ['守时', '尊重边界', '公开场所优先'];
  entity.avoidTraits = ['临时爽约', '索要隐私联系方式'];
  entity.relationshipGoals = uniqueStrings([
    ...input.template.goals,
    ...input.template.demandTypes,
  ]);
  entity.openness = 'high';
  entity.availableTimes = uniqueStrings(input.template.timeBuckets);
  entity.weekdayAvailability =
    input.template.timeBuckets.find((item) => item.includes('工作日')) ?? '';
  entity.weekendAvailability =
    input.template.timeBuckets.find((item) => item.includes('周末')) ?? '';
  entity.socialPreference = input.template.summary;
  entity.rejectRules = input.template.safetyNote;
  entity.privacyBoundary = '只在站内沟通，对方接受邀请前不交换联系方式。';
  entity.candidateDisplayMode = 'coarse_profile';
  entity.candidateAvatarVisibility = 'public';
  entity.candidateCoarseArea = `${input.template.city}${input.template.area}`;
  entity.contactDisclosurePolicy = 'in_app_after_match';
  entity.preciseLocationPolicy = 'coarse_only';
  entity.strangerOpenerPolicy = 'opener_requires_confirmation';
  entity.strangerInvitePolicy = 'invite_requires_confirmation';
  entity.strangerFriendPolicy = 'friend_requires_confirmation';
  entity.profileDiscoverable = true;
  entity.agentCanRecommendMe = true;
  entity.agentCanStartChatAfterApproval = false;
  entity.hideSensitiveTags = true;
  entity.aiSummary = input.template.summary;
  entity.aiProfileCard = {
    seedKind: SEED_KIND,
    seedBatch: input.seedKey,
    seedIndex: input.index,
    demandTypes: input.template.demandTypes,
    activities: input.template.activities,
    city: input.template.city,
    area: input.template.area,
  };
  entity.matchSignals = {
    seedKind: SEED_KIND,
    seedBatch: input.seedKey,
    seedIndex: input.index,
    demandTypes: input.template.demandTypes,
    activities: input.template.activities,
    interests: input.template.interests,
    city: input.template.city,
    area: input.template.area,
    timeBuckets: input.template.timeBuckets,
  };
  entity.sensitiveTagDecisions = {};
  return profiles.save(entity);
}

function buildProfileIndex(
  profile: UserSocialProfile,
  user: User,
  template: CandidateTemplate,
  seedKey: string,
  index: number,
): Partial<CandidateSearchIndex> &
  Pick<CandidateSearchIndex, 'sourceType' | 'sourceId'> {
  const now = NOW();
  return {
    sourceType: CandidateSearchIndexSourceType.Profile,
    sourceId: String(profile.userId),
    sourceVersion: String(profile.profileVersion ?? 0),
    userId: profile.userId,
    publicIntentId: null,
    linkedSocialRequestId: null,
    isRealUser: true,
    profileDiscoverable: true,
    agentCanRecommendMe: true,
    agentCanStartChatAfterApproval: false,
    status: CandidateSearchIndexStatus.Active,
    displayName: profile.nickname,
    city: profile.city,
    locale: profile.locale,
    countryCode: profile.countryCode,
    timeZone: profile.timeZone,
    utcOffsetMinutes: profile.utcOffsetMinutes,
    geoHash: profile.geoHash,
    areaText: profile.nearbyArea,
    lat: user.lat,
    lng: user.lng,
    radiusKm: profile.defaultMatchRadiusKm,
    activityTypes: uniqueStrings([
      ...template.demandTypes,
      ...template.activities,
      ...template.scenes,
    ]),
    interestTags: uniqueStrings([
      ...template.interests,
      ...template.activities,
      ...template.goals,
    ]),
    lifestyleTags: uniqueStrings([
      ...template.lifestyleTags,
      ...profile.traits,
    ]),
    socialScenes: uniqueStrings(template.scenes),
    relationshipGoals: uniqueStrings([
      ...template.goals,
      ...template.demandTypes,
    ]),
    timeBuckets: uniqueStrings(template.timeBuckets),
    publicSummary: profile.aiSummary,
    publicSafetyNotes: [template.safetyNote, profile.privacyBoundary],
    safetyFlags: {
      seedKind: SEED_KIND,
      seedBatch: seedKey,
      seedIndex: index,
      verified: true,
      hasProfilePhoto: true,
    },
    trustScore: user.trustScore,
    profileCompleteness: 96,
    lastActiveAt: now,
    sourceUpdatedAt: now,
  };
}

async function upsertSearchIndex(
  searchIndex: Repository<CandidateSearchIndex>,
  projection: Partial<CandidateSearchIndex> &
    Pick<CandidateSearchIndex, 'sourceType' | 'sourceId'>,
): Promise<CandidateSearchIndex> {
  const existing = await searchIndex.findOne({
    where: {
      sourceType: projection.sourceType,
      sourceId: projection.sourceId,
    },
  });
  return searchIndex.save(
    Object.assign(existing ?? searchIndex.create(), projection),
  );
}

async function cleanupSeedData(
  manager: EntityManager,
  seedKey: string,
): Promise<SeedSummary> {
  const userIds = await loadSeedUserIds(manager, seedKey);
  await manager.query(
    `DELETE FROM "candidate_search_index"
     WHERE "userId" = ANY($1::int[])
        OR ("safetyFlags" ->> 'seedKind' = $2 AND "safetyFlags" ->> 'seedBatch' = $3)`,
    [userIds, SEED_KIND, seedKey],
  );
  await manager.query(
    `DELETE FROM "user_social_profiles" WHERE "userId" = ANY($1::int[])`,
    [userIds],
  );
  await manager.query(`DELETE FROM "users" WHERE id = ANY($1::int[])`, [
    userIds,
  ]);
  return {
    batch: seedKey,
    seedKind: SEED_KIND,
    users: userIds.length,
    profiles: userIds.length,
    indexRows: userIds.length,
  };
}

async function loadSeedUserIds(
  manager: EntityManager,
  seedKey: string,
): Promise<number[]> {
  const rows: Array<{ id: number | string }> = await manager.query(
    `SELECT id FROM "users" WHERE email LIKE $1 ORDER BY id ASC`,
    [`fitmeet.demand+${seedKey}-%@${EMAIL_DOMAIN}`],
  );
  return rows.map((row) => Number(row.id)).filter(Number.isFinite);
}

function colorFor(index: number) {
  const colors = [
    '#4F46E5',
    '#0EA5E9',
    '#10B981',
    '#F97316',
    '#EC4899',
    '#8B5CF6',
  ];
  return colors[index % colors.length];
}

function ageRangeFor(age: number): string {
  if (age <= 24) return '18-24';
  if (age <= 34) return '25-34';
  if (age <= 44) return '35-44';
  return '45+';
}

function uniqueStrings(values: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const text = value.trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

function parseArgs(args: string[]): SeedOptions {
  const options: SeedOptions = {
    batch: DEFAULT_BATCH,
    count: DEFAULT_COUNT,
    cleanup: false,
    help: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--cleanup') options.cleanup = true;
    else if (arg === '--batch')
      options.batch = args[(index += 1)] ?? options.batch;
    else if (arg.startsWith('--batch='))
      options.batch = arg.slice('--batch='.length);
    else if (arg === '--count') options.count = parseCount(args[(index += 1)]);
    else if (arg.startsWith('--count='))
      options.count = parseCount(arg.slice('--count='.length));
  }
  options.count = Math.min(Math.max(1, options.count), MAX_COUNT);
  options.batch = sanitizeSeedKey(options.batch);
  return options;
}

function parseCount(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return DEFAULT_COUNT;
  return parsed;
}

function sanitizeSeedKey(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || DEFAULT_BATCH
  );
}

function assertSeedTarget(): void {
  const seedTarget = `${process.env.FITMEET_SEED_TARGET ?? ''}`
    .trim()
    .toLowerCase();
  if (seedTarget !== 'staging' && seedTarget !== 'development') {
    throw new Error(
      'Refusing to seed demand candidates unless FITMEET_SEED_TARGET=staging or FITMEET_SEED_TARGET=development.',
    );
  }
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.FITMEET_ENV === 'production'
  ) {
    throw new Error('Refusing to seed demand candidates in production.');
  }
}

function printHelp(): void {
  console.log(`Seed demand candidates for FitMeet Demand matching QA.

Usage:
  pnpm run seed:demand-candidates -- --count 20 --batch demand-v1-local
  pnpm run seed:demand-candidates -- --cleanup --batch demand-v1-local

Options:
  --count <n>     Number of candidates to upsert, default ${DEFAULT_COUNT}, max ${MAX_COUNT}
  --batch <name>  Stable cleanup/upsert key, default ${DEFAULT_BATCH}
  --cleanup       Delete rows created for the batch

Environment:
  FITMEET_SEED_TARGET must be staging or development
`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[seed-demand-candidates] ${message}`);
  process.exitCode = 1;
});
