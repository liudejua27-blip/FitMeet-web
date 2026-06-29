import { Injectable } from '@nestjs/common';

import type {
  FitMeetLoopIntent,
  FitMeetLoopRouterResult,
} from './fitmeet-loop-router.types';

const WORKOUT_EXPLICIT =
  /(约练|运动搭子|跑步搭子|健身搭子|羽毛球搭子|篮球搭子|一起跑步|一起运动|找人跑步|找人健身|附近跑步|周末运动)/i;
const WORKOUT_ACTIVITY =
  /(跑步|慢跑|健身|撸铁|羽毛球|篮球|散步|徒步|骑行|瑜伽|游泳|运动)/i;
const WORKOUT_CONTEXT =
  /(今天|今晚|明天|周末|上午|中午|下午|晚上|附近|大学|公园|体育馆|健身房|球馆|操场|青岛|北京|上海|杭州|深圳|广州)/i;

const FRIEND =
  /(交友|认识朋友|找朋友|聊天搭子|同城朋友|低压力社交|扩列|搭话|认识新朋友)/i;
const TRAVEL =
  /(旅游|旅行|出游|结伴|攻略|目的地|出发|预算|拍照搭子|住宿|行程|机票|酒店)/i;
const PROFILE = /(完善资料|补全个人信息|修改画像|更新资料|补资料|个人信息)/i;

@Injectable()
export class FitMeetLoopRouterService {
  classify(message: string): FitMeetLoopRouterResult {
    const text = message.trim();
    if (!text) return result('casual', 0.2, 'empty_message');

    if (PROFILE.test(text)) return result('profile', 0.9, 'profile_keyword');
    if (TRAVEL.test(text)) return result('travel', 0.88, 'travel_keyword');
    if (FRIEND.test(text)) return result('friend', 0.86, 'friend_keyword');

    if (WORKOUT_EXPLICIT.test(text)) {
      const confidence = WORKOUT_CONTEXT.test(text) ? 0.95 : 0.82;
      return result('workout', confidence, 'workout_explicit_keyword');
    }

    if (WORKOUT_ACTIVITY.test(text) && WORKOUT_CONTEXT.test(text)) {
      const hasTime = /(今天|今晚|明天|周末|上午|中午|下午|晚上)/i.test(text);
      const hasPlace =
        /(附近|大学|公园|体育馆|健身房|球馆|操场|青岛|北京|上海|杭州|深圳|广州)/i.test(
          text,
        );
      return result(
        'workout',
        hasTime && hasPlace ? 0.91 : 0.78,
        'workout_activity_with_context',
      );
    }

    return result('casual', 0.45, 'no_loop_keyword');
  }
}

function result(
  intent: FitMeetLoopIntent,
  confidence: number,
  reason: string,
): FitMeetLoopRouterResult {
  return { intent, confidence, reason };
}
