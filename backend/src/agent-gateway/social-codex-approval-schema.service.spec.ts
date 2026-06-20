import { SocialCodexApprovalSchemaService } from './social-codex-approval-schema.service';

describe('SocialCodexApprovalSchemaService', () => {
  const service = new SocialCodexApprovalSchemaService();

  it('uses distinct copy and dry-run preview for publish approval', () => {
    const payload = service.enrichPayload({
      actionType: 'publish_social_request',
      summary: '发布周末青岛大学散步约练卡到发现',
      riskLevel: 'medium',
      payload: { checkpointId: 42 },
    });

    expect(payload.socialCodexApproval).toMatchObject({
      actionType: 'publish_social_request',
      title: '发布到发现前需要你确认',
      confirmationLabel: '确认发布',
    });
    expect(payload.dryRunPreview).toMatchObject({
      title: '预览将公开的约练卡',
      visibleTo: '发现页公开可发现用户',
      reversible: true,
    });
    expect(payload.sideEffectAllowedBeforeApproval).toBe(false);
    expect(payload.auditRequired).toBe(true);
  });

  it('uses contact-specific copy for precise location and contact exchange', () => {
    expect(
      service.schemaFor({ actionType: 'reveal_precise_location' }),
    ).toMatchObject({
      title: '公开精确位置前需要你确认',
      confirmationLabel: '确认公开位置',
    });
    expect(service.schemaFor({ actionType: 'exchange_contact' })).toMatchObject(
      {
        title: '交换联系方式前需要你确认',
        confirmationLabel: '确认交换',
      },
    );
  });
});
