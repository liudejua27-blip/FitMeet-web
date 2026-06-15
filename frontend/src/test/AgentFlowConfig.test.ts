import { describe, expect, it } from 'vitest';
import {
  AGENT_FLOW_INTERESTS,
  AGENT_FLOW_PHASE_CONFIG,
} from '../components/agent-workspace/agentFlow.constants';
import type { AgentFlowPhase } from '../components/agent-workspace/agentFlow.types';

const phases: AgentFlowPhase[] = [
  'welcome',
  'inputFocused',
  'userSubmitted',
  'analyzingIntent',
  'discoveringScenes',
  'recommendationsReady',
  'generatingOpener',
  'openerReady',
  'safetyReminder',
  'awaitingConfirmation',
  'completed',
  'missingInfo',
  'failed',
];

describe('Agent flow phase config', () => {
  it('defines a complete UI contract for every Agent phase', () => {
    expect(Object.keys(AGENT_FLOW_PHASE_CONFIG).sort()).toEqual([...phases].sort());

    for (const phase of phases) {
      const config = AGENT_FLOW_PHASE_CONFIG[phase];
      expect(config.title.trim()).toBeTruthy();
      expect(config.description.trim()).toBeTruthy();
      expect(config.recommendedDuration).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(config.nextAllowedActions)).toBe(true);
      expect(config.nextAllowedActions.length).toBeGreaterThan(0);
    }
  });

  it('maps product phases to the expected AntGuide visual states', () => {
    expect(AGENT_FLOW_PHASE_CONFIG.welcome.antState).toBe('idle');
    expect(AGENT_FLOW_PHASE_CONFIG.inputFocused.antTarget).toBe('input');
    expect(AGENT_FLOW_PHASE_CONFIG.analyzingIntent.antState).toBe('thinking');
    expect(AGENT_FLOW_PHASE_CONFIG.discoveringScenes.antState).toBe('discovering');
    expect(AGENT_FLOW_PHASE_CONFIG.recommendationsReady.antState).toBe('recommending');
    expect(AGENT_FLOW_PHASE_CONFIG.generatingOpener.antState).toBe('thinking');
    expect(AGENT_FLOW_PHASE_CONFIG.safetyReminder.antState).toBe('reminding');
    expect(AGENT_FLOW_PHASE_CONFIG.awaitingConfirmation.antState).toBe('confirming');
    expect(AGENT_FLOW_PHASE_CONFIG.completed.antState).toBe('success');
    expect(AGENT_FLOW_PHASE_CONFIG.missingInfo.antState).toBe('error');
    expect(AGENT_FLOW_PHASE_CONFIG.failed.antState).toBe('error');
  });

  it('keeps mock discovery labels but uses neutral missing-info copy', () => {
    expect([...AGENT_FLOW_INTERESTS]).toEqual(['咖啡', 'Citywalk', '散步', '轻聊天']);
    expect(AGENT_FLOW_PHASE_CONFIG.missingInfo).toMatchObject({
      antState: 'error',
      antTarget: 'input',
      title: '先输入一句话',
      description: '可以直接问我一个问题，或描述你现在想完成的事。',
    });
  });

  it('keeps panel visibility in sync with safety and confirmation phases', () => {
    expect(AGENT_FLOW_PHASE_CONFIG.discoveringScenes.rightPanelState).toBe(
      'loadingRecommendations',
    );
    expect(AGENT_FLOW_PHASE_CONFIG.safetyReminder.safetyCardVisible).toBe(true);
    expect(AGENT_FLOW_PHASE_CONFIG.safetyReminder.confirmCardVisible).toBe(false);
    expect(AGENT_FLOW_PHASE_CONFIG.openerReady.rightPanelState).toBe('recommendations');
    expect(AGENT_FLOW_PHASE_CONFIG.openerReady.confirmCardVisible).toBe(false);
    expect(AGENT_FLOW_PHASE_CONFIG.awaitingConfirmation.confirmCardVisible).toBe(true);
    expect(AGENT_FLOW_PHASE_CONFIG.awaitingConfirmation.antTarget).toBe('confirmButton');
  });
});
