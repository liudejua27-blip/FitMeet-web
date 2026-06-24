import { RealtimeEventService } from './realtime-event.service';

describe('RealtimeEventService', () => {
  const notificationModel = { create: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends agent events through the gateway envelope', () => {
    const service = new RealtimeEventService(notificationModel as never);
    const gateway = {
      emitEnvelope: jest.fn(() => true),
      isUserOnline: jest.fn(() => true),
    };
    service.bindGateway(gateway as never);

    const envelope = service.emitAgentEvent(7, 'agent:thinking', {
      taskId: 101,
    });

    expect(envelope.eventType).toBe('agent:thinking');
    expect(envelope.userId).toBe(7);
    expect(gateway.emitEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'agent:thinking',
        userId: 7,
      }),
      ['agent_task:101'],
    );
    expect(notificationModel.create).not.toHaveBeenCalled();
  });

  it('writes an unread notification when the user is offline', async () => {
    const service = new RealtimeEventService(notificationModel as never);
    const gateway = {
      emitEnvelope: jest.fn(() => false),
      isUserOnline: jest.fn(() => false),
    };
    service.bindGateway(gateway as never);
    notificationModel.create.mockResolvedValue({ id: 'n1' });

    service.emitToUser({
      userId: 7,
      eventType: 'notification:new',
      payload: { text: 'hello' },
      notification: {
        type: 'system',
        text: 'hello',
        pushPayload: { route: '/messages' },
      },
    });
    await Promise.resolve();

    expect(notificationModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        read: false,
        pushPayload: expect.objectContaining({
          eventType: 'notification:new',
          route: '/messages',
        }),
      }),
    );
  });
});
