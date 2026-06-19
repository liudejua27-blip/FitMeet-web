import { LifeGraphComplianceService } from './life-graph-compliance.service';
import { LifeGraphField } from './entities/life-graph-field.entity';
import {
  LifeGraphDataTier,
  LifeGraphFieldCategory,
  LifeGraphFieldSource,
  LifeGraphSignalType,
} from './life-graph.enums';

function repo() {
  return {
    create: jest.fn((value) => value),
    save: jest.fn((value) => Promise.resolve(value)),
    find: jest.fn(() => Promise.resolve([])),
    count: jest.fn(() => Promise.resolve(3)),
    delete: jest.fn(() => Promise.resolve({ affected: 2 })),
  };
}

function makeService() {
  const accessAuditLogs = repo();
  const behaviorEvents = repo();
  const signalScores = repo();
  const updateAudits = repo();
  const corrections = repo();
  const auditLogs = repo();
  const service = new LifeGraphComplianceService(
    accessAuditLogs as never,
    behaviorEvents as never,
    signalScores as never,
    updateAudits as never,
    corrections as never,
    auditLogs as never,
  );
  return {
    service,
    accessAuditLogs,
    behaviorEvents,
    signalScores,
    updateAudits,
    corrections,
    auditLogs,
  };
}

describe('LifeGraphComplianceService', () => {
  it('audits sensitive Life Graph field access with redacted metadata', async () => {
    const { service, accessAuditLogs } = makeService();
    const field = {
      userId: 7,
      category: LifeGraphFieldCategory.PrivacyBoundary,
      fieldKey: 'privacyBoundary',
      fieldValue: '手机号 15253005312',
      source: LifeGraphFieldSource.Manual,
      signalType: LifeGraphSignalType.Sensitive,
    } as LifeGraphField;

    await service.auditSensitiveAccess({
      userId: 7,
      actorUserId: 7,
      action: 'export',
      purpose: 'user_confirmed_export',
      route: '/life-graph/export-requests/1/confirm',
      fields: [field],
      metadata: {
        phone: '15253005312',
        message: '邮箱 15253005312@163.com',
      },
    });

    expect(accessAuditLogs.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        actorUserId: 7,
        action: 'export',
        dataTiers: expect.arrayContaining([LifeGraphDataTier.UserSecret]),
        fieldKeys: ['privacyBoundary'],
        metadata: expect.objectContaining({
          phone: '[REDACTED_PHONE]',
          message: expect.stringContaining('[REDACTED_EMAIL]'),
        }),
      }),
    );
  });

  it('applies retention policy in dry-run mode without deleting rows', async () => {
    const { service, behaviorEvents, accessAuditLogs } = makeService();

    const result = await service.applyRetentionPolicy({
      dryRun: true,
      actorUserId: 1,
    });

    expect(result.result.behaviorEvents).toMatchObject({
      deleted: 3,
      dryRun: true,
    });
    expect(behaviorEvents.count).toHaveBeenCalled();
    expect(behaviorEvents.delete).not.toHaveBeenCalled();
    expect(accessAuditLogs.save).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'retention_purge',
        purpose: 'life_graph_retention_dry_run',
      }),
    );
  });
});
