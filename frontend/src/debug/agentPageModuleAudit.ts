export type AgentPageModuleAuditStatus = 'present' | 'missing';

export type AgentPageModuleAuditItem = {
  id: string;
  title: string;
  status: AgentPageModuleAuditStatus;
  evidence: string[];
  missingSignals: string[];
};

export type AgentPageModuleAuditResult = {
  checked: number;
  present: number;
  missing: number;
  missingModules: string[];
  modules: AgentPageModuleAuditItem[];
};

type AgentPageModuleRule = {
  id: string;
  title: string;
  promptPatterns: RegExp[];
  codeSignals: Array<{ label: string; pattern: RegExp }>;
};

const agentPageModuleRules: AgentPageModuleRule[] = [
  {
    id: 'activity-status',
    title: 'Activity 状态显示',
    promptPatterns: [/activity|活动|约练|签到|证明|评价/i],
    codeSignals: [
      { label: 'activity_status card type', pattern: /activity_status/ },
      { label: 'activity status card component', pattern: /AgentActivityCard/ },
      { label: 'activity timeline', pattern: /activityTimelineRows|agent-activity-timeline/ },
      { label: 'activity detail panel', pattern: /AgentActivityDetailPanel/ },
    ],
  },
  {
    id: 'reasoning-collapse-compact',
    title: '推理折叠块小型化',
    promptPatterns: [/推理|折叠|分析中|工具调用|reasoning|tool/i],
    codeSignals: [
      { label: 'progress row component', pattern: /AgentProgressRow/ },
      { label: 'details disclosure', pattern: /<details|details\s*\./ },
      { label: 'progress summary container', pattern: /agent-gpt-progress-summary/ },
      { label: 'compact step styles', pattern: /agent-gpt-step-list[\s\S]{0,120}gap:\s*6px/ },
    ],
  },
  {
    id: 'life-graph-confirmation',
    title: 'Life Graph 用户确认',
    promptPatterns: [/life graph|画像|用户确认|确认前|写入数据库/i],
    codeSignals: [
      { label: 'profile proposal card', pattern: /profile_proposal|AgentLifeGraphProposalCard/ },
      { label: 'accept update action', pattern: /life_graph\.accept_update/ },
      { label: 'reject update action', pattern: /life_graph\.reject_update/ },
      { label: 'confirmation UI', pattern: /AgentNaturalConfirmationCard|ConfirmationAction/ },
    ],
  },
  {
    id: 'permission-dropdown-linkage',
    title: '权限下拉框联动',
    promptPatterns: [/权限|基础|正常|开放|permission|dropdown|下拉/i],
    codeSignals: [
      { label: 'permission select component', pattern: /AgentPermissionSelect/ },
      { label: 'select control', pattern: /<select[\s\S]{0,240}权限模式/ },
      { label: 'mode state setter', pattern: /onModeChange|setMode/ },
      { label: 'request permission mode', pattern: /permissionMode:\s*mode/ },
    ],
  },
  {
    id: 'privacy-controls',
    title: '隐私开关行为',
    promptPatterns: [/隐私|身体信息|精确位置|privacy|location/i],
    codeSignals: [
      { label: 'privacy controls component', pattern: /AgentPrivacyControls/ },
      { label: 'body info switch', pattern: /showBodyInfo|身体信息/ },
      { label: 'exact location switch', pattern: /showExactLocation|精确位置/ },
      { label: 'hidden by default text', pattern: /默认隐藏|Hidden by default/ },
    ],
  },
  {
    id: 'debug-logs',
    title: '前端调试日志',
    promptPatterns: [/调试|日志|QA|debug|tool_call|API/i],
    codeSignals: [
      { label: 'debug panel', pattern: /AgentDebugPanel/ },
      { label: 'task events API', pattern: /getTaskEvents|socialAgentDebugApi/ },
      { label: 'API response summary', pattern: /debugResultText|API 返回/ },
      { label: 'tool event details', pattern: /工具 \/ 事件|tool_call/ },
    ],
  },
  {
    id: 'candidate-complete-info',
    title: '推荐卡片完整信息',
    promptPatterns: [/推荐|匹配度|匹配理由|下一步|candidate/i],
    codeSignals: [
      { label: 'candidate card component', pattern: /UserFacingCandidateCard/ },
      { label: 'match score', pattern: /matchScore|matchingScore|匹配度/ },
      { label: 'reason list', pattern: /fitReasons|匹配理由/ },
      { label: 'next action', pattern: /nextActionSuggestion|Next step|下一步/ },
    ],
  },
];

export function auditAgentPageModules(input: {
  pageCode: string;
  featurePrompt: string;
}): AgentPageModuleAuditResult {
  const code = input.pageCode || '';
  const prompt = input.featurePrompt || '';
  const selectedRules = agentPageModuleRules.filter((rule) =>
    rule.promptPatterns.some((pattern) => pattern.test(prompt)),
  );
  const rules = selectedRules.length ? selectedRules : agentPageModuleRules;
  const modules = rules.map((rule) => {
    const evidence = rule.codeSignals
      .filter((signal) => signal.pattern.test(code))
      .map((signal) => signal.label);
    const missingSignals = rule.codeSignals
      .filter((signal) => !signal.pattern.test(code))
      .map((signal) => signal.label);
    return {
      id: rule.id,
      title: rule.title,
      status: missingSignals.length ? 'missing' : 'present',
      evidence,
      missingSignals,
    } satisfies AgentPageModuleAuditItem;
  });

  const missingModules = modules
    .filter((module) => module.status === 'missing')
    .map((module) => module.title);

  return {
    checked: modules.length,
    present: modules.length - missingModules.length,
    missing: missingModules.length,
    missingModules,
    modules,
  };
}
