import { AgentTaskEventType } from './entities/agent-task.entity';
import {
  FitMeetAgentStepStatus,
  FitMeetAgentToolStatus,
} from './entities/fitmeet-agent-runtime.entity';
import type {
  SocialAgentVisibleStep,
  StreamEmit,
} from './social-agent-chat.types';

type RuntimeStepRecord = {
  stepOrder: number;
  stepKey: string;
  title: string;
  status: FitMeetAgentStepStatus;
  safePayload: Record<string, unknown>;
};

type RuntimeToolRecord = {
  toolName: string;
  status: FitMeetAgentToolStatus;
  safeInput: Record<string, unknown>;
  safeOutput: Record<string, unknown>;
};

export class SocialAgentRunProgressTracker {
  private runtimeStepOrder = 0;

  constructor(
    private readonly options: {
      visibleSteps: SocialAgentVisibleStep[];
      emit?: StreamEmit;
      visibleStepLabel: (id: string, label: string) => string;
      rememberStep: (
        id: string,
        label: string,
        status: SocialAgentVisibleStep['status'],
      ) => void;
      writeEvent: (
        eventType: AgentTaskEventType,
        summary: string,
        payload: Record<string, unknown>,
      ) => Promise<void> | void;
      recordRuntimeStep?: (input: RuntimeStepRecord) => Promise<void> | void;
      recordRuntimeTool?: (input: RuntimeToolRecord) => Promise<void> | void;
    },
  ) {}

  get visibleSteps(): SocialAgentVisibleStep[] {
    return this.options.visibleSteps;
  }

  async completeStep(
    id: string,
    label: string,
    eventType: AgentTaskEventType,
    payload: Record<string, unknown> = {},
  ): Promise<SocialAgentVisibleStep> {
    const publicLabel = this.options.visibleStepLabel(id, label);
    await this.options.emit?.({
      type: 'step',
      step: { id, label: publicLabel, status: 'running' },
    });
    this.options.rememberStep(id, publicLabel, 'running');
    const step: SocialAgentVisibleStep = {
      id,
      label: publicLabel,
      status: 'done',
    };
    this.options.visibleSteps.push(step);
    this.options.rememberStep(id, publicLabel, 'done');
    await this.options.writeEvent(eventType, label, payload);
    await this.options.recordRuntimeStep?.({
      stepOrder: ++this.runtimeStepOrder,
      stepKey: id,
      title: publicLabel,
      status: FitMeetAgentStepStatus.Completed,
      safePayload: payload,
    });
    await this.options.emit?.({ type: 'step', step });
    return step;
  }

  async recordTool(
    toolName: string,
    status: FitMeetAgentToolStatus,
    safeInput: Record<string, unknown> = {},
    safeOutput: Record<string, unknown> = {},
  ): Promise<void> {
    await this.options.recordRuntimeTool?.({
      toolName,
      status,
      safeInput,
      safeOutput,
    });
  }
}
