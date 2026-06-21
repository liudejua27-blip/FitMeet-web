import { AgentTaskEventType } from './entities/agent-task.entity';
import {
  FitMeetAgentStepStatus,
  FitMeetAgentToolStatus,
} from './entities/fitmeet-agent-runtime.entity';
import type {
  SocialAgentVisibleStepSnapshot,
  SocialAgentVisibleStep,
  StreamEmit,
} from './social-agent-chat.types';

export type RuntimeStepRecord = {
  stepOrder: number;
  stepKey: string;
  title: string;
  status: FitMeetAgentStepStatus;
  safePayload: Record<string, unknown>;
};

export type RuntimeToolRecord = {
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
      snapshot: this.stepSnapshot(id, publicLabel, eventType, payload),
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

  private stepSnapshot(
    id: string,
    label: string,
    eventType: AgentTaskEventType,
    payload: Record<string, unknown>,
  ): SocialAgentVisibleStepSnapshot {
    const metrics = this.safePayloadLines(payload);
    const observation =
      metrics.length > 0 ? metrics : [`${label} 已完成，未暴露额外内部数据。`];
    return {
      schemaVersion: 'fitmeet.step-snapshot.v1',
      observation,
      critique: this.stepCritique(id, eventType, payload),
      result: this.stepResult(label, payload),
    };
  }

  private safePayloadLines(payload: Record<string, unknown>): string[] {
    return Object.entries(payload)
      .filter(
        ([key, value]) =>
          this.isPublicPayloadKey(key) && this.isPublicPrimitive(value),
      )
      .slice(0, 4)
      .map(([key, value]) => `${this.publicKeyLabel(key)}：${String(value)}`);
  }

  private isPublicPayloadKey(key: string): boolean {
    return !/token|secret|password|trace|debug|raw|stack|internal|phone|mobile|email|location|lng|lat|address/i.test(
      key,
    );
  }

  private isPublicPrimitive(
    value: unknown,
  ): value is string | number | boolean {
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'boolean') return true;
    return (
      typeof value === 'string' &&
      value.trim().length > 0 &&
      value.length <= 120
    );
  }

  private publicKeyLabel(key: string): string {
    return key
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .trim();
  }

  private stepCritique(
    id: string,
    eventType: AgentTaskEventType,
    payload: Record<string, unknown>,
  ): string {
    if (payload.error) return '这个动作返回了失败信号，后续应重试或重新规划。';
    if (/approval|confirm|risk|safety/i.test(`${id} ${eventType}`)) {
      return '这个动作涉及安全或确认边界，我会保留可继续的位置。';
    }
    return '这个动作产生了可用观察，可以交给后续进度继续整理。';
  }

  private stepResult(label: string, payload: Record<string, unknown>): string {
    if (payload.error) return '未完成，已保留上下文用于重试。';
    const count = Object.keys(payload).filter((key) =>
      this.isPublicPayloadKey(key),
    ).length;
    return count > 0
      ? `已完成，并记录 ${count} 个安全摘要字段。`
      : `${label} 已完成。`;
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
