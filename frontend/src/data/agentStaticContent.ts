export const gatewayOverviewMetrics = [
  { labelZh: '已连接智能体', labelEn: 'CONNECTED AGENTS', value: '0', tone: 'neutral' },
  { labelZh: '待审批行为', labelEn: 'PENDING ACTIONS', value: '0', tone: 'stable' },
  { labelZh: '今日行为记录', labelEn: 'TODAY LOGS', value: '0', tone: 'neutral' },
  { labelZh: '当前安全状态', labelEn: 'SAFETY STATE', value: 'Stable', tone: 'stable' },
  { labelZh: 'API Gateway', labelEn: 'API GATEWAY', value: '待登录', tone: 'neutral' },
] as const;

export const safetyProtocols = [
  'Agent 不能冒充真人',
  'Agent 不能无限制私信',
  'Agent 不能未经允许索要联系方式',
  'Agent 不能替用户承诺关系',
  '高风险行为必须经过用户确认',
  '所有 Agent 行为都会记录日志',
] as const;
