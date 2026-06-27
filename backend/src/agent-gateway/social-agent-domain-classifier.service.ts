import { Injectable } from '@nestjs/common';

export type SocialAgentDomainIntent =
  | 'SPORTS_MATCH'
  | 'TRAVEL_COMPANION'
  | 'PURE_CHAT';

@Injectable()
export class SocialAgentDomainClassifierService {
  classify(message: string): SocialAgentDomainIntent {
    const text = message.trim();
    if (
      /(约练|运动|跑步|散步|羽毛球|网球|健身|瑜伽|爬山|骑行|篮球|足球|活动|五四广场|中山公园)/i.test(
        text,
      )
    ) {
      return 'SPORTS_MATCH';
    }
    if (
      /(旅游|旅行|出行|同游|攻略|逛展|看展|citywalk|city walk|周边游|巴黎|伦敦|东京|首尔)/i.test(
        text,
      )
    ) {
      return 'TRAVEL_COMPANION';
    }
    return 'PURE_CHAT';
  }
}
