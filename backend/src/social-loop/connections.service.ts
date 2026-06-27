import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { Follow } from '../friends/follow.entity';
import { User } from '../users/user.entity';
import { ApiIdempotencyService } from './api-idempotency.service';
import {
  ConnectionRequest,
  ConnectionRequestStatus,
} from './connection-request.entity';
import { ContactPolicyService } from './contact-policy.service';
import { Friendship } from './friendship.entity';
import {
  SocialLoopErrorCode,
  socialConflict,
  socialNotFound,
} from './social-loop.errors';

type ConnectionRequestBody = {
  targetUserId?: number;
  message?: string;
};

type ResolveConnectionRequestBody = {
  reason?: string;
};

@Injectable()
export class ConnectionsService {
  constructor(
    private readonly idempotency: ApiIdempotencyService,
    private readonly contactPolicy: ContactPolicyService,
    @InjectRepository(ConnectionRequest)
    private readonly requestRepo: Repository<ConnectionRequest>,
    @InjectRepository(Friendship)
    private readonly friendshipRepo: Repository<Friendship>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Follow)
    private readonly followRepo: Repository<Follow>,
  ) {}

  async createRequest(
    requesterId: number,
    body: ConnectionRequestBody,
    idempotencyKey?: string,
  ) {
    const targetUserId = Number(body.targetUserId);
    return this.idempotency.run(
      requesterId,
      'connections.requests.create',
      idempotencyKey,
      { targetUserId, message: body.message ?? '' },
      (manager) =>
        this.createRequestOnce(
          requesterId,
          targetUserId,
          body.message ?? '',
          manager,
        ),
    );
  }

  async listRequests(
    userId: number,
    box: 'inbox' | 'outbox' = 'inbox',
    status = 'pending',
  ) {
    const requestStatus = this.connectionRequestStatus(status);
    const where =
      box === 'outbox'
        ? { requesterId: userId, status: requestStatus }
        : { targetUserId: userId, status: requestStatus };
    return this.requestRepo.find({
      where,
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async acceptRequest(
    userId: number,
    requestId: number,
    body: ResolveConnectionRequestBody,
    idempotencyKey?: string,
  ) {
    return this.idempotency.run(
      userId,
      'connections.requests.accept',
      idempotencyKey,
      { requestId, ...body },
      (manager) => this.acceptRequestOnce(userId, requestId, manager),
    );
  }

  async rejectRequest(
    userId: number,
    requestId: number,
    body: ResolveConnectionRequestBody,
    idempotencyKey?: string,
  ) {
    return this.idempotency.run(
      userId,
      'connections.requests.reject',
      idempotencyKey,
      { requestId, ...body },
      (manager) =>
        this.resolveRequestOnce(userId, requestId, 'rejected', manager),
    );
  }

  async cancelRequest(
    userId: number,
    requestId: number,
    body: ResolveConnectionRequestBody,
    idempotencyKey?: string,
  ) {
    return this.idempotency.run(
      userId,
      'connections.requests.cancel',
      idempotencyKey,
      { requestId, ...body },
      (manager) =>
        this.resolveRequestOnce(userId, requestId, 'cancelled', manager),
    );
  }

  async listFriends(userId: number) {
    const friendships = await this.friendshipRepo.find({
      where: [
        { userLowId: userId, status: 'active' },
        { userHighId: userId, status: 'active' },
      ],
      order: { updatedAt: 'DESC' },
    });
    const friendIds = friendships.map((friendship) =>
      friendship.userLowId === userId
        ? friendship.userHighId
        : friendship.userLowId,
    );
    if (friendIds.length === 0) return [];
    const users = await this.userRepo.find({ where: { id: In(friendIds) } });
    const userMap = new Map(users.map((user) => [user.id, user]));
    return friendIds
      .map((id) => userMap.get(id))
      .filter((user): user is User => Boolean(user))
      .map((user) => ({
        id: user.id,
        name: user.name,
        avatar: user.avatar || user.name?.[0] || '?',
        color: user.color,
        status: 'online' as const,
      }));
  }

  async deleteFriend(userId: number, targetUserId: number) {
    const pair = this.pair(userId, targetUserId);
    const friendship = await this.friendshipRepo.findOne({ where: pair });
    if (!friendship || friendship.status !== 'active') {
      return { removed: false, friendship: 'none' };
    }
    friendship.status = 'removed';
    friendship.removedAt = new Date();
    await this.friendshipRepo.save(friendship);
    await this.contactPolicy.revokeGrant(
      userId,
      targetUserId,
      'friendship',
      friendship.id,
    );
    return { removed: true, friendship: 'removed' };
  }

  async getRelationshipState(userId: number, targetUserId: number) {
    const [following, friendship, incoming, outgoing, contact] =
      await Promise.all([
        this.followRepo.count({
          where: { followerId: userId, followingId: targetUserId },
        }),
        this.friendshipRepo.findOne({ where: this.pair(userId, targetUserId) }),
        this.requestRepo.findOne({
          where: {
            requesterId: targetUserId,
            targetUserId: userId,
            status: 'pending',
          },
          order: { createdAt: 'DESC' },
        }),
        this.requestRepo.findOne({
          where: {
            requesterId: userId,
            targetUserId,
            status: 'pending',
          },
          order: { createdAt: 'DESC' },
        }),
        this.contactPolicy.getRelationshipState(userId, targetUserId),
      ]);
    const activeFriendship = friendship?.status === 'active';
    const connectionRequest = activeFriendship
      ? 'accepted'
      : incoming
        ? 'pending_incoming'
        : outgoing
          ? 'pending_outgoing'
          : 'none';
    return {
      userId: targetUserId,
      following: following > 0,
      friendship: activeFriendship ? 'active' : 'none',
      connectionRequest,
      messagePermission: contact.messagePermission,
      conversationId: contact.conversationId,
      blocked: contact.blocked,
    };
  }

  private async createRequestOnce(
    requesterId: number,
    targetUserId: number,
    message: string,
    manager: EntityManager,
  ) {
    this.assertTarget(requesterId, targetUserId);
    await this.contactPolicy.assertSociallyEligible(requesterId);
    await this.contactPolicy.assertSociallyEligible(targetUserId);
    await this.contactPolicy.assertNotBlocked(requesterId, targetUserId);
    await this.assertUserExists(targetUserId, manager);
    const friendship = await manager
      .getRepository(Friendship)
      .findOne({ where: this.pair(requesterId, targetUserId) });
    if (friendship?.status === 'active') {
      throw socialConflict(
        SocialLoopErrorCode.ConnectionRequestAlreadyResolved,
      );
    }
    const duplicate = await manager.getRepository(ConnectionRequest).findOne({
      where: { requesterId, targetUserId, status: 'pending' },
    });
    if (duplicate) return this.presentConnectionRequest(duplicate);

    const request = await manager.getRepository(ConnectionRequest).save(
      manager.getRepository(ConnectionRequest).create({
        requesterId,
        targetUserId,
        message: message.trim().slice(0, 500),
        status: 'pending',
        resolvedAt: null,
      }),
    );
    return this.presentConnectionRequest(request);
  }

  private async acceptRequestOnce(
    userId: number,
    requestId: number,
    manager: EntityManager,
  ) {
    const request = await this.lockRequest(requestId, manager);
    if (request.targetUserId !== userId) {
      throw socialNotFound(SocialLoopErrorCode.ConnectionRequestNotFound);
    }
    if (request.status === 'accepted') {
      const friendship = await this.upsertFriendship(request, manager);
      return {
        ...this.presentConnectionRequest(request),
        friendshipId: friendship.id,
      };
    }
    if (request.status !== 'pending') {
      throw socialConflict(
        SocialLoopErrorCode.ConnectionRequestAlreadyResolved,
      );
    }
    await this.contactPolicy.assertSociallyEligible(request.requesterId);
    await this.contactPolicy.assertSociallyEligible(request.targetUserId);
    await this.contactPolicy.assertNotBlocked(
      request.requesterId,
      request.targetUserId,
    );
    request.status = 'accepted';
    request.resolvedAt = new Date();
    await manager.getRepository(ConnectionRequest).save(request);
    const friendship = await this.upsertFriendship(request, manager);
    await this.contactPolicy.grantOpenAccess(
      request.requesterId,
      request.targetUserId,
      'connection_request',
      request.id,
      userId,
      manager,
    );
    await this.contactPolicy.grantOpenAccess(
      request.requesterId,
      request.targetUserId,
      'friendship',
      friendship.id,
      userId,
      manager,
    );
    return {
      ...this.presentConnectionRequest(request),
      friendshipId: friendship.id,
    };
  }

  private async resolveRequestOnce(
    userId: number,
    requestId: number,
    status: 'rejected' | 'cancelled',
    manager: EntityManager,
  ) {
    const request = await this.lockRequest(requestId, manager);
    const isOwner =
      status === 'cancelled'
        ? request.requesterId === userId
        : request.targetUserId === userId;
    if (!isOwner) {
      throw socialNotFound(SocialLoopErrorCode.ConnectionRequestNotFound);
    }
    if (request.status === status)
      return this.presentConnectionRequest(request);
    if (request.status !== 'pending') {
      throw socialConflict(
        SocialLoopErrorCode.ConnectionRequestAlreadyResolved,
      );
    }
    request.status = status;
    request.resolvedAt = new Date();
    await manager.getRepository(ConnectionRequest).save(request);
    return this.presentConnectionRequest(request);
  }

  private async upsertFriendship(
    request: ConnectionRequest,
    manager: EntityManager,
  ) {
    const repo = manager.getRepository(Friendship);
    const pair = this.pair(request.requesterId, request.targetUserId);
    let friendship = await repo.findOne({
      where: pair,
      lock: { mode: 'pessimistic_write' },
    });
    if (!friendship) {
      friendship = repo.create({
        ...pair,
        status: 'active',
        sourceConnectionRequestId: request.id,
        removedAt: null,
      });
    }
    friendship.status = 'active';
    friendship.sourceConnectionRequestId = request.id;
    friendship.removedAt = null;
    return repo.save(friendship);
  }

  private async lockRequest(requestId: number, manager: EntityManager) {
    const request = await manager.getRepository(ConnectionRequest).findOne({
      where: { id: requestId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!request) {
      throw socialNotFound(SocialLoopErrorCode.ConnectionRequestNotFound);
    }
    return request;
  }

  private async assertUserExists(userId: number, manager: EntityManager) {
    const user = await manager
      .getRepository(User)
      .findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
  }

  private assertTarget(userId: number, targetUserId: number) {
    if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
      throw new BadRequestException('targetUserId is required');
    }
    if (userId === targetUserId) {
      throw new BadRequestException('Cannot connect to yourself');
    }
  }

  private pair(userId: number, targetUserId: number) {
    return {
      userLowId: Math.min(userId, targetUserId),
      userHighId: Math.max(userId, targetUserId),
    };
  }

  private connectionRequestStatus(value: string): ConnectionRequestStatus {
    if (value === 'accepted' || value === 'rejected' || value === 'cancelled') {
      return value;
    }
    return 'pending';
  }

  private presentConnectionRequest(request: ConnectionRequest) {
    return {
      id: request.id,
      requesterId: request.requesterId,
      targetUserId: request.targetUserId,
      status: request.status,
      message: request.message,
      resolvedAt: request.resolvedAt,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
    };
  }
}
