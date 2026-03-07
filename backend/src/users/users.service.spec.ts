import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { User } from './user.entity';
import { Follow } from '../friends/follow.entity';
import { Post } from '../posts/post.entity';
import { Meet } from '../meets/meet.entity';
import { MeetParticipant } from '../meets/meet-participant.entity';
import { Coach } from '../coaches/coach.entity';

const mockRepo = () => ({
  findOne: jest.fn(),
  count: jest.fn(),
  update: jest.fn(),
  find: jest.fn(),
});

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useFactory: mockRepo },
        { provide: getRepositoryToken(Follow), useFactory: mockRepo },
        { provide: getRepositoryToken(Post), useFactory: mockRepo },
        { provide: getRepositoryToken(Meet), useFactory: mockRepo },
        { provide: getRepositoryToken(MeetParticipant), useFactory: mockRepo },
        { provide: getRepositoryToken(Coach), useFactory: mockRepo },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
