import type { AgentConnection, AgentPermissionModeProfile, PreferenceCalibration } from '@/types/agent';

export const agentConnections: AgentConnection[] = [
  {
    id: 'openclaw',
    name: 'OpenClaw',
    provider: 'OpenClaw',
    type: 'External Autonomous Agent',
    status: 'Connected',
    permissionMode: 'Basic Mode',
    tokenStatus: 'Token Active',
    lastActiveAt: '2 minutes ago',
    riskStatus: 'Low Risk',
    description:
      'A social discovery agent that can search, recommend, and prepare user-approved outreach drafts inside FitMeet.',
  },
  {
    id: 'codex',
    name: 'Codex',
    provider: 'Codex',
    type: 'Code-native Agent',
    status: 'Pending Approval',
    permissionMode: 'Open Mode',
    tokenStatus: 'OAuth Required',
    lastActiveAt: 'No recent activity',
    riskStatus: 'Needs Review',
    description:
      'A code-native intelligence interface prepared for controlled workflow experiments and agent-to-agent tests.',
  },
  {
    id: 'hermes',
    name: 'Hermes',
    provider: 'Hermes',
    type: 'Communication Agent',
    status: 'Not Connected',
    permissionMode: 'None',
    tokenStatus: 'Not Generated',
    lastActiveAt: 'No recent activity',
    riskStatus: 'Unknown',
    description:
      'A communication-focused agent designed for message drafting, etiquette suggestions, and conversational support.',
  },
  {
    id: 'qclaw',
    name: 'QClaw',
    provider: 'QClaw',
    type: 'Custom Workflow Agent',
    status: 'Disabled',
    permissionMode: 'Standard Mode',
    tokenStatus: 'Token Expired',
    lastActiveAt: 'Yesterday 21:18',
    riskStatus: 'Medium Risk',
    description:
      'A workflow agent with expired access that can be re-enabled after token renewal and boundary confirmation.',
  },
  {
    id: 'custom-agent',
    name: 'Custom Agent',
    provider: 'Custom',
    type: 'Bring Your Own Agent',
    status: 'Not Connected',
    permissionMode: 'None',
    tokenStatus: 'Create Required',
    lastActiveAt: 'No recent activity',
    riskStatus: 'Unknown',
    description:
      'Register a self-hosted or third-party AI Agent through FitMeet Gateway with explicit scopes and audit logging.',
  },
];

export const gatewayOverviewMetrics = [
  { labelZh: '已连接智能体', labelEn: 'CONNECTED AGENTS', value: '2', tone: 'stable' },
  { labelZh: '待审批行为', labelEn: 'PENDING ACTIONS', value: '4', tone: 'review' },
  { labelZh: '今日行为记录', labelEn: 'TODAY LOGS', value: '18', tone: 'neutral' },
  { labelZh: '当前安全状态', labelEn: 'SAFETY STATE', value: 'Stable', tone: 'stable' },
  { labelZh: 'API Gateway', labelEn: 'API GATEWAY', value: 'Online', tone: 'online' },
] as const;

export const safetyProtocols = [
  'Agent 不能冒充真人',
  'Agent 不能无限制私信',
  'Agent 不能未经允许索要联系方式',
  'Agent 不能替用户承诺关系',
  '高风险行为必须经过用户确认',
  '所有 Agent 行为都会记录日志',
] as const;

export const permissionModeProfiles: AgentPermissionModeProfile[] = [
  {
    id: 'Basic Mode',
    titleZh: '基础模式',
    titleEn: 'Basic Mode',
    description: 'Agent 只提出建议与草稿，所有对外的写动作（第一条私信、交换联系方式、加好友、线下邀约、创建活动、上传凭证）均需用户确认。',
    allowed: [
      '发帖与推荐生成',
      '识别意图、搜索匹配',
      '生成破冰话术与私信草稿',
      '提出是否继续交流的建议',
    ],
    blocked: [
      '自动发送首条私信',
      '自动交换联系方式',
      '自动加好友 / 发出线下邀约',
      '自动创建活动或上传完成凭证',
    ],
    scenarios: '新用户、谨慎型用户、正式社交、陌生人破冰。',
    riskLevel: '低风险',
    englishLabel: 'Human Approval Required',
  },
  {
    id: 'Standard Mode',
    titleZh: '正常模式',
    titleEn: 'Standard Mode',
    description:
      'Agent 可以发帖、自动筛选匹配、进行普通聊天与续聊、协助交换联系方式、发出活动邀请。仅在高风险场景需要用户确认。',
    allowed: [
      '自动发帖与筛选匹配对象',
      '进行普通聊天与续聊',
      '协助交换联系方式与发出活动邀请',
      '提醒需确认的高风险行为',
    ],
    blocked: [
      '首次联系陌生人时自动发送',
      '夜间 / 饮酒 / 支付 / 精确定位场景自动执行',
      '未经确认上传照片 / 完成凭证',
      '未经确认发起最终发布',
    ],
    scenarios: '熟悉用户、低风险聊天、社交辅助。',
    riskLevel: '中风险',
    englishLabel: 'Standard Automation',
  },
  {
    id: 'Open Mode',
    titleZh: '开放模式',
    titleEn: 'Open Mode',
    description:
      'Agent 拥有最高自由度：可以自动聊天、加好友、邀请用户、发布活动。平台仍会拦截违法 / 骚扰 / 色情 / 暴力 / 诱导转账 / 被拉黑或对方拒绝 Agent 的行为，开放模式也不能绕过平台安全风控。',
    allowed: [
      '自动进行全流程社交',
      '自动加好友与发送邀请',
      '自动发布帖子与活动',
      '自动推进聊天进展',
    ],
    blocked: [
      '违法 / 色情 / 暴力 / 骚扰 / 诱导转账内容',
      '向已拉黑或已拒绝 Agent 的用户发送信息',
      '伪造身份 / 承诺恋爱关系',
      '绕过实名或安全风控机制',
    ],
    scenarios: '高信任用户、高频社交、熟练型 Agent 使用者。',
    riskLevel: '实验风险',
    englishLabel: 'Maximum Autonomy',
  },
];

export const preferenceCalibrations: PreferenceCalibration[] = [
  {
    id: 'social-energy',
    labelZh: '社交主动性',
    labelEn: 'SOCIAL INITIATIVE',
    value: 42,
    leftLabel: '克制观察',
    rightLabel: '主动破冰',
  },
  {
    id: 'tone',
    labelZh: '表达语气',
    labelEn: 'COMMUNICATION TONE',
    value: 58,
    leftLabel: '冷静简洁',
    rightLabel: '温暖细腻',
  },
  {
    id: 'match-depth',
    labelZh: '匹配深度',
    labelEn: 'MATCH DEPTH',
    value: 66,
    leftLabel: '兴趣优先',
    rightLabel: '价值观优先',
  },
  {
    id: 'privacy',
    labelZh: '隐私边界',
    labelEn: 'PRIVACY BOUNDARY',
    value: 78,
    leftLabel: '开放分享',
    rightLabel: '严格保护',
  },
];

export const preferenceSignals = [
  '喜欢真实、克制、有边界感的社交开场',
  '优先推荐同城、共同兴趣、节奏稳定的对象',
  '不主动提及联系方式、收入、住址等敏感信息',
  '遇到暧昧、关系承诺、线下见面时提醒用户确认',
  '私信草稿保持礼貌、简短、不过度热情',
] as const;
