export type AgentProvider = 'OpenClaw' | 'Codex' | 'Hermes' | 'QClaw' | 'Custom';

export type AgentConnectionStatus = 'Connected' | 'Not Connected' | 'Pending Approval' | 'Disabled';

export type AgentPermissionMode = 'Basic Mode' | 'Standard Mode' | 'Open Mode' | 'None';

export type AgentTokenStatus =
  | 'Token Active'
  | 'Token Expired'
  | 'Not Generated'
  | 'OAuth Required'
  | 'Create Required';

export type AgentRiskStatus = 'Low Risk' | 'Medium Risk' | 'High Risk' | 'Needs Review' | 'Unknown';

export type AgentConnection = {
  id: string;
  name: string;
  provider: AgentProvider;
  type: string;
  status: AgentConnectionStatus;
  permissionMode: AgentPermissionMode;
  tokenStatus: AgentTokenStatus;
  lastActiveAt: string;
  riskStatus: AgentRiskStatus;
  description: string;
};

export type PermissionRiskLevel = '低风险' | '中风险' | '实验风险';

export type AgentPermissionModeProfile = {
  id: Exclude<AgentPermissionMode, 'None'>;
  titleZh: string;
  titleEn: string;
  description: string;
  allowed: string[];
  blocked: string[];
  scenarios: string;
  riskLevel: PermissionRiskLevel;
  englishLabel: string;
};

export type PreferenceCalibration = {
  id: string;
  labelZh: string;
  labelEn: string;
  value: number;
  leftLabel: string;
  rightLabel: string;
};
