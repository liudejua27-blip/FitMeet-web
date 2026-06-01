import { SocialRequestStatus } from './entities/social-request.entity';
import { AgentGatewayService } from './agent-gateway.service';

function makeService(publicIntentRepo: Record<string, unknown>) {
  const empty = {} as never;
  return new AgentGatewayService(
    empty,
    empty,
    empty,
    empty,
    empty,
    empty,
    empty,
    empty,
    empty,
    publicIntentRepo as never,
    empty,
    empty,
    empty,
    empty,
    empty,
    empty,
    empty,
    empty,
    empty,
    empty,
    empty,
    empty,
    empty,
  );
}

function makeQueryBuilder() {
  const queryBuilder = {
    orderBy: jest.fn(),
    take: jest.fn(),
    skip: jest.fn(),
    andWhere: jest.fn(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  };
  queryBuilder.orderBy.mockReturnValue(queryBuilder);
  queryBuilder.take.mockReturnValue(queryBuilder);
  queryBuilder.skip.mockReturnValue(queryBuilder);
  queryBuilder.andWhere.mockReturnValue(queryBuilder);
  return queryBuilder;
}

describe('AgentGatewayService public social intents', () => {
  it('defaults the public hall feed to active public intents only', async () => {
    const queryBuilder = makeQueryBuilder();
    const service = makeService({
      createQueryBuilder: jest.fn(() => queryBuilder),
    });

    const result = await service.listPublicSocialIntents();

    expect(queryBuilder.andWhere).toHaveBeenCalledWith('intent.mode = :mode', {
      mode: 'public',
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'intent.status = :status',
      {
        status: SocialRequestStatus.Active,
      },
    );
    expect(result.metadata.filters.status).toBe(SocialRequestStatus.Active);
  });

  it('keeps the public mode guard when an explicit public status is requested', async () => {
    const queryBuilder = makeQueryBuilder();
    const service = makeService({
      createQueryBuilder: jest.fn(() => queryBuilder),
    });

    await service.listPublicSocialIntents({
      status: SocialRequestStatus.Matched,
    });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith('intent.mode = :mode', {
      mode: 'public',
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'intent.status = :status',
      {
        status: SocialRequestStatus.Matched,
      },
    );
  });
});
