import { AgentTaskEventType } from './entities/agent-task.entity';
import {
  FitMeetAgentStepStatus,
  FitMeetAgentToolStatus,
} from './entities/fitmeet-agent-runtime.entity';
import { SocialAgentRunProgressTracker } from './social-agent-run-progress.tracker';
import type {
  SocialAgentChatStreamEvent,
  SocialAgentVisibleStep,
} from './social-agent-chat.types';

describe('SocialAgentRunProgressTracker', () => {
  it('records stream, memory, event, and runtime step progress in order', async () => {
    const visibleSteps: SocialAgentVisibleStep[] = [];
    const emitted: SocialAgentChatStreamEvent[] = [];
    const remembered: Array<Record<string, unknown>> = [];
    const events: Array<Record<string, unknown>> = [];
    const runtimeSteps: Array<Record<string, unknown>> = [];
    const tracker = new SocialAgentRunProgressTracker({
      visibleSteps,
      emit: (event) => {
        emitted.push(event);
      },
      visibleStepLabel: (id, label) => `${id}:${label}`,
      rememberStep: (id, label, status) => {
        remembered.push({ id, label, status });
      },
      writeEvent: (eventType, summary, payload) => {
        events.push({ eventType, summary, payload });
      },
      recordRuntimeStep: (input) => {
        runtimeSteps.push(input);
      },
    });

    await tracker.completeStep(
      'search',
      '正在检索附近候选人',
      AgentTaskEventType.ToolReturned,
      {
        candidateCount: 3,
      },
    );
    await tracker.completeStep(
      'rank',
      '正在排序',
      AgentTaskEventType.StepCompleted,
    );

    expect(visibleSteps).toEqual([
      { id: 'search', label: 'search:正在检索附近候选人', status: 'done' },
      { id: 'rank', label: 'rank:正在排序', status: 'done' },
    ]);
    expect(emitted).toEqual([
      {
        type: 'step',
        step: {
          id: 'search',
          label: 'search:正在检索附近候选人',
          status: 'running',
        },
      },
      {
        type: 'step',
        step: {
          id: 'search',
          label: 'search:正在检索附近候选人',
          status: 'done',
        },
      },
      {
        type: 'step',
        step: { id: 'rank', label: 'rank:正在排序', status: 'running' },
      },
      {
        type: 'step',
        step: { id: 'rank', label: 'rank:正在排序', status: 'done' },
      },
    ]);
    expect(remembered).toEqual([
      { id: 'search', label: 'search:正在检索附近候选人', status: 'running' },
      { id: 'search', label: 'search:正在检索附近候选人', status: 'done' },
      { id: 'rank', label: 'rank:正在排序', status: 'running' },
      { id: 'rank', label: 'rank:正在排序', status: 'done' },
    ]);
    expect(events).toEqual([
      {
        eventType: AgentTaskEventType.ToolReturned,
        summary: '正在检索附近候选人',
        payload: { candidateCount: 3 },
      },
      {
        eventType: AgentTaskEventType.StepCompleted,
        summary: '正在排序',
        payload: {},
      },
    ]);
    expect(runtimeSteps).toEqual([
      {
        stepOrder: 1,
        stepKey: 'search',
        title: 'search:正在检索附近候选人',
        status: FitMeetAgentStepStatus.Completed,
        safePayload: { candidateCount: 3 },
      },
      {
        stepOrder: 2,
        stepKey: 'rank',
        title: 'rank:正在排序',
        status: FitMeetAgentStepStatus.Completed,
        safePayload: {},
      },
    ]);
    expect(tracker.visibleSteps).toBe(visibleSteps);
  });

  it('records runtime tool calls with safe input and output payloads', async () => {
    const runtimeTools: Array<Record<string, unknown>> = [];
    const tracker = new SocialAgentRunProgressTracker({
      visibleSteps: [],
      visibleStepLabel: (_, label) => label,
      rememberStep: jest.fn(),
      writeEvent: jest.fn(),
      recordRuntimeTool: (input) => {
        runtimeTools.push(input);
      },
    });

    await tracker.recordTool(
      'fitmeet_search_candidates',
      FitMeetAgentToolStatus.Succeeded,
      { taskId: 101, socialRequestId: 301 },
      { candidateCount: 2 },
    );

    expect(runtimeTools).toEqual([
      {
        toolName: 'fitmeet_search_candidates',
        status: FitMeetAgentToolStatus.Succeeded,
        safeInput: { taskId: 101, socialRequestId: 301 },
        safeOutput: { candidateCount: 2 },
      },
    ]);
  });
});
