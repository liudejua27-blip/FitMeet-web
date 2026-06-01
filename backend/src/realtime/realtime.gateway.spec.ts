import { RealtimeGateway } from './realtime.gateway';
import { RealtimeEventService } from './realtime-event.service';

function socket(token?: string) {
  const joined: string[] = [];
  const emitted: Array<{ event: string; payload: unknown }> = [];
  return {
    id: `socket_${Math.random()}`,
    data: {},
    handshake: {
      auth: token ? { token } : {},
      query: {},
      headers: {},
    },
    join: jest.fn((room: string) => joined.push(room)),
    leave: jest.fn(),
    emit: jest.fn((event: string, payload: unknown) => emitted.push({ event, payload })),
    disconnect: jest.fn(),
    joined,
    emitted,
  } as never;
}

describe('RealtimeGateway', () => {
  const jwt = { verify: jest.fn() };
  const events = { bindGateway: jest.fn() } as unknown as RealtimeEventService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts websocket connections with a valid JWT', () => {
    jwt.verify.mockReturnValue({ sub: 7 });
    const gateway = new RealtimeGateway(jwt as never, events);
    const client = socket('valid-token');

    gateway.handleConnection(client);

    expect(jwt.verify).toHaveBeenCalledWith('valid-token');
    expect(client.join).toHaveBeenCalledWith('user:7');
    expect(gateway.isUserOnline(7)).toBe(true);
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('rejects websocket connections without login', () => {
    jwt.verify.mockImplementation(() => {
      throw new Error('invalid token');
    });
    const gateway = new RealtimeGateway(jwt as never, events);
    const client = socket();

    gateway.handleConnection(client);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(gateway.isUserOnline(7)).toBe(false);
  });

  it('joins scoped realtime rooms after authentication', () => {
    jwt.verify.mockReturnValue({ sub: 7 });
    const gateway = new RealtimeGateway(jwt as never, events);
    const client = socket('valid-token');
    gateway.handleConnection(client);

    const result = gateway.handleJoin(
      { agentTaskId: 101, conversationId: 'abc_1', activityId: 9 },
      client,
    );

    expect(result).toEqual({
      ok: true,
      rooms: ['agent_task:101', 'conversation:abc_1', 'activity:9'],
    });
  });
});
