/* eslint-disable @typescript-eslint/require-await */
import { LifeGraphController } from './life-graph.controller';
import {
  LifeGraphAuditAction,
  LifeGraphBehaviorEventType,
  LifeGraphCorrectionType,
  LifeGraphFieldCategory,
  LifeGraphFieldSource,
  LifeGraphSignalKey,
} from './life-graph.enums';

const req = { user: { id: 7 } } as never;

function makeService() {
  return {
    getLifeGraph: jest.fn(async () => ({
      profile: { userId: 7 },
      fields: {},
      completeness: {},
    })),
    updateLifeGraph: jest.fn(async () => ({
      profile: { userId: 7 },
      fields: {},
      completeness: {},
    })),
    getCompleteness: jest.fn(async () => ({
      completenessScore: 72,
      modules: {},
      missingFields: [],
    })),
    getUnifiedMatchSignals: jest.fn(async () => ({
      identitySignals: {},
      safetySignals: {},
    })),
    getAuditLogs: jest.fn(async () => [
      {
        id: 1,
        userId: 7,
        category: LifeGraphFieldCategory.Identity,
        fieldKey: 'city',
        source: LifeGraphFieldSource.Manual,
        action: LifeGraphAuditAction.Updated,
        createdAt: new Date().toISOString(),
      },
    ]),
    getBehaviorEvents: jest.fn(async () => [
      {
        id: 1,
        userId: 7,
        eventType: LifeGraphBehaviorEventType.ActivityCompleted,
        createdAt: new Date().toISOString(),
      },
    ]),
    recordBehaviorEvent: jest.fn(async () => ({
      id: 1,
      userId: 7,
      eventType: LifeGraphBehaviorEventType.ActivityCompleted,
    })),
    getSignalScores: jest.fn(async () => [
      {
        signalKey: LifeGraphSignalKey.Reliability,
        score: 82,
      },
    ]),
    getUpdateAudits: jest.fn(async () => [
      {
        id: 1,
        userFacingSummary: 'updated',
      },
    ]),
    correctLifeGraph: jest.fn(async () => ({
      id: 1,
      correctionType: LifeGraphCorrectionType.NotTrue,
    })),
    extractFromChat: jest.fn(async () => ({
      proposalId: 10,
      proposedFields: [],
    })),
    confirmUpdate: jest.fn(async () => ({
      proposalId: 10,
      status: 'confirmed',
    })),
    rejectUpdate: jest.fn(async () => ({ proposalId: 10, status: 'rejected' })),
    revokeField: jest.fn(async () => ({
      profile: { userId: 7 },
      fields: {},
      completeness: {},
    })),
  };
}

function makeSecurityRequests() {
  return {
    createRequest: jest.fn(),
    confirmExportRequest: jest.fn(),
    confirmDeleteRequest: jest.fn(),
  };
}

describe('LifeGraphController', () => {
  it('handles GET /api/life-graph/me', async () => {
    const service = makeService();
    const controller = new LifeGraphController(
      service as never,
      makeSecurityRequests() as never,
    );

    await expect(controller.getMe(req)).resolves.toMatchObject({
      profile: { userId: 7 },
    });
    expect(service.getLifeGraph).toHaveBeenCalledWith(7);
  });

  it('handles PATCH /api/life-graph/me', async () => {
    const service = makeService();
    const controller = new LifeGraphController(
      service as never,
      makeSecurityRequests() as never,
    );
    const body = { city: '青岛' };

    await controller.updateMe(req, body as never);

    expect(service.updateLifeGraph).toHaveBeenCalledWith(7, body);
  });

  it('handles POST /api/life-graph/extract-from-chat', async () => {
    const service = makeService();
    const controller = new LifeGraphController(
      service as never,
      makeSecurityRequests() as never,
    );
    const body = { message: '周末下午想找跑步搭子' };

    await controller.extractFromChat(req, body as never);

    expect(service.extractFromChat).toHaveBeenCalledWith(7, body);
  });

  it('handles POST /api/life-graph/confirm-update', async () => {
    const service = makeService();
    const controller = new LifeGraphController(
      service as never,
      makeSecurityRequests() as never,
    );

    await controller.confirmUpdate(req, { proposalId: 10 });

    expect(service.confirmUpdate).toHaveBeenCalledWith(7, { proposalId: 10 });
  });

  it('handles POST /api/life-graph/reject-update', async () => {
    const service = makeService();
    const controller = new LifeGraphController(
      service as never,
      makeSecurityRequests() as never,
    );

    await controller.rejectUpdate(req, { proposalId: 10, reason: '不保存' });

    expect(service.rejectUpdate).toHaveBeenCalledWith(7, {
      proposalId: 10,
      reason: '不保存',
    });
  });

  it('handles POST /api/life-graph/revoke-field', async () => {
    const service = makeService();
    const controller = new LifeGraphController(
      service as never,
      makeSecurityRequests() as never,
    );
    const body = {
      category: LifeGraphFieldCategory.FitnessActivity,
      fieldKey: 'sportsPreferences',
    };

    await controller.revokeField(req, body);

    expect(service.revokeField).toHaveBeenCalledWith(7, body);
  });

  it('handles GET /api/life-graph/completeness', async () => {
    const service = makeService();
    const controller = new LifeGraphController(
      service as never,
      makeSecurityRequests() as never,
    );

    await expect(controller.getCompleteness(req)).resolves.toMatchObject({
      completenessScore: 72,
    });
  });

  it('handles GET /api/life-graph/match-signals', async () => {
    const service = makeService();
    const controller = new LifeGraphController(
      service as never,
      makeSecurityRequests() as never,
    );

    await controller.getMatchSignals(req);

    expect(service.getUnifiedMatchSignals).toHaveBeenCalledWith(7);
  });

  it('handles GET /api/life-graph/audit with pagination params', async () => {
    const service = makeService();
    const controller = new LifeGraphController(
      service as never,
      makeSecurityRequests() as never,
    );

    await controller.getAudit(req, '20', '2026-05-26T00:00:00.000Z');

    expect(service.getAuditLogs).toHaveBeenCalledWith(7, {
      limit: 20,
      cursor: '2026-05-26T00:00:00.000Z',
    });
  });

  it('handles behavior signals and correction endpoints', async () => {
    const service = makeService();
    const controller = new LifeGraphController(
      service as never,
      makeSecurityRequests() as never,
    );
    const eventBody = {
      eventType: LifeGraphBehaviorEventType.ActivityCompleted,
      naturalSummary: '你完成了一次跑步约练。',
    };
    const correctionBody = {
      correctionType: LifeGraphCorrectionType.NotTrue,
      signalKey: LifeGraphSignalKey.SameSchoolPreference,
      note: '同校不是必须。',
    };

    await controller.recordBehaviorEvent(req, eventBody);
    await controller.getBehaviorEvents(req, '10', '2026-05-26T00:00:00.000Z');
    await controller.getSignalScores(req);
    await controller.getUpdateAudits(req, '10', '2026-05-26T00:00:00.000Z');
    await controller.correctLifeGraph(req, correctionBody);

    expect(service.recordBehaviorEvent).toHaveBeenCalledWith(7, eventBody);
    expect(service.getBehaviorEvents).toHaveBeenCalledWith(7, {
      limit: 10,
      cursor: '2026-05-26T00:00:00.000Z',
    });
    expect(service.getSignalScores).toHaveBeenCalledWith(7);
    expect(service.getUpdateAudits).toHaveBeenCalledWith(7, {
      limit: 10,
      cursor: '2026-05-26T00:00:00.000Z',
    });
    expect(service.correctLifeGraph).toHaveBeenCalledWith(7, correctionBody);
  });
});
