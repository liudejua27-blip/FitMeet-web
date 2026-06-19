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
