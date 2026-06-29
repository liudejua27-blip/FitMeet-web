import { FitMeetLoopRouterService } from './fitmeet-loop-router.service';

describe('FitMeetLoopRouterService', () => {
  const service = new FitMeetLoopRouterService();

  it('routes workout requests before the legacy agent loop', () => {
    expect(service.classify('今晚青岛大学附近找人跑步')).toMatchObject({
      intent: 'workout',
      reason: expect.stringContaining('workout'),
    });
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
