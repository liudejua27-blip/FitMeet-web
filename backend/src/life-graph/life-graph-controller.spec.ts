/* eslint-disable @typescript-eslint/require-await */
import { LifeGraphController } from './life-graph.controller';
import {
  LifeGraphAuditAction,
  LifeGraphFieldCategory,
  LifeGraphFieldSource,
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

describe('LifeGraphController', () => {
  it('handles GET /api/life-graph/me', async () => {
    const service = makeService();
    const controller = new LifeGraphController(service as never);

    await expect(controller.getMe(req)).resolves.toMatchObject({
      profile: { userId: 7 },
    });
    expect(service.getLifeGraph).toHaveBeenCalledWith(7);
  });

  it('handles PATCH /api/life-graph/me', async () => {
    const service = makeService();
    const controller = new LifeGraphController(service as never);
    const body = { city: '青岛' };

    await controller.updateMe(req, body as never);

    expect(service.updateLifeGraph).toHaveBeenCalledWith(7, body);
  });

  it('handles POST /api/life-graph/extract-from-chat', async () => {
    const service = makeService();
    const controller = new LifeGraphController(service as never);
    const body = { message: '周末下午想找跑步搭子' };

    await controller.extractFromChat(req, body as never);

    expect(service.extractFromChat).toHaveBeenCalledWith(7, body);
  });

  it('handles POST /api/life-graph/confirm-update', async () => {
    const service = makeService();
    const controller = new LifeGraphController(service as never);

    await controller.confirmUpdate(req, { proposalId: 10 });

    expect(service.confirmUpdate).toHaveBeenCalledWith(7, { proposalId: 10 });
  });

  it('handles POST /api/life-graph/reject-update', async () => {
    const service = makeService();
    const controller = new LifeGraphController(service as never);

    await controller.rejectUpdate(req, { proposalId: 10, reason: '不保存' });

    expect(service.rejectUpdate).toHaveBeenCalledWith(7, {
      proposalId: 10,
      reason: '不保存',
    });
  });

  it('handles POST /api/life-graph/revoke-field', async () => {
    const service = makeService();
    const controller = new LifeGraphController(service as never);
    const body = {
      category: LifeGraphFieldCategory.FitnessActivity,
      fieldKey: 'sportsPreferences',
    };

    await controller.revokeField(req, body);

    expect(service.revokeField).toHaveBeenCalledWith(7, body);
  });

  it('handles GET /api/life-graph/completeness', async () => {
    const service = makeService();
    const controller = new LifeGraphController(service as never);

    await expect(controller.getCompleteness(req)).resolves.toMatchObject({
      completenessScore: 72,
    });
  });

  it('handles GET /api/life-graph/match-signals', async () => {
    const service = makeService();
    const controller = new LifeGraphController(service as never);

    await controller.getMatchSignals(req);

    expect(service.getUnifiedMatchSignals).toHaveBeenCalledWith(7);
  });

  it('handles GET /api/life-graph/audit with pagination params', async () => {
    const service = makeService();
    const controller = new LifeGraphController(service as never);

    await controller.getAudit(req, '20', '2026-05-26T00:00:00.000Z');

    expect(service.getAuditLogs).toHaveBeenCalledWith(7, {
      limit: 20,
      cursor: '2026-05-26T00:00:00.000Z',
    });
  });
});
