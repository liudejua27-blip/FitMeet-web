import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ApiIdempotencyRecord } from './api-idempotency-record.entity';
import { MediaAsset } from './media-asset.entity';
import { OnboardingService } from './onboarding.service';
import { UserConsent } from './user-consent.entity';
import { UserProfilePhoto } from './user-profile-photo.entity';
import { UserSocialProfile } from './user-social-profile.entity';
import { User } from './user.entity';

const TERMS_VERSION = '2026-01';
const PRIVACY_VERSION = '2026-01';

type TestState = {
  user: Record<string, unknown>;
  profile: Record<string, unknown> | null;
  assets: Array<Record<string, unknown>>;
  photos: Array<Record<string, unknown>>;
  consents: Array<Record<string, unknown>>;
  idempotencyRecords: Array<Record<string, unknown>>;
  nextConsentId: number;
  nextIdempotencyId: number;
  nextPhotoId: number;
};

describe('OnboardingService', () => {
  it('does not complete with fewer than 2 approved photos', async () => {
    const { service } = makeService(
      makeState({
        photos: [photo({ id: 10, assetId: 100, isCover: true })],
        assets: [asset({ id: 100 })],
      }),
    );

    await expect(
      service.complete(
        1,
        completeDto({ photoIds: [10], coverPhotoId: 10 }),
        'idem-1',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'ONBOARDING_REQUIREMENTS_NOT_MET',
        details: expect.objectContaining({
          missing: expect.arrayContaining(['PROFILE_PHOTOS_REQUIRED']),
        }),
      }),
    });
  });

  it('reports pending review when one photo is approved and one is pending', async () => {
    const state = makeState({
      photos: [
        photo({ id: 10, assetId: 100, isCover: true }),
        photo({ id: 11, assetId: 101, status: 'pending' }),
      ],
      assets: [
        asset({ id: 100 }),
        asset({ id: 101, moderationStatus: 'pending' }),
      ],
    });
    const { service } = makeService(state);

    const status = await service.getStatus(1);

    expect(status.status).toBe('pending_review');
    expect(status.canUseSocialActions).toBe(false);
    expect(status.completion.missing).toEqual(
      expect.arrayContaining([
        'PROFILE_PHOTOS_REQUIRED',
        'PHOTO_REVIEW_PENDING',
      ]),
    );
  });

  it('requires an approved cover photo', async () => {
    const { service } = makeService(
      makeState({
        photos: [
          photo({ id: 10, assetId: 100, isCover: false }),
          photo({ id: 11, assetId: 101, isCover: false }),
        ],
        assets: [asset({ id: 100 }), asset({ id: 101 })],
      }),
    );

    await expect(
      service.complete(
        1,
        completeDto({ photoIds: [10, 11], coverPhotoId: 10 }),
        'idem-2',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        details: expect.objectContaining({
          missing: expect.arrayContaining(['COVER_PHOTO_REQUIRED']),
        }),
      }),
    });
  });

  it('requires at least 3 interests and a primary purpose', async () => {
    const { service } = makeService(makeState());

    await expect(
      service.complete(
        1,
        completeDto({
          interestTags: ['咖啡', 'Citywalk'],
          primaryPurpose: '',
        }),
        'idem-3',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        details: expect.objectContaining({
          missing: expect.arrayContaining([
            'INTERESTS_REQUIRED',
            'PRIMARY_PURPOSE_REQUIRED',
          ]),
        }),
      }),
    });
  });

  it('requires current terms and privacy consent versions', async () => {
    const { service } = makeService(makeState());

    await expect(
      service.complete(
        1,
        completeDto({
          consents: {
            termsVersion: '2025-01',
            privacyVersion: '2025-01',
            adultAttestation: true,
          },
        }),
        'idem-4',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        details: expect.objectContaining({
          missing: expect.arrayContaining([
            'TERMS_REQUIRED',
            'PRIVACY_REQUIRED',
          ]),
        }),
      }),
    });
  });

  it('returns a stable restricted business reason for underage users', async () => {
    const { service } = makeService(makeState());

    await expect(
      service.complete(
        1,
        completeDto({
          dateOfBirth: '2012-01-01',
        }),
        'idem-5',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        details: expect.objectContaining({
          missing: expect.arrayContaining(['ACCOUNT_RESTRICTED']),
        }),
      }),
    });
  });

  it('does not allow binding another user asset', async () => {
    const { service } = makeService(
      makeState({
        assets: [
          asset({ id: 100, ownerUserId: 1 }),
          asset({ id: 101, ownerUserId: 2 }),
        ],
      }),
    );

    await expect(
      service.replaceProfilePhotos(1, {
        photos: [
          { assetId: 100, isCover: true },
          { assetId: 101, isCover: false },
        ],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires an idempotency key for complete', async () => {
    const { service } = makeService(makeState());

    await expect(service.complete(1, completeDto())).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('replays the original complete response for the same idempotency key and payload', async () => {
    const state = makeState();
    const { service } = makeService(state);
    const dto = completeDto();

    const first = await service.complete(1, dto, 'idem-7');
    const second = await service.complete(1, dto, 'idem-7');

    expect(second).toEqual(first);
    expect(state.profile?.profileVersion).toBe(1);
    expect(activeConsentCount(state, 'terms')).toBe(1);
    expect(activeConsentCount(state, 'privacy')).toBe(1);
    expect(activeConsentCount(state, 'adult_attestation')).toBe(1);
    expect(
      state.photos.filter((item) => item.status !== 'deleted'),
    ).toHaveLength(2);
  });

  it('rejects idempotency key reuse with a different payload', async () => {
    const state = makeState();
    const { service } = makeService(state);

    await service.complete(1, completeDto(), 'idem-reused');

    await expect(
      service.complete(1, completeDto({ nickname: 'Zoe' }), 'idem-reused'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'IDEMPOTENCY_KEY_REUSED',
      }),
    });
  });

  it('restores onboarding status from persisted server state', async () => {
    const state = makeState();
    const first = makeService(state).service;
    await first.complete(1, completeDto(), 'idem-8');

    const second = makeService(state).service;
    const status = await second.getStatus(1);

    expect(status.status).toBe('ready');
    expect(status.canUseSocialActions).toBe(true);
    expect(status.completion.approvedPhotoCount).toBe(2);
  });

  it('does not expose pending, rejected, or deleted photos as public cover images', async () => {
    const state = makeState({
      photos: [
        photo({ id: 10, assetId: 100, isCover: true, status: 'pending' }),
        photo({ id: 11, assetId: 101, status: 'rejected' }),
      ],
      assets: [
        asset({
          id: 100,
          url: 'https://cdn.fitmeet.test/pending.webp',
          moderationStatus: 'pending',
        }),
        asset({
          id: 101,
          url: 'https://cdn.fitmeet.test/rejected.webp',
          moderationStatus: 'rejected',
        }),
      ],
    });
    const { service } = makeService(state);

    await service.replaceProfilePhotos(1, {
      photos: [
        { assetId: 100, isCover: true },
        { assetId: 101, isCover: false },
      ],
    });

    expect(state.user.avatar).toBe('');
    expect(state.user.coverUrl).toBe('');
  });

  it('persists primary purpose and distance preference on complete', async () => {
    const state = makeState();
    const { service } = makeService(state);

    await service.complete(
      1,
      completeDto({ primaryPurpose: '认真交友', distanceKm: 12 }),
      'idem-distance',
    );

    expect(state.profile?.primaryPurpose).toBe('认真交友');
    expect(state.profile?.defaultMatchRadiusKm).toBe(12);
    expect(state.profile?.relationshipGoals).toEqual(
      expect.arrayContaining(['认真交友']),
    );
  });

  it('rolls back complete writes when a later transaction step fails', async () => {
    const state = makeState();
    const { service, repos } = makeService(state);
    repos.profileRepo.save.mockRejectedValueOnce(
      new Error('profile save failed'),
    );

    await expect(
      service.complete(1, completeDto(), 'idem-rollback'),
    ).rejects.toThrow('profile save failed');

    expect(state.user.onboardingCompletedAt).toBeNull();
    expect(state.profile?.profileVersion).toBe(0);
    expect(activeConsentCount(state, 'terms')).toBe(1);
    expect(state.idempotencyRecords).toHaveLength(0);
  });

  it('serializes concurrent complete calls with the same idempotency key', async () => {
    const state = makeState();
    const { service } = makeService(state);
    const dto = completeDto();

    const [first, second] = await Promise.all([
      service.complete(1, dto, 'idem-concurrent'),
      service.complete(1, dto, 'idem-concurrent'),
    ]);

    expect(second).toEqual(first);
    expect(state.profile?.profileVersion).toBe(1);
    expect(state.idempotencyRecords).toHaveLength(1);
  });

  it('serializes concurrent photo replacement without mixing active sets', async () => {
    const state = makeState({
      assets: [
        asset({ id: 100 }),
        asset({ id: 101 }),
        asset({ id: 102 }),
        asset({ id: 103 }),
      ],
    });
    const { service } = makeService(state);

    await Promise.all([
      service.replaceProfilePhotos(1, {
        photos: [
          { assetId: 100, isCover: true },
          { assetId: 101, isCover: false },
        ],
      }),
      service.replaceProfilePhotos(1, {
        photos: [
          { assetId: 102, isCover: true },
          { assetId: 103, isCover: false },
        ],
      }),
    ]);

    const activeAssetIds = state.photos
      .filter((item) => item.status !== 'deleted')
      .map((item) => item.assetId)
      .sort();
    expect(activeAssetIds).toEqual([102, 103]);
  });
});

function makeState(overrides: Partial<TestState> = {}): TestState {
  return {
    user: {
      id: 1,
      name: 'Mia',
      dateOfBirth: '1995-01-01',
      city: '青岛',
      interestTags: ['咖啡', 'Citywalk', '羽毛球'],
      onboardingCompletedAt: null,
      onboardingVersion: 0,
      avatar: '',
      coverUrl: '',
    },
    profile: {
      userId: 1,
      profileVersion: 0,
      primaryPurpose: '找运动搭子',
      defaultMatchRadiusKm: 8,
      relationshipGoals: ['找运动搭子'],
    },
    assets: [asset({ id: 100 }), asset({ id: 101 })],
    photos: [
      photo({ id: 10, assetId: 100, isCover: true }),
      photo({ id: 11, assetId: 101 }),
    ],
    consents: [
      consent({ id: 1, consentType: 'terms', version: TERMS_VERSION }),
      consent({ id: 2, consentType: 'privacy', version: PRIVACY_VERSION }),
      consent({
        id: 3,
        consentType: 'adult_attestation',
        version: TERMS_VERSION,
      }),
    ],
    idempotencyRecords: [],
    nextConsentId: 4,
    nextIdempotencyId: 1,
    nextPhotoId: 20,
    ...overrides,
  };
}

function makeService(state: TestState) {
  const userRepo = {
    findOne: jest.fn(({ where }) =>
      where.id === state.user.id ? { ...state.user } : null,
    ),
    update: jest.fn((id, patch) => {
      if (id === state.user.id) Object.assign(state.user, patch);
      return { affected: id === state.user.id ? 1 : 0 };
    }),
  };
  const profileRepo = {
    findOne: jest.fn(({ where }) =>
      where.userId === state.user.id && state.profile
        ? { ...state.profile }
        : null,
    ),
    create: jest.fn((value) => ({ profileVersion: 0, ...value })),
    save: jest.fn((value) => {
      state.profile = { ...(state.profile ?? {}), ...value };
      return state.profile;
    }),
  };
  const mediaRepo = {
    find: jest.fn(({ where }) => {
      const ids = idsFromFindOperator(where.id);
      return state.assets.filter(
        (item) => !ids || ids.includes(Number(item.id)),
      );
    }),
  };
  const photoRepo = {
    find: jest.fn(({ where }) => {
      const ids = idsFromFindOperator(where.id);
      return state.photos
        .filter((item) => item.userId === where.userId)
        .filter((item) => !ids || ids.includes(Number(item.id)))
        .map((item) => ({ ...item }));
    }),
    findOne: jest.fn(({ where }) => {
      const found = state.photos.find((item) => item.id === where.id);
      return found ? { ...found } : null;
    }),
    update: jest.fn((where, patch) => {
      for (const item of state.photos) {
        if (item.userId === where.userId) Object.assign(item, patch);
      }
      return {
        affected: state.photos.filter((item) => item.userId === where.userId)
          .length,
      };
    }),
    create: jest.fn((value) => ({ id: state.nextPhotoId++, ...value })),
    save: jest.fn((value) => {
      const rows = Array.isArray(value) ? value : [value];
      for (const row of rows) {
        const existing = state.photos.find((item) => item.id === row.id);
        if (existing) Object.assign(existing, row);
        else state.photos.push({ ...row });
      }
      return value;
    }),
    createQueryBuilder: jest.fn(() => profilePhotoQueryBuilder(state)),
  };
  const consentRepo = {
    find: jest.fn(({ where }) =>
      state.consents
        .filter((item) => item.userId === where.userId)
        .filter((item) => matchesRevokedAt(item.revokedAt, where.revokedAt))
        .map((item) => ({ ...item })),
    ),
    findOne: jest.fn(({ where }) => {
      const found = state.consents.find(
        (item) =>
          item.userId === where.userId &&
          item.consentType === where.consentType &&
          item.version === where.version &&
          matchesRevokedAt(item.revokedAt, where.revokedAt),
      );
      return found ? { ...found } : null;
    }),
    create: jest.fn((value) => ({ id: state.nextConsentId++, ...value })),
    save: jest.fn((value) => {
      state.consents.push({ ...value });
      return value;
    }),
  };
  const idempotencyRepo = {
    createQueryBuilder: jest.fn(() => idempotencyInsertBuilder(state)),
    findOne: jest.fn(({ where }) => {
      const found = state.idempotencyRecords.find(
        (item) =>
          item.ownerUserId === where.ownerUserId &&
          item.scope === where.scope &&
          item.idempotencyKey === where.idempotencyKey,
      );
      return found ? { ...found } : null;
    }),
    save: jest.fn((value) => {
      const existing = state.idempotencyRecords.find(
        (item) => item.id === value.id,
      );
      if (existing) Object.assign(existing, value);
      else state.idempotencyRecords.push({ ...value });
      return value;
    }),
  };
  const reposByEntity = new Map<unknown, unknown>([
    [User, userRepo],
    [UserSocialProfile, profileRepo],
    [MediaAsset, mediaRepo],
    [UserProfilePhoto, photoRepo],
    [UserConsent, consentRepo],
    [ApiIdempotencyRecord, idempotencyRepo],
  ]);
  const manager = {
    getRepository: jest.fn((entity) => reposByEntity.get(entity)),
  };
  let transactionChain = Promise.resolve();
  const dataSource = {
    transaction: jest.fn(async (callback) => {
      const run = transactionChain.then(async () => {
        const snapshot = cloneState(state);
        try {
          return await callback(manager);
        } catch (error) {
          restoreState(state, snapshot);
          throw error;
        }
      });
      transactionChain = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    }),
  };

  return {
    service: new OnboardingService(
      dataSource as never,
      userRepo as never,
      profileRepo as never,
      mediaRepo as never,
      photoRepo as never,
      consentRepo as never,
    ),
    repos: {
      userRepo,
      profileRepo,
      mediaRepo,
      photoRepo,
      consentRepo,
      idempotencyRepo,
      dataSource,
    },
  };
}

function profilePhotoQueryBuilder(state: TestState) {
  const qb = {
    leftJoinAndMapOne: jest.fn(() => qb),
    setLock: jest.fn(() => qb),
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    addOrderBy: jest.fn(() => qb),
    getMany: jest.fn(() =>
      state.photos
        .filter((item) => item.userId === state.user.id)
        .filter((item) => item.status !== 'deleted')
        .map((item) => ({
          ...item,
          asset: state.assets.find((assetRow) => assetRow.id === item.assetId),
        }))
        .sort(
          (left, right) =>
            Number(left.sortOrder) - Number(right.sortOrder) ||
            Number(left.id) - Number(right.id),
        ),
    ),
  };
  return qb;
}

function idempotencyInsertBuilder(state: TestState) {
  let pendingValue: Record<string, unknown> | null = null;
  const qb = {
    insert: jest.fn(() => qb),
    values: jest.fn((value) => {
      pendingValue = value;
      return qb;
    }),
    orIgnore: jest.fn(() => qb),
    execute: jest.fn(() => {
      if (!pendingValue) return { identifiers: [] };
      const exists = state.idempotencyRecords.some(
        (item) =>
          item.ownerUserId === pendingValue?.ownerUserId &&
          item.scope === pendingValue?.scope &&
          item.idempotencyKey === pendingValue?.idempotencyKey,
      );
      if (!exists) {
        state.idempotencyRecords.push({
          id: state.nextIdempotencyId++,
          ...pendingValue,
        });
      }
      return { identifiers: [] };
    }),
  };
  return qb;
}

function cloneState(state: TestState): TestState {
  return {
    user: { ...state.user },
    profile: state.profile ? { ...state.profile } : null,
    assets: state.assets.map((item) => ({ ...item })),
    photos: state.photos.map((item) => ({ ...item })),
    consents: state.consents.map((item) => ({ ...item })),
    idempotencyRecords: state.idempotencyRecords.map((item) => ({ ...item })),
    nextConsentId: state.nextConsentId,
    nextIdempotencyId: state.nextIdempotencyId,
    nextPhotoId: state.nextPhotoId,
  };
}

function restoreState(state: TestState, snapshot: TestState) {
  state.user = snapshot.user;
  state.profile = snapshot.profile;
  state.assets = snapshot.assets;
  state.photos = snapshot.photos;
  state.consents = snapshot.consents;
  state.idempotencyRecords = snapshot.idempotencyRecords;
  state.nextConsentId = snapshot.nextConsentId;
  state.nextIdempotencyId = snapshot.nextIdempotencyId;
  state.nextPhotoId = snapshot.nextPhotoId;
}

function idsFromFindOperator(value: unknown): number[] | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) return value.map(Number);
  const maybeOperator = value as { _value?: unknown; value?: unknown };
  const inner = maybeOperator._value ?? maybeOperator.value;
  return Array.isArray(inner) ? inner.map(Number) : undefined;
}

function matchesRevokedAt(value: unknown, condition: unknown) {
  if (
    condition &&
    typeof condition === 'object' &&
    ((condition as { _type?: string })._type === 'isNull' ||
      (condition as { type?: string }).type === 'isNull')
  ) {
    return value === null || typeof value === 'undefined';
  }
  return value === condition;
}

function completeDto(overrides: Record<string, unknown> = {}) {
  return {
    expectedProfileVersion: 0,
    nickname: 'Mia',
    dateOfBirth: '1995-01-01',
    city: '青岛',
    primaryPurpose: '找运动搭子',
    purposes: ['找运动搭子', '认识新朋友'],
    interestTags: ['咖啡', 'Citywalk', '羽毛球'],
    distanceKm: 8,
    photoIds: [10, 11],
    coverPhotoId: 10,
    consents: {
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      adultAttestation: true,
    },
    ...overrides,
  } as never;
}

function asset(overrides: Record<string, unknown> = {}) {
  const id =
    typeof overrides.id === 'number' || typeof overrides.id === 'string'
      ? overrides.id
      : 100;
  return {
    id: 100,
    ownerUserId: 1,
    purpose: 'profile_photo',
    url: `https://cdn.fitmeet.test/${id}.webp`,
    width: 640,
    height: 640,
    moderationStatus: 'approved',
    ...overrides,
  };
}

function photo(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    userId: 1,
    assetId: 100,
    sortOrder: 0,
    isCover: false,
    status: 'approved',
    ...overrides,
  };
}

function consent(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    userId: 1,
    consentType: 'terms',
    version: TERMS_VERSION,
    acceptedAt: new Date('2026-01-01T00:00:00Z'),
    revokedAt: null,
    ...overrides,
  };
}

function activeConsentCount(state: TestState, consentType: string) {
  return state.consents.filter(
    (consent) =>
      consent.userId === 1 &&
      consent.revokedAt === null &&
      consent.consentType === consentType,
  ).length;
}
