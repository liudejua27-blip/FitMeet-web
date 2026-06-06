import { PostsService } from './posts.service';
import { NotFoundException } from '@nestjs/common';

const createQueryBuilder = <T>(items: T[], total = items.length) => {
  const builder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([items, total]),
  };
  return builder;
};

const repo = <T>(items: T[] = []) => ({
  createQueryBuilder: jest.fn(() => createQueryBuilder(items)),
  create: jest.fn((value) => value),
  save: jest.fn((value) => Promise.resolve({ ...value, id: 99 })),
  findOne: jest.fn(),
  remove: jest.fn((value) => Promise.resolve(value)),
  increment: jest.fn().mockResolvedValue({ affected: 1 }),
  decrement: jest.fn().mockResolvedValue({ affected: 1 }),
});

describe('PostsService unified feed', () => {
  const user = {
    id: 7,
    name: '测试用户',
    gender: '女',
    age: 26,
    city: '上海',
    color: '#C8FF00',
    singleCert: true,
    verified: true,
  };

  it('returns meet items through category=meet', async () => {
    const postRepo = repo();
    const meetRepo = repo([
      {
        id: 3,
        title: '今晚约练',
        type: 'gym',
        sport: '健身',
        time: '今晚 19:00',
        loc: '静安寺',
        city: '上海',
        address: '南京西路',
        poiId: 'poi-1',
        lat: 31.22,
        lng: 121.45,
        dist: '',
        maxSlots: 4,
        slots: 1,
        level: 'beginner',
        desc: '一起练腿',
        groupType: 'small',
        creatorType: 'peer',
        status: 'active',
        createdAt: new Date('2026-05-04T08:00:00Z'),
        user,
      },
    ]);
    const service = new PostsService(
      postRepo as never,
      {} as never,
      {} as never,
      meetRepo as never,
      { checkText: jest.fn() } as never,
    );

    const result = await service.findAll('meet', 1, 10);

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: -3,
      sourceId: 3,
      type: 'meet',
      title: '今晚约练',
      loc: '静安寺',
    });
  });

  it('preserves post location fields when creating a post payload', async () => {
    const postRepo = repo();
    postRepo.findOne.mockResolvedValue({
      id: 99,
      type: 'log',
      sport: 'run',
      text: '跑步打卡',
      tags: [],
      images: [],
      loc: '西湖',
      city: '杭州',
      address: '湖滨',
      poiId: 'poi-2',
      lat: 30.25,
      lng: 120.16,
      likesCount: 0,
      commentsCount: 0,
      viewCount: 0,
      createdAt: new Date('2026-05-04T08:00:00Z'),
      user,
    });
    const service = new PostsService(
      postRepo as never,
      {} as never,
      {} as never,
      repo() as never,
      { checkText: jest.fn() } as never,
    );

    const created = await service.create(7, {
      type: 'log',
      sport: 'run',
      text: '跑步打卡',
      loc: '西湖',
      city: '杭州',
      address: '湖滨',
      poiId: 'poi-2',
      lat: 30.25,
      lng: 120.16,
    });

    expect(postRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        loc: '西湖',
        city: '杭州',
        address: '湖滨',
        poiId: 'poi-2',
        lat: 30.25,
        lng: 120.16,
      }),
    );
    expect(created).toMatchObject({ loc: '西湖', city: '杭州' });
  });

  it('returns a stable not found error before liking a missing post', async () => {
    const postRepo = repo();
    const likeRepo = repo();
    postRepo.findOne.mockResolvedValue(null);
    const service = new PostsService(
      postRepo as never,
      likeRepo as never,
      repo() as never,
      repo() as never,
      { checkText: jest.fn() } as never,
    );

    await expect(service.toggleLike(404, 7)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(likeRepo.save).not.toHaveBeenCalled();
    expect(postRepo.increment).not.toHaveBeenCalled();
  });

  it('returns a stable not found error before saving a missing post', async () => {
    const postRepo = repo();
    const saveRepo = repo();
    postRepo.findOne.mockResolvedValue(null);
    const service = new PostsService(
      postRepo as never,
      repo() as never,
      saveRepo as never,
      repo() as never,
      { checkText: jest.fn() } as never,
    );

    await expect(service.toggleSave(404, 7)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(saveRepo.save).not.toHaveBeenCalled();
  });
});
