import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
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

const ONBOARDING_VERSION = 1;
const MINIMUM_AGE = 18;
const MINIMUM_APPROVED_PHOTOS = 2;
const MINIMUM_INTERESTS = 3;
const TERMS_VERSION = '2026-01';
const PRIVACY_VERSION = '2026-01';

@Injectable()
export class OnboardingService {
  constructor(
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

  async getStatus(userId: number) {
    const [user, profile, photos, consents] = await Promise.all([
      this.requireUser(userId),
      this.profileRepo.findOne({ where: { userId } }),
      this.listProfilePhotoRows(userId),
      this.consentRepo.find({ where: { userId, revokedAt: IsNull() } }),
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

  async listProfilePhotos(userId: number) {
    const photos = await this.listProfilePhotoRows(userId);
    return photos.map((photo) => this.presentPhoto(photo));
  }

  async replaceProfilePhotos(userId: number, dto: UpdateProfilePhotosDto) {
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

    const assets = await this.mediaRepo.find({ where: { id: In(assetIds) } });
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    for (const input of inputs) {
      const asset = byId.get(input.assetId);
      if (!asset) throw new NotFoundException('上传资源不存在');
      if (asset.ownerUserId !== userId) {
        throw new ForbiddenException('不能绑定其他用户上传的照片');
      }
    }

    await this.photoRepo.update({ userId }, { status: 'deleted' });

    let coverAssigned = inputs.some((photo) => photo.isCover);
    const rows = inputs.map((input, index) =>
      this.photoRepo.create({
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

    await this.photoRepo.save(rows);
    await this.syncUserCover(userId);
    return this.listProfilePhotos(userId);
  }

  async deleteProfilePhoto(userId: number, photoId: number) {
    const photo = await this.photoRepo.findOne({ where: { id: photoId } });
    if (!photo || photo.userId !== userId || photo.status === 'deleted') {
      throw new NotFoundException('资料照片不存在');
    }
    photo.status = 'deleted';
    await this.photoRepo.save(photo);
    await this.syncUserCover(userId);
    return { id: photo.id, status: photo.status };
  }

  async complete(
    userId: number,
    dto: CompleteOnboardingDto,
    idempotencyKey?: string,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    const [user, profile] = await Promise.all([
      this.requireUser(userId),
      this.profileRepo.findOne({ where: { userId } }),
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

    const photos = await this.photoRepo.find({
      where: { userId, id: In(dto.photoIds) },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    if (photos.length !== dto.photoIds.length) {
      throw new ConflictException(
        this.requirementsError(['PROFILE_PHOTOS_REQUIRED']),
      );
    }
    if (photos.some((photo) => photo.status === 'deleted')) {
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
    await this.ensurePhotoAssetsOwnedByUser(userId, photos);

    const consents = await this.previewConsents(userId, dto);
    const candidateUser = {
      ...user,
      name: dto.nickname,
      dateOfBirth: dto.dateOfBirth,
      city: dto.city,
      interestTags: dto.interestTags,
    } as User;
    const candidateProfile = {
      relationshipGoals: [
        dto.primaryPurpose.trim(),
        ...dto.purposes.map((purpose) => purpose.trim()),
      ].filter(Boolean),
    } as UserSocialProfile;
    const completion = this.computeCompletion(
      candidateUser,
      photos,
      consents,
      candidateProfile,
    );
    const missing = new Set<OnboardingMissingReason>(completion.missing);
    if (!dto.primaryPurpose.trim()) missing.add('PRIMARY_PURPOSE_REQUIRED');
    if (dto.consents.termsVersion !== TERMS_VERSION)
      missing.add('TERMS_REQUIRED');
    if (dto.consents.privacyVersion !== PRIVACY_VERSION) {
      missing.add('PRIVACY_REQUIRED');
    }
    if (!dto.consents.adultAttestation)
      missing.add('ADULT_ATTESTATION_REQUIRED');
    if (completion.pendingPhotoCount > 0) missing.add('PHOTO_REVIEW_PENDING');

    if (missing.size > 0) {
      throw new ConflictException(this.requirementsError([...missing]));
    }

    await this.saveConsents(userId, dto);
    await this.userRepo.update(userId, {
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
      this.profileRepo.create({
        userId,
        profileVersion: 0,
      });
    savedProfile.nickname = dto.nickname.trim();
    savedProfile.city = dto.city.trim();
    savedProfile.interestTags = dto.interestTags;
    savedProfile.relationshipGoals = candidateProfile.relationshipGoals;
    savedProfile.profileVersion = savedProfile.profileVersion + 1;
    await this.profileRepo.save(savedProfile);

    const status = await this.getStatus(userId);
    return {
      ...status,
      idempotencyKey,
    };
  }

  private async requireUser(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');
    return user;
  }

  private async listProfilePhotoRows(userId: number) {
    return this.photoRepo
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
  ) {
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
    if ((profile?.relationshipGoals ?? []).filter(Boolean).length === 0) {
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
    completion: ReturnType<OnboardingService['computeCompletion']>,
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

  private async previewConsents(userId: number, dto: CompleteOnboardingDto) {
    const existing = await this.consentRepo.find({
      where: { userId, revokedAt: IsNull() },
    });
    const now = new Date();
    return [
      ...existing,
      this.consentRepo.create({
        userId,
        consentType: 'terms',
        version: dto.consents.termsVersion,
        acceptedAt: now,
        revokedAt: null,
      }),
      this.consentRepo.create({
        userId,
        consentType: 'privacy',
        version: dto.consents.privacyVersion,
        acceptedAt: now,
        revokedAt: null,
      }),
      this.consentRepo.create({
        userId,
        consentType: 'adult_attestation',
        version: TERMS_VERSION,
        acceptedAt: now,
        revokedAt: null,
      }),
    ];
  }

  private async saveConsents(userId: number, dto: CompleteOnboardingDto) {
    const rows: Array<[UserConsentType, string]> = [
      ['terms', dto.consents.termsVersion],
      ['privacy', dto.consents.privacyVersion],
      ['adult_attestation', TERMS_VERSION],
    ];
    const now = new Date();
    for (const [consentType, version] of rows) {
      const existing = await this.consentRepo.findOne({
        where: { userId, consentType, version, revokedAt: IsNull() },
      });
      if (existing) continue;
      await this.consentRepo.save(
        this.consentRepo.create({
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
  ) {
    const assets = await this.mediaRepo.find({
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
    await this.photoRepo.save(photos);
  }

  private async syncUserCover(userId: number) {
    const photos = await this.listProfilePhotoRows(userId);
    const cover = photos.find(
      (photo) => photo.isCover && photo.status === 'approved',
    );
    if (cover?.asset?.url) {
      await this.userRepo.update(userId, {
        avatar: cover.asset.url,
        coverUrl: cover.asset.url,
      });
      return;
    }

    await this.userRepo.update(userId, {
      avatar: '',
      coverUrl: '',
    });
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
