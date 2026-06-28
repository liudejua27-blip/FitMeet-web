import { SocialAgentApplicationActionService } from './social-agent-application-action.service';

const pendingApplication = {
  id: 42,
  publicIntentId: 'intent_abc',
  ownerUserId: 7,
  applicantUserId: 11,
  status: 'pending',
  message: '我也想参加这次散步。',
  meetId: null,
  resolvedAt: null,
  createdAt: new Date('2026-06-28T10:00:00Z'),
  updatedAt: new Date('2026-06-28T10:00:00Z'),
};

function makeHarness() {
  const applications = {
    listMine: jest.fn().mockResolvedValue([pendingApplication]),
    acceptApplication: jest.fn().mockResolvedValue({
      applicationId: 42,
      status: 'accepted',
      meetId: 99,
      conversation: {
        status: 'provisioning',
        conversationId: null,
      },
    }),
    rejectApplication: jest.fn().mockResolvedValue({
      ...pendingApplication,
      status: 'rejected',
      resolvedAt: new Date('2026-06-28T10:05:00Z'),
    }),
  };
  const contactPolicy = {
    getRelationshipState: jest.fn().mockResolvedValue({
      messagePermission: 'open',
      conversationId: 'conv_123',
      blocked: false,
    }),
  };
  const outboxWorker = {
    processPending: jest.fn().mockResolvedValue({ processed: 1 }),
  };
  const sideEffects = {
    runOnce: jest.fn(async (input) => ({
      result: await input.execute(),
      reused: false,
    })),
  };
  const service = new SocialAgentApplicationActionService(
    applications as never,
    contactPolicy as never,
    sideEffects as never,
    outboxWorker as never,
  );
  return { applications, contactPolicy, outboxWorker, sideEffects, service };
}

describe('SocialAgentApplicationActionService', () => {
  const originalInlineOutbox =
    process.env.FITMEET_AGENT_INLINE_OUTBOX_PROVISIONING;
  const originalInlineOutboxTimeout =
    process.env.FITMEET_AGENT_INLINE_OUTBOX_PROVISIONING_TIMEOUT_MS;

  afterEach(() => {
    if (originalInlineOutbox === undefined) {
      delete process.env.FITMEET_AGENT_INLINE_OUTBOX_PROVISIONING;
    } else {
      process.env.FITMEET_AGENT_INLINE_OUTBOX_PROVISIONING =
        originalInlineOutbox;
    }
    if (originalInlineOutboxTimeout === undefined) {
      delete process.env.FITMEET_AGENT_INLINE_OUTBOX_PROVISIONING_TIMEOUT_MS;
    } else {
      process.env.FITMEET_AGENT_INLINE_OUTBOX_PROVISIONING_TIMEOUT_MS =
        originalInlineOutboxTimeout;
    }
  });

  it('accepts an owner application without forcing outbox work into the request path by default', async () => {
    const { applications, contactPolicy, outboxWorker, sideEffects, service } =
      makeHarness();

    const result = await service.performApplicationAction({
      ownerUserId: 7,
      taskId: 101,
      action: 'public_intent_application.accept',
      body: {
        action: 'public_intent_application.accept',
        idempotencyKey: 'accept:42',
        payload: { applicationId: 42, confirmedAccept: true },
      },
    });

    expect(applications.listMine).toHaveBeenCalledWith(7, 'owner');
    expect(applications.acceptApplication).toHaveBeenCalledWith(
      7,
      42,
      { reason: undefined },
      'accept:42',
    );
    expect(sideEffects.runOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 7,
        taskId: 101,
        effectType: 'public_intent_application.accept',
        idempotencyKey: 'accept:42',
        resourceType: 'public_intent_application',
        resourceId: 42,
        execute: expect.any(Function),
      }),
    );
    expect(outboxWorker.processPending).not.toHaveBeenCalled();
    expect(contactPolicy.getRelationshipState).toHaveBeenCalledWith(7, 11);
    expect(result.publicLoop).toEqual(
      expect.objectContaining({
        stage: 'messages_handoff',
        publicIntentId: 'intent_abc',
        publicIntentHref: '/public-intent/intent_abc',
        messagesHref: '/messages?conversationId=conv_123',
      }),
    );
    expect(result.cards?.[0]).toEqual(
      expect.objectContaining({
        type: 'public_intent_application_card',
        schemaType: 'public_intent.application',
        status: 'completed',
      }),
    );
    expect(result.cards?.[0]?.data).toEqual(
      expect.objectContaining({
        applicationId: 42,
        applicantUserId: 11,
        conversationId: 'conv_123',
        messagesHref: '/messages?conversationId=conv_123',
      }),
    );
  });

  it('can provision one outbox item inline behind an explicit feature flag', async () => {
    process.env.FITMEET_AGENT_INLINE_OUTBOX_PROVISIONING = '1';
    const { outboxWorker, service } = makeHarness();

    await service.performApplicationAction({
      ownerUserId: 7,
      taskId: 101,
      action: 'public_intent_application.accept',
      body: {
        action: 'public_intent_application.accept',
        idempotencyKey: 'accept:42:inline',
        payload: { applicationId: 42, confirmedAccept: true },
      },
    });

    expect(outboxWorker.processPending).toHaveBeenCalledWith(1);
  });

  it('requires an explicit confirmation field before accepting an application', async () => {
    const { applications, sideEffects, service } = makeHarness();

    await expect(
      service.performApplicationAction({
        ownerUserId: 7,
        taskId: 101,
        action: 'public_intent_application.accept',
        body: {
          action: 'public_intent_application.accept',
          idempotencyKey: 'accept:42:missing-confirmation',
          payload: { applicationId: 42 },
        },
      }),
    ).rejects.toThrow('public_intent_application_accept_confirmation_required');

    expect(applications.acceptApplication).not.toHaveBeenCalled();
    expect(sideEffects.runOnce).not.toHaveBeenCalled();
  });

  it('rejects an owner application without creating a conversation handoff', async () => {
    const { applications, outboxWorker, sideEffects, service } = makeHarness();

    const result = await service.performApplicationAction({
      ownerUserId: 7,
      taskId: 101,
      action: 'public_intent_application.reject',
      body: {
        action: 'public_intent_application.reject',
        payload: { applicationId: 42 },
      },
    });

    expect(applications.rejectApplication).toHaveBeenCalledWith(
      7,
      42,
      { reason: undefined },
      'agent:public-intent-application:42:reject',
    );
    expect(sideEffects.runOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 7,
        taskId: 101,
        effectType: 'public_intent_application.reject',
        idempotencyKey: 'agent:public-intent-application:42:reject',
        resourceType: 'public_intent_application',
        resourceId: 42,
        execute: expect.any(Function),
      }),
    );
    expect(outboxWorker.processPending).not.toHaveBeenCalled();
    expect(result.publicLoop).toEqual(
      expect.objectContaining({
        publicIntentId: 'intent_abc',
        messagesHref: null,
      }),
    );
    expect(result.cards?.[0]?.data).toEqual(
      expect.objectContaining({
        status: 'rejected',
        applicationId: 42,
      }),
    );
  });
});
