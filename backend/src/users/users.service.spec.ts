import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { User } from './user.entity';
import { Follow } from '../friends/follow.entity';
import { Meet } from '../meets/meet.entity';
import { MeetParticipant } from '../meets/meet-participant.entity';

const mockRepo = () => ({
  findOne: jest.fn(),
  count: jest.fn(),
  update: jest.fn(),
  find: jest.fn(),
});

describe('UsersService', () => {
  let service: UsersService;
  let userRepo: ReturnType<typeof mockRepo>;
  let followRepo: ReturnType<typeof mockRepo>;
  let meetRepo: ReturnType<typeof mockRepo>;
  let meetParticipantRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    userRepo = mockRepo();
    followRepo = mockRepo();
    meetRepo = mockRepo();
    meetParticipantRepo = mockRepo();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Follow), useValue: followRepo },
        { provide: getRepositoryToken(Meet), useValue: meetRepo },
        {
          provide: getRepositoryToken(MeetParticipant),
          useValue: meetParticipantRepo,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('serializes public user profiles without private account, location, or fixture fields', async () => {
    const now = new Date('2026-06-23T00:00:00Z');
    userRepo.findOne.mockResolvedValue({
      id: 1,
      email: 'agent-smoke-owner@ourfitmeet.cn',
      password: 'hashed-password',
      phone: '13800000000',
      wechatOpenId: 'wechat-open-id',
      name: 'Agent Smoke Owner',
      avatar: '',
      color: '#2F7BFF',
      gender: 'unknown',
      age: 28,
      city: '青岛',
      lat: 36.0607,
      lng: 120.3826,
      locationUpdatedAt: now,
      acceptNearbyMatch: true,
      gym: '市南-五四广场',
      bio: 'FitMeet Agent real API smoke account.',
      coverUrl: null,
      singleCert: false,
      verified: true,
      interestTags: ['咖啡', 'agent smoke'],
      trainingDays: 12,
      trainingCount: 5,
      caloriesBurned: 900,
      bestRecords: [{ name: 'agent-smoke-owner', value: 'agent-api-smoke' }],
      trustScore: 3,
      socialTrustCount: 1,
      createdAt: now,
      updatedAt: now,
    } as User);
    followRepo.count.mockResolvedValue(0);
    meetRepo.count.mockResolvedValue(0);
    meetParticipantRepo.count.mockResolvedValue(0);

    const result = await service.findById(1);

    expect(result).toMatchObject({
      id: 1,
      name: 'FitMeet 用户',
      bio: '这位用户正在寻找同频的运动社交伙伴。',
      interestTags: ['咖啡'],
      followers: 0,
      following: 0,
      meetCount: 0,
    });
    expect(result).not.toHaveProperty('email');
    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('phone');
    expect(result).not.toHaveProperty('wechatOpenId');
    expect(result).not.toHaveProperty('lat');
    expect(result).not.toHaveProperty('lng');
    expect(result).not.toHaveProperty('locationUpdatedAt');
    expect(result).not.toHaveProperty('acceptNearbyMatch');
    expect(result).not.toHaveProperty('bestRecords');
  });
});
