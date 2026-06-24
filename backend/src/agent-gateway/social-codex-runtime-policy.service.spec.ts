import { SocialCodexRuntimePolicyService } from './social-codex-runtime-policy.service';
import { SocialAgentToolName } from './social-agent-tool.types';

describe('SocialCodexRuntimePolicyService', () => {
  const service = new SocialCodexRuntimePolicyService();

  it('requires dry-run, approval, and audit for real social side effects', () => {
    const decision = service.evaluate({
      toolName: SocialAgentToolName.SendMessageToCandidate,
      payload: {
        message: '周末一起散步吗？',
        publiclyDiscoverable: true,
      },
    });

    expect(decision).toMatchObject({
      actionType: 'send_invite',
      mode: 'approval_required',
      riskLevel: 'high',
      requiresApproval: true,
      dryRunRequired: true,
      auditRequired: true,
      dryRunPreview: {
        required: true,
        title: '邀请发送草稿',
        sideEffectAllowedBeforeApproval: false,
      },
    });
    expect(decision.sandbox.externalSideEffectAllowed).toBe(false);
    expect(decision.sandbox.publicCandidateRequired).toBe(true);
    expect(decision.sandbox.publicCandidateVerified).toBe(true);
    expect(decision.reasons.join(' ')).not.toMatch(/dry-run|审计记录/i);
    expect(decision.reasons.join(' ')).toContain('预览影响');
  });

  it('allows low-risk public candidate reads', () => {
    const decision = service.evaluate({
      toolName: SocialAgentToolName.SearchPublicIntents,
      payload: { activity: '散步', area: '青岛大学附近' },
    });

    expect(decision).toMatchObject({
      actionType: 'search_public_candidates',
      mode: 'allow',
      riskLevel: 'low',
      requiresApproval: false,
      dryRunPreview: {
        required: false,
        title: '工具执行预览',
      },
    });
    expect(decision.sandbox).toMatchObject({
      readOnlyAccessAllowed: true,
      externalSideEffectAllowed: false,
      contactExchangeAllowed: false,
      preciseLocationAllowed: false,
    });
    expect(decision.reasons.join(' ')).toContain('低风险的理解');
  });

  it('treats opener generation as low-risk draft work while sending remains approval-required', () => {
    const opener = service.evaluate({
      toolName: SocialAgentToolName.DraftOpener,
      payload: {
        candidateRecordId: 501,
        targetUserId: 22,
        publiclyDiscoverable: true,
      },
    });
    const send = service.evaluate({
      toolName: SocialAgentToolName.SendMessageToCandidate,
      payload: {
        candidateRecordId: 501,
        targetUserId: 22,
        publiclyDiscoverable: true,
        message: '周末一起散步吗？',
      },
    });

    expect(opener).toMatchObject({
      actionType: 'generate_opener',
      mode: 'allow',
      riskLevel: 'low',
      requiresApproval: false,
      dryRunRequired: false,
      auditRequired: false,
    });
    expect(send).toMatchObject({
      actionType: 'send_invite',
      mode: 'approval_required',
      riskLevel: 'high',
      requiresApproval: true,
      dryRunRequired: true,
      auditRequired: true,
    });
  });

  it('treats candidate save as a low-risk local preference action', () => {
    const byTool = service.evaluate({
      toolName: SocialAgentToolName.SaveCandidate,
      payload: {
        candidateRecordId: 501,
        targetUserId: 22,
        publiclyDiscoverable: true,
      },
    });
    const byLegacyText = service.evaluate({
      actionName: 'save_candidate',
      payload: {
        candidateRecordId: 501,
        targetUserId: 22,
      },
    });

    expect(byTool).toMatchObject({
      actionType: 'save_candidate',
      mode: 'allow',
      riskLevel: 'low',
      requiresApproval: false,
      dryRunRequired: false,
      auditRequired: false,
    });
    expect(byTool.sandbox).toMatchObject({
      readOnlyAccessAllowed: true,
      externalSideEffectAllowed: false,
      publicCandidateRequired: false,
    });
    expect(byLegacyText).toMatchObject({
      actionType: 'save_candidate',
      mode: 'allow',
      requiresApproval: false,
    });
  });

  it('normalizes legacy invite_candidate actions into the canonical send_invite approval lane', () => {
    const decision = service.evaluate({
      actionType: 'invite_candidate' as never,
      payload: {
        targetUserId: 22,
        candidateRecordId: 501,
        publiclyDiscoverable: true,
        message: '周末一起散步吗？',
      },
    });

    expect(decision).toMatchObject({
      actionType: 'send_invite',
      mode: 'approval_required',
      riskLevel: 'high',
      requiresApproval: true,
      dryRunRequired: true,
      auditRequired: true,
    });
    expect(decision.idempotencyKeyScope).toBe('social_codex:send_invite');
  });

  it('treats CreateSocialRequest publish payloads as medium-risk actions that still require approval', () => {
    const decision = service.evaluate({
      toolName: SocialAgentToolName.CreateSocialRequest,
      payload: {
        mode: 'publish',
        publish: true,
        syncPublicIntent: true,
        title: '今晚青岛大学散步',
      },
    });

    expect(decision).toMatchObject({
      actionType: 'publish_social_request',
      mode: 'approval_required',
      riskLevel: 'medium',
      requiresApproval: true,
      dryRunRequired: true,
      auditRequired: true,
      dryRunPreview: {
        required: true,
        title: '约练发布草稿',
        sideEffectAllowedBeforeApproval: false,
      },
    });
    expect(decision.idempotencyKeyScope).toBe(
      'social_codex:publish_social_request',
    );
    expect(decision.sandbox.externalSideEffectAllowed).toBe(false);
  });

  it('allows opportunity drafts to describe station-only contact boundaries', () => {
    const decision = service.evaluate({
      toolName: SocialAgentToolName.CreateSocialRequest,
      payload: {
        mode: 'ai_draft',
        title: '青岛大学晨跑搭子',
        contactMethod: '先站内聊，不展示手机号',
        safetyBoundary: '公共场所，不交换联系方式',
        metadata: {
          contactInfo: {
            method: '站内沟通',
            boundary: '不会公开微信或手机号',
          },
        },
      },
    });

    expect(decision).toMatchObject({
      actionType: 'create_opportunity_card',
      mode: 'allow',
      riskLevel: 'low',
      requiresApproval: false,
    });
  });

  it('still blocks real contact methods in opportunity draft payloads', () => {
    const decision = service.evaluate({
      toolName: SocialAgentToolName.CreateSocialRequest,
      payload: {
        mode: 'ai_draft',
        title: '青岛大学晨跑搭子',
        contactMethod: '微信 fitmeet-test',
      },
    });

    expect(decision).toMatchObject({
      actionType: 'create_opportunity_card',
      mode: 'blocked',
      riskLevel: 'blocked',
    });
    expect(decision.reasons.join(' ')).toContain('消息内容包含联系方式');
  });

  it('treats allowed tools as read-only rather than side-effect capable', () => {
    const decision = service.evaluate({
      actionType: 'summarize_intent',
      payload: { message: '周末下午想散步' },
    });

    expect(decision).toMatchObject({
      mode: 'allow',
      riskLevel: 'low',
      auditRequired: false,
      dryRunRequired: false,
      sandbox: {
        readOnlyAccessAllowed: true,
        externalSideEffectAllowed: false,
        contactExchangeAllowed: false,
        preciseLocationAllowed: false,
      },
      dryRunPreview: {
        sideEffectAllowedBeforeApproval: false,
      },
    });
  });

  it('requires approval for explicit contact exchange and precise location before user confirmation', () => {
    const contact = service.evaluate({
      actionType: 'exchange_contact',
      payload: { wechat: 'fitmeet-test', conversationId: 12 },
    });
    const location = service.evaluate({
      actionType: 'reveal_precise_location',
      payload: { exactLocation: '青岛大学 3 号宿舍 401' },
    });

    expect(contact.mode).toBe('approval_required');
    expect(location.mode).toBe('approval_required');
    expect(contact.auditRequired).toBe(true);
    expect(location.reasons.join(' ')).toContain('必须先获得用户确认');
  });

  it('blocks hidden contact details inside ordinary messages before confirmation', () => {
    const decision = service.evaluate({
      actionType: 'send_message',
      payload: { message: '我的微信是 fitmeet-test' },
    });

    expect(decision.mode).toBe('blocked');
    expect(decision.reasons.join(' ')).toContain('不能混在普通消息');
  });

  it('does not treat negative contact boundary text as hidden contact details', () => {
    const decision = service.evaluate({
      actionType: 'summarize_intent',
      payload: {
        message: '第一次只在公共场所，先站内聊，不展示微信或手机号。',
      },
    });

    expect(decision).toMatchObject({
      mode: 'allow',
      riskLevel: 'low',
    });
  });

  it('does not treat negative precise-location boundary text as location leakage', () => {
    const decision = service.evaluate({
      toolName: SocialAgentToolName.CreateSocialRequest,
      payload: {
        mode: 'ai_draft',
        title: '青岛大学附近轻松跑',
        privacyNotes: [
          '见面地点只模糊到公共区域，不公开具体门牌号。',
          '不要共享实时位置或精确住址。',
        ],
      },
    });

    expect(decision).toMatchObject({
      actionType: 'create_opportunity_card',
      mode: 'allow',
      riskLevel: 'low',
    });
  });

  it('blocks stranger outreach when candidate discoverability is not verified', () => {
    const decision = service.evaluate({
      toolName: SocialAgentToolName.SendMessageToCandidate,
      payload: {
        targetUserId: 22,
        message: '周末一起散步吗？',
        candidateVisibility: 'private',
      },
    });

    expect(decision).toMatchObject({
      actionType: 'send_invite',
      mode: 'blocked',
      riskLevel: 'blocked',
      auditRequired: true,
      sandbox: expect.objectContaining({
        publicCandidateRequired: true,
        publicCandidateVerified: false,
        strangerConnectionAllowed: false,
      }),
    });
    expect(decision.reasons.join(' ')).toContain('公开可发现');
  });

  it('blocks stranger outreach when the public candidate boundary is missing', () => {
    const decision = service.evaluate({
      toolName: SocialAgentToolName.SendMessageToCandidate,
      payload: {
        targetUserId: 22,
        message: '周末一起散步吗？',
      },
    });

    expect(decision).toMatchObject({
      actionType: 'send_invite',
      mode: 'blocked',
      riskLevel: 'blocked',
      requiresApproval: false,
      dryRunRequired: false,
      auditRequired: true,
      sandbox: expect.objectContaining({
        publicCandidateRequired: true,
        publicCandidateVerified: false,
        strangerConnectionAllowed: false,
        externalSideEffectAllowed: false,
      }),
    });
    expect(decision.reasons.join(' ')).toContain('公开资料');
  });

  it('keeps existing conversations in the normal approval lane', () => {
    const decision = service.evaluate({
      toolName: SocialAgentToolName.SendMessage,
      payload: {
        conversationId: 12,
        message: '那我们周末下午确认一下时间。',
      },
    });

    expect(decision).toMatchObject({
      actionType: 'send_message',
      mode: 'approval_required',
      riskLevel: 'high',
      sandbox: expect.objectContaining({
        publicCandidateRequired: true,
        publicCandidateVerified: true,
      }),
    });
  });

  it('blocks high-frequency stranger outreach before it becomes spammy', () => {
    const decision = service.evaluate({
      toolName: SocialAgentToolName.ConnectCandidate,
      payload: {
        publiclyDiscoverable: true,
        recentStrangerContactCount: 5,
      },
    });

    expect(decision).toMatchObject({
      actionType: 'connect_candidate',
      mode: 'blocked',
      riskLevel: 'blocked',
      auditRequired: true,
      sandbox: expect.objectContaining({
        rateLimitRequired: true,
        externalSideEffectAllowed: false,
      }),
    });
    expect(decision.reasons.join(' ')).toContain('触达次数过多');
  });

  it('redacts sensitive audit payload fields', () => {
    const decision = service.evaluate({ actionType: 'send_message' });
    const audit = service.buildAuditPayload({
      userId: 1,
      decision,
      payload: {
        phone: '15253005312',
        nested: { exactLocation: '某小区 1 栋 101', publicText: '散步' },
      },
    });

    expect(audit.payload).toMatchObject({
      phone: '[redacted]',
      nested: { exactLocation: '[redacted]', publicText: '散步' },
    });
  });

  it('redacts contact and precise location hidden in generic text fields', () => {
    const decision = service.evaluate({ actionType: 'send_message' });
    const audit = service.buildAuditPayload({
      userId: 1,
      decision,
      payload: {
        message: '我的微信是 fitmeet-test',
        notes: ['电话 15253005312', '青岛大学附近'],
        nested: { reply: '青岛大学 3 号宿舍门口见' },
      },
    });

    expect(audit.payload).toMatchObject({
      message: '[redacted]',
      notes: ['[redacted]', '青岛大学附近'],
      nested: { reply: '[redacted]' },
    });
  });

  it('keeps station-only contact boundaries visible in audit payloads', () => {
    const decision = service.evaluate({
      toolName: SocialAgentToolName.CreateSocialRequest,
      payload: {
        mode: 'ai_draft',
        contactMethod: '先站内聊，不展示手机号',
      },
    });
    const audit = service.buildAuditPayload({
      userId: 1,
      decision,
      payload: {
        contactMethod: '先站内聊，不展示手机号',
        safetyBoundary: '公共场所，不交换联系方式',
      },
    });

    expect(audit.payload).toMatchObject({
      contactMethod: '先站内聊，不展示手机号',
      safetyBoundary: '公共场所，不交换联系方式',
    });
  });

  it('blocks coordinate or map-link leakage inside ordinary outreach', () => {
    const decision = service.evaluate({
      actionType: 'send_message',
      payload: {
        publiclyDiscoverable: true,
        message: '直接来这里：36.062123,120.389456，高德地图链接 amap://poi',
      },
    });

    expect(decision).toMatchObject({
      mode: 'blocked',
      riskLevel: 'blocked',
      sandbox: expect.objectContaining({
        preciseLocationAllowed: false,
        externalSideEffectAllowed: false,
      }),
    });
    expect(decision.reasons.join(' ')).toContain('精确位置');

    const audit = service.buildAuditPayload({
      userId: 1,
      decision,
      payload: {
        message: '直接来这里：36.062123,120.389456，高德地图链接 amap://poi',
        safeArea: '青岛大学附近',
      },
    });

    expect(audit.payload).toMatchObject({
      message: '[redacted]',
      safeArea: '青岛大学附近',
    });
  });
});
