import { NotFoundException } from '@nestjs/common';
import { CommentsService } from './comments.service';

const repo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  create: jest.fn((value) => value),
  save: jest.fn((value) => Promise.resolve({ ...value, id: 99 })),
  increment: jest.fn().mockResolvedValue({ affected: 1 }),
});

describe('CommentsService', () => {
  it('returns a stable not found error before listing comments for a missing post', async () => {
    const commentRepo = repo();
    const postRepo = repo();
    postRepo.findOne.mockResolvedValue(null);
    const service = new CommentsService(
      commentRepo as never,
      postRepo as never,
      { checkText: jest.fn() } as never,
    );

    await expect(service.findByPost(404)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(commentRepo.find).not.toHaveBeenCalled();
  });

  it('does not create orphan comments for a missing post', async () => {
    const commentRepo = repo();
    const postRepo = repo();
    const moderation = { checkText: jest.fn() };
    postRepo.findOne.mockResolvedValue(null);
    const service = new CommentsService(
      commentRepo as never,
      postRepo as never,
      moderation as never,
    );

    await expect(
      service.create(404, 7, { text: '今晚跑步吗？' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(moderation.checkText).not.toHaveBeenCalled();
    expect(commentRepo.save).not.toHaveBeenCalled();
    expect(postRepo.increment).not.toHaveBeenCalled();
  });

  it('returns a stable not found error before liking a missing comment', async () => {
    const commentRepo = repo();
    commentRepo.findOne.mockResolvedValue(null);
    const service = new CommentsService(
      commentRepo as never,
      repo() as never,
      { checkText: jest.fn() } as never,
    );

    await expect(service.likeComment(404)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(commentRepo.increment).not.toHaveBeenCalled();
  });
});
