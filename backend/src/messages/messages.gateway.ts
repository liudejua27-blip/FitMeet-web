import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'messages',
})
export class MessagesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(MessagesGateway.name);

  // Map to store connected clients: userId -> Set of socketIds
  private connectedClients = new Map<number, Set<string>>();

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        // Allow connection but maybe restrict functionality?
        // Or disconnect immediately. Strict auth for now.
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      const userId = Number(payload.sub);

      if (!userId) {
        client.disconnect();
        return;
      }

      client.data.userId = userId;
      this.addClient(userId, client.id);

      // Join a room for targeted messaging
      client.join(`user_${userId}`);

      this.logger.log(`Client connected: ${client.id} (User ${userId})`);
    } catch (error) {
      this.logger.error(`Connection Unauthorized: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    if (userId) {
      this.removeClient(userId, client.id);
    }
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /* ========== Public Methods ========== */

  notifyNewMessage(toUserId: number, message: any) {
    this.server.to(`user_${toUserId}`).emit('newMessage', message);
  }

  /* ========== Helpers ========== */

  private extractToken(client: Socket): string | undefined {
    // Try query param first
    if (client.handshake.query.token && typeof client.handshake.query.token === 'string') {
      return client.handshake.query.token;
    }
    // Try headers
    const authHeader = client.handshake.headers.authorization;
    if (authHeader && authHeader.split(' ')[0] === 'Bearer') {
      return authHeader.split(' ')[1];
    }
    return undefined;
  }

  private addClient(userId: number, socketId: string) {
    if (!this.connectedClients.has(userId)) {
      this.connectedClients.set(userId, new Set());
    }
    this.connectedClients.get(userId)?.add(socketId);
  }

  private removeClient(userId: number, socketId: string) {
    if (this.connectedClients.has(userId)) {
      const socketIds = this.connectedClients.get(userId);
      socketIds?.delete(socketId);
      if (socketIds?.size === 0) {
        this.connectedClients.delete(userId);
      }
    }
  }
}
