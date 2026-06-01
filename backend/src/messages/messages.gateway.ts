import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { MessagesService } from './messages.service';

interface JwtPayload {
  sub: number;
  email: string;
}

interface SocketUserData {
  userId?: number;
}

type AuthenticatedSocket = Socket;

function getSocketCorsOrigins(): string[] {
  const origins = process.env.ALLOWED_ORIGINS?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins?.length) {
    return origins;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('ALLOWED_ORIGINS is required for messages gateway');
  }

  return ['http://localhost:5173'];
}

@WebSocketGateway({
  namespace: 'messages',
  cors: {
    origin: getSocketCorsOrigins(),
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6,
  allowEIO3: false,
})
export class MessagesGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly userSockets = new Map<number, string>();

  constructor(
    private readonly messagesService: MessagesService,
    private readonly jwtService: JwtService,
  ) {}

  handleConnection(client: AuthenticatedSocket) {
    const userId = this.validateToken(this.extractToken(client));
    if (!userId) {
      client.disconnect();
      return;
    }

    this.userSockets.set(userId, client.id);
    this.setUserId(client, userId);
  }

  handleDisconnect(client: AuthenticatedSocket) {
    const userId = this.getUserId(client);
    if (userId) {
      this.userSockets.delete(userId);
    }
  }

  @SubscribeMessage('sendMessage')
  async handleMessage(
    @MessageBody()
    data: { conversationId: string; content?: string; text?: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const userId = this.getUserId(client);
    const text = data.content ?? data.text ?? '';

    if (!userId) return { error: '未登录' };
    if (!text.trim()) return { error: '消息不能为空' };
    if (text.length > 5000) return { error: '消息内容过长' };

    const message = await this.messagesService.sendMessage(
      data.conversationId,
      userId,
      text,
    );
    const participants = await this.messagesService.getParticipantIds(
      data.conversationId,
    );
    const recipientId = participants.find((id) => id !== userId);
    const recipientSocketId = recipientId
      ? this.userSockets.get(recipientId)
      : undefined;

    if (recipientSocketId) {
      this.server.to(recipientSocketId).emit('newMessage', message);
    }

    return message;
  }

  /**
   * Push a newMessage event to a specific user if they are connected.
   * Returns true when the recipient was online and the event was emitted.
   * Used by AgentGatewayService when an external Agent sends a message.
   */
  pushNewMessageToUser(userId: number, message: unknown): boolean {
    const socketId = this.userSockets.get(userId);
    if (!socketId) return false;
    this.server.to(socketId).emit('newMessage', message);
    return true;
  }

  private extractToken(client: Socket): string | undefined {
    const auth = client.handshake.auth as { token?: string };
    const authToken = auth.token;
    const queryToken = client.handshake.query?.token;
    const headerToken = client.handshake.headers.authorization;
    const rawToken = authToken || queryToken || headerToken;

    if (Array.isArray(rawToken)) return rawToken[0];
    if (!rawToken) return undefined;
    return rawToken.replace(/^Bearer\s+/i, '');
  }

  private validateToken(token?: string): number | null {
    if (!token) return null;

    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      return payload.sub;
    } catch {
      return null;
    }
  }

  private getUserId(client: Socket): number | undefined {
    const data = client.data as SocketUserData;
    return data.userId;
  }

  private setUserId(client: Socket, userId: number): void {
    const data = client.data as SocketUserData;
    data.userId = userId;
  }
}
