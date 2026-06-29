import { FitMeetLoopRouterService } from './fitmeet-loop-router.service';

describe('FitMeetLoopRouterService', () => {
  const service = new FitMeetLoopRouterService();

  it('routes workout requests before the legacy agent loop', () => {
    expect(service.classify('今晚青岛大学附近找人跑步')).toMatchObject({
      intent: 'workout',
      reason: expect.stringContaining('workout'),
    });
  });

  it('routes real-world workout wording even when slots are incomplete', () => {
    for (const message of [
      '想找个健身伙伴',
      '约个球',
      '附近有人一起练吗',
      '想找朋友一起健身',
    ]) {
      expect(service.classify(message)).toMatchObject({
        intent: 'workout',
        reason: expect.stringContaining('workout'),
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
