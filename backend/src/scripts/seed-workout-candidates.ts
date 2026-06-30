import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { EntityManager, Repository } from 'typeorm';
import dataSource from '../database/data-source';
import { PublicSocialIntent } from '../agent-gateway/entities/public-social-intent.entity';
import {
  CandidateSearchIndex,
  CandidateSearchIndexSourceType,
  CandidateSearchIndexStatus,
} from '../agent-gateway/entities/candidate-search-index.entity';
import {
  SocialRequestRiskLevel,
  SocialRequestStatus,
} from '../agent-gateway/entities/social-request.entity';
import {
  SocialRequestGenderPreference,
  SocialRequestSource,
  SocialRequestType,
  SocialRequestVisibility,
  UserSocialRequest,
  UserSocialRequestStatus,
} from '../social-requests/social-request.entity';
import { UserSocialProfile } from '../users/user-social-profile.entity';
import { User } from '../users/user.entity';

type SeedOptions = {
  batch: string;
  count: number;
  cleanup: boolean;
  yes: boolean;
  help: boolean;
};

type CandidateTemplate = {
  city: string;
  area: string;
  lat: number;
  lng: number;
  activity: string;
  activityType: SocialRequestType;
  timePreference: string;
  gender: 'male' | 'female';
  age: number;
  intensity: string;
  interests: string[];
  lifestyleTags: string[];
  availableTimes: string[];
  socialStyle: string;
  goal: string;
};

type SeedSummary = {
  batch: string;
  seedKey: string;
  users: number;
  profiles: number;
  socialRequests: number;
  publicIntents: number;
  indexRows: number;
};

const DEFAULT_BATCH = 'workout-qa';
const DEFAULT_COUNT = 50;
const MAX_COUNT = 200;
const EMAIL_DOMAIN = 'ourfitmeet.local';
const NOW = () => new Date();

const CANDIDATE_TEMPLATES: CandidateTemplate[] = [
  tpl(
    '北京',
    '奥森公园',
    40.0169,
    116.3811,
    '跑步',
    SocialRequestType.RunningPartner,
    '明天晚上',
    'male',
    28,
    '轻松',
    ['宠物', '晨跑', '公园'],
    ['规律作息'],
    ['工作日晚上', '周末上午'],
    '主动但尊重边界',
    '找能一起稳定跑步的搭子',
  ),
  tpl(
    '北京',
    '北京大学',
    39.9928,
    116.3109,
    '篮球',
    SocialRequestType.FitnessPartner,
    '明天下午3点',
    'male',
    24,
    '中等',
    ['篮球', '校园', '团队运动'],
    ['学生友好'],
    ['工作日下午', '周末下午'],
    '直接高效',
    '找同城篮球搭子',
  ),
  tpl(
    '上海',
    '世纪公园',
    31.218,
    121.552,
    '跑步',
    SocialRequestType.RunningPartner,
    '周三晚上',
    'female',
    27,
    '轻松',
    ['夜跑', '摄影', '宠物'],
    ['下班后运动'],
    ['工作日晚上'],
    '慢热但守时',
    '找下班后轻松运动伙伴',
  ),
  tpl(
    '上海',
    '徐家汇',
    31.1926,
    121.4376,
    '健身',
    SocialRequestType.FitnessPartner,
    '周末上午',
    'male',
    31,
    '中等',
    ['力量训练', '咖啡', '科技'],
    ['自律'],
    ['周末上午', '周末下午'],
    '目标感强',
    '找互相监督训练的人',
  ),
  tpl(
    '广州',
    '天河体育中心',
    23.1386,
    113.3196,
    '羽毛球',
    SocialRequestType.FitnessPartner,
    '周六下午',
    'female',
    26,
    '中等',
    ['羽毛球', '轻食', '音乐'],
    ['规律训练'],
    ['周末下午'],
    '开朗友好',
    '找水平接近的羽毛球搭子',
  ),
  tpl(
    '广州',
    '大学城',
    23.0558,
    113.3946,
    '骑行',
    SocialRequestType.FitnessPartner,
    '周日早上',
    'male',
    23,
    '轻松',
    ['骑行', '校园', '城市探索'],
    ['早睡早起'],
    ['周末上午'],
    '外向',
    '找低压力骑行伙伴',
  ),
  tpl(
    '深圳',
    '深圳湾公园',
    22.5287,
    113.9432,
    '跑步',
    SocialRequestType.RunningPartner,
    '工作日晚上',
    'female',
    29,
    '轻松',
    ['海边', '夜跑', '宠物'],
    ['下班后放松'],
    ['工作日晚上'],
    '安静友好',
    '找深圳湾附近跑步搭子',
  ),
  tpl(
    '深圳',
    '莲花山公园',
    22.5543,
    114.0596,
    '徒步',
    SocialRequestType.FitnessPartner,
    '周末上午',
    'male',
    32,
    '轻松',
    ['徒步', '摄影', '城市漫步'],
    ['户外'],
    ['周末上午'],
    '稳重',
    '找周末户外搭子',
  ),
  tpl(
    '杭州',
    '西湖',
    30.2425,
    120.1416,
    '夜跑',
    SocialRequestType.RunningPartner,
    '周五晚上',
    'female',
    25,
    '轻松',
    ['西湖', '夜跑', '咖啡'],
    ['文艺'],
    ['周五晚上', '周末下午'],
    '慢热',
    '找能边跑边聊天的搭子',
  ),
  tpl(
    '杭州',
    '滨江江边',
    30.1882,
    120.212,
    '健身',
    SocialRequestType.FitnessPartner,
    '下班后',
    'male',
    30,
    '中等',
    ['健身', '互联网', '减脂'],
    ['效率型'],
    ['工作日晚上'],
    '直接',
    '找下班后互相打卡伙伴',
  ),
  tpl(
    '成都',
    '锦城湖',
    30.5559,
    104.0712,
    '跑步',
    SocialRequestType.RunningPartner,
    '明晚',
    'female',
    28,
    '轻松',
    ['湖边', '宠物', '火锅'],
    ['松弛感'],
    ['工作日晚上', '周末上午'],
    '开朗',
    '找轻松跑步搭子',
  ),
  tpl(
    '成都',
    '太古里',
    30.6538,
    104.081,
    '城市漫步',
    SocialRequestType.CityWalk,
    '周末下午',
    'male',
    33,
    '轻松',
    ['城市漫步', '咖啡', '摄影'],
    ['探店'],
    ['周末下午'],
    '会照顾节奏',
    '找城市漫步伙伴',
  ),
  tpl(
    '重庆',
    '观音桥',
    29.583,
    106.533,
    '健身',
    SocialRequestType.FitnessPartner,
    '周二晚上',
    'male',
    27,
    '中等',
    ['健身', '篮球', '夜跑'],
    ['下班后训练'],
    ['工作日晚上'],
    '爽快',
    '找同频训练搭子',
  ),
  tpl(
    '重庆',
    '南滨路',
    29.5458,
    106.5742,
    '散步',
    SocialRequestType.CityWalk,
    '周日晚上',
    'female',
    30,
    '轻松',
    ['江边', '散步', '音乐'],
    ['慢节奏'],
    ['周末晚上'],
    '温和',
    '找安全公共场所散步伙伴',
  ),
  tpl(
    '青岛',
    '五四广场',
    36.061,
    120.3826,
    '跑步',
    SocialRequestType.RunningPartner,
    '明天晚上',
    'male',
    26,
    '轻松',
    ['海边', '跑步', '宠物'],
    ['户外'],
    ['工作日晚上'],
    '友好',
    '找海边跑步搭子',
  ),
  tpl(
    '青岛',
    '青岛大学',
    36.074,
    120.422,
    '羽毛球',
    SocialRequestType.FitnessPartner,
    '周六下午',
    'female',
    22,
    '中等',
    ['羽毛球', '校园', '轻食'],
    ['学生友好'],
    ['周末下午'],
    '活泼',
    '找同校或附近运动伙伴',
  ),
  tpl(
    '南京',
    '玄武湖',
    32.071,
    118.793,
    '跑步',
    SocialRequestType.RunningPartner,
    '周三晚上',
    'female',
    29,
    '轻松',
    ['玄武湖', '夜跑', '阅读'],
    ['稳定打卡'],
    ['工作日晚上'],
    '慢热守时',
    '找稳定夜跑搭子',
  ),
  tpl(
    '南京',
    '奥体中心',
    32.009,
    118.724,
    '健身',
    SocialRequestType.FitnessPartner,
    '周末上午',
    'male',
    34,
    '中等',
    ['力量训练', '篮球', '减脂'],
    ['训练计划'],
    ['周末上午'],
    '目标明确',
    '找互相监督训练伙伴',
  ),
  tpl(
    '苏州',
    '金鸡湖',
    31.3156,
    120.705,
    '夜跑',
    SocialRequestType.RunningPartner,
    '周五晚上',
    'female',
    27,
    '轻松',
    ['金鸡湖', '夜跑', '摄影'],
    ['下班后放松'],
    ['周五晚上'],
    '开朗',
    '找湖边夜跑搭子',
  ),
  tpl(
    '苏州',
    '独墅湖',
    31.275,
    120.732,
    '骑行',
    SocialRequestType.FitnessPartner,
    '周日早上',
    'male',
    29,
    '轻松',
    ['骑行', '湖边', '咖啡'],
    ['户外'],
    ['周末上午'],
    '稳定',
    '找低压力骑行伙伴',
  ),
  tpl(
    '天津',
    '五大道',
    39.108,
    117.201,
    '散步',
    SocialRequestType.CityWalk,
    '周末下午',
    'female',
    31,
    '轻松',
    ['建筑', '散步', '咖啡'],
    ['慢节奏'],
    ['周末下午'],
    '温和',
    '找城市漫步伙伴',
  ),
  tpl(
    '天津',
    '水上公园',
    39.082,
    117.171,
    '跑步',
    SocialRequestType.RunningPartner,
    '明早',
    'male',
    35,
    '中等',
    ['晨跑', '公园', '自律'],
    ['早起'],
    ['工作日早上', '周末上午'],
    '直接',
    '找晨跑搭子',
  ),
  tpl(
    '长沙',
    '岳麓山',
    28.1846,
    112.937,
    '徒步',
    SocialRequestType.FitnessPartner,
    '周六上午',
    'male',
    25,
    '轻松',
    ['徒步', '爬山', '摄影'],
    ['户外'],
    ['周末上午'],
    '外向',
    '找轻松徒步伙伴',
  ),
  tpl(
    '长沙',
    '梅溪湖',
    28.192,
    112.909,
    '跑步',
    SocialRequestType.RunningPartner,
    '周四晚上',
    'female',
    28,
    '轻松',
    ['湖边', '夜跑', '音乐'],
    ['下班后运动'],
    ['工作日晚上'],
    '慢热',
    '找附近跑步搭子',
  ),
  tpl(
    '武汉',
    '东湖绿道',
    30.555,
    114.401,
    '骑行',
    SocialRequestType.FitnessPartner,
    '周日早上',
    'male',
    30,
    '中等',
    ['骑行', '东湖', '摄影'],
    ['户外'],
    ['周末上午'],
    '稳重',
    '找东湖骑行搭子',
  ),
  tpl(
    '武汉',
    '汉口江滩',
    30.594,
    114.302,
    '跑步',
    SocialRequestType.RunningPartner,
    '工作日晚上',
    'female',
    26,
    '轻松',
    ['江边', '跑步', '宠物'],
    ['轻松社交'],
    ['工作日晚上'],
    '友好',
    '找江滩跑步伙伴',
  ),
  tpl(
    '西安',
    '大雁塔',
    34.218,
    108.959,
    '城市漫步',
    SocialRequestType.CityWalk,
    '周六晚上',
    'female',
    29,
    '轻松',
    ['城市漫步', '历史', '摄影'],
    ['文化探索'],
    ['周末晚上'],
    '安静',
    '找公共场所漫步伙伴',
  ),
  tpl(
    '西安',
    '曲江池',
    34.199,
    108.984,
    '跑步',
    SocialRequestType.RunningPartner,
    '明晚',
    'male',
    28,
    '中等',
    ['跑步', '湖边', '篮球'],
    ['规律训练'],
    ['工作日晚上'],
    '爽快',
    '找曲江附近运动搭子',
  ),
  tpl(
    '厦门',
    '环岛路',
    24.446,
    118.126,
    '骑行',
    SocialRequestType.FitnessPartner,
    '周末早上',
    'female',
    27,
    '轻松',
    ['海边', '骑行', '摄影'],
    ['户外'],
    ['周末上午'],
    '开朗',
    '找海边骑行伙伴',
  ),
  tpl(
    '厦门',
    '白鹭洲公园',
    24.483,
    118.092,
    '跑步',
    SocialRequestType.RunningPartner,
    '周二晚上',
    'male',
    31,
    '轻松',
    ['公园', '夜跑', '咖啡'],
    ['下班后放松'],
    ['工作日晚上'],
    '温和',
    '找附近跑步搭子',
  ),
  tpl(
    '郑州',
    '郑东新区CBD',
    34.765,
    113.725,
    '健身',
    SocialRequestType.FitnessPartner,
    '下班后',
    'male',
    29,
    '中等',
    ['健身', '减脂', '咖啡'],
    ['效率型'],
    ['工作日晚上'],
    '直接',
    '找下班后训练伙伴',
  ),
  tpl(
    '郑州',
    '北龙湖',
    34.826,
    113.733,
    '跑步',
    SocialRequestType.RunningPartner,
    '周末上午',
    'female',
    30,
    '轻松',
    ['湖边', '跑步', '宠物'],
    ['慢跑'],
    ['周末上午'],
    '慢热',
    '找北龙湖跑步搭子',
  ),
  tpl(
    '济南',
    '大明湖',
    36.675,
    117.025,
    '散步',
    SocialRequestType.CityWalk,
    '周日晚上',
    'female',
    33,
    '轻松',
    ['散步', '湖边', '阅读'],
    ['慢节奏'],
    ['周末晚上'],
    '温和',
    '找安全公共区域散步伙伴',
  ),
  tpl(
    '济南',
    '奥体中心',
    36.665,
    117.122,
    '羽毛球',
    SocialRequestType.FitnessPartner,
    '周六下午',
    'male',
    27,
    '中等',
    ['羽毛球', '篮球', '健身'],
    ['规律运动'],
    ['周末下午'],
    '开朗',
    '找水平接近的羽毛球搭子',
  ),
  tpl(
    '合肥',
    '天鹅湖',
    31.822,
    117.225,
    '跑步',
    SocialRequestType.RunningPartner,
    '明天晚上',
    'male',
    26,
    '轻松',
    ['天鹅湖', '跑步', '宠物'],
    ['户外'],
    ['工作日晚上'],
    '友好',
    '找湖边轻松跑步搭子',
  ),
  tpl(
    '合肥',
    '翡翠湖',
    31.776,
    117.207,
    '骑行',
    SocialRequestType.FitnessPartner,
    '周末上午',
    'female',
    24,
    '轻松',
    ['骑行', '校园', '摄影'],
    ['学生友好'],
    ['周末上午'],
    '活泼',
    '找低压力骑行伙伴',
  ),
  tpl(
    '福州',
    '西湖公园',
    26.096,
    119.287,
    '跑步',
    SocialRequestType.RunningPartner,
    '周三晚上',
    'female',
    28,
    '轻松',
    ['公园', '夜跑', '音乐'],
    ['下班后运动'],
    ['工作日晚上'],
    '慢热',
    '找公园跑步搭子',
  ),
  tpl(
    '福州',
    '闽江公园',
    26.055,
    119.3,
    '散步',
    SocialRequestType.CityWalk,
    '周末晚上',
    'male',
    32,
    '轻松',
    ['江边', '散步', '咖啡'],
    ['慢节奏'],
    ['周末晚上'],
    '稳重',
    '找江边散步伙伴',
  ),
  tpl(
    '昆明',
    '滇池',
    24.88,
    102.665,
    '骑行',
    SocialRequestType.FitnessPartner,
    '周日早上',
    'male',
    30,
    '轻松',
    ['骑行', '湖边', '摄影'],
    ['户外'],
    ['周末上午'],
    '开朗',
    '找滇池附近骑行搭子',
  ),
  tpl(
    '昆明',
    '翠湖',
    25.047,
    102.704,
    '散步',
    SocialRequestType.CityWalk,
    '周六下午',
    'female',
    29,
    '轻松',
    ['散步', '公园', '阅读'],
    ['轻松社交'],
    ['周末下午'],
    '温和',
    '找公共场所散步伙伴',
  ),
  tpl(
    '宁波',
    '东钱湖',
    29.789,
    121.63,
    '跑步',
    SocialRequestType.RunningPartner,
    '周末上午',
    'female',
    27,
    '轻松',
    ['湖边', '跑步', '宠物'],
    ['户外'],
    ['周末上午'],
    '友好',
    '找东钱湖跑步搭子',
  ),
  tpl(
    '宁波',
    '老外滩',
    29.878,
    121.56,
    '城市漫步',
    SocialRequestType.CityWalk,
    '周五晚上',
    'male',
    34,
    '轻松',
    ['城市漫步', '咖啡', '摄影'],
    ['下班后放松'],
    ['周五晚上'],
    '稳重',
    '找老外滩漫步伙伴',
  ),
  tpl(
    '无锡',
    '蠡湖',
    31.49,
    120.266,
    '跑步',
    SocialRequestType.RunningPartner,
    '明晚',
    'male',
    28,
    '轻松',
    ['湖边', '夜跑', '健身'],
    ['规律运动'],
    ['工作日晚上'],
    '直接',
    '找蠡湖跑步搭子',
  ),
  tpl(
    '无锡',
    '太湖新城',
    31.484,
    120.312,
    '羽毛球',
    SocialRequestType.FitnessPartner,
    '周六下午',
    'female',
    26,
    '中等',
    ['羽毛球', '轻食', '音乐'],
    ['规律训练'],
    ['周末下午'],
    '开朗',
    '找附近羽毛球搭子',
  ),
  tpl(
    '大连',
    '星海广场',
    38.88,
    121.582,
    '跑步',
    SocialRequestType.RunningPartner,
    '周二晚上',
    'female',
    29,
    '轻松',
    ['海边', '跑步', '摄影'],
    ['下班后运动'],
    ['工作日晚上'],
    '慢热',
    '找星海附近跑步搭子',
  ),
  tpl(
    '大连',
    '东港',
    38.918,
    121.66,
    '散步',
    SocialRequestType.CityWalk,
    '周末下午',
    'male',
    33,
    '轻松',
    ['海边', '散步', '咖啡'],
    ['慢节奏'],
    ['周末下午'],
    '温和',
    '找公共场所散步伙伴',
  ),
  tpl(
    '沈阳',
    '奥体中心',
    41.742,
    123.461,
    '健身',
    SocialRequestType.FitnessPartner,
    '下班后',
    'male',
    31,
    '中等',
    ['健身', '篮球', '减脂'],
    ['效率型'],
    ['工作日晚上'],
    '直接',
    '找奥体附近健身搭子',
  ),
  tpl(
    '沈阳',
    '浑河岸边',
    41.752,
    123.43,
    '跑步',
    SocialRequestType.RunningPartner,
    '明早',
    'female',
    27,
    '轻松',
    ['晨跑', '河边', '宠物'],
    ['早起'],
    ['工作日早上', '周末上午'],
    '友好',
    '找晨跑搭子',
  ),
  tpl(
    '南昌',
    '艾溪湖',
    28.696,
    115.981,
    '跑步',
    SocialRequestType.RunningPartner,
    '周四晚上',
    'male',
    29,
    '轻松',
    ['湖边', '夜跑', '音乐'],
    ['规律运动'],
    ['工作日晚上'],
    '稳重',
    '找艾溪湖跑步搭子',
  ),
  tpl(
    '南昌',
    '八一广场',
    28.676,
    115.909,
    '城市漫步',
    SocialRequestType.CityWalk,
    '周日晚上',
    'female',
    28,
    '轻松',
    ['城市漫步', '摄影', '咖啡'],
    ['轻松社交'],
    ['周末晚上'],
    '开朗',
    '找市中心漫步伙伴',
  ),
];

function tpl(
  city: string,
  area: string,
  lat: number,
  lng: number,
  activity: string,
  activityType: SocialRequestType,
  timePreference: string,
  gender: 'male' | 'female',
  age: number,
  intensity: string,
  interests: string[],
  lifestyleTags: string[],
  availableTimes: string[],
  socialStyle: string,
  goal: string,
): CandidateTemplate {
  return {
    city,
    area,
    lat,
    lng,
    activity,
    activityType,
    timePreference,
    gender,
    age,
    intensity,
    interests,
    lifestyleTags,
    availableTimes,
    socialStyle,
    goal,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  assertProductionIntent(options);
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
      seedCandidates(manager, options.count, seedKey, passwordHash),
    );
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await dataSource.destroy();
  }
}

async function seedCandidates(
  manager: EntityManager,
  count: number,
  seedKey: string,
  passwordHash: string,
): Promise<SeedSummary> {
  const boundedCount = Math.min(Math.max(1, count), MAX_COUNT);
  const users = manager.getRepository(User);
  const profiles = manager.getRepository(UserSocialProfile);
  const socialRequests = manager.getRepository(UserSocialRequest);
  const publicIntents = manager.getRepository(PublicSocialIntent);
  const searchIndex = manager.getRepository(CandidateSearchIndex);
  const now = NOW();
  const stats: SeedSummary = {
    batch: seedKey,
    seedKey,
    users: 0,
    profiles: 0,
    socialRequests: 0,
    publicIntents: 0,
    indexRows: 0,
  };

  for (let index = 1; index <= boundedCount; index += 1) {
    const template =
      CANDIDATE_TEMPLATES[(index - 1) % CANDIDATE_TEMPLATES.length];
    const serial = String(index).padStart(2, '0');
    const email = `fitmeet.seed+${seedKey}-${serial}@${EMAIL_DOMAIN}`;
    const displayName = `FitMeet QA ${template.city}${template.activity} ${serial}`;
    const user = await upsertUser(users, {
      email,
      passwordHash,
      displayName,
      template,
      now,
    });
    stats.users += 1;

    const profile = await upsertProfile(profiles, {
      userId: user.id,
      displayName,
      template,
      seedKey,
      index,
    });
    stats.profiles += 1;

    const socialRequest = await upsertSocialRequest(socialRequests, {
      userId: user.id,
      template,
      seedKey,
      index,
    });
    stats.socialRequests += 1;

    const publicIntent = await upsertPublicIntent(publicIntents, {
      userId: user.id,
      linkedSocialRequestId: socialRequest.id,
      template,
      seedKey,
      index,
    });
    stats.publicIntents += 1;

    await upsertSearchIndex(
      searchIndex,
      buildProfileIndex(profile, user, template),
    );
    await upsertSearchIndex(
      searchIndex,
      buildPublicIntentIndex(publicIntent, template),
    );
    stats.indexRows += 2;
  }

  return stats;
}

async function upsertUser(
  users: Repository<User>,
  input: {
    email: string;
    passwordHash: string;
    displayName: string;
    template: CandidateTemplate;
    now: Date;
  },
): Promise<User> {
  const user = await users.findOne({ where: { email: input.email } });
  const entity = user ?? users.create({ email: input.email });
  entity.password = input.passwordHash;
  entity.name = input.displayName;
  entity.gender = input.template.gender;
  entity.age = input.template.age;
  entity.city = input.template.city;
  entity.lat = input.template.lat;
  entity.lng = input.template.lng;
  entity.locationUpdatedAt = input.now;
  entity.acceptNearbyMatch = true;
  entity.bio = `${input.template.city}${input.template.area}附近，偏好${input.template.activity}，${input.template.goal}。`;
  entity.verified = true;
  entity.interestTags = uniqueStrings([
    input.template.activity,
    ...input.template.interests,
    ...input.template.lifestyleTags,
  ]);
  entity.trustScore = 80;
  entity.socialTrustCount = 3;
  entity.onboardingCompletedAt = input.now;
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
  entity.primaryPurpose = 'workout_partner';
  entity.defaultMatchRadiusKm = 8;
  entity.ageRange = ageRangeFor(input.template.age);
  entity.city = input.template.city;
  entity.locale = 'zh-CN';
  entity.countryCode = 'CN';
  entity.timeZone = 'Asia/Shanghai';
  entity.utcOffsetMinutes = 480;
  entity.nearbyArea = input.template.area;
  entity.fitnessGoals = uniqueStrings([
    input.template.activity,
    input.template.intensity,
    '约练',
  ]);
  entity.interestTags = uniqueStrings([
    input.template.activity,
    ...input.template.interests,
  ]);
  entity.lifestyleTags = input.template.lifestyleTags;
  entity.socialScenes = ['同城约练', '公开场所运动'];
  entity.wantToMeet = ['运动搭子', `${input.template.activity}搭子`];
  entity.preferredTraits = ['守时', '尊重边界', '站内沟通'];
  entity.avoidTraits = [];
  entity.relationshipGoals = ['找搭子', '同城约练'];
  entity.openness = 'high';
  entity.availableTimes = input.template.availableTimes;
  entity.weekdayAvailability = input.template.availableTimes.includes(
    '工作日晚上',
  )
    ? '工作日晚上'
    : (input.template.availableTimes[0] ?? '周末下午');
  entity.weekendAvailability = input.template.availableTimes.includes(
    '周末上午',
  )
    ? '周末上午'
    : '周末下午';
  entity.socialStyle = input.template.socialStyle;
  entity.communicationStyle = '先站内确认时间地点，见面选择公共场所';
  entity.socialPreference = `${input.template.goal}；偏好${input.template.city}${input.template.area}附近，强度${input.template.intensity}。`;
  entity.rejectRules = '首次只选公共场所，临时变更需要提前说明';
  entity.privacyBoundary = '仅站内沟通，不交换联系方式，不公开精确位置';
  entity.candidateDisplayMode = 'coarse_profile';
  entity.candidateAvatarVisibility = 'hidden_until_confirmed';
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
  entity.aiSummary = `${input.template.city}${input.template.area}附近的${input.template.activity}候选，${input.template.intensity}强度，${input.template.goal}。`;
  entity.aiProfileCard = {
    purpose: 'workout_candidate_pool',
    seedBatch: input.seedKey,
    seedIndex: input.index,
    activityType: input.template.activity,
    city: input.template.city,
    area: input.template.area,
  };
  entity.matchSignals = {
    seedBatch: input.seedKey,
    seedIndex: input.index,
    activityTypes: [input.template.activity],
    city: input.template.city,
    area: input.template.area,
    intensity: input.template.intensity,
    availableTimes: input.template.availableTimes,
  };
  return profiles.save(entity);
}

async function upsertSocialRequest(
  socialRequests: Repository<UserSocialRequest>,
  input: {
    userId: number;
    template: CandidateTemplate;
    seedKey: string;
    index: number;
  },
): Promise<UserSocialRequest> {
  const existing = await socialRequests
    .createQueryBuilder('request')
    .where('request.userId = :userId', { userId: input.userId })
    .andWhere("request.metadata ->> 'seedBatch' = :seedBatch", {
      seedBatch: input.seedKey,
    })
    .andWhere("request.metadata ->> 'seedIndex' = :seedIndex", {
      seedIndex: String(input.index),
    })
    .getOne();
  const entity = existing ?? socialRequests.create({ userId: input.userId });
  entity.agentId = null;
  entity.source = SocialRequestSource.FitMeetAgent;
  entity.type = input.template.activityType;
  entity.title = `${input.template.timePreference}${input.template.city}${input.template.area}${input.template.activity}约练`;
  entity.description = `${input.template.timePreference}在${input.template.city}${input.template.area}附近${input.template.activity}，强度${input.template.intensity}，${input.template.goal}。`;
  entity.rawText = entity.description;
  entity.city = input.template.city;
  entity.locale = 'zh-CN';
  entity.countryCode = 'CN';
  entity.timeZone = 'Asia/Shanghai';
  entity.utcOffsetMinutes = 480;
  entity.lat = input.template.lat;
  entity.lng = input.template.lng;
  entity.radiusKm = 8;
  entity.timeStart = futureDate(input.index);
  entity.timeEnd = futureDate(input.index, 2);
  entity.genderPreference = SocialRequestGenderPreference.Any;
  entity.ageMin = 18;
  entity.ageMax = 45;
  entity.interestTags = uniqueStrings([
    input.template.activity,
    ...input.template.interests,
  ]);
  entity.activityType = input.template.activity;
  entity.agentAllowed = true;
  entity.requireUserConfirmation = true;
  entity.status = UserSocialRequestStatus.Matching;
  entity.visibility = SocialRequestVisibility.Public;
  entity.metadata = {
    fitmeetSeed: true,
    seedBatch: input.seedKey,
    seedIndex: String(input.index),
    seedKind: 'workout_candidate_pool',
    intensity: input.template.intensity,
    locationText: input.template.area,
    safetyBoundary: '公共场所、站内沟通、不交换联系方式、不公开精确位置',
  };
  entity.expiresAt = futureDate(input.index, 24 * 14);
  return socialRequests.save(entity);
}

async function upsertPublicIntent(
  publicIntents: Repository<PublicSocialIntent>,
  input: {
    userId: number;
    linkedSocialRequestId: number;
    template: CandidateTemplate;
    seedKey: string;
    index: number;
  },
): Promise<PublicSocialIntent> {
  const publicIntentId = publicIntentIdFor(input.seedKey, input.index);
  const existing = await publicIntents.findOne({
    where: { id: publicIntentId },
  });
  const entity = existing ?? publicIntents.create({ id: publicIntentId });
  entity.userId = input.userId;
  entity.linkedSocialRequestId = input.linkedSocialRequestId;
  entity.source = SocialRequestSource.FitMeetAgent;
  entity.mode = 'public';
  entity.requestType = input.template.activityType;
  entity.title = `${input.template.city}${input.template.area}${input.template.activity}搭子`;
  entity.description = `${input.template.timePreference}在${input.template.city}${input.template.area}附近${input.template.activity}，${input.template.goal}。`;
  entity.interestTags = uniqueStrings([
    input.template.activity,
    ...input.template.interests,
  ]);
  entity.city = input.template.city;
  entity.locale = 'zh-CN';
  entity.countryCode = 'CN';
  entity.timeZone = 'Asia/Shanghai';
  entity.utcOffsetMinutes = 480;
  entity.loc = input.template.area;
  entity.lat = input.template.lat;
  entity.lng = input.template.lng;
  entity.radiusKm = 8;
  entity.timePreference = input.template.timePreference;
  entity.locationPreference = `${input.template.city}${input.template.area}附近`;
  entity.socialGoal = input.template.goal;
  entity.riskLevel = SocialRequestRiskLevel.Low;
  entity.requiresUserConfirmation = true;
  entity.filters = {
    activityType: input.template.activity,
    socialScenes: ['同城约练', '公开场所运动'],
    relationshipGoals: ['找搭子', '同城约练'],
    intensity: input.template.intensity,
    availableTimes: input.template.availableTimes,
  };
  entity.candidateUserIds = [];
  entity.matchedCount = 0;
  entity.capacityMin = 1;
  entity.capacityMax = 4;
  entity.acceptedCount = 0;
  entity.applicationPolicy = 'approval_required';
  entity.linkedMeetId = null;
  entity.closesAt = futureDate(input.index, 24 * 14);
  entity.status = SocialRequestStatus.Searching;
  entity.metadata = {
    fitmeetSeed: true,
    seedBatch: input.seedKey,
    seedIndex: String(input.index),
    seedKind: 'workout_candidate_pool',
    linkedSocialRequestId: input.linkedSocialRequestId,
  };
  return publicIntents.save(entity);
}

function buildProfileIndex(
  profile: UserSocialProfile,
  user: User,
  template: CandidateTemplate,
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
      template.activity,
      ...profile.fitnessGoals,
      ...profile.socialScenes,
    ]),
    interestTags: uniqueStrings([
      ...profile.interestTags,
      ...profile.wantToMeet,
      ...profile.preferredTraits,
    ]),
    lifestyleTags: uniqueStrings([...profile.lifestyleTags, ...profile.traits]),
    socialScenes: profile.socialScenes,
    relationshipGoals: profile.relationshipGoals,
    timeBuckets: uniqueStrings([
      ...profile.availableTimes,
      profile.weekdayAvailability,
      profile.weekendAvailability,
    ]),
    publicSummary: profile.aiSummary,
    publicSafetyNotes: [profile.privacyBoundary, profile.rejectRules],
    safetyFlags: { hideSensitiveTags: true },
    trustScore: user.trustScore,
    profileCompleteness: 96,
    lastActiveAt: now,
    sourceUpdatedAt: now,
  };
}

function buildPublicIntentIndex(
  intent: PublicSocialIntent,
  template: CandidateTemplate,
): Partial<CandidateSearchIndex> &
  Pick<CandidateSearchIndex, 'sourceType' | 'sourceId'> {
  const now = NOW();
  return {
    sourceType: CandidateSearchIndexSourceType.PublicIntent,
    sourceId: intent.id,
    sourceVersion: `${intent.status}:${now.toISOString()}`,
    userId: intent.userId,
    publicIntentId: intent.id,
    linkedSocialRequestId: intent.linkedSocialRequestId,
    isRealUser: intent.userId !== null,
    profileDiscoverable: true,
    agentCanRecommendMe: true,
    agentCanStartChatAfterApproval: false,
    status: CandidateSearchIndexStatus.Active,
    displayName: intent.title,
    city: intent.city,
    locale: intent.locale,
    countryCode: intent.countryCode,
    timeZone: intent.timeZone,
    utcOffsetMinutes: intent.utcOffsetMinutes,
    geoHash: intent.geoHash,
    areaText: intent.loc,
    lat: intent.lat,
    lng: intent.lng,
    radiusKm: intent.radiusKm,
    activityTypes: uniqueStrings([
      intent.requestType,
      template.activity,
      ...intent.interestTags,
    ]),
    interestTags: uniqueStrings(intent.interestTags),
    lifestyleTags: [],
    socialScenes: ['同城约练', '公开场所运动', intent.requestType],
    relationshipGoals: ['找搭子', '同城约练', intent.socialGoal],
    timeBuckets: uniqueStrings([
      intent.timePreference,
      ...template.availableTimes,
    ]),
    publicSummary: intent.description,
    publicSafetyNotes: ['risk:low', 'requires_confirmation'],
    safetyFlags: {
      riskLevel: intent.riskLevel,
      requiresUserConfirmation: true,
    },
    trustScore: 70,
    profileCompleteness: 92,
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
  const publicIntentIds = await loadSeedPublicIntentIds(manager, seedKey);
  await manager.query(
    `DELETE FROM "candidate_search_index"
     WHERE ("sourceType" = $1 AND "sourceId" = ANY($2::text[]))
        OR ("sourceType" = $3 AND "sourceId" = ANY($4::text[]))
        OR "userId" = ANY($5::int[])
        OR "publicIntentId" = ANY($4::text[])`,
    [
      CandidateSearchIndexSourceType.Profile,
      userIds.map(String),
      CandidateSearchIndexSourceType.PublicIntent,
      publicIntentIds,
      userIds,
    ],
  );
  await manager.query(
    `DELETE FROM "public_social_intents"
     WHERE id = ANY($1::text[])
        OR metadata ->> 'seedBatch' = $2`,
    [publicIntentIds, seedKey],
  );
  await manager.query(
    `DELETE FROM "user_social_requests"
     WHERE metadata ->> 'seedBatch' = $1`,
    [seedKey],
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
    seedKey,
    users: userIds.length,
    profiles: userIds.length,
    socialRequests: 0,
    publicIntents: publicIntentIds.length,
    indexRows: userIds.length + publicIntentIds.length,
  };
}

async function loadSeedUserIds(
  manager: EntityManager,
  seedKey: string,
): Promise<number[]> {
  const rows: Array<{ id: number | string }> = await manager.query(
    `SELECT id FROM "users" WHERE email LIKE $1 ORDER BY id ASC`,
    [`fitmeet.seed+${seedKey}-%@${EMAIL_DOMAIN}`],
  );
  return rows.map((row) => Number(row.id)).filter(Number.isFinite);
}

async function loadSeedPublicIntentIds(
  manager: EntityManager,
  seedKey: string,
): Promise<string[]> {
  const rows: Array<{ id: string }> = await manager.query(
    `SELECT id FROM "public_social_intents"
     WHERE id LIKE $1 OR metadata ->> 'seedBatch' = $2
     ORDER BY id ASC`,
    [`qa-${seedKey}-%`, seedKey],
  );
  return rows.map((row) => row.id).filter(Boolean);
}

function futureDate(seedIndex: number, hoursOffset = 24): Date {
  const date = NOW();
  date.setHours(date.getHours() + hoursOffset + (seedIndex % 7) * 12);
  return date;
}

function publicIntentIdFor(seedKey: string, index: number): string {
  return `qa-${seedKey}-${String(index).padStart(3, '0')}`.slice(0, 80);
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
    yes: false,
    help: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--cleanup') options.cleanup = true;
    else if (arg === '--yes') options.yes = true;
    else if (arg === '--batch')
      options.batch = args[(index += 1)] ?? options.batch;
    else if (arg.startsWith('--batch='))
      options.batch = arg.slice('--batch='.length);
    else if (arg === '--count') {
      options.count = parseCount(args[(index += 1)]);
    } else if (arg.startsWith('--count=')) {
      options.count = parseCount(arg.slice('--count='.length));
    }
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
  const seedKey =
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || DEFAULT_BATCH;
  return seedKey;
}

function assertProductionIntent(options: SeedOptions): void {
  const isProduction =
    process.env.NODE_ENV === 'production' ||
    process.env.FITMEET_ENV === 'production';
  if (!isProduction) return;
  if (options.yes || process.env.FITMEET_ALLOW_PRODUCTION_SEED === 'true')
    return;
  throw new Error(
    'Refusing to seed production without --yes or FITMEET_ALLOW_PRODUCTION_SEED=true.',
  );
}

function printHelp(): void {
  console.log(`Seed workout candidates for Agent matching QA.

Usage:
  pnpm run seed:workout-candidates -- --count 50 --batch workout-qa-20260630
  pnpm run seed:workout-candidates -- --cleanup --batch workout-qa-20260630

Options:
  --count <n>     Number of candidates to upsert, default ${DEFAULT_COUNT}, max ${MAX_COUNT}
  --batch <name>  Stable cleanup/upsert key, default ${DEFAULT_BATCH}
  --cleanup       Delete rows created for the batch
  --yes           Required when NODE_ENV=production
`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[seed-workout-candidates] ${message}`);
  process.exitCode = 1;
});
