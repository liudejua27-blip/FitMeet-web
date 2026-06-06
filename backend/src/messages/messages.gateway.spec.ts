import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';
import { MessagesGateway } from './messages.gateway';
import { MessagesService } from './messages.service';

type TestSocket = Socket & {
  disconnect: jest.Mock<void, []>;
};

function createSocket(id: string, token = 'valid-token'): TestSocket {
  return {
    id,
    data: {},
    handshake: {
      auth: { token },
      query: {},
      headers: {},
    },
    disconnect: jest.fn(),
  } as unknown as TestSocket;
}

describe('MessagesGateway', () => {
  let gateway: MessagesGateway;
  let messagesService: jest.Mocked<
    Pick<MessagesService, 'sendMessage' | 'getParticipantIds'>
  >;
  let jwtService: jest.Mocked<Pick<JwtService, 'verify'>>;
  let emit: jest.Mock;
  let server: { to: jest.Mock };

  beforeEach(() => {
    messagesService = {
      sendMessage: jest.fn(),
      getParticipantIds: jest.fn(),
    };
    jwtService = {
      verify: jest.fn((token: string) => ({ sub: Number(token), email: '' })),
    };
    emit = jest.fn();
    server = {
      to: jest.fn(() => ({ emit })),
    };

    gateway = new MessagesGateway(
      messagesService as unknown as MessagesService,
      jwtService as unknown as JwtService,
    );
    gateway.server = server as never;
  });

  it('pushes newMessage to every socket connected for the same user', () => {
    gateway.handleConnection(createSocket('web_socket', '7'));
    gateway.handleConnection(createSocket('app_socket', '7'));

    const delivered = gateway.pushNewMessageToUser(7, {
      id: 'message_1',
      text: 'hello',
    });

    expect(delivered).toBe(true);
    expect(server.to).toHaveBeenCalledWith('web_socket');
    expect(server.to).toHaveBeenCalledWith('app_socket');
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenCalledWith('newMessage', {
      id: 'message_1',
      text: 'hello',
    });
  });

  it('keeps another same-user socket online when one socket disconnects', () => {
    const webSocket = createSocket('web_socket', '7');
    const appSocket = createSocket('app_socket', '7');
    gateway.handleConnection(webSocket);
    gateway.handleConnection(appSocket);

    gateway.handleDisconnect(webSocket);
    const delivered = gateway.pushNewMessageToUser(7, { id: 'message_2' });

    expect(delivered).toBe(true);
    expect(server.to).toHaveBeenCalledTimes(1);
    expect(server.to).toHaveBeenCalledWith('app_socket');
    expect(server.to).not.toHaveBeenCalledWith('web_socket');
  });

  it('marks the user offline only after the final socket disconnects', () => {
    const webSocket = createSocket('web_socket', '7');
    const appSocket = createSocket('app_socket', '7');
    gateway.handleConnection(webSocket);
    gateway.handleConnection(appSocket);

    gateway.handleDisconnect(webSocket);
    gateway.handleDisconnect(appSocket);

    expect(gateway.pushNewMessageToUser(7, { id: 'message_3' })).toBe(false);
    expect(server.to).not.toHaveBeenCalled();
  });

  it('emits sendMessage results to every recipient socket', async () => {
    const senderSocket = createSocket('sender_socket', '1');
    gateway.handleConnection(senderSocket);
    gateway.handleConnection(createSocket('recipient_web_socket', '2'));
    gateway.handleConnection(createSocket('recipient_app_socket', '2'));
    const message = { id: 'message_4', text: 'staging hello' };
    messagesService.sendMessage.mockResolvedValue(message as never);
    messagesService.getParticipantIds.mockResolvedValue([1, 2]);

    const result = await gateway.handleMessage(
      { conversationId: 'conversation_1', content: 'staging hello' },
      senderSocket,
    );

    expect(result).toBe(message);
    expect(messagesService.sendMessage).toHaveBeenCalledWith(
      'conversation_1',
      1,
      'staging hello',
    );
    expect(server.to).toHaveBeenCalledWith('recipient_web_socket');
    expect(server.to).toHaveBeenCalledWith('recipient_app_socket');
    expect(server.to).not.toHaveBeenCalledWith('sender_socket');
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('disconnects sockets without a valid token', () => {
    jwtService.verify.mockImplementation(() => {
      throw new Error('invalid token');
    });
    const socket = createSocket('invalid_socket', 'invalid-token');

    gateway.handleConnection(socket);

    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(gateway.pushNewMessageToUser(7, { id: 'message_5' })).toBe(false);
  });
});
