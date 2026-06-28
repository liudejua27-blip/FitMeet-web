import { BadRequestException, Injectable, Optional } from '@nestjs/common';

import { DomainOutboxWorkerService } from '../messages/domain-outbox-worker.service';
import { ContactPolicyService } from '../social-loop/contact-policy.service';
import { PublicIntentApplicationsService } from '../social-loop/public-intent-applications.service';
import type {
  FitMeetAgentSchemaAction,
  FitMeetAlphaCard,
} from './fitmeet-alpha-agent.types';
import type { SocialAgentCardActionBody } from './social-agent-action.types';
import type { SocialAgentIntentRouteResult } from './social-agent-chat.types';
import { SocialSideEffectService } from './social-side-effect.service';

type PresentedApplication = {
  id: number;
  publicIntentId: string;
  ownerUserId: number;
  applicantUserId: number;
  status: string;
  message?: string | null;
  meetId?: number | null;
  resolvedAt?: Date | string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
};

type ApplicationCardInput = {
  taskId: number;
  application: PresentedApplication;
  applicantName?: string | null;
  publicIntentTitle?: string | null;
  profileHref?: string | null;
  conversationId?: string | null;
  meetId?: number | null;
};

@Injectable()
export class SocialAgentApplicationActionService {
  constructor(
    private readonly applications: PublicIntentApplicationsService,
    private readonly contactPolicy: ContactPolicyService,
    private readonly sideEffects: SocialSideEffectService,
    @Optional()
    private readonly outboxWorker?: DomainOutboxWorkerService,
  ) {}

  async performApplicationAction(input: {
    ownerUserId: number;
    taskId: number;
    action: FitMeetAgentSchemaAction;
    body: SocialAgentCardActionBody;
  }): Promise<SocialAgentIntentRouteResult> {
    const payload = this.record(input.body.payload);
    const applicationId = this.number(
      payload.applicationId ?? payload.publicIntentApplicationId,
    );
    if (!applicationId) {
      throw new BadRequestException('报名申请缺少 applicationId');
    }

    if (input.action === 'public_intent_application.accept') {
      if (!this.isConfirmedAccept(payload)) {
        throw new BadRequestException(
          'public_intent_application_accept_confirmation_required',
        );
      }
      return this.acceptApplication({
        ownerUserId: input.ownerUserId,
        taskId: input.taskId,
        applicationId,
        idempotencyKey:
          input.body.idempotencyKey ||
          this.text(payload.idempotencyKey) ||
          `agent:public-intent-application:${applicationId}:accept`,
        reason: this.text(payload.reason) || null,
      });
    }

    if (input.action === 'public_intent_application.reject') {
      return this.rejectApplication({
        ownerUserId: input.ownerUserId,
        taskId: input.taskId,
        applicationId,
        idempotencyKey:
          input.body.idempotencyKey ||
          this.text(payload.idempotencyKey) ||
          `agent:public-intent-application:${applicationId}:reject`,
        reason: this.text(payload.reason) || null,
      });
    }

    if (input.action === 'public_intent_application.open_conversation') {
      const conversationId = this.text(payload.conversationId);
      return this.simpleRouteResult({
        taskId: input.taskId,
        assistantMessage: conversationId
          ? '已准备好消息页入口，可以继续确认时间和地点。'
          : '这条报名还在创建会话中，稍后会回到消息页继续。',
        publicLoop: {
          stage: 'messages_handoff',
          publicIntentId: this.text(payload.publicIntentId) || null,
          discoverHref: null,
          publicIntentHref: this.publicIntentHref(payload.publicIntentId),
          messagesHref: this.messagesHref(conversationId),
          requiredConfirmation: false,
        },
      });
    }

    if (input.action === 'public_intent_application.view_profile') {
      const applicantUserId = this.number(
        payload.applicantUserId ?? payload.targetUserId ?? payload.userId,
      );
      return this.simpleRouteResult({
        taskId: input.taskId,
        assistantMessage: applicantUserId
          ? '已打开对方资料。接受前不会自动创建会话或活动。'
          : '可以先查看对方资料，再决定是否接受报名。',
        publicLoop: {
          stage: 'contact_confirmation_required',
          publicIntentId: this.text(payload.publicIntentId) || null,
          discoverHref: null,
          publicIntentHref: this.publicIntentHref(payload.publicIntentId),
          messagesHref: null,
          requiredConfirmation: false,
        },
      });
    }

    throw new BadRequestException(
      'Unsupported public intent application action',
    );
  }

  async buildPendingApplicationCards(input: {
    ownerUserId: number;
    taskId: number;
    limit?: number;
  }): Promise<FitMeetAlphaCard[]> {
    const applications = await this.applications.listMine(
      input.ownerUserId,
      'owner',
    );
    return applications
      .filter((application) => application.status === 'pending')
      .slice(0, Math.max(1, Math.min(input.limit ?? 5, 10)))
      .map((application) =>
        this.buildApplicationCard({
          taskId: input.taskId,
          application,
        }),
      );
  }

  buildApplicationCard(input: ApplicationCardInput): FitMeetAlphaCard {
    const { application } = input;
    const conversationId = input.conversationId ?? null;
    const messagesHref = this.messagesHref(conversationId);
    const profileHref =
      input.profileHref ??
      `/user/${encodeURIComponent(String(application.applicantUserId))}`;
    const status = this.applicationStatus(application.status);
    const accepted = status === 'accepted';
    const pending = status === 'pending';
    const rejected = status === 'rejected' || status === 'cancelled';
    const title =
      input.publicIntentTitle ??
      `用户 ${application.applicantUserId} 申请加入你的约练`;
    const body =
      this.text(application.message) ||
      '对方想加入你发布的约练卡。接受前不会自动公开联系方式。';
    return {
      id: `public_intent_application:${application.id}:${status}`,
      type: 'public_intent_application_card',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'public_intent.application',
      title: pending
        ? '有人申请加入你的约练'
        : accepted
          ? '已接受约练申请'
          : '已处理约练申请',
      body,
      status: pending ? 'waiting_confirmation' : 'completed',
      data: {
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'public_intent.application',
        schemaName: 'PublicIntentApplicationCard',
        taskId: input.taskId,
        applicationId: application.id,
        publicIntentId: application.publicIntentId,
        applicantUserId: application.applicantUserId,
        applicantName:
          this.text(input.applicantName) ||
          `用户 ${application.applicantUserId}`,
        publicIntentTitle: title,
        message: body,
        status,
        meetId: input.meetId ?? application.meetId ?? null,
        profileHref,
        messagesHref,
        conversationId,
        safetyBoundary:
          '接受后才会创建站内会话；仍不公开手机号、微信或精确位置。',
      },
      actions: [
        ...(pending
          ? [
              this.action({
                id: `public_intent_application:${application.id}:accept`,
                label: '接受并开聊',
                action: 'public_intent_application.accept',
                requiresConfirmation: true,
                payload: {
                  applicationId: application.id,
                  publicIntentId: application.publicIntentId,
                  applicantUserId: application.applicantUserId,
                },
              }),
              this.action({
                id: `public_intent_application:${application.id}:reject`,
                label: '暂不接受',
                action: 'public_intent_application.reject',
                requiresConfirmation: false,
                payload: {
                  applicationId: application.id,
                  publicIntentId: application.publicIntentId,
                  applicantUserId: application.applicantUserId,
                },
              }),
            ]
          : []),
        this.action({
          id: `public_intent_application:${application.id}:view_profile`,
          label: '查看资料',
          action: 'public_intent_application.view_profile',
          requiresConfirmation: false,
          payload: {
            applicationId: application.id,
            publicIntentId: application.publicIntentId,
            applicantUserId: application.applicantUserId,
            targetUserId: application.applicantUserId,
            profileHref,
          },
        }),
        ...(accepted || conversationId
          ? [
              this.action({
                id: `public_intent_application:${application.id}:open_conversation`,
                label: '去消息页',
                action: 'public_intent_application.open_conversation',
                requiresConfirmation: false,
                payload: {
                  applicationId: application.id,
                  publicIntentId: application.publicIntentId,
                  applicantUserId: application.applicantUserId,
                  conversationId,
                  messagesHref,
                },
              }),
            ]
          : []),
        ...(rejected ? [] : []),
      ],
    };
  }

  private async acceptApplication(input: {
    ownerUserId: number;
    taskId: number;
    applicationId: number;
    idempotencyKey: string;
    reason?: string | null;
  }): Promise<SocialAgentIntentRouteResult> {
    const application = await this.findOwnerApplication(
      input.ownerUserId,
      input.applicationId,
    );
    const { result } = await this.sideEffects.runOnce<
      SocialAgentIntentRouteResult & Record<string, unknown>
    >({
      actorUserId: input.ownerUserId,
      taskId: input.taskId,
      effectType: 'public_intent_application.accept',
      idempotencyKey: input.idempotencyKey,
      resourceType: 'public_intent_application',
      resourceId: input.applicationId,
      payload: {
        applicationId: input.applicationId,
        reason: input.reason ?? null,
      },
      metadata: {
        publicIntentId: application.publicIntentId,
        applicantUserId: application.applicantUserId,
      },
      execute: () => this.acceptApplicationOnce(input, application),
    });
    return result;
  }

  private async acceptApplicationOnce(
    input: {
      ownerUserId: number;
      taskId: number;
      applicationId: number;
      idempotencyKey: string;
      reason?: string | null;
    },
    application: PresentedApplication,
  ): Promise<SocialAgentIntentRouteResult & Record<string, unknown>> {
    const result = await this.applications.acceptApplication(
      input.ownerUserId,
      input.applicationId,
      { reason: input.reason ?? undefined },
      input.idempotencyKey,
    );
    if (this.shouldRunInlineOutboxProvisioning()) {
      await withTimeout(
        this.outboxWorker?.processPending(1),
        this.inlineOutboxTimeoutMs(),
      ).catch(() => null);
    }
    const relationship = await this.contactPolicy.getRelationshipState(
      input.ownerUserId,
      application.applicantUserId,
    );
    const conversationId =
      relationship.conversationId ?? result.conversation.conversationId ?? null;
    const messagesHref = this.messagesHref(conversationId);
    const card = this.buildApplicationCard({
      taskId: input.taskId,
      application: {
        ...application,
        status: 'accepted',
        meetId: result.meetId ?? application.meetId ?? null,
        resolvedAt: new Date().toISOString(),
      },
      conversationId,
      meetId: result.meetId ?? application.meetId ?? null,
    });

    return this.simpleRouteResult({
      taskId: input.taskId,
      assistantMessage: conversationId
        ? '已接受对方报名，并创建了站内会话。可以去消息页继续确认细节。'
        : '已接受对方报名，站内会话正在创建中；创建完成后会回到消息页继续。',
      cards: [card],
      publicLoop: {
        stage: conversationId
          ? 'messages_handoff'
          : 'contact_confirmation_required',
        publicIntentId: application.publicIntentId,
        discoverHref: null,
        publicIntentHref: this.publicIntentHref(application.publicIntentId),
        messagesHref,
        requiredConfirmation: false,
      },
    }) as SocialAgentIntentRouteResult & Record<string, unknown>;
  }

  private async rejectApplication(input: {
    ownerUserId: number;
    taskId: number;
    applicationId: number;
    idempotencyKey: string;
    reason?: string | null;
  }): Promise<SocialAgentIntentRouteResult> {
    const application = await this.findOwnerApplication(
      input.ownerUserId,
      input.applicationId,
    );
    const { result } = await this.sideEffects.runOnce<
      SocialAgentIntentRouteResult & Record<string, unknown>
    >({
      actorUserId: input.ownerUserId,
      taskId: input.taskId,
      effectType: 'public_intent_application.reject',
      idempotencyKey: input.idempotencyKey,
      resourceType: 'public_intent_application',
      resourceId: input.applicationId,
      payload: {
        applicationId: input.applicationId,
        reason: input.reason ?? null,
      },
      metadata: {
        publicIntentId: application.publicIntentId,
        applicantUserId: application.applicantUserId,
      },
      execute: () => this.rejectApplicationOnce(input),
    });
    return result;
  }

  private async rejectApplicationOnce(input: {
    ownerUserId: number;
    taskId: number;
    applicationId: number;
    idempotencyKey: string;
    reason?: string | null;
  }): Promise<SocialAgentIntentRouteResult & Record<string, unknown>> {
    const result = await this.applications.rejectApplication(
      input.ownerUserId,
      input.applicationId,
      { reason: input.reason ?? undefined },
      input.idempotencyKey,
    );
    const card = this.buildApplicationCard({
      taskId: input.taskId,
      application: result,
    });
    return this.simpleRouteResult({
      taskId: input.taskId,
      assistantMessage: '已拒绝这条报名申请，不会创建会话或约练参与关系。',
      cards: [card],
      publicLoop: {
        stage: 'contact_confirmation_required',
        publicIntentId: result.publicIntentId,
        discoverHref: null,
        publicIntentHref: this.publicIntentHref(result.publicIntentId),
        messagesHref: null,
        requiredConfirmation: false,
      },
    }) as SocialAgentIntentRouteResult & Record<string, unknown>;
  }

  private async findOwnerApplication(
    ownerUserId: number,
    applicationId: number,
  ): Promise<PresentedApplication> {
    const applications = await this.applications.listMine(ownerUserId, 'owner');
    const application = applications.find((item) => item.id === applicationId);
    if (!application) {
      throw new BadRequestException('报名申请不存在或不属于当前用户');
    }
    return application;
  }

  private simpleRouteResult(input: {
    taskId: number;
    assistantMessage: string;
    cards?: FitMeetAlphaCard[];
    publicLoop?: SocialAgentIntentRouteResult['publicLoop'];
  }): SocialAgentIntentRouteResult {
    return {
      intent: 'action_request',
      confidence: 1,
      entities: {
        city: '',
        activityType: '',
        targetGender: '',
        timePreference: '',
        locationPreference: '',
      },
      shouldSearch: false,
      shouldReplan: false,
      shouldUpdateProfile: false,
      shouldExecuteAction: true,
      replyStrategy: 'execute_action',
      source: 'rules',
      action: 'reply',
      taskId: input.taskId,
      assistantMessage: input.assistantMessage,
      assistantMessageSource: 'deterministic_action',
      savedContext: true,
      profileUpdated: false,
      shouldQueueRun: false,
      runMode: null,
      queuedRun: null,
      pendingApproval: null,
      activityResults: [],
      profileUpdateProposal: null,
      cards: input.cards ?? [],
      publicLoop: input.publicLoop,
      permissionMode: 'confirm' as never,
    };
  }

  private action(input: {
    id: string;
    label: string;
    action: FitMeetAgentSchemaAction;
    requiresConfirmation: boolean;
    payload: Record<string, unknown>;
  }): FitMeetAlphaCard['actions'][number] {
    return {
      id: input.id,
      label: input.label,
      action: input.action,
      schemaAction: input.action,
      requiresConfirmation: input.requiresConfirmation,
      payload: input.payload,
    };
  }

  private applicationStatus(value: unknown) {
    const status = this.text(value);
    if (
      status === 'pending' ||
      status === 'accepted' ||
      status === 'rejected' ||
      status === 'cancelled'
    ) {
      return status;
    }
    return 'pending';
  }

  private publicIntentHref(value: unknown) {
    const publicIntentId = this.text(value);
    return publicIntentId
      ? `/public-intent/${encodeURIComponent(publicIntentId)}`
      : null;
  }

  private messagesHref(conversationId: unknown) {
    const id = this.text(conversationId);
    return id ? `/messages?conversationId=${encodeURIComponent(id)}` : null;
  }

  private record(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private number(value: unknown): number | null {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
  }

  private shouldRunInlineOutboxProvisioning(): boolean {
    return ['1', 'true', 'yes'].includes(
      String(process.env.FITMEET_AGENT_INLINE_OUTBOX_PROVISIONING ?? '')
        .trim()
        .toLowerCase(),
    );
  }

  private isConfirmedAccept(payload: Record<string, unknown>) {
    return (
      payload.confirmedAccept === true ||
      payload.approved === true ||
      payload.confirmed === true
    );
  }

  private inlineOutboxTimeoutMs(): number {
    const parsed = Number(
      process.env.FITMEET_AGENT_INLINE_OUTBOX_PROVISIONING_TIMEOUT_MS,
    );
    if (Number.isFinite(parsed) && parsed >= 100 && parsed <= 5_000) {
      return Math.floor(parsed);
    }
    return 1_200;
  }
}

function withTimeout<T>(
  promise: Promise<T> | undefined,
  timeoutMs: number,
): Promise<T | undefined> {
  if (!promise) return Promise.resolve(undefined);
  let timer: NodeJS.Timeout | null = null;
  return Promise.race([
    promise,
    new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), timeoutMs);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
