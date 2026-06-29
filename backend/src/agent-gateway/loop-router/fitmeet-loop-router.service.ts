import { Injectable } from '@nestjs/common';

import type {
  FitMeetLoopIntent,
  FitMeetLoopRouterResult,
} from './fitmeet-loop-router.types';
import { classifyWorkoutIntent } from '../workout-loop/workout-intent-classifier';

const WORKOUT_EXPLICIT =
  /(约练|约跑|约球|约.{0,4}(球|打球|羽毛球|篮球|网球)|运动搭子|训练搭子|跑步搭子|健身搭子|羽毛球搭子|篮球搭子|网球搭子|瑜伽搭子|游泳搭子|一起.{0,12}(跑步|运动|训练|健身|撸铁|羽毛球|篮球|网球|瑜伽|游泳|散步|徒步|骑行)|找.{0,16}(跑步|运动|训练|健身|撸铁|羽毛球|篮球|网球|瑜伽|游泳|散步|徒步|骑行)|(?:跑步|运动|训练|健身|撸铁|羽毛球|篮球|网球|瑜伽|游泳|散步|徒步|骑行).{0,8}(搭子|伙伴)|附近.{0,16}(跑步|运动|训练|健身|撸铁|搭子|伙伴)|有人.{0,16}(一起|陪).{0,16}(跑步|运动|训练|健身|撸铁|打球|练))/i;
const WORKOUT_ACTIVITY =
  /(跑步|慢跑|健身|撸铁|羽毛球|篮球|网球|散步|徒步|骑行|瑜伽|游泳|训练|运动)/i;
const WORKOUT_TIME =
  /(今天|今晚|明天|后天|本周末|下周末|周末|上午|中午|下午|晚上|早上|周[一二三四五六日]|星期[一二三四五六日天]|\d{1,2}\s*[点:：]\s*\d{0,2})/i;
const WORKOUT_PLACE =
  /(附近|大学|学院|公园|广场|体育馆|健身房|球馆|操场|校区|中心|海边|河边|青岛|北京|上海|杭州|深圳|广州|南京|成都|武汉|西安|厦门|苏州)/i;
const WORKOUT_PERSON_SEARCH =
  /(找|约|匹配|推荐|想找|希望|最好|优先|朋友|搭子|伙伴|同伴|有人|一起|一块|陪|男生|女生|同学|校友)/i;
const WORKOUT_DIRECT_CREATE =
  /(?:发布|发起|创建|新建|生成|开一张|整理成|帮我发|帮我建|我要发|我想发).{0,14}(?:约练|约跑|约球|运动|跑步|篮球|羽毛球|网球|健身|活动|搭子)|(?:约练|约跑|约球).{0,14}(?:卡|发布|发起|创建|新建|生成)/i;

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

    const workoutIntent = classifyWorkoutIntent(text);
    if (workoutIntent === 'negative') {
      return result('casual', 0.55, 'workout_negative_defer_to_main_agent');
    }

    const hasWorkoutCandidate =
      workoutIntent === 'workout' ||
      WORKOUT_EXPLICIT.test(text) ||
      WORKOUT_ACTIVITY.test(text);
    const hasActivity = WORKOUT_ACTIVITY.test(text);
    const hasTime = WORKOUT_TIME.test(text);
    const hasPlace = WORKOUT_PLACE.test(text);
    const hasPersonSearch = WORKOUT_PERSON_SEARCH.test(text);

    if (WORKOUT_DIRECT_CREATE.test(text)) {
      return result(
        'workout',
        hasActivity && hasTime && hasPlace ? 0.97 : 0.86,
        'workout_direct_create_phrase',
      );
    }

    if (hasActivity && hasTime && hasPlace && hasPersonSearch) {
      return result('workout', 0.91, 'workout_activity_time_place_partner');
    }

    if (hasWorkoutCandidate) {
      return result(
        'casual',
        0.62,
        'workout_keyword_candidate_defer_to_main_agent',
      );
    }

    if (FRIEND.test(text)) return result('friend', 0.86, 'friend_keyword');

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
