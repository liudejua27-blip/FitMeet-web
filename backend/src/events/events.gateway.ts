import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from '../redis/redis.service';

interface JwtPayload {
  sub: number;
}

type AuthenticatedSocket = Socket & { data: { userId?: number } };

function getSocketCorsOrigins(): string[] {
  const origins = process.env.ALLOWED_ORIGINS?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins?.length) {
    return origins;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('ALLOWED_ORIGINS is required for events gateway');
  }

  return ['http://localhost:5173'];
}

@WebSocketGateway({
  cors: {
    origin: getSocketCorsOrigins(),
    credentials: true,
  },
  namespace: 'events',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        // Allow anonymous connection? Perhaps not for user tracking.
        return;
      }

      const payload = this.jwtService.verify<JwtPayload>(token);
      const userId = payload.sub;
      client.data.userId = userId;

      void client.join(`user:${userId}`);

      await this.redisService.getClient().set(`user:online:${userId}`, 'true');
      this.logger.log(`Client connected: ${userId}`);
    } catch {
      this.logger.warn('Socket connection failed auth');
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    const userId = client.data.userId;
    if (userId) {
      await this.redisService.getClient().del(`user:online:${userId}`);
      this.logger.log(`Client disconnected: ${userId}`);
    }
  }

  @SubscribeMessage('join_room')
  handleJoinRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() roomId: string,
  ) {
    void client.join(roomId);
    this.logger.log(`User ${client.data.userId} joined room ${roomId}`);
  }

  @SubscribeMessage('leave_room')
  handleLeaveRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() roomId: string,
  ) {
    void client.leave(roomId);
  }

  @SubscribeMessage('send_message')
  handleMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { roomId: string; text: string },
  ) {
    this.server.to(payload.roomId).emit('new_message', {
      senderId: client.data.userId,
      text: payload.text,
      timestamp: new Date(),
    });
  }

  private extractToken(client: Socket): string | undefined {
    const auth = client.handshake.auth as { token?: string };
    const authToken = auth.token;
    const headerToken = client.handshake.headers.authorization;
    const rawToken = authToken || headerToken;

    if (!rawToken) return undefined;
    return rawToken.replace(/^Bearer\s+/i, '');
  }
}
