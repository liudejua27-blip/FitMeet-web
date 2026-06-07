import type { AgentTask } from './entities/agent-task.entity';
import type { SocialAgentToolCallRecord } from './social-agent-tool.types';

type StepRecord = Record<string, unknown>;

export function appendSocialAgentToolCallToTask(input: {
  task: AgentTask;
  call: SocialAgentToolCallRecord;
  updatedAt?: string;
}): void {
  const { task, call } = input;
  task.toolCalls = [...(task.toolCalls ?? []), call];
  task.result = {
    ...(task.result ?? {}),
    lastToolCall: call,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
}

export function applySocialAgentPlanStepCallToTask(input: {
  task: AgentTask;
  plan: StepRecord[];
  stepIndex: number;
  step: StepRecord;
  call: SocialAgentToolCallRecord;
  withStepResult: (
    step: StepRecord,
    call: SocialAgentToolCallRecord,
  ) => StepRecord;
  updatedAt?: string;
}): void {
  const { task, plan, stepIndex, step, call, withStepResult, updatedAt } =
    input;
  plan[stepIndex] = withStepResult(step, call);
  task.plan = plan;
  appendSocialAgentToolCallToTask({ task, call, updatedAt });
}
