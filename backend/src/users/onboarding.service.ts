import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import { ApiIdempotencyRecord } from './api-idempotency-record.entity';
import { MediaAsset } from './media-asset.entity';
import { UserConsent, UserConsentType } from './user-consent.entity';
import { UserProfilePhoto } from './user-profile-photo.entity';
import { UserSocialProfile } from './user-social-profile.entity';
import { User } from './user.entity';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';
import { UpdateProfilePhotosDto } from './dto/update-profile-photos.dto';

export type OnboardingStatus =
  | 'incomplete'
  | 'pending_review'
  | 'ready'
  | 'restricted';

export type OnboardingMissingReason =
  | 'TERMS_REQUIRED'
  | 'PRIVACY_REQUIRED'
  | 'ADULT_ATTESTATION_REQUIRED'
  | 'BIRTH_DATE_REQUIRED'
  | 'NICKNAME_REQUIRED'
  | 'CITY_REQUIRED'
  | 'PRIMARY_PURPOSE_REQUIRED'
  | 'INTERESTS_REQUIRED'
  | 'PROFILE_PHOTOS_REQUIRED'
  | 'PHOTO_REVIEW_PENDING'
  | 'COVER_PHOTO_REQUIRED'
  | 'ACCOUNT_RESTRICTED';

type OnboardingCompletion = {
  missing: OnboardingMissingReason[];
  approvedPhotoCount: number;
  pendingPhotoCount: number;
  rejectedPhotoCount: number;
  hasCoverPhoto: boolean;
  profileVersion: number;
};

type OnboardingStatusResponse = {
  version: number;
  status: OnboardingStatus;
  canUseSocialActions: boolean;
  requirements: {
    minimumAge: number;
    minimumApprovedPhotos: number;
    minimumInterests: number;
    termsVersion: string;
    privacyVersion: string;
  };
  completion: OnboardingCompletion;
  completedAt: Date | null;
};

type CompleteOnboardingResponse = OnboardingStatusResponse & {
  idempotencyKey: string;
};

type OnboardingRepositories = {
  userRepo: Repository<User>;
  profileRepo: Repository<UserSocialProfile>;
  mediaRepo: Repository<MediaAsset>;
  photoRepo: Repository<UserProfilePhoto>;
  consentRepo: Repository<UserConsent>;
  idempotencyRepo?: Repository<ApiIdempotencyRecord>;
};

const ONBOARDING_VERSION = 1;
const MINIMUM_AGE = 18;
const MINIMUM_APPROVED_PHOTOS = 2;
const MINIMUM_INTERESTS = 3;
const TERMS_VERSION = '2026-01';
const PRIVACY_VERSION = '2026-01';
const COMPLETE_ONBOARDING_SCOPE = 'users.me.onboarding.complete';
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class OnboardingService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserSocialProfile)
    private readonly profileRepo: Repository<UserSocialProfile>,
    @InjectRepository(MediaAsset)
    private readonly mediaRepo: Repository<MediaAsset>,
    @InjectRepository(UserProfilePhoto)
    private readonly photoRepo: Repository<UserProfilePhoto>,
    @InjectRepository(UserConsent)
    private readonly consentRepo: Repository<UserConsent>,
  ) {}

  async getStatus(userId: number): Promise<OnboardingStatusResponse> {
    return this.getStatusWithRepos(userId, this.repos());
  }

  async listProfilePhotos(userId: number) {
    const photos = await this.listProfilePhotoRows(userId, this.repos());
    return photos.map((photo) => this.presentPhoto(photo));
  }

  async replaceProfilePhotos(userId: number, dto: UpdateProfilePhotosDto) {
    return this.dataSource.transaction(async (manager) => {
      const repos = this.repos(manager);
      await this.requireUser(userId, repos, true);
      await this.lockProfilePhotos(userId, repos.photoRepo);
      return this.replaceProfilePhotosWithRepos(userId, dto, repos);
    });
  }

  async deleteProfilePhoto(userId: number, photoId: number) {
    return this.dataSource.transaction(async (manager) => {
      const repos = this.repos(manager);
      await this.requireUser(userId, repos, true);
      const photo = await repos.photoRepo.findOne({ where: { id: photoId } });
      if (!photo || photo.userId !== userId || photo.status === 'deleted') {
        throw new NotFoundException('资料照片不存在');
      }
      photo.status = 'deleted';
      await repos.photoRepo.save(photo);
      await this.syncUserCover(userId, repos);
      return { id: photo.id, status: photo.status };
    });
  }

  async complete(
    userId: number,
    dto: CompleteOnboardingDto,
    idempotencyKey?: string,
  ): Promise<CompleteOnboardingResponse | Record<string, unknown>> {
    const normalizedKey = idempotencyKey?.trim();
    if (!normalizedKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    const requestHash = this.hashRequest(dto);
    return this.dataSource.transaction(async (manager) => {
      const repos = this.repos(manager);
      if (!repos.idempotencyRepo) {
        throw new BadRequestException(
          'Idempotency repository is not configured',
        );
      }

      const idempotency = await this.claimIdempotencyRecord(
        repos.idempotencyRepo,
        userId,
        normalizedKey,
        requestHash,
      );
      if (idempotency.status === 'completed' && idempotency.responseBody) {
        return idempotency.responseBody;
      }
      if (idempotency.status === 'failed' && idempotency.responseBody) {
        throw new ConflictException(idempotency.responseBody);
      }

      try {
        const response = await this.completeWithRepos(
          userId,
          dto,
          normalizedKey,
          repos,
        );
        idempotency.status = 'completed';
        idempotency.responseStatus = 200;
        idempotency.responseBody = response as unknown as Record<
          string,
          unknown
        >;
        await repos.idempotencyRepo.save(idempotency);
        return response;
      } catch (error) {
        idempotency.status = 'failed';
        idempotency.responseStatus = this.errorStatus(error);
        idempotency.responseBody = this.errorBody(error);
        await repos.idempotencyRepo.save(idempotency);
        throw error;
      }
    });
  }

  private async getStatusWithRepos(
    userId: number,
    repos: OnboardingRepositories,
  ): Promise<OnboardingStatusResponse> {
    const [user, profile, photos, consents] = await Promise.all([
      this.requireUser(userId, repos),
      repos.profileRepo.findOne({ where: { userId } }),
      this.listProfilePhotoRows(userId, repos),
      repos.consentRepo.find({ where: { userId, revokedAt: IsNull() } }),
    ]);

    const completion = this.computeCompletion(user, photos, consents, profile);
    return {
      version: ONBOARDING_VERSION,
      status: this.computeStatus(user, completion),
      canUseSocialActions: completion.missing.length === 0,
      requirements: this.requirements(),
      completion,
      completedAt: user.onboardingCompletedAt,
    };
  }

  private async replaceProfilePhotosWithRepos(
    userId: number,
    dto: UpdateProfilePhotosDto,
    repos: OnboardingRepositories,
  ) {
    const inputs = dto.photos ?? [];
    if (inputs.length > 6) {
      throw new BadRequestException('最多只能设置 6 张资料照片');
    }
    if (inputs.filter((photo) => photo.isCover === true).length > 1) {
      throw new BadRequestException('只能设置一张封面资料照片');
    }
    const assetIds = [...new Set(inputs.map((photo) => photo.assetId))];
    if (assetIds.length !== inputs.length) {
      throw new BadRequestException('资料照片不能重复绑定同一个 assetId');
    }

    const assets = await repos.mediaRepo.find({ where: { id: In(assetIds) } });
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    for (const input of inputs) {
      const asset = byId.get(input.assetId);
      if (!asset) throw new NotFoundException('上传资源不存在');
      if (asset.ownerUserId !== userId) {
        throw new ForbiddenException('不能绑定其他用户上传的照片');
      }
    }

    await repos.photoRepo.update({ userId }, { status: 'deleted' });

    let coverAssigned = inputs.some((photo) => photo.isCover);
    const rows = inputs.map((input, index) =>
      repos.photoRepo.create({
        userId,
        assetId: input.assetId,
        sortOrder: input.sortOrder ?? index,
        isCover: input.isCover === true || (!coverAssigned && index === 0),
        status: this.statusFromAsset(byId.get(input.assetId)!),
      }),
    );
    if (!coverAssigned && rows.length > 0) {
      rows[0].isCover = true;
      coverAssigned = true;
    }

    await repos.photoRepo.save(rows);
    await this.syncUserCover(userId, repos);
    const photos = await this.listProfilePhotoRows(userId, repos);
    return photos.map((photo) => this.presentPhoto(photo));
  }

  private async completeWithRepos(
    userId: number,
    dto: CompleteOnboardingDto,
    idempotencyKey: string,
    repos: OnboardingRepositories,
  ): Promise<CompleteOnboardingResponse> {
    const [user, profile] = await Promise.all([
      this.requireUser(userId, repos, true),
      repos.profileRepo.findOne({
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      }),
    ]);
    if (
      typeof dto.expectedProfileVersion === 'number' &&
      profile &&
      profile.profileVersion !== dto.expectedProfileVersion
    ) {
      throw new ConflictException({
        code: 'PROFILE_VERSION_CONFLICT',
        message: 'Profile version has changed.',
        details: { currentProfileVersion: profile.profileVersion },
      });
    }

    const photos = await repos.photoRepo.find({
      where: { userId, id: In(dto.photoIds) },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    if (
      photos.length !== dto.photoIds.length ||
      photos.some((photo) => photo.status === 'deleted')
    ) {
      throw new ConflictException(
        this.requirementsError(['PROFILE_PHOTOS_REQUIRED']),
      );
    }
    const cover = photos.find((photo) => photo.id === dto.coverPhotoId);
    if (!cover) {
      throw new ConflictException(
        this.requirementsError(['COVER_PHOTO_REQUIRED']),
      );
    }
    await this.ensurePhotoAssetsOwnedByUser(userId, photos, repos);

    const consents = await this.previewConsents(userId, dto, repos);
    const candidateUser = {
      ...user,
      name: dto.nickname,
      dateOfBirth: dto.dateOfBirth,
      city: dto.city,
      interestTags: dto.interestTags,
    } as User;
    const relationshipGoals = [
      dto.primaryPurpose.trim(),
      ...dto.purposes.map((purpose) => purpose.trim()),
    ].filter(Boolean);
    const candidateProfile = {
      primaryPurpose: dto.primaryPurpose.trim(),
      defaultMatchRadiusKm: dto.distanceKm,
      relationshipGoals,
    } as UserSocialProfile;
    const completion = this.computeCompletion(
      candidateUser,
      photos,
      consents,
      candidateProfile,
    );
    const missing = new Set<OnboardingMissingReason>(completion.missing);
    if (!dto.primaryPurpose.trim()) missing.add('PRIMARY_PURPOSE_REQUIRED');
    if (dto.consents.termsVersion !== TERMS_VERSION) {
      missing.add('TERMS_REQUIRED');
    }
    if (dto.consents.privacyVersion !== PRIVACY_VERSION) {
      missing.add('PRIVACY_REQUIRED');
    }
    if (!dto.consents.adultAttestation) {
      missing.add('ADULT_ATTESTATION_REQUIRED');
    }
    if (completion.pendingPhotoCount > 0) missing.add('PHOTO_REVIEW_PENDING');
    if (!cover.isCover || cover.status !== 'approved') {
      missing.add('COVER_PHOTO_REQUIRED');
    }

    if (missing.size > 0) {
      throw new ConflictException(this.requirementsError([...missing]));
    }

    await this.saveConsents(userId, dto, repos);
    await repos.userRepo.update(userId, {
      name: dto.nickname.trim(),
      dateOfBirth: dto.dateOfBirth,
      age: this.ageFromDateOfBirth(dto.dateOfBirth),
      city: dto.city.trim(),
      interestTags: dto.interestTags,
      onboardingCompletedAt: new Date(),
      onboardingVersion: ONBOARDING_VERSION,
    });
    const savedProfile =
      profile ??
      repos.profileRepo.create({
        userId,
        profileVersion: 0,
      });
    savedProfile.nickname = dto.nickname.trim();
    savedProfile.primaryPurpose = dto.primaryPurpose.trim();
    savedProfile.defaultMatchRadiusKm = dto.distanceKm;
    savedProfile.city = dto.city.trim();
    savedProfile.interestTags = dto.interestTags;
    savedProfile.relationshipGoals = relationshipGoals;
    savedProfile.profileVersion = savedProfile.profileVersion + 1;
    await repos.profileRepo.save(savedProfile);

    const status = await this.getStatusWithRepos(userId, repos);
    return {
      ...status,
      idempotencyKey,
    };
  }

  private async requireUser(
    userId: number,
    repos: OnboardingRepositories,
    lock = false,
  ) {
    const user = await repos.userRepo.findOne({
      where: { id: userId },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!user) throw new NotFoundException('用户不存在');
    return user;
  }

  private async listProfilePhotoRows(
    userId: number,
    repos: OnboardingRepositories,
  ) {
    return repos.photoRepo
      .createQueryBuilder('photo')
      .leftJoinAndMapOne(
        'photo.asset',
        MediaAsset,
        'asset',
        'asset.id = photo.assetId',
      )
      .where('photo.userId = :userId', { userId })
      .andWhere("photo.status != 'deleted'")
      .orderBy('photo.sortOrder', 'ASC')
      .addOrderBy('photo.id', 'ASC')
      .getMany() as Promise<Array<UserProfilePhoto & { asset?: MediaAsset }>>;
  }

  private presentPhoto(photo: UserProfilePhoto & { asset?: MediaAsset }) {
    return {
      id: photo.id,
      assetId: photo.assetId,
      url: photo.asset?.url ?? '',
      sortOrder: photo.sortOrder,
      isCover: photo.isCover,
      status: photo.status,
      moderationStatus: photo.asset?.moderationStatus ?? photo.status,
      width: photo.asset?.width ?? 0,
      height: photo.asset?.height ?? 0,
    };
  }

  private statusFromAsset(asset: MediaAsset): UserProfilePhoto['status'] {
    if (asset.moderationStatus === 'approved') return 'approved';
    if (asset.moderationStatus === 'rejected') return 'rejected';
    return 'pending';
  }

  private computeCompletion(
    user: User,
    photos: UserProfilePhoto[],
    consents: UserConsent[],
    profile?: UserSocialProfile | null,
  ): OnboardingCompletion {
    const missing: OnboardingMissingReason[] = [];
    const approvedPhotoCount = photos.filter(
      (photo) => photo.status === 'approved',
    ).length;
    const pendingPhotoCount = photos.filter(
      (photo) => photo.status === 'pending',
    ).length;
    const rejectedPhotoCount = photos.filter(
      (photo) => photo.status === 'rejected',
    ).length;
    const hasCoverPhoto = photos.some(
      (photo) => photo.isCover && photo.status === 'approved',
    );

    if (!this.hasConsent(consents, 'terms', TERMS_VERSION)) {
      missing.push('TERMS_REQUIRED');
    }
    if (!this.hasConsent(consents, 'privacy', PRIVACY_VERSION)) {
      missing.push('PRIVACY_REQUIRED');
    }
    if (!this.hasConsent(consents, 'adult_attestation', TERMS_VERSION)) {
      missing.push('ADULT_ATTESTATION_REQUIRED');
    }
    if (!user.dateOfBirth) missing.push('BIRTH_DATE_REQUIRED');
    if (
      user.dateOfBirth &&
      this.ageFromDateOfBirth(user.dateOfBirth) < MINIMUM_AGE
    ) {
      missing.push('ACCOUNT_RESTRICTED');
    }
    if (!user.name?.trim()) missing.push('NICKNAME_REQUIRED');
    if (!user.city?.trim()) missing.push('CITY_REQUIRED');
    if (!profile?.primaryPurpose?.trim()) {
      missing.push('PRIMARY_PURPOSE_REQUIRED');
    }
    if ((user.interestTags ?? []).filter(Boolean).length < MINIMUM_INTERESTS) {
      missing.push('INTERESTS_REQUIRED');
    }
    if (approvedPhotoCount < MINIMUM_APPROVED_PHOTOS) {
      missing.push('PROFILE_PHOTOS_REQUIRED');
    }
    if (pendingPhotoCount > 0) missing.push('PHOTO_REVIEW_PENDING');
    if (!hasCoverPhoto) missing.push('COVER_PHOTO_REQUIRED');

    return {
      missing: [...new Set(missing)],
      approvedPhotoCount,
      pendingPhotoCount,
      rejectedPhotoCount,
      hasCoverPhoto,
      profileVersion: profile?.profileVersion ?? user.onboardingVersion ?? 0,
    };
  }

  private computeStatus(
    user: User,
    completion: OnboardingCompletion,
  ): OnboardingStatus {
    if (completion.missing.includes('ACCOUNT_RESTRICTED')) return 'restricted';
    if (completion.missing.length === 0) return 'ready';
    if (
      completion.pendingPhotoCount > 0 &&
      completion.approvedPhotoCount + completion.pendingPhotoCount >=
        MINIMUM_APPROVED_PHOTOS
    ) {
      return 'pending_review';
    }
    return user.onboardingCompletedAt ? 'restricted' : 'incomplete';
  }

  private requirements() {
    return {
      minimumAge: MINIMUM_AGE,
      minimumApprovedPhotos: MINIMUM_APPROVED_PHOTOS,
      minimumInterests: MINIMUM_INTERESTS,
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
    };
  }

  private requirementsError(missing: OnboardingMissingReason[]) {
    return {
      statusCode: 409,
      code: 'ONBOARDING_REQUIREMENTS_NOT_MET',
      message: 'Onboarding requirements are not satisfied.',
      details: { missing },
    };
  }

  private hasConsent(
    consents: UserConsent[],
    type: UserConsentType,
    version: string,
  ) {
    return consents.some(
      (consent) =>
        consent.consentType === type &&
        consent.version === version &&
        consent.revokedAt === null,
    );
  }

  private async previewConsents(
    userId: number,
    dto: CompleteOnboardingDto,
    repos: OnboardingRepositories,
  ) {
    const existing = await repos.consentRepo.find({
      where: { userId, revokedAt: IsNull() },
    });
    const now = new Date();
    return [
      ...existing,
      repos.consentRepo.create({
        userId,
        consentType: 'terms',
        version: dto.consents.termsVersion,
        acceptedAt: now,
        revokedAt: null,
      }),
      repos.consentRepo.create({
        userId,
        consentType: 'privacy',
        version: dto.consents.privacyVersion,
        acceptedAt: now,
        revokedAt: null,
      }),
      repos.consentRepo.create({
        userId,
        consentType: 'adult_attestation',
        version: TERMS_VERSION,
        acceptedAt: now,
        revokedAt: null,
      }),
    ];
  }

  private async saveConsents(
    userId: number,
    dto: CompleteOnboardingDto,
    repos: OnboardingRepositories,
  ) {
    const rows: Array<[UserConsentType, string]> = [
      ['terms', dto.consents.termsVersion],
      ['privacy', dto.consents.privacyVersion],
      ['adult_attestation', TERMS_VERSION],
    ];
    const now = new Date();
    for (const [consentType, version] of rows) {
      const existing = await repos.consentRepo.findOne({
        where: { userId, consentType, version, revokedAt: IsNull() },
      });
      if (existing) continue;
      await repos.consentRepo.save(
        repos.consentRepo.create({
          userId,
          consentType,
          version,
          acceptedAt: now,
          revokedAt: null,
        }),
      );
    }
  }

  private async ensurePhotoAssetsOwnedByUser(
    userId: number,
    photos: UserProfilePhoto[],
    repos: OnboardingRepositories,
  ) {
    const assets = await repos.mediaRepo.find({
      where: { id: In(photos.map((photo) => photo.assetId)) },
    });
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    for (const photo of photos) {
      const asset = byId.get(photo.assetId);
      if (!asset) {
        throw new ConflictException(
          this.requirementsError(['PROFILE_PHOTOS_REQUIRED']),
        );
      }
      if (asset.ownerUserId !== userId) {
        throw new ForbiddenException('不能使用其他用户上传的照片');
      }
      photo.status = this.statusFromAsset(asset);
    }
    await repos.photoRepo.save(photos);
  }

  private async syncUserCover(userId: number, repos: OnboardingRepositories) {
    const photos = await this.listProfilePhotoRows(userId, repos);
    const cover = photos.find(
      (photo) => photo.isCover && photo.status === 'approved',
    );
    if (cover?.asset?.url) {
      await repos.userRepo.update(userId, {
        avatar: cover.asset.url,
        coverUrl: cover.asset.url,
      });
      return;
    }

    await repos.userRepo.update(userId, {
      avatar: '',
      coverUrl: '',
    });
  }

  private repos(manager?: EntityManager): OnboardingRepositories {
    if (!manager) {
      return {
        userRepo: this.userRepo,
        profileRepo: this.profileRepo,
        mediaRepo: this.mediaRepo,
        photoRepo: this.photoRepo,
        consentRepo: this.consentRepo,
      };
    }
    return {
      userRepo: manager.getRepository(User),
      profileRepo: manager.getRepository(UserSocialProfile),
      mediaRepo: manager.getRepository(MediaAsset),
      photoRepo: manager.getRepository(UserProfilePhoto),
      consentRepo: manager.getRepository(UserConsent),
      idempotencyRepo: manager.getRepository(ApiIdempotencyRecord),
    };
  }

  private async lockProfilePhotos(
    userId: number,
    photoRepo: Repository<UserProfilePhoto>,
  ) {
    await photoRepo
      .createQueryBuilder('photo')
      .setLock('pessimistic_write')
      .where('photo.userId = :userId', { userId })
      .getMany();
  }

  private async claimIdempotencyRecord(
    idempotencyRepo: Repository<ApiIdempotencyRecord>,
    userId: number,
    idempotencyKey: string,
    requestHash: string,
  ) {
    await idempotencyRepo
      .createQueryBuilder()
      .insert()
      .values({
        ownerUserId: userId,
        scope: COMPLETE_ONBOARDING_SCOPE,
        idempotencyKey,
        requestHash,
        status: 'processing',
        responseStatus: null,
        responseBody: null,
        expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
      })
      .orIgnore()
      .execute();

    const record = await idempotencyRepo.findOne({
      where: {
        ownerUserId: userId,
        scope: COMPLETE_ONBOARDING_SCOPE,
        idempotencyKey,
      },
      lock: { mode: 'pessimistic_write' },
    });
    if (!record) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_RECORD_UNAVAILABLE',
        message: 'Idempotency record could not be acquired.',
      });
    }
    if (record.requestHash !== requestHash) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Idempotency-Key was reused with a different request payload.',
      });
    }
    return record;
  }

  private hashRequest(dto: CompleteOnboardingDto) {
    return createHash('sha256')
      .update(JSON.stringify(this.sortJson(dto)))
      .digest('hex');
  }

  private sortJson(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.sortJson(item));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, this.sortJson(item)]),
    );
  }

  private errorStatus(error: unknown) {
    return typeof (error as { getStatus?: unknown }).getStatus === 'function'
      ? (error as { getStatus: () => number }).getStatus()
      : 500;
  }

  private errorBody(error: unknown) {
    if (
      typeof (error as { getResponse?: unknown }).getResponse === 'function'
    ) {
      const response = (error as { getResponse: () => unknown }).getResponse();
      return typeof response === 'object' && response !== null
        ? (response as Record<string, unknown>)
        : { message: String(response) };
    }
    return {
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  private ageFromDateOfBirth(dateOfBirth: string) {
    const date = new Date(dateOfBirth);
    if (Number.isNaN(date.getTime())) return 0;
    const now = new Date();
    let age = now.getUTCFullYear() - date.getUTCFullYear();
    const monthDiff = now.getUTCMonth() - date.getUTCMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && now.getUTCDate() < date.getUTCDate())
    ) {
      age -= 1;
    }
    return age;
  }
}
