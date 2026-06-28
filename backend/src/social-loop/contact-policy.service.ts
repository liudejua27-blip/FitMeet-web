import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { UserBlock } from '../safety/user-block.entity';
import type {
  SocialPolicyAction,
  SocialPolicyDecision,
} from '../social-policy/social-policy.types';
import { SocialPolicyService } from '../social-policy/social-policy.service';
import { ContactPermission } from './contact-permission.entity';
import {
  ContactPermissionGrant,
  ContactPermissionGrantSource,
} from './contact-permission-grant.entity';
import {
  SocialLoopErrorCode,
  socialConflict,
  socialForbidden,
} from './social-loop.errors';

export type ContactContextType =
  | 'agent_candidate'
  | 'connection_request'
  | 'public_intent_application'
  | 'friendship'
  | 'meet';

type ContactContext = {
  contextType: ContactContextType;
  contextId: string;
};

type Pair = {
  userLowId: number;
  userHighId: number;
};

export type RelationshipState = {
  messagePermission:
    | 'none'
    | 'opener_available'
    | 'awaiting_reply'
    | 'open'
    | 'closed';
  conversationId: string | null;
  blocked: boolean;
};

@Injectable()
export class ContactPolicyService {
  constructor(
    private readonly socialPolicy: SocialPolicyService,
    @InjectRepository(ContactPermission)
    private readonly permissionRepo: Repository<ContactPermission>,
    @InjectRepository(ContactPermissionGrant)
    private readonly grantRepo: Repository<ContactPermissionGrant>,
    @InjectRepository(UserBlock)
    private readonly blockRepo: Repository<UserBlock>,
  ) {}

  async assertSociallyEligible(userId: number) {
    const decision = await this.socialPolicy.evaluateSocialEligibility(
      userId,
      'message.send',
    );
    if (!decision.allowed) {
      throw socialForbidden(SocialLoopErrorCode.SocialProfileNotReady, {
        message: decision.publicMessage,
        details: decision.metadata,
      });
    }
  }

  async assertNotBlocked(userId: number, targetUserId: number) {
    if (await this.isBlocked(userId, targetUserId)) {
      throw socialForbidden(SocialLoopErrorCode.UserBlocked, {
        message: 'These users cannot contact each other.',
      });
    }
  }

  async assertCanStartConversation(
    userId: number,
    targetUserId: number,
    context: ContactContext,
  ) {
    await this.assertPairAllowed(userId, targetUserId, 'message.send');
    const permission = await this.getPermission(userId, targetUserId);
    if (!permission) {
      throw socialForbidden(SocialLoopErrorCode.ContactNotAllowed);
    }
    if (permission.status === 'closed') {
      throw socialForbidden(SocialLoopErrorCode.ContactNotAllowed);
    }
    if (permission.status === 'open') return permission;
    if (
      permission.status === 'opener_available' &&
      permission.openerSenderId === userId &&
      permission.openerContextType === context.contextType &&
      permission.openerContextId === context.contextId
    ) {
      return permission;
    }
    throw socialForbidden(SocialLoopErrorCode.ContactNotAllowed);
  }

  async assertCanSendMessage(
    senderId: number,
    targetUserId: number,
    context?: ContactContext,
  ): Promise<{ permission: ContactPermission; shouldOpenAfterReply: boolean }> {
    await this.assertPairAllowed(senderId, targetUserId, 'message.send');
    const permission = await this.getPermission(senderId, targetUserId);
    if (!permission || permission.status === 'none') {
      throw socialForbidden(SocialLoopErrorCode.ContactNotAllowed);
    }
    if (permission.status === 'closed') {
      throw socialForbidden(SocialLoopErrorCode.ContactNotAllowed);
    }
    if (permission.status === 'open') {
      return { permission, shouldOpenAfterReply: false };
    }
    if (
      permission.status === 'opener_available' &&
      permission.openerSenderId === senderId &&
      context &&
      permission.openerContextType === context.contextType &&
      permission.openerContextId === context.contextId
    ) {
      return { permission, shouldOpenAfterReply: false };
    }
    if (permission.status === 'awaiting_reply') {
      if (permission.openerSenderId === senderId) {
        throw socialConflict(SocialLoopErrorCode.OpenerAlreadySent);
      }
      return { permission, shouldOpenAfterReply: true };
    }
    throw socialForbidden(SocialLoopErrorCode.ContactNotAllowed);
  }

  async grantOpener(
    senderId: number,
    targetUserId: number,
    context: ContactContext,
    manager?: EntityManager,
  ) {
    const permission = await this.ensurePermission(
      senderId,
      targetUserId,
      manager,
    );
    if (permission.status === 'open') return permission;
    if (permission.status === 'awaiting_reply') {
      throw socialConflict(SocialLoopErrorCode.OpenerAlreadySent);
    }
    permission.status = 'opener_available';
    permission.openerSenderId = senderId;
    permission.openerContextType = context.contextType;
    permission.openerContextId = context.contextId;
    permission.closedAt = null;
    return this.permissionRepository(manager).save(permission);
  }

  async reserveOpener(
    senderId: number,
    targetUserId: number,
    context: ContactContext,
    manager?: EntityManager,
  ) {
    return this.grantOpener(senderId, targetUserId, context, manager);
  }

  async markOpenerSent(
    senderId: number,
    targetUserId: number,
    context: ContactContext,
    manager?: EntityManager,
  ) {
    const permission = await this.ensurePermission(
      senderId,
      targetUserId,
      manager,
    );
    if (
      permission.status === 'awaiting_reply' &&
      permission.openerSenderId === senderId
    ) {
      throw socialConflict(SocialLoopErrorCode.OpenerAlreadySent);
    }
    if (
      permission.status !== 'opener_available' ||
      permission.openerSenderId !== senderId ||
      permission.openerContextType !== context.contextType ||
      permission.openerContextId !== context.contextId
    ) {
      throw socialForbidden(SocialLoopErrorCode.ContactNotAllowed);
    }
    permission.status = 'awaiting_reply';
    permission.openerSentAt = new Date();
    return this.permissionRepository(manager).save(permission);
  }

  async restoreOpenerAvailableAfterSendFailure(
    senderId: number,
    targetUserId: number,
    context: ContactContext,
    manager?: EntityManager,
  ) {
    const permission = await this.permissionRepository(manager).findOne({
      where: this.pair(senderId, targetUserId),
    });
    if (
      !permission ||
      permission.status !== 'awaiting_reply' ||
      permission.openerSenderId !== senderId ||
      permission.openerContextType !== context.contextType ||
      permission.openerContextId !== context.contextId
    ) {
      return permission;
    }
    permission.status = 'opener_available';
    permission.openerSentAt = null;
    return this.permissionRepository(manager).save(permission);
  }

  async openAfterReply(
    senderId: number,
    targetUserId: number,
    manager?: EntityManager,
  ) {
    const permission = await this.ensurePermission(
      senderId,
      targetUserId,
      manager,
    );
    if (permission.status !== 'awaiting_reply') return permission;
    if (permission.openerSenderId === senderId) {
      throw socialConflict(SocialLoopErrorCode.OpenerAlreadySent);
    }
    permission.status = 'open';
    permission.openedAt = new Date();
    permission.closedAt = null;
    return this.permissionRepository(manager).save(permission);
  }

  async grantOpenAccess(
    userId: number,
    targetUserId: number,
    sourceType: ContactPermissionGrantSource,
    sourceId: string | number,
    grantedByUserId: number | null,
    manager?: EntityManager,
  ) {
    const permission = await this.ensurePermission(
      userId,
      targetUserId,
      manager,
    );
    const grants = this.grantRepository(manager);
    const sourceIdText = String(sourceId);
    let grant = await grants.findOne({
      where: {
        permissionId: permission.id,
        sourceType,
        sourceId: sourceIdText,
        status: 'active',
      },
    });
    if (!grant) {
      grant = grants.create({
        permissionId: permission.id,
        sourceType,
        sourceId: sourceIdText,
        status: 'active',
        grantedByUserId,
        revokedAt: null,
        metadata: {},
      });
      await grants.save(grant);
    }
    permission.status = 'open';
    permission.openedAt = permission.openedAt ?? new Date();
    permission.closedAt = null;
    return this.permissionRepository(manager).save(permission);
  }

  async revokeGrant(
    userId: number,
    targetUserId: number,
    sourceType: ContactPermissionGrantSource,
    sourceId: string | number,
    manager?: EntityManager,
  ) {
    const permission = await this.getOrCreatePermission(
      userId,
      targetUserId,
      manager,
    );
    await this.grantRepository(manager).update(
      {
        permissionId: permission.id,
        sourceType,
        sourceId: String(sourceId),
        status: 'active',
      },
      { status: 'revoked', revokedAt: new Date() },
    );
    return this.recomputePermission(permission, manager);
  }

  async closeForBlock(
    blockerId: number,
    blockedId: number,
    manager?: EntityManager,
  ) {
    const permission = await this.getOrCreatePermission(
      blockerId,
      blockedId,
      manager,
    );
    await this.grantRepository(manager).update(
      { permissionId: permission.id, status: 'active' },
      { status: 'revoked', revokedAt: new Date() },
    );
    permission.status = 'closed';
    permission.closedAt = new Date();
    return this.permissionRepository(manager).save(permission);
  }

  async setConversationId(
    userId: number,
    targetUserId: number,
    conversationId: string,
    manager?: EntityManager,
  ) {
    const permission = await this.ensurePermission(
      userId,
      targetUserId,
      manager,
    );
    permission.conversationId = conversationId;
    return this.permissionRepository(manager).save(permission);
  }

  async getRelationshipState(
    userId: number,
    targetUserId: number,
  ): Promise<RelationshipState> {
    const [blocked, permission] = await Promise.all([
      this.isBlocked(userId, targetUserId),
      this.getPermission(userId, targetUserId),
    ]);
    if (blocked) {
      return {
        messagePermission: 'closed',
        conversationId: permission?.conversationId ?? null,
        blocked: true,
      };
    }
    return {
      messagePermission: permission?.status ?? 'none',
      conversationId: permission?.conversationId ?? null,
      blocked: false,
    };
  }

  async isBlocked(userId: number, targetUserId: number) {
    const count = await this.blockRepo.count({
      where: [
        { blockerId: userId, blockedId: targetUserId },
        { blockerId: targetUserId, blockedId: userId },
      ],
    });
    return count > 0;
  }

  async getPermission(userId: number, targetUserId: number) {
    const pair = this.pair(userId, targetUserId);
    return this.permissionRepo.findOne({ where: pair });
  }

  pair(userId: number, targetUserId: number): Pair {
    const left = Number(userId);
    const right = Number(targetUserId);
    return {
      userLowId: Math.min(left, right),
      userHighId: Math.max(left, right),
    };
  }

  private async ensurePermission(
    userId: number,
    targetUserId: number,
    manager?: EntityManager,
  ) {
    await this.assertNotBlocked(userId, targetUserId);
    return this.getOrCreatePermission(userId, targetUserId, manager);
  }

  private async assertPairAllowed(
    userId: number,
    targetUserId: number,
    action: SocialPolicyAction,
  ) {
    const decision = await this.socialPolicy.evaluateUserPair(
      userId,
      targetUserId,
      action,
    );
    if (!decision.allowed) {
      this.throwSocialPolicyDecision(decision);
    }
  }

  private throwSocialPolicyDecision(decision: SocialPolicyDecision): never {
    if (decision.code === 'social_profile_not_ready') {
      throw socialForbidden(SocialLoopErrorCode.SocialProfileNotReady, {
        message: decision.publicMessage,
        details: decision.metadata,
      });
    }
    if (decision.code === 'user_blocked') {
      throw socialForbidden(SocialLoopErrorCode.UserBlocked, {
        message: decision.publicMessage,
        details: decision.metadata,
      });
    }
    throw socialForbidden(SocialLoopErrorCode.ContactNotAllowed, {
      message: decision.publicMessage,
      details: decision.metadata,
    });
  }

  private async getOrCreatePermission(
    userId: number,
    targetUserId: number,
    manager?: EntityManager,
  ) {
    const repo = this.permissionRepository(manager);
    const pair = this.pair(userId, targetUserId);
    let permission = await repo.findOne({
      where: pair,
      lock: manager ? { mode: 'pessimistic_write' } : undefined,
    });
    if (!permission) {
      permission = repo.create({
        ...pair,
        status: 'none',
        conversationId: null,
        openerSenderId: null,
        openerContextType: null,
        openerContextId: null,
        openerSentAt: null,
        openedAt: null,
        closedAt: null,
        metadata: {},
      });
      permission = await repo.save(permission);
    }
    return permission;
  }

  private async recomputePermission(
    permission: ContactPermission,
    manager?: EntityManager,
  ) {
    const hasActiveGrant = await this.grantRepository(manager).count({
      where: { permissionId: permission.id, status: 'active' },
    });
    if (permission.status === 'closed') return permission;
    if (hasActiveGrant > 0) {
      permission.status = 'open';
      permission.openedAt = permission.openedAt ?? new Date();
    } else {
      permission.status = 'none';
      permission.openedAt = null;
    }
    return this.permissionRepository(manager).save(permission);
  }

  private permissionRepository(manager?: EntityManager) {
    return manager
      ? manager.getRepository(ContactPermission)
      : this.permissionRepo;
  }

  private grantRepository(manager?: EntityManager) {
    return manager
      ? manager.getRepository(ContactPermissionGrant)
      : this.grantRepo;
  }
}
