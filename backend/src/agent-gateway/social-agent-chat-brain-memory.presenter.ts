import { cleanDisplayText } from '../common/display-text.util';
import type { AgentTask } from './entities/agent-task.entity';
import type { SocialAgentBrainTurnDecision } from './social-agent-brain.service';
import { readSocialAgentTaskMemory } from './social-agent-memory.util';

export function rememberSocialAgentConversationBrainDecision(
  task: AgentTask,
  decision: SocialAgentBrainTurnDecision,
): void {
  const memory = isRecord(task.memory) ? task.memory : {};
  task.memory = {
    ...memory,
    conversationBrain: {
      intent: decision.route.intent,
      replyStrategy: decision.route.replyStrategy,
      conversationMode: decision.conversationMode,
      shouldExecuteTool: decision.shouldExecuteTool,
      shouldAskClarifyingQuestion: decision.shouldAskClarifyingQuestion,
      plannerSource: decision.plannerSource,
      userIntent: decision.userIntent,
      reason: decision.reason,
      responseGoal: decision.responseGoal,
      needUserConfirmation: decision.needUserConfirmation,
      tools: decision.tools,
      notes: decision.notes,
      updatedAt: new Date().toISOString(),
    },
  };
}

export function readSocialAgentConversationBrainMode(task: AgentTask): string {
  const brain = readConversationBrain(task) ?? {};
  return cleanDisplayText(brain.conversationMode, '');
}

export function readSocialAgentCurrentAgentState(task: AgentTask): string {
  const memory = isRecord(task.memory) ? task.memory : {};
  const state = cleanDisplayText(memory.agentState, '');
  if (state) return state;
  const taskMemory = readSocialAgentTaskMemory(task);
  return cleanDisplayText(taskMemory.currentTask.state, '') || 'idle';
}

export function readSocialAgentConversationBrainDecision(
  task: AgentTask,
): Record<string, unknown> | null {
  return readConversationBrain(task);
}

export function socialAgentFinalResponseSafetyRules(): string[] {
  return [
    '私信、加好友、连接候选人、创建公开需求或活动，必须遵守工具权限和用户确认要求。',
    '不得编造候选人、活动、消息发送结果或已经执行的动作。',
    '涉及线下见面时，优先公共场所、尊重边界，不承诺绝对安全。',
    '不要暴露 DeepSeek、API、后端、工具日志或内部状态机细节。',
  ];
}

export function readSocialAgentConversationBrainToolNames(
  task: AgentTask,
): string[] {
  return readSocialAgentConversationBrainPlannedTools(task).flatMap((tool) => {
    const name = cleanDisplayText(tool.name, '');
    return name ? [name] : [];
  });
}

export function readSocialAgentConversationBrainPlannedTools(
  task: AgentTask,
): Array<Record<string, unknown>> {
  const brain = readConversationBrain(task) ?? {};
  return Array.isArray(brain.tools)
    ? brain.tools.filter((tool): tool is Record<string, unknown> =>
        isRecord(tool),
      )
    : [];
}

export function readSocialAgentConversationBrainToolArguments(
  task: AgentTask,
  toolName: string,
): Record<string, unknown> {
  const tool = readSocialAgentConversationBrainPlannedTools(task).find(
    (item) => cleanDisplayText(item.name, '') === toolName,
  );
  if (!tool) return {};
  return isRecord(tool.arguments) ? tool.arguments : {};
}

export function rememberSocialAgentConversationBrainToolResult(
  task: AgentTask,
  result: Record<string, unknown>,
): void {
  const memory = isRecord(task.memory) ? task.memory : {};
  const brain = readConversationBrain(task) ?? {};
  task.memory = {
    ...memory,
    conversationBrain: {
      ...brain,
      lastToolResult: {
        ...result,
        completedAt: new Date().toISOString(),
      },
    },
  };
}

export function readSocialAgentConversationBrainLastToolResult(
  task: AgentTask,
): Record<string, unknown> | null {
  const brain = readConversationBrain(task) ?? {};
  return isRecord(brain.lastToolResult) ? brain.lastToolResult : null;
}

function readConversationBrain(
  task: AgentTask,
): Record<string, unknown> | null {
  const memory = isRecord(task.memory) ? task.memory : {};
  return isRecord(memory.conversationBrain) ? memory.conversationBrain : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
