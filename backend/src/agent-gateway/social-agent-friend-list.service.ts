import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { cleanDisplayText } from '../common/display-text.util';
import { Follow } from '../friends/follow.entity';
import { MeetParticipant } from '../meets/meet-participant.entity';
import { Meet } from '../meets/meet.entity';
import { MessagesService } from '../messages/messages.service';
import { ConnectionRequest } from '../social-loop/connection-request.entity';
import { ContactPermissionGrant } from '../social-loop/contact-permission-grant.entity';
import { ContactPermission } from '../social-loop/contact-permission.entity';
import { Friendship } from '../social-loop/friendship.entity';
import { User } from '../users/user.entity';

export type SocialAgentFriendSummary = {
  userId: number;
  displayName: string;
  avatar: string;
  color: string;
  friendship: 'active' | 'none';
  following: boolean;
  followsMe: boolean;
  connectionRequest:
    | 'none'
    | 'pending_incoming'
    | 'pending_outgoing'
    | 'accepted';
  messagePermission: string;
  conversationId: string | null;
  messagesHref: string | null;
  hasOpenConversation: boolean;
  unread: number;
  lastMessagePreview: string;
  lastInteractionAt: string | null;
  fromPublicIntentApplication: boolean;
  publicIntentApplicationId: number | null;
  activeMeetLoop: {
    meetId: number;
    status: string;
    title: string;
    time: string;
    loc: string;
  } | null;
  nextBestAction: string;
};

export type SocialAgentFriendListOutput = {
  friends: SocialAgentFriendSummary[];
  total: number;
  source: 'friendships_contacts_conversations';
};

@Injectable()
export class SocialAgentFriendListService {
  constructor(
    @InjectRepository(Friendship)
    private readonly friendshipRepo: Repository<Friendship>,
    @InjectRepository(Follow)
    private readonly followRepo: Repository<Follow>,
    @InjectRepository(ContactPermission)
    private readonly contactPermissionRepo: Repository<ContactPermission>,
    @InjectRepository(ContactPermissionGrant)
    private readonly contactGrantRepo: Repository<ContactPermissionGrant>,
    @InjectRepository(ConnectionRequest)
    private readonly connectionRequestRepo: Repository<ConnectionRequest>,
    @InjectRepository(MeetParticipant)
    private readonly meetParticipantRepo: Repository<MeetParticipant>,
    @InjectRepository(Meet)
    private readonly meetRepo: Repository<Meet>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly messages: MessagesService,
  ) {}

  async listFriends(input: {
    ownerUserId: number;
    limit?: number | null;
  }): Promise<SocialAgentFriendListOutput> {
    const limit = this.limit(input.limit);
    const ownerUserId = input.ownerUserId;
    const [
      friendships,
      outgoingFollows,
      incomingFollows,
      contactPermissions,
      connectionRequests,
      conversations,
    ] = await Promise.all([
      this.friendshipRepo.find({
        where: [
          { userLowId: ownerUserId, status: 'active' },
          { userHighId: ownerUserId, status: 'active' },
        ],
        order: { updatedAt: 'DESC' },
        take: limit * 2,
      }),
      this.followRepo.find({
        where: { followerId: ownerUserId },
        order: { createdAt: 'DESC' },
        take: limit * 3,
      }),
      this.followRepo.find({
        where: { followingId: ownerUserId },
        order: { createdAt: 'DESC' },
        take: limit * 3,
      }),
      this.contactPermissionRepo.find({
        where: [{ userLowId: ownerUserId }, { userHighId: ownerUserId }],
        order: { updatedAt: 'DESC' },
        take: limit * 3,
      }),
      this.connectionRequestRepo.find({
        where: [{ requesterId: ownerUserId }, { targetUserId: ownerUserId }],
        order: { updatedAt: 'DESC' },
        take: limit * 3,
      }),
      this.messages.getConversations(ownerUserId),
    ]);

    const targetIds = new Set<number>();
    for (const friendship of friendships) {
      targetIds.add(this.otherUserId(ownerUserId, friendship));
    }
    for (const follow of outgoingFollows) targetIds.add(follow.followingId);
    for (const follow of incomingFollows) targetIds.add(follow.followerId);
    for (const permission of contactPermissions) {
      targetIds.add(this.otherUserId(ownerUserId, permission));
    }
    for (const request of connectionRequests) {
      targetIds.add(
        request.requesterId === ownerUserId
          ? request.targetUserId
          : request.requesterId,
      );
    }
    for (const conversation of conversations) {
      const userId = this.number(conversation.userId);
      if (userId && userId !== ownerUserId) targetIds.add(userId);
    }

    const users = await this.loadUsers([...targetIds]);
    const userMap = new Map(users.map((user) => [user.id, user]));
    const grantMap = await this.loadGrantMap(contactPermissions);
    const meetMap = await this.loadActiveMeetMap(ownerUserId, [...targetIds]);
    const friendshipMap = new Map(
      friendships.map((friendship) => [
        this.otherUserId(ownerUserId, friendship),
        friendship,
      ]),
    );
    const outgoingFollowIds = new Set(
      outgoingFollows.map((follow) => follow.followingId),
    );
    const incomingFollowIds = new Set(
      incomingFollows.map((follow) => follow.followerId),
    );
    const contactMap = new Map(
      contactPermissions.map((permission) => [
        this.otherUserId(ownerUserId, permission),
        permission,
      ]),
    );
    const connectionMap = this.latestConnectionRequestMap(
      ownerUserId,
      connectionRequests,
    );
    const conversationMap = new Map(
      conversations
        .map((conversation) => [
          this.number(conversation.userId),
          conversation as Record<string, unknown>,
        ])
        .filter(([userId]) => userId && userId !== ownerUserId) as Array<
        [number, Record<string, unknown>]
      >,
    );

    const friends = [...targetIds]
      .filter((userId) => userId !== ownerUserId)
      .map((targetUserId) => {
        const user = userMap.get(targetUserId);
        const contact = contactMap.get(targetUserId) ?? null;
        const grant = contact ? (grantMap.get(contact.id) ?? null) : null;
        const conversation = conversationMap.get(targetUserId) ?? null;
        const conversationId =
          this.text(contact?.conversationId) ||
          this.text(conversation?.conversationId) ||
          null;
        const friendship = friendshipMap.get(targetUserId) ?? null;
        const friendshipState: SocialAgentFriendSummary['friendship'] =
          friendship?.status === 'active' ? 'active' : 'none';
        const connectionRequest =
          friendshipState === 'active'
            ? 'accepted'
            : this.connectionRequestState(
                ownerUserId,
                connectionMap.get(targetUserId) ?? null,
              );
        return {
          userId: targetUserId,
          displayName: cleanDisplayText(user?.name, `用户 #${targetUserId}`),
          avatar: cleanDisplayText(user?.avatar, user?.name?.[0] ?? '?'),
          color: cleanDisplayText(user?.color, '#38BDF8'),
          friendship: friendshipState,
          following: outgoingFollowIds.has(targetUserId),
          followsMe: incomingFollowIds.has(targetUserId),
          connectionRequest,
          messagePermission: contact?.status ?? 'none',
          conversationId,
          messagesHref: conversationId
            ? `/messages?conversationId=${encodeURIComponent(conversationId)}`
            : null,
          hasOpenConversation: Boolean(conversationId),
          unread: this.number(conversation?.unread) ?? 0,
          lastMessagePreview: cleanDisplayText(conversation?.lastMessage, ''),
          lastInteractionAt: this.latestIso([
            friendship?.updatedAt,
            contact?.updatedAt,
            connectionMap.get(targetUserId)?.updatedAt,
            meetMap.get(targetUserId)?.updatedAt,
          ]),
          fromPublicIntentApplication:
            grant?.sourceType === 'public_intent_application',
          publicIntentApplicationId:
            grant?.sourceType === 'public_intent_application'
              ? this.number(grant.sourceId)
              : null,
          activeMeetLoop: this.presentMeet(meetMap.get(targetUserId) ?? null),
          nextBestAction: this.nextBestAction({
            connectionRequest,
            conversationId,
            contactStatus: contact?.status ?? 'none',
            activeMeet: meetMap.get(targetUserId) ?? null,
          }),
        };
      })
      .sort((a, b) =>
        String(b.lastInteractionAt ?? '').localeCompare(
          String(a.lastInteractionAt ?? ''),
        ),
      )
      .slice(0, limit);

    return {
      friends,
      total: friends.length,
      source: 'friendships_contacts_conversations',
    };
  }

  private async loadUsers(userIds: number[]): Promise<User[]> {
    if (userIds.length === 0) return [];
    return this.userRepo.find({ where: { id: In([...new Set(userIds)]) } });
  }

  private async loadGrantMap(permissions: ContactPermission[]) {
    const permissionIds = permissions.map((permission) => permission.id);
    if (permissionIds.length === 0)
      return new Map<number, ContactPermissionGrant>();
    const grants = await this.contactGrantRepo.find({
      where: { permissionId: In(permissionIds), status: 'active' },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    const map = new Map<number, ContactPermissionGrant>();
    for (const grant of grants) {
      if (!map.has(grant.permissionId)) map.set(grant.permissionId, grant);
    }
    return map;
  }

  private async loadActiveMeetMap(ownerUserId: number, targetIds: number[]) {
    if (targetIds.length === 0) return new Map<number, Meet>();
    const ownerParticipants = await this.meetParticipantRepo.find({
      where: {
        userId: ownerUserId,
        status: In(['pending', 'active']),
      },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    const meetIds = ownerParticipants.map((participant) => participant.meetId);
    if (meetIds.length === 0) return new Map<number, Meet>();
    const targetParticipants = await this.meetParticipantRepo.find({
      where: {
        userId: In([...new Set(targetIds)]),
        meetId: In(meetIds),
        status: In(['pending', 'active']),
      },
      order: { createdAt: 'DESC' },
      take: 200,
    });
    if (targetParticipants.length === 0) return new Map<number, Meet>();
    const meets = await this.meetRepo.find({
      where: {
        id: In([...new Set(targetParticipants.map((item) => item.meetId))]),
        status: In(['pending', 'active', 'matched', 'activity_created']),
      },
    });
    const meetById = new Map(meets.map((meet) => [meet.id, meet]));
    const map = new Map<number, Meet>();
    for (const participant of targetParticipants) {
      const meet = meetById.get(participant.meetId);
      if (meet && !map.has(participant.userId))
        map.set(participant.userId, meet);
    }
    return map;
  }

  private latestConnectionRequestMap(
    ownerUserId: number,
    requests: ConnectionRequest[],
  ): Map<number, ConnectionRequest> {
    const map = new Map<number, ConnectionRequest>();
    for (const request of requests) {
      const targetUserId =
        request.requesterId === ownerUserId
          ? request.targetUserId
          : request.requesterId;
      if (!map.has(targetUserId)) map.set(targetUserId, request);
    }
    return map;
  }

  private connectionRequestState(
    ownerUserId: number,
    request: ConnectionRequest | null,
  ): SocialAgentFriendSummary['connectionRequest'] {
    if (!request) return 'none';
    if (request.status === 'accepted') return 'accepted';
    if (request.status !== 'pending') return 'none';
    return request.requesterId === ownerUserId
      ? 'pending_outgoing'
      : 'pending_incoming';
  }

  private nextBestAction(input: {
    connectionRequest: SocialAgentFriendSummary['connectionRequest'];
    conversationId: string | null;
    contactStatus: string;
    activeMeet: Meet | null;
  }): string {
    if (input.activeMeet) return 'continue_meet_loop';
    if (input.conversationId) return 'open_conversation';
    if (input.contactStatus === 'opener_available') return 'draft_opener';
    if (input.connectionRequest === 'pending_incoming')
      return 'review_connection_request';
    if (input.connectionRequest === 'pending_outgoing') return 'wait_for_reply';
    return 'suggest_reconnect';
  }

  private presentMeet(
    meet: Meet | null,
  ): SocialAgentFriendSummary['activeMeetLoop'] {
    if (!meet) return null;
    return {
      meetId: meet.id,
      status: meet.status,
      title: cleanDisplayText(meet.title, '约练'),
      time: cleanDisplayText(meet.time, ''),
      loc: cleanDisplayText(meet.loc, ''),
    };
  }

  private otherUserId(
    ownerUserId: number,
    value: Friendship | ContactPermission,
  ): number {
    return value.userLowId === ownerUserId ? value.userHighId : value.userLowId;
  }

  private latestIso(values: Array<Date | null | undefined>): string | null {
    const times = values
      .map((value) => (value instanceof Date ? value.getTime() : 0))
      .filter((value) => value > 0);
    if (times.length === 0) return null;
    return new Date(Math.max(...times)).toISOString();
  }

  private limit(value: number | null | undefined): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 20;
    return Math.min(100, Math.max(1, Math.trunc(numeric)));
  }

  private number(value: unknown): number | null {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  private text(value: unknown): string {
    return cleanDisplayText(value, '');
  }
}
