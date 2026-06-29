import { FitMeetLoopRouterService } from './fitmeet-loop-router.service';

describe('FitMeetLoopRouterService', () => {
  const service = new FitMeetLoopRouterService();

  it('routes explicit workout publishing requests to the workout loop', () => {
    expect(
      service.classify(
        '我想发布约练，我明天在北京大学有一场篮球赛，想找个朋友一块，最好是男生，明天下午3点',
      ),
    ).toMatchObject({
      intent: 'workout',
      confidence: expect.any(Number),
      reason: 'workout_direct_create_phrase',
    });
  });

  it('routes complete workout partner requests before the legacy activity search path', () => {
    expect(service.classify('今晚青岛大学附近找人跑步')).toMatchObject({
      intent: 'workout',
      reason: 'workout_activity_time_place_partner',
    });
  });

  it('does not let workout keywords alone take over the turn', () => {
    for (const message of [
      '想找个健身伙伴',
      '约个球',
      '附近有人一起练吗',
      '想找朋友一起健身',
    ]) {
      expect(service.classify(message)).toMatchObject({
        intent: 'casual',
        reason: 'workout_keyword_candidate_defer_to_main_agent',
      });
    }
  });

  it('keeps friend and travel as explicit placeholder loop intents', () => {
    expect(service.classify('想认识同城朋友')).toMatchObject({
      intent: 'friend',
    });
    expect(service.classify('周末想找人结伴旅游')).toMatchObject({
      intent: 'travel',
    });
  });

  it('does not over-route casual text', () => {
    expect(service.classify('今天心情不错')).toMatchObject({
      intent: 'casual',
    });
  });
});
