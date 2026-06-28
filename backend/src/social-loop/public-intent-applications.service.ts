import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { PublicSocialIntent } from '../agent-gateway/entities/public-social-intent.entity';
import { SocialRequestStatus } from '../agent-gateway/entities/social-request.entity';
import { MeetParticipant } from '../meets/meet-participant.entity';
import { Meet } from '../meets/meet.entity';
import { SocialPolicyService } from '../social-policy/social-policy.service';
import type { SocialPolicyDecision } from '../social-policy/social-policy.types';
import { User } from '../users/user.entity';
import { ApiIdempotencyService } from './api-idempotency.service';
import { ContactPolicyService } from './contact-policy.service';
import { DomainOutboxEvent } from './domain-outbox-event.entity';
import { PublicIntentApplication } from './public-intent-application.entity';
import {
  SocialLoopErrorCode,
  socialConflict,
  socialForbidden,
  socialNotFound,
} from './social-loop.errors';

type CreateApplicationBody = {
  message?: string;
};

type ResolveApplicationBody = {
  reason?: string;
};

@Injectable()
export class PublicIntentApplicationsService {
  constructor(
    private readonly idempotency: ApiIdempotencyService,
    private readonly contactPolicy: ContactPolicyService,
    private readonly socialPolicy: SocialPolicyService,
    @InjectRepository(PublicIntentApplication)
    private readonly applicationRepo: Repository<PublicIntentApplication>,
    @InjectRepository(PublicSocialIntent)
    private readonly publicIntentRepo: Repository<PublicSocialIntent>,
  ) {}

  async createApplication(
    applicantUserId: number,
    publicIntentId: string,
    body: CreateApplicationBody,
    idempotencyKey?: string,
  ) {
    return this.idempotency.run(
      applicantUserId,
      'public-intent-applications.create',
      idempotencyKey,
      { publicIntentId, message: body.message ?? '' },
      (manager) =>
        this.createApplicationOnce(
          applicantUserId,
          publicIntentId,
          body.message ?? '',
          manager,
        ),
    );
  }

  async listForIntent(ownerUserId: number, publicIntentId: string) {
    const intent = await this.publicIntentRepo.findOne({
      where: { id: publicIntentId },
    });
    if (!intent || intent.userId !== ownerUserId) {
      throw socialNotFound(SocialLoopErrorCode.PublicIntentApplicationNotFound);
    }
    return this.applicationRepo.find({
      where: { publicIntentId },
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  async listMine(userId: number, role: 'owner' | 'applicant' = 'applicant') {
    const where =
      role === 'owner' ? { ownerUserId: userId } : { applicantUserId: userId };
    return this.applicationRepo.find({
      where,
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  async acceptApplication(
    ownerUserId: number,
    applicationId: number,
    body: ResolveApplicationBody,
    idempotencyKey?: string,
  ) {
    return this.idempotency.run(
      ownerUserId,
      'public-intent-applications.accept',
      idempotencyKey,
      { applicationId, ...body },
      (manager) =>
        this.acceptApplicationOnce(ownerUserId, applicationId, manager),
    );
  }

  async rejectApplication(
    ownerUserId: number,
    applicationId: number,
    body: ResolveApplicationBody,
    idempotencyKey?: string,
  ) {
    return this.idempotency.run(
      ownerUserId,
      'public-intent-applications.reject',
      idempotencyKey,
      { applicationId, ...body },
      (manager) =>
        this.resolveApplicationOnce(
          ownerUserId,
          applicationId,
          'rejected',
          manager,
        ),
    );
  }

  async cancelApplication(
    applicantUserId: number,
    applicationId: number,
    body: ResolveApplicationBody,
    idempotencyKey?: string,
  ) {
    return this.idempotency.run(
      applicantUserId,
      'public-intent-applications.cancel',
      idempotencyKey,
      { applicationId, ...body },
      (manager) =>
        this.resolveApplicationOnce(
          applicantUserId,
          applicationId,
          'cancelled',
          manager,
        ),
    );
  }

  private async createApplicationOnce(
    applicantUserId: number,
    publicIntentId: string,
    message: string,
    manager: EntityManager,
  ) {
    const intent = await this.lockIntent(publicIntentId, manager);
    this.assertIntentCanReceiveApplications(intent, applicantUserId);
    if (!intent.userId) {
      throw socialConflict(SocialLoopErrorCode.PublicIntentNotActive);
    }
    this.assertPolicyAllowed(
      await this.socialPolicy.evaluatePublicIntentApplication({
        applicantUserId,
        ownerUserId: intent.userId,
        publicIntentId,
        status: intent.status,
        closesAt: intent.closesAt,
        acceptedCount: intent.acceptedCount,
        capacityMax: intent.capacityMax,
        applicationPolicy: intent.applicationPolicy,
      }),
    );
    await this.assertUserExists(applicantUserId, manager);
    const duplicate = await manager
      .getRepository(PublicIntentApplication)
      .findOne({
        where: [
          { publicIntentId, applicantUserId, status: 'pending' },
          { publicIntentId, applicantUserId, status: 'accepted' },
        ],
        order: { createdAt: 'DESC' },
      });
    if (duplicate) {
      throw socialConflict(
        SocialLoopErrorCode.PublicIntentApplicationDuplicate,
      );
    }
    const application = await manager
      .getRepository(PublicIntentApplication)
      .save(
        manager.getRepository(PublicIntentApplication).create({
          publicIntentId,
          ownerUserId: intent.userId,
          applicantUserId,
          status: 'pending',
          message: message.trim().slice(0, 500),
          meetId: null,
          resolvedAt: null,
        }),
      );
    return this.presentApplication(application);
  }

  private async acceptApplicationOnce(
    ownerUserId: number,
    applicationId: number,
    manager: EntityManager,
  ) {
    const application = await this.lockApplication(applicationId, manager);
    if (application.ownerUserId !== ownerUserId) {
      throw socialNotFound(SocialLoopErrorCode.PublicIntentApplicationNotFound);
    }
    const intent = await this.lockIntent(application.publicIntentId, manager);
    if (application.status === 'accepted') {
      return this.acceptedResponse(application, intent);
    }
    if (application.status !== 'pending') {
      throw socialConflict(
        SocialLoopErrorCode.PublicIntentApplicationAlreadyResolved,
      );
    }
    this.assertIntentActive(intent);
    this.assertCapacityAvailable(intent);
    this.assertPolicyAllowed(
      await this.socialPolicy.evaluateOwnerApplicationResolution({
        actorUserId: ownerUserId,
        ownerUserId,
        applicantUserId: application.applicantUserId,
        applicationStatus: application.status,
        resolution: 'accepted',
      }),
    );

    const meet = await this.createOrReuseLinkedMeet(intent, manager);
    await this.upsertParticipant(meet.id, ownerUserId, manager);
    await this.upsertParticipant(meet.id, application.applicantUserId, manager);

    application.status = 'accepted';
    application.meetId = meet.id;
    application.resolvedAt = new Date();
    await manager.getRepository(PublicIntentApplication).save(application);

    intent.acceptedCount += 1;
    intent.linkedMeetId = meet.id;
    if (intent.acceptedCount >= intent.capacityMax) {
      intent.status = SocialRequestStatus.Closed;
    }
    await manager.getRepository(PublicSocialIntent).save(intent);
    await manager
      .getRepository(Meet)
      .update({ id: meet.id }, { slots: intent.acceptedCount });

    const permission = await this.contactPolicy.grantOpenAccess(
      ownerUserId,
      application.applicantUserId,
      'public_intent_application',
      application.id,
      ownerUserId,
      manager,
    );
    await this.writeConversationOutbox(application, intent, meet, manager);
    return {
      applicationId: application.id,
      status: 'accepted',
      meetId: meet.id,
      conversation: {
        status: permission.conversationId ? 'ready' : 'provisioning',
        conversationId: permission.conversationId,
      },
    };
  }

  private async resolveApplicationOnce(
    userId: number,
    applicationId: number,
    status: 'rejected' | 'cancelled',
    manager: EntityManager,
  ) {
    const application = await this.lockApplication(applicationId, manager);
    const isOwner =
      status === 'rejected'
        ? application.ownerUserId === userId
        : application.applicantUserId === userId;
    if (!isOwner) {
      throw socialNotFound(SocialLoopErrorCode.PublicIntentApplicationNotFound);
    }
    if (application.status === status)
      return this.presentApplication(application);
    if (application.status !== 'pending') {
      throw socialConflict(
        SocialLoopErrorCode.PublicIntentApplicationAlreadyResolved,
      );
    }
    if (status === 'rejected') {
      this.assertPolicyAllowed(
        await this.socialPolicy.evaluateOwnerApplicationResolution({
          actorUserId: userId,
          ownerUserId: application.ownerUserId,
          applicantUserId: application.applicantUserId,
          applicationStatus: application.status,
          resolution: 'rejected',
        }),
      );
    }
    application.status = status;
    application.resolvedAt = new Date();
    await manager.getRepository(PublicIntentApplication).save(application);
    return this.presentApplication(application);
  }

  private async createOrReuseLinkedMeet(
    intent: PublicSocialIntent,
    manager: EntityManager,
  ) {
    const meetRepo = manager.getRepository(Meet);
    if (intent.linkedMeetId) {
      const existing = await meetRepo.findOne({
        where: { id: intent.linkedMeetId },
        lock: { mode: 'pessimistic_write' },
      });
      if (existing) return existing;
    }
    if (!intent.userId) {
      throw socialConflict(SocialLoopErrorCode.PublicIntentNotActive);
    }
    const draft = meetRepo.create({
      title: intent.title,
      type: intent.requestType || 'custom',
      sport: intent.requestType || 'custom',
      time: intent.timePreference || '',
      loc: intent.loc || intent.city || '',
      address: intent.locationPreference || '',
      poiId: null,
      lat: intent.lat,
      lng: intent.lng,
      dist: '',
      price: 'free',
      slots: intent.acceptedCount,
      maxSlots: Math.max(intent.capacityMax, 1),
      level: 'all',
      desc: intent.description || intent.socialGoal || '',
      feeType: '',
      groupType: 'public_intent',
      creatorType: 'user',
      status: 'matched',
      tripShareToken: null,
      activityId: null,
      rating: 0,
      meetCount: 0,
      userId: intent.userId,
      city: intent.city || '',
      startAt: null,
      autoCancelAt: null,
      cancelReason: null,
    });
    const meet = await meetRepo.save(draft);
    intent.linkedMeetId = meet.id;
    await manager.getRepository(PublicSocialIntent).save(intent);
    return meet;
  }

  private async upsertParticipant(
    meetId: number,
    userId: number,
    manager: EntityManager,
  ) {
    const repo = manager.getRepository(MeetParticipant);
    const existing = await repo.findOne({ where: { meetId, userId } });
    if (existing) {
      existing.status = 'active';
      return repo.save(existing);
    }
    return repo.save(
      repo.create({
        meetId,
        userId,
        status: 'active',
        tripShareToken: null,
      }),
    );
  }

  private async writeConversationOutbox(
    application: PublicIntentApplication,
    intent: PublicSocialIntent,
    meet: Meet,
    manager: EntityManager,
  ) {
    const dedupeKey = `public_intent_application:${application.id}:conversation`;
    await manager
      .getRepository(DomainOutboxEvent)
      .createQueryBuilder()
      .insert()
      .values({
        eventType: 'conversation.provision_requested',
        aggregateType: 'public_intent_application',
        aggregateId: String(application.id),
        dedupeKey,
        payload: {
          applicationId: application.id,
          publicIntentId: application.publicIntentId,
          ownerUserId: application.ownerUserId,
          applicantUserId: application.applicantUserId,
          meetId: meet.id,
          title: intent.title,
        },
        status: 'pending',
        attemptCount: 0,
        availableAt: new Date(),
        processedAt: null,
        lastError: '',
      })
      .orIgnore()
      .execute();
  }

  private async lockApplication(applicationId: number, manager: EntityManager) {
    const application = await manager
      .getRepository(PublicIntentApplication)
      .findOne({
        where: { id: applicationId },
        lock: { mode: 'pessimistic_write' },
      });
    if (!application) {
      throw socialNotFound(SocialLoopErrorCode.PublicIntentApplicationNotFound);
    }
    return application;
  }

  private async lockIntent(publicIntentId: string, manager: EntityManager) {
    const intent = await manager.getRepository(PublicSocialIntent).findOne({
      where: { id: publicIntentId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!intent) {
      throw socialConflict(SocialLoopErrorCode.PublicIntentNotActive);
    }
    return intent;
  }

  private assertIntentCanReceiveApplications(
    intent: PublicSocialIntent,
    applicantUserId: number,
  ) {
    this.assertIntentActive(intent);
    this.assertCapacityAvailable(intent);
    if (!intent.userId) {
      throw socialConflict(SocialLoopErrorCode.PublicIntentNotActive);
    }
    if (intent.userId === applicantUserId) {
      throw new BadRequestException('Cannot apply to your own social intent.');
    }
  }

  private assertIntentActive(intent: PublicSocialIntent) {
    if (intent.status !== SocialRequestStatus.Active) {
      throw socialConflict(SocialLoopErrorCode.PublicIntentNotActive);
    }
    if (intent.closesAt && intent.closesAt.getTime() <= Date.now()) {
      throw socialConflict(SocialLoopErrorCode.PublicIntentNotActive);
    }
  }

  private assertCapacityAvailable(intent: PublicSocialIntent) {
    if (intent.acceptedCount >= intent.capacityMax) {
      throw socialConflict(SocialLoopErrorCode.PublicIntentFull);
    }
  }

  private async assertUserExists(userId: number, manager: EntityManager) {
    const user = await manager
      .getRepository(User)
      .findOne({ where: { id: userId } });
    if (!user) throw socialForbidden(SocialLoopErrorCode.SocialProfileNotReady);
  }

  private assertPolicyAllowed(decision: SocialPolicyDecision) {
    if (decision.allowed) return;
    const details = {
      policyCode: decision.code,
      reasons: decision.reasons,
      requiredConfirmations: decision.requiredConfirmations,
      ...(decision.metadata ? { policyMetadata: decision.metadata } : {}),
    };
    if (decision.code === 'social_profile_not_ready') {
      throw socialForbidden(SocialLoopErrorCode.SocialProfileNotReady, {
        message: decision.publicMessage,
        details,
      });
    }
    if (decision.code === 'user_blocked') {
      throw socialForbidden(SocialLoopErrorCode.UserBlocked, {
        message: decision.publicMessage,
        details,
      });
    }
    if (
      decision.code === 'public_intent_not_active' ||
      decision.code === 'public_intent_expired'
    ) {
      throw socialConflict(SocialLoopErrorCode.PublicIntentNotActive, {
        message: decision.publicMessage,
        details,
      });
    }
    if (decision.code === 'public_intent_full') {
      throw socialConflict(SocialLoopErrorCode.PublicIntentFull, {
        message: decision.publicMessage,
        details,
      });
    }
    if (decision.code === 'application_already_resolved') {
      throw socialConflict(
        SocialLoopErrorCode.PublicIntentApplicationAlreadyResolved,
        { message: decision.publicMessage, details },
      );
    }
    throw socialForbidden(SocialLoopErrorCode.ContactNotAllowed, {
      message: decision.publicMessage,
      details,
    });
  }

  private async acceptedResponse(
    application: PublicIntentApplication,
    intent: PublicSocialIntent,
  ) {
    const relationship = await this.contactPolicy.getRelationshipState(
      application.ownerUserId,
      application.applicantUserId,
    );
    return {
      applicationId: application.id,
      status: 'accepted',
      meetId: application.meetId ?? intent.linkedMeetId,
      conversation: {
        status: relationship.conversationId ? 'ready' : 'provisioning',
        conversationId: relationship.conversationId,
      },
    };
  }

  private presentApplication(application: PublicIntentApplication) {
    return {
      id: application.id,
      publicIntentId: application.publicIntentId,
      ownerUserId: application.ownerUserId,
      applicantUserId: application.applicantUserId,
      status: application.status,
      message: application.message,
      meetId: application.meetId,
      resolvedAt: application.resolvedAt,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
    };
  }
}
