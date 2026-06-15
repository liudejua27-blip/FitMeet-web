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
      { label: 'activity tool schema', pattern: /meet_loop_timeline|activityTimeline/ },
      { label: 'assistant-ui timeline renderer', pattern: /MeetLoopTimeline|tool-ui-meet-loop/ },
      { label: 'message part action surface', pattern: /ToolUiAction|assistant-ui-tool-ui/ },
    ],
  },
  {
    id: 'reasoning-collapse-compact',
    title: '推理折叠块小型化',
    promptPatterns: [/推理|折叠|分析中|工具调用|reasoning|tool/i],
    codeSignals: [
      { label: 'assistant-ui reasoning group', pattern: /MessagePrimitive\.GroupedParts/ },
      { label: 'details disclosure', pattern: /<details|details\s*\./ },
      { label: 'assistant-ui thinking state', pattern: /assistant-ui-thinking/ },
      { label: 'assistant-ui tool message part', pattern: /assistant-ui-tool-(?:ui|fallback|group)/ },
    ],
  },
  {
    id: 'life-graph-confirmation',
    title: 'Life Graph 用户确认',
    promptPatterns: [/life graph|画像|用户确认|确认前|写入数据库/i],
    codeSignals: [
      { label: 'profile proposal schema', pattern: /profile_proposal|life_graph_diff/ },
      { label: 'accept update action', pattern: /life_graph\.accept_update/ },
      { label: 'reject update action', pattern: /life_graph\.reject_update/ },
      { label: 'assistant-ui approval action', pattern: /approval_required|ToolUiAction/ },
    ],
  },
  {
    id: 'safety-settings-entry',
    title: '安全与权限入口',
    promptPatterns: [/权限|基础|正常|开放|permission|安全|隐私/i],
    codeSignals: [
      { label: 'account menu safety item', pattern: /Safety|安全|privacy|隐私/ },
      { label: 'permission mode carried by stream transport', pattern: /runUserFacingStream/ },
      { label: 'request permission mode', pattern: /permissionMode:\s*mode/ },
      { label: 'composer keeps business controls out', pattern: /ComposerPrimitive\.Root/ },
    ],
  },
  {
    id: 'privacy-boundary-copy',
    title: '隐私边界说明',
    promptPatterns: [/隐私|身体信息|精确位置|privacy|location/i],
    codeSignals: [
      { label: 'body info boundary', pattern: /身体信息|body info|bodyInfo/ },
      { label: 'exact location boundary', pattern: /精确位置|exact location|exactLocation/ },
      { label: 'private by default text', pattern: /默认不公开|默认隐藏|private by default/ },
      { label: 'revoke or export control', pattern: /撤回|导出|删除|revoke|export|delete/ },
    ],
  },
  {
    id: 'tool-trace-fallback',
    title: '工具过程折叠摘要',
    promptPatterns: [/调试|日志|QA|debug|tool_call|API|trace|工具过程/i],
    codeSignals: [
      { label: 'tool fallback component', pattern: /ToolFallback|tool-fallback/ },
      { label: 'schema driven tool ui', pattern: /toolUiSchema|ToolUiSchema/ },
      { label: 'safe summary text', pattern: /summary|userSafeSummary|toolResultSummary/ },
      { label: 'retry replay fork actions', pattern: /retry|replay|fork/ },
    ],
  },
  {
    id: 'candidate-tool-ui',
    title: '候选推荐 Tool UI',
    promptPatterns: [/推荐|匹配度|匹配理由|下一步|candidate/i],
    codeSignals: [
      { label: 'candidate schema', pattern: /candidate_card|OpportunityCard|social_match/ },
      { label: 'match score', pattern: /matchScore|matchingScore|匹配度/ },
      { label: 'reason list', pattern: /fitReasons|匹配理由/ },
      { label: 'message part actions', pattern: /view_profile|send_invite|connect_candidate|ToolUiAction/ },
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
