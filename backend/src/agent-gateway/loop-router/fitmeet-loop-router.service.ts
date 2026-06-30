import { Injectable } from '@nestjs/common';

import type {
  FitMeetLoopDisposition,
  FitMeetLoopIntent,
  FitMeetLoopRouterResult,
} from './fitmeet-loop-router.types';
import { classifyWorkoutIntent } from '../workout-loop/workout-intent-classifier';

const WORKOUT_EXPLICIT =
  /(约练|约跑|约球|约.{0,4}(球|打球|羽毛球|篮球|网球)|运动搭子|训练搭子|跑步搭子|健身搭子|羽毛球搭子|篮球搭子|网球搭子|瑜伽搭子|游泳搭子|一起.{0,12}(跑步|夜跑|运动|训练|健身|练肩|撸铁|羽毛球|篮球|网球|瑜伽|游泳|散步|徒步|骑行|city\s*walk|citywalk)|找.{0,16}(跑步|夜跑|运动|训练|健身|练肩|撸铁|羽毛球|篮球|网球|瑜伽|游泳|散步|徒步|骑行|city\s*walk|citywalk)|(?:跑步|夜跑|运动|训练|健身|练肩|撸铁|羽毛球|篮球|网球|瑜伽|游泳|散步|徒步|骑行|city\s*walk|citywalk).{0,8}(搭子|伙伴)|附近.{0,16}(跑步|夜跑|运动|训练|健身|练肩|撸铁|搭子|伙伴)|有人.{0,16}(一起|陪).{0,16}(跑步|夜跑|运动|训练|健身|练肩|撸铁|打球|练))/i;
const WORKOUT_ACTIVITY =
  /(跑步|夜跑|慢跑|健身|练肩|撸铁|羽毛球|篮球|网球|散步|徒步|骑行|瑜伽|游泳|训练|运动|city\s*walk|citywalk)/i;
const WORKOUT_CONTEXT =
  /(今天|今晚|明天|明晚|后天|周末|上午|中午|下午|晚上|附近|大学|公园|体育馆|健身房|球馆|操场|青岛|北京|上海|广州|深圳|杭州|成都|重庆|南京|苏州|武汉|西安|长沙|郑州|天津|济南|厦门|宁波|合肥)/i;
const WORKOUT_DIRECT_CREATE =
  /((发布|创建|生成|新建|做|整理).{0,10}(约练|约练卡|运动卡|搭子卡)|(约练|约练卡).{0,10}(发布|创建|生成|新建))/i;
const WORKOUT_TIME =
  /(今天|今晚|明天|明晚|后天|本周末|这周末|下周末|周末|周[一二三四五六日天]|星期[一二三四五六日天]|上午|中午|下午|晚上|早上|夜间|下班后|工作日晚上|\d{1,2}\s*[点:：]\s*\d{0,2})/i;
const WORKOUT_PLACE =
  /(附近|大学|学院|公园|广场|体育馆|健身房|球馆|操场|商场|校区|中心|海边|河边|湖|山|桥|陆家嘴|徐家汇|金鸡湖|五大道|岳麓山|观音桥|太古里|奥体中心|学校|公司|青岛|北京|上海|广州|深圳|杭州|成都|重庆|南京|苏州|武汉|西安|长沙|郑州|天津|济南|厦门|宁波|合肥)/i;
const WORKOUT_PARTNER =
  /(找|约|一起|一块|搭子|伙伴|朋友|有人|陪|组队|同去|同练)/i;
const WORKOUT_ACTIVITY_PARTNER =
  /((跑步|夜跑|慢跑|健身|练肩|撸铁|羽毛球|篮球|网球|散步|徒步|骑行|瑜伽|游泳|训练|运动|city\s*walk|citywalk).{0,10}(搭子|伙伴|朋友|同伴|队友|陪练|同练|一起))|((找|约|想找|想约|一起|一块).{0,16}(跑步|夜跑|慢跑|健身|练肩|撸铁|羽毛球|篮球|网球|散步|徒步|骑行|瑜伽|游泳|训练|运动|city\s*walk|citywalk).{0,10}(搭子|伙伴|朋友|同伴|队友|陪练|同练)?)/i;

const FRIEND =
  /(交友|认识朋友|找朋友|聊天搭子|同城朋友|低压力社交|扩列|搭话|认识新朋友)/i;
const TRAVEL =
  /(旅游|旅行|出游|结伴|攻略|目的地|出发|预算|拍照搭子|住宿|行程|机票|酒店)/i;
const PROFILE = /(完善资料|补全个人信息|修改画像|更新资料|补资料|个人信息)/i;

@Injectable()
export class FitMeetLoopRouterService {
  classify(message: string): FitMeetLoopRouterResult {
    const text = message.trim();
    if (!text) return result('casual', 0.2, 'empty_message', 'handoff_legacy');

    if (PROFILE.test(text))
      return result('profile', 0.9, 'profile_keyword', 'accept_loop');
    if (TRAVEL.test(text))
      return result('travel', 0.88, 'travel_keyword', 'accept_loop');

    const workoutIntent = classifyWorkoutIntent(text);
    if (workoutIntent === 'negative') {
      return result(
        'casual',
        0.72,
        'workout_negative_intent',
        'handoff_legacy',
      );
    }

    if (WORKOUT_DIRECT_CREATE.test(text)) {
      return result(
        'workout',
        0.96,
        'workout_direct_create_phrase',
        'accept_loop',
      );
    }

    if (WORKOUT_ACTIVITY_PARTNER.test(text)) {
      return result(
        'workout',
        0.9,
        'workout_activity_partner_phrase',
        'accept_loop',
      );
    }

    if (this.hasWorkoutActivityTimePlacePartner(text)) {
      return result(
        'workout',
        0.93,
        'workout_activity_time_place_partner',
        'accept_loop',
      );
    }

    if (FRIEND.test(text) && WORKOUT_ACTIVITY.test(text)) {
      return result(
        'casual',
        0.7,
        'workout_friend_activity_candidate_defer_to_main_agent',
        'needs_arbitration',
        'workout',
      );
    }

    if (FRIEND.test(text))
      return result('friend', 0.86, 'friend_keyword', 'accept_loop');

    if (workoutIntent === 'workout' || WORKOUT_EXPLICIT.test(text)) {
      return result(
        'casual',
        WORKOUT_CONTEXT.test(text) ? 0.72 : 0.62,
        'workout_keyword_candidate_defer_to_main_agent',
        'needs_arbitration',
        'workout',
      );
    }

    if (WORKOUT_ACTIVITY.test(text) && WORKOUT_CONTEXT.test(text)) {
      return result(
        'casual',
        0.68,
        'workout_activity_context_candidate_defer_to_main_agent',
        'needs_arbitration',
        'workout',
      );
    }

    return result('casual', 0.45, 'no_loop_keyword', 'handoff_legacy');
  }

  private hasWorkoutActivityTimePlacePartner(text: string): boolean {
    return (
      WORKOUT_ACTIVITY.test(text) &&
      WORKOUT_TIME.test(text) &&
      WORKOUT_PLACE.test(text) &&
      WORKOUT_PARTNER.test(text)
    );
  }
}

function result(
  intent: FitMeetLoopIntent,
  confidence: number,
  reason: string,
  disposition: FitMeetLoopDisposition,
  candidateIntent?: FitMeetLoopIntent,
): FitMeetLoopRouterResult {
  return { intent, confidence, reason, disposition, candidateIntent };
}
