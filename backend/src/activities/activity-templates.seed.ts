import {
  ActivityProofPolicy,
  ActivitySafetyLevel,
  ActivityType,
} from './entities/activity-template.entity';

export interface ActivityTemplateSeed {
  type: ActivityType;
  title: string;
  description: string;
  defaultDurationMinutes: number;
  defaultIcebreakers: string[];
  proofOptions: string[];
  safetyTips: string[];
  safetyLevel: ActivitySafetyLevel;
  defaultProofPolicy: ActivityProofPolicy;
}

export const ACTIVITY_TEMPLATES: ActivityTemplateSeed[] = [
  {
    type: ActivityType.Running,
    title: '一起慢跑',
    description: '在城市公园 / 跑道上完成一次轻松慢跑，认识彼此节奏。',
    defaultDurationMinutes: 30,
    defaultIcebreakers: [
      '互相说明今天的跑步目标（距离、配速或纯放松）。',
      '一起完成 20 分钟慢跑，途中保持可以聊天的速度。',
      '活动后互相评价节奏是否舒适、是否愿意再约。',
    ],
    proofOptions: ['mutual_confirm', 'checkin', 'scene_photo'],
    safetyTips: [
      '建议在公共跑道、城市公园等开放场所，不要去对方私人住所。',
      '夜间跑步请选择有照明、人流稳定的路段，并提前告知一位朋友。',
      '不强制上传露脸照片，场景照即可。',
    ],
    safetyLevel: ActivitySafetyLevel.Low,
    defaultProofPolicy: ActivityProofPolicy.MutualOrProof,
  },
  {
    type: ActivityType.Fitness,
    title: '健身房一起练',
    description: '在健身房完成一次轻量训练，互相点评动作。',
    defaultDurationMinutes: 60,
    defaultIcebreakers: [
      '出发前确认双方训练强度（轻 / 中 / 重）。',
      '一起完成一个轻量训练动作（深蹲 / 划船 / 推举任选）。',
      '活动后互相评价是否适合下次继续。',
    ],
    proofOptions: ['mutual_confirm', 'checkin', 'scene_photo', 'qr_code'],
    safetyTips: [
      '建议在公共健身房，第一次见面不去对方私人健身空间。',
      '不勉强尝试超出体能的训练，受伤优先停止。',
      '场景照片可代替露脸照片。',
    ],
    safetyLevel: ActivitySafetyLevel.Low,
    defaultProofPolicy: ActivityProofPolicy.MutualOrProof,
  },
  {
    type: ActivityType.DogWalking,
    title: '一起遛狗',
    description: '带各自的宠物在公园散步，让狗狗先破冰。',
    defaultDurationMinutes: 30,
    defaultIcebreakers: [
      '先互相介绍宠物的名字、品种、性格。',
      '一起在公园散步 15 分钟，让狗狗先熟悉。',
      '可上传一张不露脸的宠物合照作为证明。',
    ],
    proofOptions: ['mutual_confirm', 'scene_photo', 'checkin'],
    safetyTips: [
      '提前确认双方宠物是否友好、是否打过疫苗。',
      '建议在公共宠物公园，不去对方家中。',
      '请只上传宠物 / 场景照片，避免露脸。',
    ],
    safetyLevel: ActivitySafetyLevel.Low,
    defaultProofPolicy: ActivityProofPolicy.MutualOrProof,
  },
  {
    type: ActivityType.CoffeeChat,
    title: '咖啡轻聊',
    description: '在咖啡店进行一次轻松的破冰对话。',
    defaultDurationMinutes: 45,
    defaultIcebreakers: [
      '每人分享一个最近感兴趣的话题（书、电影、城市、运动均可）。',
      '互相问 3 个轻松问题，不询问收入、住址、隐私联系方式。',
      '保留对方边界，对方不愿回答时立刻换话题。',
    ],
    proofOptions: ['mutual_confirm', 'checkin', 'merchant_confirm', 'qr_code'],
    safetyTips: [
      '建议选择连锁 / 公共咖啡店，避免对方私人空间。',
      '不询问对方的家庭住址、收入、身份证号。',
      '感觉不适随时离开，FitMeet 支持事后举报。',
    ],
    safetyLevel: ActivitySafetyLevel.Low,
    defaultProofPolicy: ActivityProofPolicy.MutualConfirm,
  },
  {
    type: ActivityType.CityWalk,
    title: '城市散步',
    description: '一起完成一段城市散步路线，到达共同打卡点。',
    defaultDurationMinutes: 40,
    defaultIcebreakers: [
      '出发前一起选择一个公共打卡点（地标 / 街区 / 桥）。',
      '一起步行 20 分钟到达打卡点。',
      '到达后上传一张场景照片或互相确认完成。',
    ],
    proofOptions: ['mutual_confirm', 'scene_photo', 'checkin'],
    safetyTips: [
      '路线请走人流稳定的街区，避开偏僻区域。',
      '夜间请额外提高警惕，建议提前告知朋友路线。',
      '上传照片优先选场景，不强制露脸。',
    ],
    safetyLevel: ActivitySafetyLevel.Low,
    defaultProofPolicy: ActivityProofPolicy.MutualOrProof,
  },
];
