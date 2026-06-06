import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { getSocketAllowedOrigins } from '../common/cors/origin-allowlist';
import { RealtimeEventEnvelope } from './realtime-event.types';
import { RealtimeEventService } from './realtime-event.service';

type JwtPayload = { sub: number; email?: string };
type AuthenticatedSocket = Socket & { data: { userId?: number } };

@WebSocketGateway({
  namespace: 'realtime',
  cors: {
    origin: getSocketAllowedOrigins('realtime'),
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6,
  allowEIO3: false,
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly userSockets = new Map<number, Set<string>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly events: RealtimeEventService,
  ) {}

  afterInit() {
    this.events.bindGateway(this);
    this.logger.log(
      JSON.stringify({
        event: 'realtime.gateway_initialized',
        redisAdapterReady: Boolean(process.env.REDIS_URL),
      }),
    );
  }

  handleConnection(client: AuthenticatedSocket) {
    const userId = this.validateToken(this.extractToken(client));
    if (!userId) {
      client.emit('realtime:error', { message: 'Authentication required' });
      client.disconnect(true);
      return;
    }

    this.socketData(client).userId = userId;
    void client.join(this.userRoom(userId));
    this.addSocket(userId, client.id);
    this.logger.log(
      JSON.stringify({
        event: 'realtime.connected',
        userId,
        socketId: client.id,
      }),
    );
    client.emit('realtime:connected', {
      userId,
      rooms: [this.userRoom(userId)],
      reconnect: true,
    });
  }

  handleDisconnect(client: AuthenticatedSocket) {
    const userId = this.socketData(client).userId;
    if (!userId) return;
    this.removeSocket(userId, client.id);
    this.logger.log(
      JSON.stringify({
        event: 'realtime.disconnected',
        userId,
        socketId: client.id,
      }),
    );
  }

  @SubscribeMessage('join')
  handleJoin(
    @MessageBody()
    body: {
      agentTaskId?: number | string;
      conversationId?: number | string;
      activityId?: number | string;
    },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const userId = this.socketData(client).userId;
    if (!userId) return { ok: false, message: 'Authentication required' };
    const rooms = [
      this.roomFromValue('agent_task', body.agentTaskId),
      this.roomFromValue('conversation', body.conversationId),
      this.roomFromValue('activity', body.activityId),
    ].filter((room): room is string => Boolean(room));
    for (const room of rooms) {
      void client.join(room);
    }
    return { ok: true, rooms };
  }

  @SubscribeMessage('leave')
  handleLeave(
    @MessageBody() body: { room?: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const room = this.safeRoom(body.room);
    if (!room) return { ok: false };
    void client.leave(room);
    return { ok: true, room };
  }

  emitEnvelope(envelope: RealtimeEventEnvelope, rooms: string[] = []) {
    if (!this.server) return false;
    const userRoom = this.userRoom(envelope.userId);
    this.server.to(userRoom).emit(envelope.eventType, envelope);
    this.server.to(userRoom).emit('realtime:event', envelope);
    for (const room of rooms
      .map((item) => this.safeRoom(item))
      .filter(Boolean)) {
      this.server.to(room as string).emit(envelope.eventType, envelope);
      this.server.to(room as string).emit('realtime:event', envelope);
    }
    return this.isUserOnline(envelope.userId);
  }

  isUserOnline(userId: number) {
    return (this.userSockets.get(userId)?.size ?? 0) > 0;
  }

  private addSocket(userId: number, socketId: string) {
    const sockets = this.userSockets.get(userId) ?? new Set<string>();
    sockets.add(socketId);
    this.userSockets.set(userId, sockets);
  }

  private removeSocket(userId: number, socketId: string) {
    const sockets = this.userSockets.get(userId);
    if (!sockets) return;
    sockets.delete(socketId);
    if (sockets.size === 0) this.userSockets.delete(userId);
  }

  private userRoom(userId: number) {
    return `user:${userId}`;
  }

  private roomFromValue(
    prefix: 'agent_task' | 'conversation' | 'activity',
    value: unknown,
  ) {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const normalized = String(value).trim();
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(normalized)) return null;
    return `${prefix}:${normalized}`;
  }

  private safeRoom(room?: string) {
    if (!room) return null;
    return /^(agent_task|conversation|activity):[a-zA-Z0-9_-]{1,80}$/.test(room)
      ? room
      : null;
  }

  private extractToken(client: Socket): string | undefined {
    const auth = client.handshake.auth as { token?: string } | undefined;
    const rawToken =
      auth?.token ??
      client.handshake.query?.token ??
      client.handshake.headers.authorization;
    if (Array.isArray(rawToken)) return rawToken[0];
    if (!rawToken) return undefined;
    return String(rawToken).replace(/^Bearer\s+/i, '');
  }

  private validateToken(token?: string): number | null {
    if (!token) return null;
    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      return Number(payload.sub) || null;
    } catch {
      return null;
    }
  }

  private socketData(client: AuthenticatedSocket): { userId?: number } {
    return client.data as { userId?: number };
  }
}
