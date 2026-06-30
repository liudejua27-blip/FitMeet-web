import { FitMeetLoopRouterService } from './fitmeet-loop-router.service';

describe('FitMeetLoopRouterService', () => {
  const service = new FitMeetLoopRouterService();

  it('accepts complete workout requests before the legacy agent loop', () => {
    expect(service.classify('今晚青岛大学附近找人跑步')).toMatchObject({
      intent: 'workout',
      disposition: 'accept_loop',
      reason: expect.stringContaining('workout'),
    });
  });

  it('accepts explicit workout card creation phrases', () => {
    expect(service.classify('帮我创建一张约练卡，明晚跑步')).toMatchObject({
      intent: 'workout',
      disposition: 'accept_loop',
      reason: 'workout_direct_create_phrase',
    });
  });

  it('accepts explicit activity partner requests so intake can collect missing slots', () => {
    expect(service.classify('我想找跑步搭子，喜欢宠物的')).toMatchObject({
      intent: 'workout',
      disposition: 'accept_loop',
      reason: 'workout_activity_partner_phrase',
    });
    expect(service.classify('想找朋友一起健身')).toMatchObject({
      intent: 'workout',
      disposition: 'accept_loop',
      reason: 'workout_activity_partner_phrase',
    });
  });

  it('marks keyword-only workout wording for arbitration instead of final routing', () => {
    for (const message of [
      '约个球',
      '附近有人一起练吗',
      '明晚陆家嘴健身',
      '苏州金鸡湖夜跑',
    ]) {
      expect(service.classify(message)).toMatchObject({
        intent: 'casual',
        candidateIntent: 'workout',
        disposition: 'needs_arbitration',
        reason: expect.stringContaining('workout'),
      });
    }
  });

  it('accepts direct create wording from the Beijing University basketball sample', () => {
    expect(
      service.classify(
        '我想发布约练，我明天在北京大学有一场篮球赛，想找个朋友一块，最好是男生，明天下午3点',
      ),
    ).toMatchObject({
      intent: 'workout',
      disposition: 'accept_loop',
      reason: 'workout_direct_create_phrase',
    });
  });

  it('accepts activity time place partner wording without create verbs', () => {
    for (const message of [
      '今晚青岛大学附近找人跑步',
      '我想发布约练，我明天在北京大学有一场篮球赛，想找个朋友一块，最好是男生，明天下午3点',
    ]) {
      expect(service.classify(message)).toMatchObject({
        intent: 'workout',
        disposition: 'accept_loop',
        reason: expect.stringContaining('workout'),
      });
    }
  });

  it('accepts friend and travel loop intents before legacy fallback', () => {
    expect(service.classify('想认识同城朋友')).toMatchObject({
      intent: 'friend',
      disposition: 'accept_loop',
    });
    expect(service.classify('周末想找人结伴旅游')).toMatchObject({
      intent: 'travel',
      disposition: 'accept_loop',
    });
  });

  it('does not over-route casual text', () => {
    expect(service.classify('今天心情不错')).toMatchObject({
      intent: 'casual',
      disposition: 'handoff_legacy',
    });
  });
});
