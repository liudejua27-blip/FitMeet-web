import { describe, expect, it } from 'vitest';
import { auditAgentPageModules } from '../debug/agentPageModuleAudit';

describe('auditAgentPageModules', () => {
  it('returns missing modules from page code and a functional prompt', () => {
    const result = auditAgentPageModules({
      featurePrompt: '检查 /agent：Activity 状态显示、Life Graph 用户确认、权限下拉框联动',
      pageCode: `
        function AgentLifeGraphProposalCard() {
          return <AgentNaturalConfirmationCard action="life_graph.accept_update" />;
        }
        const action = 'life_graph.reject_update';
        function AgentPermissionSelect({ onModeChange }) {
          return <select aria-label="权限模式" onChange={onModeChange} />;
        }
        socialAgentApi.runUserFacingStream({ permissionMode: mode });
      `,
    });

    expect(result.missingModules).toContain('Activity 状态显示');
    expect(result.modules.find((module) => module.id === 'life-graph-confirmation')?.status).toBe(
      'present',
    );
    expect(result.modules.find((module) => module.id === 'permission-dropdown-linkage')?.status).toBe(
      'present',
    );
  });

  it('passes when the requested /agent modules all have code signals', () => {
    const result = auditAgentPageModules({
      featurePrompt:
        'Activity 状态显示，推理折叠块小型化，Life Graph 用户确认，权限下拉框联动，隐私开关，调试日志，推荐卡片完整信息',
      pageCode: `
        type CardType = 'activity_status';
        function AgentActivityCard() { return <AgentActivityDetailPanel />; }
        function activityTimelineRows() { return <ol className="agent-activity-timeline" />; }
        function AgentProgressRow() { return <details className="agent-gpt-progress-summary" />; }
        const css = '.agent-gpt-step-list { display:grid; gap: 6px; }';
        function AgentLifeGraphProposalCard() { return <ConfirmationAction />; }
        const accept = 'life_graph.accept_update';
        const reject = 'life_graph.reject_update';
        function AgentPermissionSelect({ onModeChange }) {
          return <select aria-label="权限模式" onChange={onModeChange} />;
        }
        socialAgentApi.runUserFacingStream({ permissionMode: mode });
        function AgentPrivacyControls() { return showBodyInfo && showExactLocation ? '默认隐藏' : null; }
        function AgentDebugPanel() { return socialAgentDebugApi.getTaskEvents(); }
        function debugResultText() { return 'API 返回 工具 / 事件 tool_call'; }
        function UserFacingCandidateCard() { return matchScore || fitReasons || nextActionSuggestion; }
      `,
    });

    expect(result.missingModules).toEqual([]);
    expect(result.present).toBe(result.checked);
  });
});
