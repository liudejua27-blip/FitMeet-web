import { Follow } from '../friends/follow.entity';
import { MeetParticipant } from '../meets/meet-participant.entity';
import { Meet } from '../meets/meet.entity';
import { ConnectionRequest } from '../social-loop/connection-request.entity';
import { ContactPermissionGrant } from '../social-loop/contact-permission-grant.entity';
import { ContactPermission } from '../social-loop/contact-permission.entity';
import { Friendship } from '../social-loop/friendship.entity';
import { User } from '../users/user.entity';
import { SocialAgentFriendListService } from './social-agent-friend-list.service';

describe('SocialAgentFriendListService', () => {
  it('combines friendships, follows, contact permissions, conversations, and meet loop state', async () => {
    const friendshipRepo = {
      find: jest.fn().mockResolvedValue([
        makeFriendship({
          id: 1,
          userLowId: 7,
          userHighId: 8,
          updatedAt: new Date('2026-06-03T00:00:00.000Z'),
        }),
      ]),
    };
    const followRepo = {
      find: jest
        .fn()
        .mockResolvedValueOnce([
          makeFollow({ id: 11, followerId: 7, followingId: 9 }),
        ])
        .mockResolvedValueOnce([
          makeFollow({ id: 12, followerId: 10, followingId: 7 }),
        ]),
    };
    const contactPermissionRepo = {
      find: jest.fn().mockResolvedValue([
        makeContactPermission({
          id: 21,
          userLowId: 7,
          userHighId: 8,
          status: 'open',
          conversationId: 'conversation_8',
          updatedAt: new Date('2026-06-04T00:00:00.000Z'),
        }),
      ]),
    };
    const contactGrantRepo = {
      find: jest.fn().mockResolvedValue([
        makeContactGrant({
          id: 31,
          permissionId: 21,
          sourceType: 'public_intent_application',
          sourceId: '42',
        }),
      ]),
    };
    const connectionRequestRepo = {
      find: jest.fn().mockResolvedValue([
        makeConnectionRequest({
          id: 41,
          requesterId: 10,
          targetUserId: 7,
          status: 'pending',
          updatedAt: new Date('2026-06-05T00:00:00.000Z'),
        }),
      ]),
    };
    const meetParticipantRepo = {
      find: jest
        .fn()
        .mockResolvedValueOnce([
          makeMeetParticipant({ id: 51, userId: 7, meetId: 61 }),
        ])
        .mockResolvedValueOnce([
          makeMeetParticipant({ id: 52, userId: 8, meetId: 61 }),
        ]),
    };
    const meetRepo = {
      find: jest.fn().mockResolvedValue([
        makeMeet({
          id: 61,
          title: '周末散步',
          status: 'active',
          time: '周末下午',
          loc: '青岛中山公园',
        }),
      ]),
    };
    const userRepo = {
      find: jest
        .fn()
        .mockResolvedValue([
          makeUser({ id: 8, name: '活动搭子' }),
          makeUser({ id: 9, name: '关注对象' }),
          makeUser({ id: 10, name: '申请人' }),
        ]),
    };
    const messages = {
      getConversations: jest.fn().mockResolvedValue([
        {
          userId: 8,
          conversationId: 'conversation_8',
          unread: 2,
          lastMessage: '周末见',
        },
        {
          userId: 9,
          conversationId: 'conversation_9',
          unread: 0,
          lastMessage: '下次再约',
        },
      ]),
    };
    const service = new SocialAgentFriendListService(
      friendshipRepo as never,
      followRepo as never,
      contactPermissionRepo as never,
      contactGrantRepo as never,
      connectionRequestRepo as never,
      meetParticipantRepo as never,
      meetRepo as never,
      userRepo as never,
      messages as never,
    );

    const result = await service.listFriends({
      ownerUserId: 7,
      limit: 10,
    });

    expect(messages.getConversations).toHaveBeenCalledWith(7);
    expect(result).toMatchObject({
      source: 'friendships_contacts_conversations',
      total: 3,
      friends: expect.arrayContaining([
        expect.objectContaining({
          userId: 8,
          displayName: '活动搭子',
          friendship: 'active',
          messagePermission: 'open',
          conversationId: 'conversation_8',
          messagesHref: '/messages?conversationId=conversation_8',
          fromPublicIntentApplication: true,
          publicIntentApplicationId: 42,
          activeMeetLoop: expect.objectContaining({
            meetId: 61,
            status: 'active',
            title: '周末散步',
          }),
          nextBestAction: 'continue_meet_loop',
        }),
        expect.objectContaining({
          userId: 9,
          following: true,
          followsMe: false,
          hasOpenConversation: true,
          nextBestAction: 'open_conversation',
        }),
        expect.objectContaining({
          userId: 10,
          followsMe: true,
          connectionRequest: 'pending_incoming',
          nextBestAction: 'review_connection_request',
        }),
      ]),
    });
  });
});

function makeFriendship(overrides: Partial<Friendship>): Friendship {
  return {
    id: 1,
    userLowId: 7,
    userHighId: 8,
    status: 'active',
    sourceConnectionRequestId: null,
    removedAt: null,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  } as Friendship;
}

function makeFollow(overrides: Partial<Follow>): Follow {
  return {
    id: 1,
    followerId: 7,
    followingId: 8,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  } as Follow;
}

function makeContactPermission(
  overrides: Partial<ContactPermission>,
): ContactPermission {
  return {
    id: 1,
    userLowId: 7,
    userHighId: 8,
    status: 'none',
    conversationId: null,
    openerSenderId: null,
    openerContextType: null,
    openerContextId: null,
    openerSentAt: null,
    openedAt: null,
    closedAt: null,
    metadata: {},
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  } as ContactPermission;
}

function makeContactGrant(
  overrides: Partial<ContactPermissionGrant>,
): ContactPermissionGrant {
  return {
    id: 1,
    permissionId: 1,
    sourceType: 'friendship',
    sourceId: '1',
    status: 'active',
    grantedByUserId: 7,
    revokedAt: null,
    metadata: {},
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  } as ContactPermissionGrant;
}

function makeConnectionRequest(
  overrides: Partial<ConnectionRequest>,
): ConnectionRequest {
  return {
    id: 1,
    requesterId: 7,
    targetUserId: 8,
    status: 'pending',
    message: '',
    resolvedAt: null,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  } as ConnectionRequest;
}

function makeMeetParticipant(
  overrides: Partial<MeetParticipant>,
): MeetParticipant {
  return {
    id: 1,
    userId: 7,
    meetId: 61,
    status: 'active',
    tripShareToken: null,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  } as MeetParticipant;
}

function makeMeet(overrides: Partial<Meet>): Meet {
  return {
    id: 61,
    title: '约练',
    type: 'walk',
    sport: '散步',
    time: '周末',
    loc: '青岛',
    address: '',
    poiId: null,
    lat: null,
    lng: null,
    dist: '',
    price: '免费',
    slots: 0,
    maxSlots: 4,
    level: '全部',
    desc: '',
    feeType: null,
    groupType: null,
    creatorType: null,
    status: 'active',
    tripShareToken: null,
    activityId: null,
    rating: 0,
    meetCount: 0,
    userId: 7,
    city: '青岛',
    startAt: null,
    autoCancelAt: null,
    cancelReason: null,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  } as Meet;
}

function makeUser(overrides: Partial<User>): User {
  return {
    id: 8,
    email: 'user@example.com',
    password: '',
    phone: '',
    wechatOpenId: '',
    name: 'FitMeet 用户',
    avatar: '',
    color: '#38BDF8',
    gender: '',
    age: 0,
    dateOfBirth: null,
    city: '青岛',
    lat: null,
    lng: null,
    locationUpdatedAt: null,
    acceptNearbyMatch: true,
    gym: '',
    bio: '',
    coverUrl: null,
    singleCert: false,
    verified: false,
    interestTags: [],
    trainingDays: 0,
    trainingCount: 0,
    caloriesBurned: 0,
    bestRecords: [],
    trustScore: 0,
    socialTrustCount: 0,
    onboardingCompletedAt: null,
    onboardingVersion: 0,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  } as User;
}
