import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  ActivityProofPolicy,
  ActivitySafetyLevel,
  ActivityTemplate,
  ActivityType,
} from './entities/activity-template.entity';
import {
  IcebreakerTask,
  SocialActivity,
  SocialActivityStatus,
} from './entities/activity.entity';
import {
  ActivityProof,
  ActivityProofPrivacyMode,
  ActivityProofStatus,
  ActivityProofType,
} from './entities/activity-proof.entity';
import {
  CheckinActivityDto,
  CreateActivityDto,
  SubmitActivityProofDto,
} from './dto/activity.dto';
import { ACTIVITY_TEMPLATES } from './activity-templates.seed';
import { ModerationService } from '../moderation/moderation.service';
import { MeetsService } from '../meets/meets.service';
import { User } from '../users/user.entity';
import {
  UserSocialRequest,
  UserSocialRequestStatus,
} from '../social-requests/social-request.entity';
import { AIService } from '../ai/ai.service';
import { PublicSocialIntent } from '../agent-gateway/entities/public-social-intent.entity';
import { SocialRequestStatus as PublicSocialIntentStatus } from '../agent-gateway/entities/social-request.entity';
import { LifeGraphService } from '../life-graph/life-graph.service';
import { LifeGraphBehaviorEventType } from '../life-graph/life-graph.enums';
import { RealtimeEventService } from '../realtime/realtime-event.service';

const NIGHT_TIPS = [
  '当前为夜间时段（22:00 - 06:00），请优先选择有照明、人流稳定的地点。',
  '建议提前把活动地点和时间告知一位你信任的朋友。',
];

const ALCOHOL_RE =
  /酒|啤酒|白酒|红酒|烧酒|清酒|鸡尾酒|wine|beer|alcohol|whisky|cocktail|bar\b/i;

/** Reject locationApprox strings that smell like raw GPS coords. */
const COORD_LIKE_RE = /-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/;

/** Strip everything past 100 chars and fail closed on coord-looking input. */
function sanitizeLocationApprox(raw: string | undefined): string {
  const v = (raw ?? '').trim();
  if (!v) return '';
  if (COORD_LIKE_RE.test(v)) {
    throw new BadRequestException(
      '位置只接受大致区域描述（如 "朝阳公园西门附近"），请勿提交精确经纬度。',
    );
  }
  return v.slice(0, 100);
}

/** Best-effort extraction of an OSS object key from a stored photo URL.
 *  Returns null when the URL doesn't look like an OSS asset (e.g. CDN
 *  rewrite, external host) — caller should fall back to text-only review. */
function tryExtractOssObjectName(url: string): string | null {
  try {
    const u = new URL(url);
    // Pattern A: <bucket>.<endpoint>/<object>
    // Pattern B: <endpoint>/<bucket>/<object>
    // We can't reliably know the bucket here, so just return the path
    // without the leading slash. checkOssImage will use the configured
    // bucket; if the URL is from a different bucket the call will fail
    // and the caller will surface that as a moderation error.
    const path = u.pathname.replace(/^\/+/, '');
    return path || null;
  } catch {
    return null;
  }
}

@Injectable()
export class ActivitiesService implements OnModuleInit {
  private readonly logger = new Logger(ActivitiesService.name);

  constructor(
    @InjectRepository(ActivityTemplate)
    private readonly templateRepo: Repository<ActivityTemplate>,
    @InjectRepository(SocialActivity)
    private readonly activityRepo: Repository<SocialActivity>,
    @InjectRepository(ActivityProof)
    private readonly proofRepo: Repository<ActivityProof>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserSocialRequest)
    private readonly socialRequestRepo: Repository<UserSocialRequest>,
    @InjectRepository(PublicSocialIntent)
    private readonly publicIntentRepo: Repository<PublicSocialIntent>,
    private readonly moderation: ModerationService,
    @Inject(forwardRef(() => MeetsService))
    private readonly meetsService: MeetsService,
    private readonly ai: AIService,
    @Optional()
    private readonly realtime?: RealtimeEventService,
    @Optional()
    private readonly lifeGraph?: LifeGraphService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedTemplates();
  }

  private async seedTemplates(): Promise<void> {
    try {
      const existing = await this.templateRepo.find();
      const byType = new Map(existing.map((t) => [t.type, t]));
      for (const seed of ACTIVITY_TEMPLATES) {
        if (byType.has(seed.type)) continue;
        await this.templateRepo.save(this.templateRepo.create(seed));
        this.logger.log(`Seeded activity template: ${seed.type}`);
      }
    } catch (err) {
      this.logger.warn(
        `Skipped activity-template seeding: ${(err as Error).message}`,
      );
    }
  }

  // ---------- templates ----------

  async listTemplates(): Promise<ActivityTemplate[]> {
    return this.templateRepo.find({ order: { id: 'ASC' } });
  }

  async getTemplateByType(
    type: ActivityType,
  ): Promise<ActivityTemplate | null> {
    return this.templateRepo.findOne({ where: { type } });
  }

  // ---------- safety ----------

  /** Returns extra safety tips based on context (time, content). */
  buildContextualSafetyTips(
    base: string[],
    ctx: { startTime?: Date | null; description?: string; title?: string },
  ): string[] {
    const tips = [...base];
    const start = ctx.startTime ?? null;
    if (start) {
      const hour = start.getHours();
      if (hour >= 22 || hour < 6) tips.push(...NIGHT_TIPS);
    }
    const text = `${ctx.title ?? ''} ${ctx.description ?? ''}`;
    if (ALCOHOL_RE.test(text)) {
      tips.push(
        '检测到酒精相关内容：FitMeet 第一版不建议安排饮酒活动，请考虑改为咖啡 / 散步等更安全的选项。',
      );
    }
    if (/上门|家里|住所|公寓|宿舍|home|apartment/i.test(text)) {
      tips.push(
        '不建议第一次见面就去对方私人住所，请优先选择咖啡店、公园、健身房等公共空间。',
      );
    }
    tips.push('上传照片仅用于活动完成证明，FitMeet 不强制露脸。');
    return Array.from(new Set(tips));
  }

  // ---------- create ----------

  async create(
    creatorId: number,
    dto: CreateActivityDto,
  ): Promise<SocialActivity> {
    const template = await this.getTemplateByType(dto.type);

    const startTime = dto.startTime ? new Date(dto.startTime) : null;
    const duration =
      dto.durationMinutes ?? template?.defaultDurationMinutes ?? 30;
    const endTime = startTime
      ? new Date(startTime.getTime() + duration * 60_000)
      : null;

    const icebreakerSource =
      dto.icebreakerTasks && dto.icebreakerTasks.length > 0
        ? dto.icebreakerTasks
        : (template?.defaultIcebreakers ?? []);
    const icebreakers: IcebreakerTask[] = icebreakerSource.map((text) => ({
      id: randomUUID(),
      text,
      done: false,
    }));

    const safetyTips = this.buildContextualSafetyTips(
      template?.safetyTips ?? [],
      {
        startTime,
        description: dto.description,
        title: dto.title,
      },
    );

    const participantIds = [creatorId];
    if (dto.invitedUserId && dto.invitedUserId !== creatorId) {
      participantIds.push(dto.invitedUserId);
    }

    const entity = this.activityRepo.create({
      creatorId,
      participantIds,
      socialRequestId: dto.socialRequestId ?? null,
      meetId: dto.meetId ?? null,
      matchedCandidateId: dto.matchedCandidateId ?? null,
      type: dto.type,
      title: dto.title || template?.title || '社交活动',
      description: dto.description ?? template?.description ?? '',
      locationName: dto.locationName ?? '',
      city: dto.city ?? '',
      lat: dto.lat ?? null,
      lng: dto.lng ?? null,
      startTime,
      endTime,
      status: dto.invitedUserId
        ? SocialActivityStatus.PendingConfirm
        : SocialActivityStatus.Draft,
      icebreakerTasks: icebreakers,
      safetyTips,
      proofRequired: dto.proofRequired ?? true,
      proofPolicy:
        dto.proofPolicy ??
        template?.defaultProofPolicy ??
        ActivityProofPolicy.MutualOrProof,
      safetyLevel: template?.safetyLevel ?? ActivitySafetyLevel.Low,
      checkinByUserId: {},
      confirmByUserId: {},
      reviewByUserId: {},
    });
    const saved = await this.activityRepo.save(entity);
    if (dto.invitedUserId && dto.invitedUserId !== creatorId) {
      this.emitActivityEvent(saved, 'activity:invitation', dto.invitedUserId, {
        invitedByUserId: creatorId,
      });
    }

    // Side effect 1: if this activity came from a Meet, write back the meet's
    // status + activityId so MeetPage can route into 履约.
    if (saved.meetId) {
      try {
        await this.meetsService.markActivityCreated(saved.meetId, saved.id);
      } catch (err) {
        this.logger.warn(
          `Failed to mark meet ${saved.meetId} as activity_created: ${(err as Error).message}`,
        );
      }
    }

    // Side effect 2: if this came from a SocialRequest, advance it to
    // ActivityCreated so the AI social loop reflects progress.
    if (saved.socialRequestId) {
      try {
        const req = await this.socialRequestRepo.findOne({
          where: { id: saved.socialRequestId },
        });
        if (
          req &&
          req.status !== UserSocialRequestStatus.Completed &&
          req.status !== UserSocialRequestStatus.ActivityCreated
        ) {
          req.status = UserSocialRequestStatus.ActivityCreated;
          await this.socialRequestRepo.save(req);
          await this.updatePublicIntentStatus(
            req.id,
            PublicSocialIntentStatus.Active,
          );
        }
      } catch (err) {
        this.logger.warn(
          `Failed to advance socialRequest ${saved.socialRequestId} to activity_created: ${(err as Error).message}`,
        );
      }
    }

    return saved;
  }

  // ---------- read ----------

  async findOne(id: number): Promise<SocialActivity> {
    const activity = await this.activityRepo.findOne({ where: { id } });
    if (!activity) throw new NotFoundException('Activity not found');
    return activity;
  }

  async findIcebreakers(id: number): Promise<IcebreakerTask[]> {
    const activity = await this.findOne(id);
    return activity.icebreakerTasks ?? [];
  }

  async listProofs(activityId: number): Promise<ActivityProof[]> {
    return this.proofRepo.find({
      where: { activityId },
      order: { createdAt: 'DESC' },
    });
  }

  // ---------- participation ----------

  private assertParticipant(activity: SocialActivity, userId: number): void {
    if (!activity.participantIds.includes(userId)) {
      throw new ForbiddenException(
        'You are not a participant of this activity.',
      );
    }
  }

  async join(id: number, userId: number): Promise<SocialActivity> {
    const activity = await this.findOne(id);
    if (activity.status === SocialActivityStatus.Cancelled) {
      throw new BadRequestException('Activity is cancelled.');
    }
    if (activity.status === SocialActivityStatus.Completed) {
      throw new BadRequestException('Activity already completed.');
    }
    if (!activity.participantIds.includes(userId)) {
      activity.participantIds = [...activity.participantIds, userId];
    }
    if (activity.status === SocialActivityStatus.Draft) {
      activity.status = SocialActivityStatus.PendingConfirm;
    }
    const saved = await this.activityRepo.save(activity);
    this.emitActivityEvent(saved, 'activity:invitation', userId, {
      joinedByUserId: userId,
    });
    return saved;
  }

  async confirm(id: number, userId: number): Promise<SocialActivity> {
    const activity = await this.findOne(id);
    this.assertParticipant(activity, userId);
    activity.confirmByUserId = {
      ...activity.confirmByUserId,
      [String(userId)]: new Date().toISOString(),
    };
    if (
      activity.participantIds.length >= 2 &&
      activity.participantIds.every(
        (uid) => activity.confirmByUserId[String(uid)],
      )
    ) {
      if (
        activity.status === SocialActivityStatus.Draft ||
        activity.status === SocialActivityStatus.PendingConfirm
      ) {
        activity.status = SocialActivityStatus.Confirmed;
      }
    }
    const saved = await this.activityRepo.save(activity);
    this.emitActivityEvent(saved, 'activity:confirmed', userId, {
      confirmedByUserId: userId,
    });
    return saved;
  }

  async checkin(
    id: number,
    userId: number,
    dto: CheckinActivityDto,
  ): Promise<{ activity: SocialActivity; proof: ActivityProof }> {
    const activity = await this.findOne(id);
    this.assertParticipant(activity, userId);
    activity.checkinByUserId = {
      ...activity.checkinByUserId,
      [String(userId)]: new Date().toISOString(),
    };
    if (
      activity.status === SocialActivityStatus.Confirmed ||
      activity.status === SocialActivityStatus.PendingConfirm
    ) {
      activity.status = SocialActivityStatus.InProgress;
    }
    await this.activityRepo.save(activity);
    this.emitActivityEvent(activity, 'activity:checked_in', userId, {
      checkedInByUserId: userId,
    });

    const proof = await this.proofRepo.save(
      this.proofRepo.create({
        activityId: id,
        userId,
        proofType: ActivityProofType.Checkin,
        photoUrl: null,
        note: '签到',
        locationApprox: dto.locationApprox ?? '',
        status: ActivityProofStatus.Accepted,
        privacyMode: ActivityProofPrivacyMode.Private,
      }),
    );
    return { activity, proof };
  }

  async submitProof(
    id: number,
    userId: number,
    dto: SubmitActivityProofDto,
  ): Promise<ActivityProof> {
    const activity = await this.findOne(id);
    this.assertParticipant(activity, userId);
    if (activity.status === SocialActivityStatus.Cancelled) {
      throw new BadRequestException(
        'Cannot submit proof for cancelled activity.',
      );
    }

    const privacyMode = dto.privacyMode ?? this.inferPrivacyMode(dto);
    const locationApprox = sanitizeLocationApprox(dto.locationApprox);

    // ── Moderation ──────────────────────────────────────────────
    // 1. Always run text moderation on free-text fields.
    if (dto.note) this.moderation.checkText(dto.note);
    if (locationApprox) this.moderation.checkText(locationApprox);

    // 2. If a photoUrl is supplied, route through Aliyun image moderation
    //    when configured. This is fail-closed — if the moderation API
    //    rejects the image we let the BadRequestException bubble up.
    if (dto.photoUrl) {
      if (this.moderation.isAliyunImageModerationEnabled()) {
        const objectName = tryExtractOssObjectName(dto.photoUrl);
        if (objectName) {
          await this.moderation.checkOssImage(objectName);
        } else {
          this.logger.warn(
            `Skipped image moderation: unable to derive OSS object from "${dto.photoUrl}". Configure CDN→OSS rewrite or pass an OSS URL.`,
          );
        }
      } else {
        this.logger.debug(
          'Aliyun image moderation disabled — accepting photoUrl without scan',
        );
      }
    }

    // ── Persist as Pending. The counterpart must accept/reject. ──
    return this.proofRepo.save(
      this.proofRepo.create({
        activityId: id,
        userId,
        proofType: dto.proofType,
        photoUrl: dto.photoUrl ?? null,
        note: dto.note ?? '',
        locationApprox,
        status: ActivityProofStatus.Pending,
        privacyMode,
        reviewedById: null,
        reviewedAt: null,
        reviewReason: '',
      }),
    );
  }

  /**
   * Counterpart (or host) accepts/rejects a pending proof.
   *  - Reviewer must be a participant AND must NOT be the proof author.
   *  - On accept: bumps reviewer-side trust, attempts auto-completion.
   *  - On reject: stores reason; activity stays in current status so the
   *    author can submit a new proof.
   */
  async respondToProof(
    activityId: number,
    proofId: number,
    reviewerId: number,
    accept: boolean,
    reason?: string,
  ): Promise<{
    proof: ActivityProof;
    activity: SocialActivity;
    autoCompleted: boolean;
  }> {
    const activity = await this.findOne(activityId);
    this.assertParticipant(activity, reviewerId);

    const proof = await this.proofRepo.findOne({
      where: { id: proofId, activityId },
    });
    if (!proof) throw new NotFoundException('Proof not found');
    if (proof.userId === reviewerId) {
      throw new ForbiddenException(
        'Cannot review your own proof — wait for the counterpart.',
      );
    }
    if (proof.status !== ActivityProofStatus.Pending) {
      throw new BadRequestException(
        `Proof already ${proof.status}; reopen by submitting a new proof.`,
      );
    }

    proof.status = accept
      ? ActivityProofStatus.Accepted
      : ActivityProofStatus.Rejected;
    proof.reviewedById = reviewerId;
    proof.reviewedAt = new Date();
    proof.reviewReason = (reason ?? '').slice(0, 500);
    const savedProof = await this.proofRepo.save(proof);

    let updatedActivity = activity;
    let autoCompleted = false;

    if (accept) {
      // +1 trust for the proof author whose proof was accepted.
      await this.bumpTrust(proof.userId, { score: 1 });

      // Best-effort auto completion — if proof policy is now satisfied,
      // mark the activity completed and propagate to the social request.
      try {
        updatedActivity = await this.completeIfPolicySatisfied(
          activity,
          reviewerId,
        );
        autoCompleted =
          updatedActivity.status === SocialActivityStatus.Completed &&
          activity.status !== SocialActivityStatus.Completed;
      } catch (err) {
        this.logger.debug(
          `Auto-complete skipped for activity ${activityId}: ${(err as Error).message}`,
        );
      }
    }

    return { proof: savedProof, activity: updatedActivity, autoCompleted };
  }

  private inferPrivacyMode(
    dto: SubmitActivityProofDto,
  ): ActivityProofPrivacyMode {
    if (!dto.photoUrl) return ActivityProofPrivacyMode.Private;
    if (dto.proofType === ActivityProofType.SelfieOptional) {
      return ActivityProofPrivacyMode.HiddenFace;
    }
    return ActivityProofPrivacyMode.SceneOnly;
  }

  /** Mark complete if proof policy is satisfied. */
  async complete(id: number, userId: number): Promise<SocialActivity> {
    const activity = await this.findOne(id);
    this.assertParticipant(activity, userId);
    return this.completeIfPolicySatisfied(activity, userId);
  }

  private async completeIfPolicySatisfied(
    activity: SocialActivity,
    actingUserId: number,
  ): Promise<SocialActivity> {
    if (activity.status === SocialActivityStatus.Completed) return activity;
    if (activity.status === SocialActivityStatus.Cancelled) {
      throw new BadRequestException('Activity is cancelled.');
    }

    const allConfirmed =
      activity.participantIds.length >= 2 &&
      activity.participantIds.every(
        (uid) => activity.confirmByUserId[String(uid)],
      );

    const proofs = await this.listProofs(activity.id);
    const hasAcceptedProof = proofs.some(
      (p) => p.status === ActivityProofStatus.Accepted,
    );

    let satisfied = false;
    switch (activity.proofPolicy) {
      case ActivityProofPolicy.MutualConfirm:
        satisfied = allConfirmed;
        break;
      case ActivityProofPolicy.MutualOrProof:
        satisfied = allConfirmed || hasAcceptedProof;
        break;
      case ActivityProofPolicy.MutualAndProof:
        satisfied = allConfirmed && hasAcceptedProof;
        break;
    }

    if (!satisfied) {
      throw new BadRequestException(
        'Proof policy not satisfied. Need mutual confirmation or accepted proof depending on policy.',
      );
    }

    activity.status = SocialActivityStatus.Completed;
    // Generate a recap on the first completion only. AIService falls back to
    // a deterministic template summary when DEEPSEEK_API_KEY is not set, so
    // this never blocks completion.
    if (!activity.recap) {
      try {
        const proofCount = proofs.length;
        const checkedInCount = Object.keys(
          activity.checkinByUserId ?? {},
        ).length;
        const durationMinutes =
          activity.startTime && activity.endTime
            ? Math.max(
                0,
                Math.round(
                  (new Date(activity.endTime).getTime() -
                    new Date(activity.startTime).getTime()) /
                    60000,
                ),
              )
            : undefined;
        activity.recap = await this.ai.generateActivityReviewSummary(
          {
            title: activity.title,
            status: SocialActivityStatus.Completed,
            participantsCount: activity.participantIds.length,
            checkedInCount,
            proofCount,
            durationMinutes,
          },
          [],
        );
      } catch (err) {
        this.logger.warn(
          `Recap generation skipped for activity ${activity.id}: ${(err as Error).message}`,
        );
      }
    }
    const saved = await this.activityRepo.save(activity);
    this.emitActivityEvent(saved, 'activity:completed', actingUserId, {
      completedByUserId: actingUserId,
    });
    await this.applyTrustOnCompletion(saved);
    await this.recordActivityCompletedForLifeGraph(saved, actingUserId);
    await this.propagateCompletionToSocialRequest(saved);
    if (saved.meetId) {
      try {
        await this.meetsService.markCompletedFromActivity(saved.meetId);
      } catch (err) {
        this.logger.warn(
          `Failed to mark meet ${saved.meetId} as completed: ${(err as Error).message}`,
        );
      }
    }
    return saved;
  }

  /** +2 trust + +1 socialTrustCount for every participant on completion. */
  private async applyTrustOnCompletion(
    activity: SocialActivity,
  ): Promise<void> {
    for (const uid of activity.participantIds) {
      try {
        await this.bumpTrust(uid, { score: 2, socialCount: 1 });
      } catch (err) {
        this.logger.warn(
          `Failed to bump trust for user ${uid} on activity ${activity.id}: ${(err as Error).message}`,
        );
      }
    }
  }

  private async bumpTrust(
    userId: number,
    delta: { score?: number; socialCount?: number },
  ): Promise<void> {
    const score = delta.score ?? 0;
    const socialCount = delta.socialCount ?? 0;
    if (score === 0 && socialCount === 0) return;
    const sets: string[] = [];
    if (score) sets.push(`"trustScore" = "trustScore" + ${score}`);
    if (socialCount)
      sets.push(`"socialTrustCount" = "socialTrustCount" + ${socialCount}`);
    await this.userRepo.query(
      `UPDATE "users" SET ${sets.join(', ')} WHERE "id" = $1`,
      [userId],
    );
  }

  /** Mark the originating UserSocialRequest as completed (if any). */
  private async propagateCompletionToSocialRequest(
    activity: SocialActivity,
  ): Promise<void> {
    if (!activity.socialRequestId) return;
    try {
      const req = await this.socialRequestRepo.findOne({
        where: { id: activity.socialRequestId },
      });
      if (!req) return;
      if (req.status === UserSocialRequestStatus.Completed) return;
      req.status = UserSocialRequestStatus.Completed;
      await this.socialRequestRepo.save(req);
      await this.updatePublicIntentStatus(
        req.id,
        PublicSocialIntentStatus.Completed,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to write back socialRequest ${activity.socialRequestId}: ${(err as Error).message}`,
      );
    }
  }

  private async updatePublicIntentStatus(
    socialRequestId: number,
    status: PublicSocialIntentStatus,
  ) {
    await this.publicIntentRepo.update(
      { linkedSocialRequestId: socialRequestId },
      { status },
    );
  }

  async cancel(id: number, userId: number): Promise<SocialActivity> {
    const activity = await this.findOne(id);
    if (activity.creatorId !== userId) {
      throw new ForbiddenException(
        'Only the creator can cancel this activity.',
      );
    }
    activity.status = SocialActivityStatus.Cancelled;
    const saved = await this.activityRepo.save(activity);
    this.emitActivityEvent(saved, 'activity:cancelled', userId, {
      cancelledByUserId: userId,
    });
    await this.recordActivityCancelledForLifeGraph(saved, userId);
    return saved;
  }

  /**
   * Lightweight review hook. Stores nothing yet — surfaces only as a trust
   * bump for the reviewed counterpart so the existing trust pipeline is
   * exercised. A full review entity can be added later without breaking the
   * route contract.
   */
  async review(
    id: number,
    reviewerId: number,
    rating: number,
    comment = '',
  ): Promise<{ ok: true }> {
    const activity = await this.findOne(id);
    if (!activity.participantIds.includes(reviewerId)) {
      throw new ForbiddenException(
        'Only participants can review this activity.',
      );
    }
    if (activity.status !== SocialActivityStatus.Completed) {
      throw new BadRequestException(
        'Only completed activities can be reviewed.',
      );
    }
    activity.reviewByUserId = {
      ...(activity.reviewByUserId ?? {}),
      [String(reviewerId)]: {
        rating,
        comment: comment.slice(0, 500),
        createdAt: new Date().toISOString(),
      },
    };
    await this.activityRepo.save(activity);
    const target = activity.participantIds.find((uid) => uid !== reviewerId);
    await this.recordActivityReviewForLifeGraph({
      activity,
      reviewerId,
      targetUserId: target ?? null,
      rating,
      comment,
    });
    if (target && rating >= 4) {
      try {
        await this.bumpTrust(target, { score: 1 });
      } catch {
        // Trust bump is best-effort.
      }
    }
    return { ok: true };
  }

  private async recordActivityCompletedForLifeGraph(
    activity: SocialActivity,
    actingUserId: number,
  ): Promise<void> {
    const participantIds = Array.from(new Set(activity.participantIds ?? []));
    await Promise.all(
      participantIds.map((userId) =>
        this.recordActivityLifeGraphEvent(userId, {
          activity,
          eventType: LifeGraphBehaviorEventType.ActivityCompleted,
          source: 'activity_completed',
          actorUserId: actingUserId,
          naturalSummary: `你完成了一次${this.activityDisplayName(activity)}活动。`,
          weight: 1.2,
        }),
      ),
    );
  }

  private async recordActivityCancelledForLifeGraph(
    activity: SocialActivity,
    actorUserId: number,
  ): Promise<void> {
    await this.recordActivityLifeGraphEvent(actorUserId, {
      activity,
      eventType: LifeGraphBehaviorEventType.ActivityCancelled,
      source: 'activity_cancelled',
      actorUserId,
      naturalSummary: `你取消了一次${this.activityDisplayName(activity)}活动，我会优先考虑更宽松的时间安排。`,
      weight: 1,
    });
  }

  private async recordActivityReviewForLifeGraph(input: {
    activity: SocialActivity;
    reviewerId: number;
    targetUserId: number | null;
    rating: number;
    comment: string;
  }): Promise<void> {
    const positive = input.rating >= 4;
    await this.recordActivityLifeGraphEvent(input.reviewerId, {
      activity: input.activity,
      eventType: positive
        ? LifeGraphBehaviorEventType.ActivityReviewedPositive
        : LifeGraphBehaviorEventType.ActivityReviewedNegative,
      source: 'activity_reviewed',
      actorUserId: input.reviewerId,
      targetUserId: input.targetUserId,
      naturalSummary: positive
        ? '你对这次活动给出了正向评价，我会提高类似安排的权重。'
        : '你对这次活动给出了保留评价，我会降低类似安排的权重。',
      weight: 1,
      metadata: {
        rating: input.rating,
        comment: input.comment.slice(0, 500),
      },
    });
  }

  private async recordActivityLifeGraphEvent(
    userId: number,
    input: {
      activity: SocialActivity;
      eventType: LifeGraphBehaviorEventType;
      source: string;
      actorUserId: number;
      targetUserId?: number | null;
      naturalSummary: string;
      weight: number;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    try {
      await this.lifeGraph?.recordBehaviorEvent(userId, {
        eventType: input.eventType,
        source: input.source,
        activityId: input.activity.id,
        candidateUserId: input.targetUserId ?? null,
        naturalSummary: input.naturalSummary,
        weight: input.weight,
        metadata: {
          ...this.activityLifeGraphMetadata(input.activity, input.actorUserId),
          targetUserId: input.targetUserId ?? null,
          ...(input.metadata ?? {}),
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to record Life Graph event ${input.eventType} for user ${userId}: ${(err as Error).message}`,
      );
    }
  }

  private activityLifeGraphMetadata(
    activity: SocialActivity,
    actorUserId: number,
  ): Record<string, unknown> {
    return {
      activityId: activity.id,
      activityType: activity.type,
      title: activity.title,
      city: activity.city,
      locationName: activity.locationName,
      startTime: activity.startTime?.toISOString?.() ?? null,
      endTime: activity.endTime?.toISOString?.() ?? null,
      participantCount: activity.participantIds?.length ?? 0,
      actorUserId,
    };
  }

  private activityDisplayName(activity: SocialActivity): string {
    return activity.title?.trim() || activity.type || '线下';
  }

  private emitActivityEvent(
    activity: SocialActivity,
    eventType:
      | 'activity:invitation'
      | 'activity:confirmed'
      | 'activity:checked_in'
      | 'activity:completed'
      | 'activity:cancelled',
    actorUserId: number,
    extra: Record<string, unknown> = {},
  ) {
    for (const userId of activity.participantIds ?? []) {
      this.realtime?.emitToUser({
        userId,
        eventType,
        payload: {
          activityId: activity.id,
          title: activity.title,
          status: activity.status,
          actorUserId,
          ...extra,
        },
        rooms: [`activity:${activity.id}`],
        notification:
          userId !== actorUserId
            ? {
                type: 'activity',
                text: activity.title,
                targetId: activity.id,
                pushPayload: { activityId: activity.id, eventType },
              }
            : undefined,
      });
    }
  }
}
