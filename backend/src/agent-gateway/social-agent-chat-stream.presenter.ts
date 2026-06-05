import { AgentTaskPermissionMode } from './entities/agent-task.entity';
import type { UserFacingResponseSanitizerService } from './response-quality/user-facing-response-sanitizer.service';

export type UserFacingStreamEvent =
  | { type: 'status'; lightStatus: string }
  | {
      type: 'progress';
      id: string;
      kind: 'analysis' | 'tool' | 'status';
      title: string;
      detail?: string;
      state: 'running' | 'done' | 'failed' | 'waiting';
    }
  | {
      type: 'result';
      result: ReturnType<
        UserFacingResponseSanitizerService['toUserFacingAgentResponse']
      >;
    }
  | { type: 'error'; message: string };

export function resolveUserPermissionMode(
  value: AgentTaskPermissionMode | undefined,
): AgentTaskPermissionMode {
  return value && Object.values(AgentTaskPermissionMode).includes(value)
    ? value
    : AgentTaskPermissionMode.Confirm;
}

export function lightStatusFromStep(label: string): string {
  if (/Life Graph|画像|profile/i.test(label)) {
    return '正在结合你的 Life Graph';
  }
  if (/筛选|候选|匹配|search|candidate/i.test(label)) {
    return '正在筛选合适的人';
  }
  if (/时间|排除|rank/i.test(label)) {
    return '正在排除时间不合适的人';
  }
  if (/安全|边界|guardrail|risk/i.test(label)) {
    return '正在检查安全边界';
  }
  if (/开场白|message|opener/i.test(label)) {
    return '正在生成开场白';
  }
  if (/确认|approval|confirm/i.test(label)) {
    return '正在等待你确认';
  }
  if (/活动|约练|activity/i.test(label)) {
    return '正在创建约练计划';
  }
  return '正在理解你的需求';
}

export function progressFromStep(step: {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed';
}): UserFacingStreamEvent {
  const key = `${step.id} ${step.label}`.toLowerCase();
  const isTool =
    /tool|call|search|candidate|match|activity|message|opener|approval|confirm|life graph|profile|risk|guardrail|rank|filter/i.test(
      key,
    );
  return {
    type: 'progress',
    id: isTool ? 'tool' : 'analysis',
    kind: isTool ? 'tool' : 'analysis',
    title: isTool ? '正在调用工具' : '分析中',
    detail: lightStatusFromStep(step.label),
    state:
      step.status === 'done'
        ? 'done'
        : step.status === 'failed'
          ? 'failed'
          : 'running',
  };
}
