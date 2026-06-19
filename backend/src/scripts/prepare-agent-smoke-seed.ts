import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import dataSource from '../database/data-source';
import {
  AgentConnection,
  AgentPermissionLevel,
  ConnectionStatus,
  KnownAgent,
} from '../agent-gateway/entities/agent-connection.entity';
import { LifeGraphField } from '../life-graph/entities/life-graph-field.entity';
import { LifeGraphProfile } from '../life-graph/entities/life-graph-profile.entity';
import {
  LifeGraphFieldCategory,
  LifeGraphFieldSource,
  LifeGraphSignalType,
} from '../life-graph/life-graph.enums';
import { User } from '../users/user.entity';
import { UserSocialProfile } from '../users/user-social-profile.entity';

const DRY_RUN =
  process.argv.includes('--dry-run') ||
  process.env.AGENT_SMOKE_SEED_DRY_RUN === 'true';
const ALLOW_PRODUCTION =
  process.argv.includes('--allow-production') ||
  process.env.AGENT_SMOKE_SEED_ALLOW_PRODUCTION === 'true';

const ownerEmail = normalizeEmail(
  process.env.AGENT_SMOKE_EMAIL ?? 'agent-smoke-owner@ourfitmeet.cn',
);
const password = process.env.AGENT_SMOKE_PASSWORD ?? 'FitMeetAgentSmoke123!';
const city = (process.env.AGENT_SMOKE_CITY ?? '青岛').trim() || '青岛';
const nearbyArea =
  (process.env.AGENT_SMOKE_AREA ?? '市南-五四广场').trim() || '市南-五四广场';
const coreInterests = ['咖啡', 'Citywalk', '轻聊天'];
const seedKey = 'agent-api-smoke-20260609';

type SeedPerson = {
  email: string;
  name: string;
  gender: string;
  age: number;
  color: string;
  city: string;
  nearbyArea: string;
  lat: number;
  lng: number;
  bio: string;
  interests: string[];
  traits: string[];
  socialScenes: string[];
  wantToMeet: string[];
  preferredTraits: string[];
  avoidTraits: string[];
  summary: string;
};

const owner: SeedPerson = {
  email: ownerEmail,
  name: 'Agent Smoke Owner',
  gender: 'unknown',
  age: 28,
  color: '#2F7BFF',
  city,
  nearbyArea,
  lat: 36.0607,
  lng: 120.3826,
  bio: 'FitMeet Agent real API smoke account. Prefers low-pressure public social scenes.',
  interests: coreInterests,
  traits: ['慢热', '边界清楚', '真诚'],
  socialScenes: ['咖啡轻聊天', '城市散步', '公共场所见面'],
  wantToMeet: ['能轻松聊天的人', '同城低压力社交朋友'],
  preferredTraits: ['礼貌', '尊重边界', '不尴尬'],
  avoidTraits: ['跳过站内聊', '第一次见面去私人场所', '索要联系方式'],
  summary:
    '测试用户想从咖啡、Citywalk 和轻聊天开始认识同城朋友，偏好公共场所和先站内聊。',
};

const candidates: SeedPerson[] = [
  {
    email: 'agent-smoke-candidate-lin@ourfitmeet.cn',
    name: '林一舟',
    gender: '男',
    age: 29,
    color: '#16B87A',
    city,
    nearbyArea: '市南-奥帆中心',
    lat: 36.062,
    lng: 120.392,
    bio: '喜欢下班后散步和咖啡店轻聊天，第一次见面只约公共场所。',
    interests: ['咖啡', 'Citywalk', '轻聊天', '散步'],
    traits: ['准时', '自然开场', '边界清楚'],
    socialScenes: ['咖啡轻聊天', '奥帆 Citywalk'],
    wantToMeet: ['低压力聊天搭子', '下班散步朋友'],
    preferredTraits: ['真诚', '礼貌', '不催促'],
    avoidTraits: ['上来要微信', '私密地点', '突然改行程'],
    summary: '同城咖啡和 Citywalk 候选人，低风险、公共场所优先。',
  },
  {
    email: 'agent-smoke-candidate-xia@ourfitmeet.cn',
    name: '夏禾',
    gender: '女',
    age: 27,
    color: '#6554FF',
    city,
    nearbyArea: '崂山-石老人',
    lat: 36.0969,
    lng: 120.4753,
    bio: '慢热但好聊，喜欢海边散步、咖啡和轻松破冰话题。',
    interests: ['咖啡', '轻聊天', '海边散步', 'Citywalk'],
    traits: ['温和', '慢热', '会照顾新手'],
    socialScenes: ['海边散步', '咖啡店公共区'],
    wantToMeet: ['聊天自然的人', '周末轻社交朋友'],
    preferredTraits: ['稳定', '尊重节奏', '不过度打探隐私'],
    avoidTraits: ['油腻玩笑', '催促见面', '跳过站内聊'],
    summary: '适合“不想太尴尬”的轻聊天候选人，安全边界明确。',
  },
  {
    email: 'agent-smoke-candidate-chen@ourfitmeet.cn',
    name: '陈砚',
    gender: '男',
    age: 31,
    color: '#F0C85A',
    city,
    nearbyArea: '市北-台东',
    lat: 36.086,
    lng: 120.355,
    bio: '常去独立咖啡店和书店，喜欢轻松聊产品、城市和生活。',
    interests: ['咖啡', '轻聊天', '书店', 'Citywalk'],
    traits: ['安静', '可靠', '有耐心'],
    socialScenes: ['咖啡店', '书店附近散步'],
    wantToMeet: ['低压力同城朋友', '能自然开口的人'],
    preferredTraits: ['守时', '不冒犯', '先站内聊'],
    avoidTraits: ['评价外貌', '索要联系方式', '夜间偏僻地点'],
    summary: '偏安静的咖啡/书店候选人，推荐理由稳定且低风险。',
  },
];

async function main() {
  validateInputs();

  if (DRY_RUN) {
    console.log(
      `[agent-smoke-seed] dry-run ok: owner=${owner.email}, city=${city}, candidates=${candidates.length}`,
    );
    return;
  }

  await dataSource.initialize();
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const userRepo = dataSource.getRepository(User);
    const profileRepo = dataSource.getRepository(UserSocialProfile);
    const lifeProfileRepo = dataSource.getRepository(LifeGraphProfile);
    const lifeFieldRepo = dataSource.getRepository(LifeGraphField);
    const connectionRepo = dataSource.getRepository(AgentConnection);

    const ownerUser = await ensurePerson({
      input: owner,
      passwordHash,
      userRepo,
      profileRepo,
      lifeProfileRepo,
      lifeFieldRepo,
      isOwner: true,
    });

    const candidateUsers: User[] = [];
    for (const candidate of candidates) {
      const saved = await ensurePerson({
        input: candidate,
        passwordHash,
        userRepo,
        profileRepo,
        lifeProfileRepo,
        lifeFieldRepo,
        isOwner: false,
      });
      candidateUsers.push(saved);
    }

    const profiles = await profileRepo
      .createQueryBuilder('profile')
      .where('profile."userId" IN (:...userIds)', {
        userIds: [ownerUser.id, ...candidateUsers.map((user) => user.id)],
      })
      .orderBy('profile."userId"', 'ASC')
      .getMany();
    const agentConnection = await ensureAgentConnection({
      ownerUserId: ownerUser.id,
      connectionRepo,
    });

    console.log('[agent-smoke-seed] prepared Agent API smoke data.');
    console.log(`ownerUserId=${ownerUser.id}`);
    console.log(`agentConnectionId=${agentConnection.id}`);
    console.log(
      `candidateUserIds=${candidateUsers.map((user) => user.id).join(',')}`,
    );
    console.log(`profileRows=${profiles.length}`);
    console.log('');
    console.log('# /agent real API smoke login');
    console.log(`export AGENT_SMOKE_EMAIL=${shellQuote(ownerUser.email)}`);
    console.log(`export AGENT_SMOKE_PASSWORD=${shellQuote(password)}`);
    console.log(`export AGENT_SMOKE_CITY=${shellQuote(city)}`);
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

async function ensurePerson(input: {
  input: SeedPerson;
  passwordHash: string;
  userRepo: Repository<User>;
  profileRepo: Repository<UserSocialProfile>;
  lifeProfileRepo: Repository<LifeGraphProfile>;
  lifeFieldRepo: Repository<LifeGraphField>;
  isOwner: boolean;
}) {
  const {
    input: person,
    passwordHash,
    userRepo,
    profileRepo,
    lifeProfileRepo,
    lifeFieldRepo,
    isOwner,
  } = input;
  const allTags = unique([...person.interests, ...person.traits]);
  const user =
    (await userRepo.findOne({ where: { email: person.email } })) ??
    userRepo.create({ email: person.email });

  Object.assign(user, {
    password: passwordHash,
    name: person.name,
    avatar: '',
    color: person.color,
    gender: person.gender,
    age: person.age,
    city: person.city,
    lat: person.lat,
    lng: person.lng,
    locationUpdatedAt: new Date(),
    acceptNearbyMatch: true,
    gym: person.nearbyArea,
    bio: person.bio,
    singleCert: false,
    verified: true,
    interestTags: allTags,
    trainingDays: isOwner ? 12 : 28,
    trainingCount: isOwner ? 5 : 14,
    caloriesBurned: isOwner ? 900 : 2600,
    bestRecords: [
      {
        name: isOwner ? 'agent-smoke-owner' : 'agent-smoke-candidate',
        value: seedKey,
      },
    ],
    isCoach: false,
    trustScore: isOwner ? 3 : 8,
    socialTrustCount: isOwner ? 1 : 4,
  });

  const savedUser = await userRepo.save(user);

  const privacyBoundary =
    '先站内聊；第一次见面优先公共场所；不共享手机号、微信或精确住址；确认后再执行邀请。';
  const profile =
    (await profileRepo.findOne({ where: { userId: savedUser.id } })) ??
    profileRepo.create({ userId: savedUser.id });

  Object.assign(profile, {
    gender: person.gender,
    nickname: person.name,
    ageRange: '25-34',
    city: person.city,
    zodiac: '',
    mbti: '',
    traits: person.traits,
    socialStyle: isOwner ? '慢热低压力' : '自然轻聊天',
    communicationStyle: '温和、真诚、先确认边界',
    nearbyArea: person.nearbyArea,
    fitnessGoals: ['保持活力', '规律生活'],
    interestTags: person.interests,
    lifestyleTags: ['咖啡', '城市生活', '轻社交'],
    socialScenes: person.socialScenes,
    wantToMeet: person.wantToMeet,
    preferredTraits: person.preferredTraits,
    avoidTraits: person.avoidTraits,
    relationshipGoals: ['交朋友', '同城轻社交'],
    openness: 'medium',
    availableTimes: ['工作日晚上', '周末下午'],
    weekdayAvailability: '工作日 19:00 后',
    weekendAvailability: '周末下午',
    socialPreference: '低压力、公共场所、先站内聊，不希望第一次见面太尴尬。',
    rejectRules:
      '不接受跳过站内聊；不接受第一次见面去私人或偏僻场所；不交换联系方式。',
    privacyBoundary,
    profileDiscoverable: true,
    agentCanRecommendMe: true,
    agentCanStartChatAfterApproval: true,
    hideSensitiveTags: true,
    aiSummary: person.summary,
    aiProfileCard: {
      source: seedKey,
      smokeRole: isOwner ? 'owner' : 'candidate',
      displayName: person.name,
      city: person.city,
      nearbyArea: person.nearbyArea,
      interests: person.interests,
      safetyPreferences: {
        publicPlaceFirst: true,
        inAppChatFirst: true,
        requireConfirmation: true,
      },
    },
    matchSignals: {
      source: seedKey,
      publicTags: person.interests,
      matchKeywords: unique([
        ...person.interests,
        ...person.traits,
        ...person.socialScenes,
        '不尴尬',
        '低压力',
        '公共场所',
      ]),
      privatePreferenceTags: ['先站内聊', '确认后执行'],
      riskLevel: 'low',
      mockMatchScore: isOwner ? null : 88,
      safetyPreferences: {
        publicPlaceFirst: true,
        inAppChatFirst: true,
        requireConfirmation: true,
      },
    },
    sensitiveTagDecisions: {},
  });

  await profileRepo.save(profile);
  await ensureLifeGraph({
    userId: savedUser.id,
    person,
    lifeProfileRepo,
    lifeFieldRepo,
    privacyBoundary,
    isOwner,
  });

  return savedUser;
}

async function ensureAgentConnection(input: {
  ownerUserId: number;
  connectionRepo: Repository<AgentConnection>;
}) {
  const existing = await input.connectionRepo.findOne({
    where: {
      userId: input.ownerUserId,
      agentName: KnownAgent.Codex,
      tokenPrefix: 'smoke-agent',
    },
  });
  if (existing) return existing;

  return input.connectionRepo.save(
    input.connectionRepo.create({
      userId: input.ownerUserId,
      agentName: KnownAgent.Codex,
      agentDisplayName: 'FitMeet Agent Smoke',
      agentWebhookUrl: null,
      agentTokenHash: 'smoke-seed-placeholder-hash',
      tokenPrefix: 'smoke-agent',
      permissionLevel: AgentPermissionLevel.Basic,
      status: ConnectionStatus.Active,
      dailyActionLimit: 50,
      dailyActionsUsed: 0,
      dailyResetAt: null,
      lastActiveAt: new Date(),
      expiresAt: null,
    }),
  );
}

async function ensureLifeGraph(input: {
  userId: number;
  person: SeedPerson;
  lifeProfileRepo: Repository<LifeGraphProfile>;
  lifeFieldRepo: Repository<LifeGraphField>;
  privacyBoundary: string;
  isOwner: boolean;
}) {
  const { userId, person, lifeProfileRepo, lifeFieldRepo, privacyBoundary } =
    input;
  const profile =
    (await lifeProfileRepo.findOne({ where: { userId } })) ??
    lifeProfileRepo.create({ userId });

  Object.assign(profile, {
    completenessScore: 82,
    currentSocialGoal: '今晚想找人一起喝咖啡，不想太尴尬',
    aiSummary: person.summary,
    preferredLanguage: 'zh-CN',
    country: '中国',
    region: '山东',
    city: person.city,
    timezone: 'Asia/Shanghai',
    lastUpdatedAt: new Date(),
  });
  await lifeProfileRepo.save(profile);

  const fields: Array<{
    category: LifeGraphFieldCategory;
    fieldKey: string;
    fieldValue: unknown;
    signalType?: LifeGraphSignalType;
    visibleInRecommendationReason?: boolean;
    userCanDisableForMatching?: boolean;
  }> = [
    {
      category: LifeGraphFieldCategory.Identity,
      fieldKey: 'nickname',
      fieldValue: person.name,
    },
    {
      category: LifeGraphFieldCategory.Identity,
      fieldKey: 'city',
      fieldValue: person.city,
    },
    {
      category: LifeGraphFieldCategory.Identity,
      fieldKey: 'nearbyArea',
      fieldValue: person.nearbyArea,
    },
    {
      category: LifeGraphFieldCategory.SocialIntent,
      fieldKey: 'currentSocialGoal',
      fieldValue: '今晚想找人一起喝咖啡，不想太尴尬',
    },
    {
      category: LifeGraphFieldCategory.SocialIntent,
      fieldKey: 'preferredPeople',
      fieldValue: person.preferredTraits,
    },
    {
      category: LifeGraphFieldCategory.SocialIntent,
      fieldKey: 'preferredSocialStyle',
      fieldValue: '低压力、轻聊天、自然开场',
    },
    {
      category: LifeGraphFieldCategory.Lifestyle,
      fieldKey: 'availableTimes',
      fieldValue: ['工作日晚上', '周末下午'],
    },
    {
      category: LifeGraphFieldCategory.Lifestyle,
      fieldKey: 'routinePreference',
      fieldValue: ['咖啡', 'Citywalk', '轻聊天'],
    },
    {
      category: LifeGraphFieldCategory.FitnessActivity,
      fieldKey: 'sportsPreferences',
      fieldValue: person.interests,
    },
    {
      category: LifeGraphFieldCategory.FitnessActivity,
      fieldKey: 'publicPlaceOnly',
      fieldValue: true,
    },
    {
      category: LifeGraphFieldCategory.TrustSafety,
      fieldKey: 'realNameVerified',
      fieldValue: true,
      signalType: LifeGraphSignalType.Weak,
    },
    {
      category: LifeGraphFieldCategory.TrustSafety,
      fieldKey: 'riskFlags',
      fieldValue: [],
      visibleInRecommendationReason: false,
    },
    {
      category: LifeGraphFieldCategory.TrustSafety,
      fieldKey: 'requiresStrictConfirmation',
      fieldValue: true,
    },
    {
      category: LifeGraphFieldCategory.PrivacyBoundary,
      fieldKey: 'privacyBoundary',
      fieldValue: privacyBoundary,
    },
    {
      category: LifeGraphFieldCategory.PrivacyBoundary,
      fieldKey: 'preciseLocationSharing',
      fieldValue: false,
      signalType: LifeGraphSignalType.Sensitive,
      visibleInRecommendationReason: false,
    },
    {
      category: LifeGraphFieldCategory.PrivacyBoundary,
      fieldKey: 'contactSharing',
      fieldValue: false,
      signalType: LifeGraphSignalType.Sensitive,
      visibleInRecommendationReason: false,
    },
  ];

  for (const fieldInput of fields) {
    const field =
      (await lifeFieldRepo.findOne({
        where: {
          userId,
          category: fieldInput.category,
          fieldKey: fieldInput.fieldKey,
        },
      })) ??
      lifeFieldRepo.create({
        userId,
        category: fieldInput.category,
        fieldKey: fieldInput.fieldKey,
      });

    Object.assign(field, {
      fieldValue: fieldInput.fieldValue,
      source: LifeGraphFieldSource.SystemGenerated,
      confidence: 0.95,
      confirmedByUser: true,
      editable: true,
      revoked: false,
      revokedAt: null,
      lastInferredAt: new Date(),
      signalType: fieldInput.signalType ?? LifeGraphSignalType.Core,
      visibleInRecommendationReason:
        fieldInput.visibleInRecommendationReason ?? true,
      userCanDisableForMatching: fieldInput.userCanDisableForMatching ?? true,
      enabledForMatching: true,
    });

    await lifeFieldRepo.save(field);
  }
}

function validateInputs() {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail)) {
    throw new Error(`Invalid AGENT_SMOKE_EMAIL: ${ownerEmail}`);
  }
  if (password.length < 12) {
    throw new Error('AGENT_SMOKE_PASSWORD must be at least 12 characters.');
  }
  if (/^(change_me|password|secret|example|fitmeet@2026)$/i.test(password)) {
    throw new Error('AGENT_SMOKE_PASSWORD must not be a placeholder password.');
  }
  if (process.env.NODE_ENV === 'production' && !ALLOW_PRODUCTION) {
    throw new Error(
      'Refusing to write Agent smoke seed in production without AGENT_SMOKE_SEED_ALLOW_PRODUCTION=true or --allow-production.',
    );
  }
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function unique(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = value.trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

main().catch((error) => {
  console.error(
    `[agent-smoke-seed] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
