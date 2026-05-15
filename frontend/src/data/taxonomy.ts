export type ContentType = 'all' | 'meet' | 'log' | 'help';

export type SportGroup =
  | 'gym'
  | 'run'
  | 'yoga'
  | 'outdoor'
  | 'swim'
  | 'martial'
  | 'ball'
  | 'cycling'
  | 'dance'
  | 'recovery'
  | 'other';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface SportSubcategory {
  id: string;
  label: string;
  englishLabel?: string;
  scenarioTags: string[];
  equipmentTags: string[];
  riskLevel: RiskLevel;
  needsVenue: boolean;
  needsCoach: boolean;
}

export interface SportTaxonomyNode {
  id: SportGroup;
  label: string;
  englishLabel: string;
  icon: string;
  summary: string;
  scenarioTags: string[];
  equipmentTags: string[];
  riskLevel: RiskLevel;
  needsVenue: boolean;
  needsCoach: boolean;
  subcategories: SportSubcategory[];
}

export const CONTENT_TYPES: Array<{ id: ContentType; label: string; shortLabel: string; description: string }> = [
  { id: 'all', label: '全部', shortLabel: '全部', description: '浏览所有约练、动态和求助' },
  { id: 'meet', label: '约练', shortLabel: '约练', description: '发布或加入线下运动活动' },
  { id: 'log', label: '动态', shortLabel: '动态', description: '分享训练记录和运动日常' },
  { id: 'help', label: '其他求助', shortLabel: '求助', description: '找装备建议、路线搭子、临时协助和小众兴趣伙伴' },
];

export const SPORT_TAXONOMY: SportTaxonomyNode[] = [
  {
    id: 'gym',
    label: '健身',
    englishLabel: 'Gym',
    icon: '🏋️',
    summary: '力量、增肌、减脂和功能训练',
    scenarioTags: ['健身房', '力量区', '团课'],
    equipmentTags: ['杠铃', '哑铃', '训练手套'],
    riskLevel: 'medium',
    needsVenue: true,
    needsCoach: false,
    subcategories: [
      { id: 'strength', label: '力量训练', scenarioTags: ['力量区', '自由重量'], equipmentTags: ['杠铃', '腰带'], riskLevel: 'medium', needsVenue: true, needsCoach: false },
      { id: 'hiit', label: 'HIIT', scenarioTags: ['团课', '燃脂'], equipmentTags: ['训练鞋'], riskLevel: 'medium', needsVenue: true, needsCoach: false },
      { id: 'muscle', label: '增肌', scenarioTags: ['健身房', '固定器械'], equipmentTags: ['护腕', '蛋白粉'], riskLevel: 'medium', needsVenue: true, needsCoach: false },
    ],
  },
  {
    id: 'run',
    label: '跑步',
    englishLabel: 'Running',
    icon: '🏃',
    summary: '夜跑、晨跑、配速组和赛事备战',
    scenarioTags: ['城市道路', '公园', '操场'],
    equipmentTags: ['跑鞋', '运动手表', '反光装备'],
    riskLevel: 'low',
    needsVenue: false,
    needsCoach: false,
    subcategories: [
      { id: 'jogging', label: '慢跑', scenarioTags: ['公园', '下班后'], equipmentTags: ['跑鞋'], riskLevel: 'low', needsVenue: false, needsCoach: false },
      { id: 'marathon', label: '马拉松', scenarioTags: ['长距离', '备赛'], equipmentTags: ['补给', '运动手表'], riskLevel: 'medium', needsVenue: false, needsCoach: false },
      { id: 'trail-running', label: '越野跑', scenarioTags: ['山路', '郊野'], equipmentTags: ['越野跑鞋', '水袋包'], riskLevel: 'high', needsVenue: false, needsCoach: false },
    ],
  },
  {
    id: 'yoga',
    label: '瑜伽',
    englishLabel: 'Yoga',
    icon: '🧘',
    summary: '拉伸、流瑜伽、普拉提和正念练习',
    scenarioTags: ['瑜伽馆', '公园', '居家'],
    equipmentTags: ['瑜伽垫', '瑜伽砖'],
    riskLevel: 'low',
    needsVenue: false,
    needsCoach: false,
    subcategories: [
      { id: 'flow-yoga', label: '流瑜伽', scenarioTags: ['瑜伽馆', '晨练'], equipmentTags: ['瑜伽垫'], riskLevel: 'low', needsVenue: false, needsCoach: false },
      { id: 'pilates', label: '普拉提', scenarioTags: ['工作室', '核心训练'], equipmentTags: ['普拉提圈'], riskLevel: 'low', needsVenue: true, needsCoach: false },
      { id: 'stretching', label: '拉伸恢复', scenarioTags: ['训练后', '居家'], equipmentTags: ['泡沫轴'], riskLevel: 'low', needsVenue: false, needsCoach: false },
    ],
  },
  {
    id: 'outdoor',
    label: '户外',
    englishLabel: 'Outdoor',
    icon: '🌿',
    summary: '徒步、露营、登山、攀岩、滑雪和潜水',
    scenarioTags: ['自然路线', '郊野', '周末'],
    equipmentTags: ['户外鞋', '背包', '补给'],
    riskLevel: 'medium',
    needsVenue: false,
    needsCoach: false,
    subcategories: [
      { id: 'hiking', label: '徒步', englishLabel: 'Hiking', scenarioTags: ['日落徒步', '城市绿道', '自然风光'], equipmentTags: ['适配装备', '专业向导', '技术装备'], riskLevel: 'low', needsVenue: false, needsCoach: false },
      { id: 'camping', label: '露营', englishLabel: 'Camping', scenarioTags: ['营地', '周末'], equipmentTags: ['帐篷', '防潮垫'], riskLevel: 'medium', needsVenue: false, needsCoach: false },
      { id: 'mountaineering', label: '登山', englishLabel: 'Mountaineering', scenarioTags: ['高海拔', '路线规划'], equipmentTags: ['登山杖', '冲锋衣'], riskLevel: 'high', needsVenue: false, needsCoach: true },
      { id: 'climbing', label: '攀岩', englishLabel: 'Climbing', scenarioTags: ['岩馆', '天然岩壁'], equipmentTags: ['安全带', '攀岩鞋'], riskLevel: 'high', needsVenue: true, needsCoach: true },
      { id: 'trail-running', label: '越野跑', englishLabel: 'Trail Running', scenarioTags: ['山路', '林道'], equipmentTags: ['越野跑鞋', '水袋包'], riskLevel: 'high', needsVenue: false, needsCoach: false },
      { id: 'ski', label: '滑雪', englishLabel: 'Skiing', scenarioTags: ['雪场', '冬季'], equipmentTags: ['雪板', '护具'], riskLevel: 'high', needsVenue: true, needsCoach: true },
      { id: 'diving', label: '潜水', englishLabel: 'Diving', scenarioTags: ['泳池', '海岛'], equipmentTags: ['潜水镜', '呼吸管'], riskLevel: 'high', needsVenue: true, needsCoach: true },
    ],
  },
  {
    id: 'swim',
    label: '游泳',
    englishLabel: 'Swimming',
    icon: '🏊',
    summary: '自由泳、长距离、泳姿纠正和水下拍摄',
    scenarioTags: ['泳池', '公开水域'],
    equipmentTags: ['泳镜', '泳帽', '浮板'],
    riskLevel: 'medium',
    needsVenue: true,
    needsCoach: false,
    subcategories: [
      { id: 'freestyle', label: '自由泳', scenarioTags: ['泳池', '长距离'], equipmentTags: ['泳镜'], riskLevel: 'medium', needsVenue: true, needsCoach: false },
      { id: 'open-water', label: '公开水域', scenarioTags: ['湖泊', '海边'], equipmentTags: ['救生浮标'], riskLevel: 'high', needsVenue: true, needsCoach: true },
    ],
  },
  {
    id: 'martial',
    label: '搏击',
    englishLabel: 'Martial Arts',
    icon: '🥊',
    summary: '拳击、散打、格斗和防身训练',
    scenarioTags: ['拳馆', '陪练', '轻对抗'],
    equipmentTags: ['拳套', '护具', '绷带'],
    riskLevel: 'high',
    needsVenue: true,
    needsCoach: true,
    subcategories: [
      { id: 'boxing', label: '拳击', scenarioTags: ['拳馆', '靶训练'], equipmentTags: ['拳套', '手靶'], riskLevel: 'high', needsVenue: true, needsCoach: true },
      { id: 'sanda', label: '散打', scenarioTags: ['轻对抗', '陪练'], equipmentTags: ['护具', '拳套'], riskLevel: 'high', needsVenue: true, needsCoach: true },
    ],
  },
  {
    id: 'ball',
    label: '球类运动',
    englishLabel: 'Ball Sports',
    icon: '⚽',
    summary: '羽毛球、篮球、网球、飞盘和匹克球',
    scenarioTags: ['球馆', '社区球场', '多人组局'],
    equipmentTags: ['球拍', '球鞋', '护腕'],
    riskLevel: 'medium',
    needsVenue: true,
    needsCoach: false,
    subcategories: [
      { id: 'badminton', label: '羽毛球', scenarioTags: ['球馆', '双打'], equipmentTags: ['球拍', '球鞋'], riskLevel: 'medium', needsVenue: true, needsCoach: false },
      { id: 'basketball', label: '篮球', scenarioTags: ['半场', '3v3'], equipmentTags: ['篮球鞋'], riskLevel: 'medium', needsVenue: true, needsCoach: false },
      { id: 'pickleball', label: '匹克球', scenarioTags: ['社区球场', '新手友好'], equipmentTags: ['球拍'], riskLevel: 'low', needsVenue: true, needsCoach: false },
    ],
  },
  {
    id: 'cycling',
    label: '骑行',
    englishLabel: 'Cycling',
    icon: '🚴',
    summary: '城市骑行、公路骑行和周末短途',
    scenarioTags: ['城市绿道', '公路', '周末'],
    equipmentTags: ['头盔', '车灯', '手套'],
    riskLevel: 'medium',
    needsVenue: false,
    needsCoach: false,
    subcategories: [
      { id: 'city-cycling', label: '城市骑行', scenarioTags: ['绿道', '夜骑'], equipmentTags: ['头盔', '车灯'], riskLevel: 'medium', needsVenue: false, needsCoach: false },
      { id: 'road-cycling', label: '公路骑行', scenarioTags: ['郊区', '长距离'], equipmentTags: ['公路车', '补给'], riskLevel: 'high', needsVenue: false, needsCoach: false },
    ],
  },
  {
    id: 'dance',
    label: '舞蹈',
    englishLabel: 'Dance',
    icon: '💃',
    summary: '街舞、爵士、尊巴和舞房搭子',
    scenarioTags: ['舞房', '团课', '排练'],
    equipmentTags: ['训练鞋', '护膝'],
    riskLevel: 'low',
    needsVenue: true,
    needsCoach: false,
    subcategories: [
      { id: 'zumba', label: '尊巴', scenarioTags: ['团课', '燃脂'], equipmentTags: ['训练鞋'], riskLevel: 'low', needsVenue: true, needsCoach: false },
      { id: 'street-dance', label: '街舞', scenarioTags: ['舞房', '排练'], equipmentTags: ['护膝'], riskLevel: 'medium', needsVenue: true, needsCoach: false },
    ],
  },
  {
    id: 'recovery',
    label: '恢复放松',
    englishLabel: 'Recovery',
    icon: '🧩',
    summary: '拉伸、康复、筋膜放松和伤病预防',
    scenarioTags: ['训练后', '康复室', '居家'],
    equipmentTags: ['泡沫轴', '弹力带'],
    riskLevel: 'low',
    needsVenue: false,
    needsCoach: false,
    subcategories: [
      { id: 'mobility', label: '灵活性', scenarioTags: ['训练后', '居家'], equipmentTags: ['弹力带'], riskLevel: 'low', needsVenue: false, needsCoach: false },
      { id: 'rehab', label: '运动康复', scenarioTags: ['康复室', '伤病预防'], equipmentTags: ['泡沫轴'], riskLevel: 'low', needsVenue: false, needsCoach: true },
    ],
  },
  {
    id: 'other',
    label: '其他（自定义）',
    englishLabel: 'Other',
    icon: '⌘',
    summary: '让小众兴趣、临时需求和未收录品类也能被看见',
    scenarioTags: ['小众兴趣', '临时求助', '自定义'],
    equipmentTags: ['按需填写'],
    riskLevel: 'low',
    needsVenue: false,
    needsCoach: false,
    subcategories: [],
  },
];

export const SPORT_ALIAS_MAP: Record<string, SportGroup> = {
  badminton: 'ball',
  basketball: 'ball',
  climbing: 'outdoor',
  camping: 'outdoor',
  diving: 'outdoor',
  fat: 'gym',
  hiking: 'outdoor',
  marathon: 'run',
  mountaineering: 'outdoor',
  muscle: 'gym',
  pickleball: 'ball',
  rehab: 'recovery',
  skiing: 'outdoor',
  ski: 'outdoor',
  strength: 'gym',
  'trail-running': 'outdoor',
  trailrunning: 'outdoor',
};

export const SCENARIO_TAGS = Array.from(new Set(SPORT_TAXONOMY.flatMap((node) => node.scenarioTags)));
export const EQUIPMENT_TAGS = Array.from(new Set(SPORT_TAXONOMY.flatMap((node) => node.equipmentTags)));
export const LEVEL_FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'beginner', label: '新手' },
  { id: 'intermediate', label: '进阶' },
  { id: 'pro', label: '专业' },
] as const;

export const GENDER_FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'male', label: '男生' },
  { id: 'female', label: '女生' },
] as const;

export const DISTANCE_FILTERS = [
  { id: 'all', label: '不限' },
  { id: '1km', label: '1km 内' },
  { id: '3km', label: '3km 内' },
  { id: '5km', label: '5km 内' },
] as const;

export const DISCOVER_FILTERS = [
  ...CONTENT_TYPES,
  ...SPORT_TAXONOMY.map((node) => ({
    id: node.id,
    label: `${node.icon} ${node.label}`,
    shortLabel: node.label,
    description: node.summary,
  })),
];

export const POST_CONTENT_TYPES = CONTENT_TYPES.filter(
  (item): item is { id: Exclude<ContentType, 'all'>; label: string; shortLabel: string; description: string } => item.id !== 'all',
);
export const SPORT_GROUP_OPTIONS = SPORT_TAXONOMY.map((node) => ({
  id: node.id,
  label: `${node.icon} ${node.label}`,
  shortLabel: node.label,
}));

export function normalizeSportGroup(value?: string | null): SportGroup | 'default' {
  const key = (value || '').trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (!key) return 'default';
  if (SPORT_TAXONOMY.some((node) => node.id === key)) return key as SportGroup;
  return SPORT_ALIAS_MAP[key] ?? 'default';
}

export function isContentType(value: string): value is ContentType {
  return CONTENT_TYPES.some((item) => item.id === value);
}

export function getSportNode(value?: string | null) {
  const group = normalizeSportGroup(value);
  return SPORT_TAXONOMY.find((node) => node.id === group);
}

export function getSportLabel(value?: string | null): string {
  const node = getSportNode(value);
  return node?.label ?? value ?? '自定义';
}

export function getSportFilterLabel(value?: string | null): string {
  const node = getSportNode(value);
  return node ? `${node.icon} ${node.label}` : value || '自定义';
}

export function getCustomCategoryName(tags?: string[]): string {
  const customTag = tags?.find((tag) => tag.startsWith('custom:') || tag.startsWith('#custom:'));
  return customTag?.replace(/^#?custom:/, '') ?? '';
}

export function buildPostTags({
  customCategoryName,
  equipmentTags,
  scenarioTags,
  selectedTags,
  subcategoryId,
}: {
  customCategoryName?: string;
  equipmentTags?: string[];
  scenarioTags?: string[];
  selectedTags: string[];
  subcategoryId?: string;
}) {
  const nextTags = [...selectedTags, ...(scenarioTags ?? []), ...(equipmentTags ?? [])];
  if (subcategoryId) nextTags.push(`subcategory:${subcategoryId}`);
  if (customCategoryName?.trim()) nextTags.push(`custom:${customCategoryName.trim()}`);
  return Array.from(new Set(nextTags)).slice(0, 12);
}
