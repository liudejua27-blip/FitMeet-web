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

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'events'
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth.token || client.handshake.headers['authorization'];
      if (!token) {
        // Allow anonymous connection? Perhaps not for user tracking.
        return;
      }

      const payload = this.jwtService.verify(token.replace('Bearer ', ''));
      const userId = payload.sub;
      client.data.userId = userId;

      // Join a room for personal notifications
      client.join(`user:${userId}`);

      // Mark online in Redis
      await this.redisService.getClient().set(`user:online:${userId}`, 'true');
      this.logger.log(`Client connected: ${userId}`);

    } catch (e) {
      this.logger.warn('Socket connection failed auth');
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    if (userId) {
      await this.redisService.getClient().del(`user:online:${userId}`);
      this.logger.log(`Client disconnected: ${userId}`);
    }
  }

  @SubscribeMessage('join_room')
  handleJoinRoom(@ConnectedSocket() client: Socket, @MessageBody() roomId: string) {
    client.join(roomId);
    this.logger.log(`User ${client.data.userId} joined room ${roomId}`);
  }

  @SubscribeMessage('leave_room')
  handleLeaveRoom(@ConnectedSocket() client: Socket, @MessageBody() roomId: string) {
    client.leave(roomId);
  }

  // Example: Client sends message
  @SubscribeMessage('send_message')
  handleMessage(@ConnectedSocket() client: Socket, @MessageBody() payload: { roomId: string, text: string }) {
    // Broadcast to room
    this.server.to(payload.roomId).emit('new_message', {
      senderId: client.data.userId,
      text: payload.text,
      timestamp: new Date(),
    });
  }
}
