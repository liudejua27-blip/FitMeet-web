import { Injectable } from '@nestjs/common';
import {
  WaitlistDeviceType,
  WaitlistQualityLevel,
  WaitlistUserRole,
} from './waitlist.enums';

export interface WaitlistQualityInput {
  city?: string;
  scenarios?: string[];
  interviewWilling?: boolean;
  inviteCode?: string | null;
  deviceType?: WaitlistDeviceType;
  userRole?: WaitlistUserRole;
}

export interface WaitlistQualityResult {
  qualityScore: number;
  qualityLevel: WaitlistQualityLevel;
  qualityReasons: string[];
}

const TARGET_CITIES = new Set([
  '青岛',
  '北京',
  '上海',
  '深圳',
  '广州',
  '杭州',
  '成都',
]);
const CORE_SCENARIOS = [
  '跑步搭子',
  '健身约练',
  '周末活动',
  '附近活动',
  '运动搭子',
  '教练约课',
  '安全见面',
];
const SEED_ROLES = new Set<WaitlistUserRole>([
  WaitlistUserRole.Student,
  WaitlistUserRole.FitnessUser,
  WaitlistUserRole.Coach,
  WaitlistUserRole.WhiteCollar,
]);

@Injectable()
export class WaitlistQualityScoringService {
  score(input: WaitlistQualityInput): WaitlistQualityResult {
    let score = 0;
    const reasons: string[] = [];
    const scenarios = input.scenarios ?? [];

    if (input.city?.trim()) {
      score += 15;
      reasons.push('填写了城市');
      if (TARGET_CITIES.has(input.city.trim())) {
        score += 12;
        reasons.push('来自早期目标城市');
      }
    }

    if (scenarios.length > 0) {
      score += 18;
      reasons.push('选择了明确使用场景');
    }
    if (
      scenarios.some((scenario) =>
        CORE_SCENARIOS.some((core) => scenario.includes(core)),
      )
    ) {
      score += 18;
      reasons.push('场景匹配 FitMeet 早期核心方向');
    }

    if (input.interviewWilling) {
      score += 15;
      reasons.push('愿意参与访谈');
    }
    if (input.inviteCode) {
      score += 12;
      reasons.push('使用了邀请码');
    }
    if (
      input.deviceType === WaitlistDeviceType.Ios ||
      input.deviceType === WaitlistDeviceType.Android ||
      input.deviceType === WaitlistDeviceType.Both
    ) {
      score += input.deviceType === WaitlistDeviceType.Both ? 10 : 8;
      reasons.push('明确了测试设备');
    }
    if (input.userRole && SEED_ROLES.has(input.userRole)) {
      score += 10;
      reasons.push('属于早期种子用户群体');
    }

    const qualityScore = Math.max(0, Math.min(100, score));
    const qualityLevel =
      qualityScore >= 70
        ? WaitlistQualityLevel.High
        : qualityScore >= 40
          ? WaitlistQualityLevel.Medium
          : WaitlistQualityLevel.Low;

    return { qualityScore, qualityLevel, qualityReasons: reasons };
  }
}
