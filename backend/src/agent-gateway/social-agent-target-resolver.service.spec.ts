import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { SocialAgentTargetResolverService } from './social-agent-target-resolver.service';

type MockRepository<T extends object = Record<string, unknown>> = {
  findOne: jest.Mock<Promise<T | null>, [unknown?]>;
};

const repo = <
  T extends object = Record<string, unknown>,
>(): MockRepository<T> => ({
  findOne: jest.fn<Promise<T | null>, [unknown?]>(),
});

function makeResolver() {
  const candidateRepo = repo();
  const publicIntentRepo = repo();
  const userSocialRequestRepo = repo();
  const userRepo = {
    findOne: jest.fn<
      Promise<{ id: number } | null>,
      [{ where?: { id?: number } }?]
    >((options) =>
      Promise.resolve(options?.where?.id ? { id: options.where.id } : null),
    ),
  };
  const safety = {
    getMutualBlockUserIds: jest.fn().mockResolvedValue(new Set<number>()),
  };
  const resolver = new SocialAgentTargetResolverService(
    candidateRepo as never,
    publicIntentRepo as never,
    userSocialRequestRepo as never,
    userRepo as never,
    safety as never,
  );

  return {
    resolver,
    candidateRepo,
    publicIntentRepo,
    userSocialRequestRepo,
    userRepo,
    safety,
  };
}

describe('SocialAgentTargetResolverService', () => {
  it('resolves nested candidate target user aliases', async () => {
    const { resolver, userRepo, safety } = makeResolver();

    await expect(
      resolver.resolveCandidateTargetUser(
        { candidate: { candidateUserId: '42' } },
        1,
      ),
    ).resolves.toBe(42);
    expect(userRepo.findOne).toHaveBeenCalledWith({ where: { id: 42 } });
    expect(safety.getMutualBlockUserIds).toHaveBeenCalledWith(1);
  });

  it('rejects public intent targets that disagree with explicit input', async () => {
    const { resolver, publicIntentRepo } = makeResolver();
    publicIntentRepo.findOne.mockResolvedValue({ id: 'intent_5', userId: 5 });

    await expect(
      resolver.resolveCandidateTargetUser(
        { publicIntentId: 'intent_5', targetUserId: 6 },
        1,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uses candidate record lookup when the input points back to the owner', async () => {
    const { resolver, candidateRepo } = makeResolver();
    candidateRepo.findOne.mockResolvedValue({ id: 12, candidateUserId: 8 });

    await expect(
      resolver.resolveCandidateTargetUser(
        { targetUserId: 1, candidateRecordId: 12 },
        1,
      ),
    ).resolves.toBe(8);
    expect(candidateRepo.findOne).toHaveBeenCalledWith({ where: { id: 12 } });
  });

  it('blocks target users that have mutual block state with the owner', async () => {
    const { resolver, safety } = makeResolver();
    safety.getMutualBlockUserIds.mockResolvedValue(new Set([2]));

    await expect(
      resolver.resolveCandidateTargetUser({ targetUserId: 2 }, 1),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
