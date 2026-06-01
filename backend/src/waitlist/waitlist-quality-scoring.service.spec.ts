import { WaitlistQualityScoringService } from './waitlist-quality-scoring.service';
import { WaitlistDeviceType, WaitlistQualityLevel, WaitlistUserRole } from './waitlist.enums';

describe('WaitlistQualityScoringService', () => {
  const service = new WaitlistQualityScoringService();

  it('calculates high quality for target seed users with core scenarios', () => {
    const result = service.score({
      city: '青岛',
      scenarios: ['跑步搭子', '周末活动'],
      interviewWilling: true,
      inviteCode: 'QDU2026',
      deviceType: WaitlistDeviceType.Both,
      userRole: WaitlistUserRole.Student,
    });

    expect(result.qualityScore).toBeGreaterThanOrEqual(70);
    expect(result.qualityLevel).toBe(WaitlistQualityLevel.High);
    expect(result.qualityReasons).toEqual(
      expect.arrayContaining([
        '来自早期目标城市',
        '场景匹配 FitMeet 早期核心方向',
        '愿意参与访谈',
      ]),
    );
  });

  it('returns low quality when key seed signals are missing', () => {
    const result = service.score({
      scenarios: [],
      interviewWilling: false,
      deviceType: WaitlistDeviceType.Ios,
      userRole: WaitlistUserRole.Other,
    });

    expect(result.qualityLevel).toBe(WaitlistQualityLevel.Low);
  });
});
