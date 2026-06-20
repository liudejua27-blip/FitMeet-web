import { describe, expect, it } from 'vitest';
import { auditAgentPageModules } from './utils/agentPageModuleAudit';

describe('auditAgentPageModules', () => {
  it('returns missing modules from page code and a functional prompt', () => {
    const result = auditAgentPageModules({
      featurePrompt: '检查 /agent：Activity 状态显示、Life Graph 用户确认、安全与权限入口',
      pageCode: `
        const schema = { type: 'life_graph_diff' };
        function AssistantApprovalActions() {
          return <ToolUiAction action="life_graph.accept_update" />;
        }
        const action = 'life_graph.reject_update';
        function SidebarAccountMenu() {
          return <button>安全与隐私</button>;
        }
        function Composer() { return <ComposerPrimitive.Root />; }
        socialAgentApi.runUserFacingStream({ permissionMode: mode });
      `,
    });

    expect(result.missingModules).toContain('Activity 状态显示');
    expect(result.modules.find((module) => module.id === 'life-graph-confirmation')?.status).toBe(
      'present',
    );
    expect(result.modules.find((module) => module.id === 'safety-settings-entry')?.status).toBe(
      'present',
    );
  });

  it('passes when the requested /agent modules all have code signals', () => {
    const result = auditAgentPageModules({
      featurePrompt:
        'Activity 状态显示，推理折叠块小型化，Life Graph 用户确认，安全与权限入口，隐私边界，工具过程，推荐卡片完整信息',
      pageCode: `
        type CardType = 'activity_status';
        const meetLoop = 'meet_loop_timeline activityTimeline';
        function MeetLoopTimeline() { return <section data-testid="tool-ui-meet-loop" />; }
        function ToolUiAction() { return <button data-testid="assistant-ui-tool-ui" />; }
        function AssistantReasoningGroup() { return <MessagePrimitive.GroupedParts />; }
        function AssistantThinking() { return <details data-testid="assistant-ui-thinking" />; }
        const css = '[data-testid="assistant-ui-tool-ui"] { display:grid; gap: 8px; }';
        const lifeGraph = 'profile_proposal life_graph_diff approval_required';
        const accept = 'life_graph.accept_update';
        const reject = 'life_graph.reject_update';
        function SidebarAccountMenu() {
          return <button>安全 隐私</button>;
        }
        function Composer() { return <ComposerPrimitive.Root />; }
        socialAgentApi.runUserFacingStream({ permissionMode: mode });
        function ProfilePrivacyCopy() {
          return bodyInfo && exactLocation ? '身体信息 精确位置 默认不公开 可撤回 可导出 可删除' : null;
        }
        function ToolFallback() { return userSafeSummary || toolResultSummary || retry || replay || fork; }
        const toolUiSchema = 'ToolUiSchema';
        function OpportunityCard() { return candidate_card || social_match || matchScore || fitReasons || view_profile || send_invite || connect_candidate; }
      `,
    });

    expect(result.missingModules).toEqual([]);
    expect(result.present).toBe(result.checked);
  });
});
