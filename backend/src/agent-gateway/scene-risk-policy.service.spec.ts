import { SceneRiskPolicyService } from './scene-risk-policy.service';

describe('SceneRiskPolicyService', () => {
  const service = new SceneRiskPolicyService();

  it('requires confirmation for fitness workout messages', () => {
    const policy = service.evaluate({
      sceneType: 'fitness',
      actionType: 'send_message',
      text: '找健身搭子一起约练',
      permissionMode: 'limited_auto',
    });

    expect(policy).toMatchObject({
      riskLevel: 'medium',
      requiresConfirmation: true,
      requiresDoubleConfirmation: false,
      sceneType: 'fitness',
    });
  });

  it('requires double confirmation for drinking scenes', () => {
    const policy = service.evaluate({
      sceneType: 'drinking',
      actionType: 'offline_meeting',
      text: '周五晚上酒局',
      permissionMode: 'open',
    });

    expect(policy.riskLevel).toBe('high');
    expect(policy.requiresConfirmation).toBe(true);
    expect(policy.requiresDoubleConfirmation).toBe(true);
  });

  it('marks mahjong and poker with money as high risk', () => {
    const mahjong = service.evaluate({
      sceneType: 'mahjong',
      actionType: 'create_activity',
      text: '麻将 AA 牌费',
      permissionMode: 'open',
    });
    const poker = service.evaluate({
      sceneType: 'poker',
      actionType: 'create_activity',
      text: '扑克带筹码',
      permissionMode: 'open',
    });

    expect(mahjong.riskLevel).toBe('high');
    expect(poker.riskLevel).toBe('high');
    expect(mahjong.safetyPrompts.join(' ')).toContain('公开');
  });

  it('blocks automatic precise location sharing', () => {
    const policy = service.evaluate({
      actionType: 'precise_location',
      text: '共享实时定位',
      permissionMode: 'open',
    });

    expect(policy.riskLevel).toBe('critical');
    expect(policy.requiresConfirmation).toBe(true);
    expect(policy.blockedActions).toContain('auto_execute');
  });

  it('uses Life Graph safety signals for location, public place, and night rules', () => {
    const location = service.evaluate({
      actionType: 'share_location',
      text: '共享实时定位',
      safetySignals: { locationSharingAllowed: false },
    });
    const night = service.evaluate({
      actionType: 'offline_meeting',
      text: '今晚跑步见面',
      safetySignals: { acceptsNightMeet: false, publicPlaceOnly: true },
    });

    expect(location.riskLevel).toBe('critical');
    expect(location.blockedActions).toContain('precise_location');
    expect(night.riskLevel).toBe('high');
    expect(night.safetyPrompts.join(' ')).toContain('公共场所');
    expect(night.safetyPrompts.join(' ')).toContain('夜间');
  });

  it('models permission modes consistently', () => {
    expect(
      service.evaluate({
        actionType: 'send_message',
        permissionMode: 'manual_confirm',
      }).requiresConfirmation,
    ).toBe(true);
    expect(
      service.evaluate({
        actionType: 'search_candidates',
        permissionMode: 'limited_auto',
      }).requiresConfirmation,
    ).toBe(false);
    expect(
      service.evaluate({
        actionType: 'send_message',
        permissionMode: 'limited_auto',
      }).requiresConfirmation,
    ).toBe(true);
    const lab = service.evaluate({
      actionType: 'send_message',
      permissionMode: 'lab',
    });
    expect(lab.requiresConfirmation).toBe(false);
    expect(lab.blockedActions).toContain('execute_real_action');
  });
});
