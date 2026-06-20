import { LightStatusMapperService } from './light-status-mapper.service';

describe('LightStatusMapperService', () => {
  const service = new LightStatusMapperService();

  it('keeps ordinary chat with safety preferences in neutral thinking state', () => {
    const status = service.resolve(
      {
        intent: 'casual_chat',
        shouldSearch: false,
        shouldExecuteAction: false,
        shouldQueueRun: false,
        candidates: [],
        activityResults: [],
        cards: [],
        safety: {
          blocked: false,
          level: 'low',
          boundaryNotes: ['用户这轮明确说不要推荐人，也不要约练。'],
          requiredConfirmations: [],
        },
      } as never,
      [],
    );

    expect(status).toBe('正在理解你的需求');
  });

  it('keeps real safety blocks visible as safety checks', () => {
    const status = service.resolve(
      {
        intent: 'casual_chat',
        shouldSearch: false,
        shouldExecuteAction: false,
        shouldQueueRun: false,
        candidates: [],
        activityResults: [],
        cards: [],
        safety: {
          blocked: true,
          level: 'blocked',
          boundaryNotes: ['消息里包含联系方式，确认前不能发送。'],
          requiredConfirmations: [],
        },
      } as never,
      [],
    );

    expect(status).toBe('正在检查安全边界');
  });
});
