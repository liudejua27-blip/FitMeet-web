import { describe, expect, it } from 'vitest';

import {
  summarizeDataPart,
  summarizeToolCallFallback,
} from '../components/assistant-ui/tool-process-model';

describe('assistant-ui tool process model', () => {
  it('maps internal Social Codex step names to user-facing process language', () => {
    const summary = summarizeDataPart('fitmeet-process', {
      visibleSummary: {
        title: 'route_search_turn',
        detail: 'hydrate_context',
        state: 'running',
      },
      steps: [
        {
          id: 'step-1',
          label: 'route_action_turn',
          detail: 'candidate_confirmation_check',
          status: 'running',
        },
        {
          id: 'step-2',
          label: 'planner traceId raw JSON',
          detail: 'internal debug runtime metadata',
          status: 'complete',
        },
      ],
      summary: 'route_profile_turn',
    });

    expect(summary.visibleSummary).toMatchObject({
      title: '正在筛选公开可发现的人',
      detail: '正在读取你的偏好',
    });
    expect(summary.steps[0]).toMatchObject({
      label: '需要你确认这一步',
      detail: '正在确认候选动作',
    });

    const publicText = JSON.stringify(summary);
    expect(publicText).not.toMatch(
      /route_(conversation|profile|search|action)_turn|candidate_confirmation_check|hydrate_context|traceId|raw JSON|planner|internal|debug/i,
    );
  });

  it('replaces unsafe or missing visible summary with a safe covering status', () => {
    const summary = summarizeDataPart('fitmeet-process', {
      title: 'planner traceId raw JSON internal runtime',
      visibleSummary: {
        title: 'planner traceId raw JSON',
        detail: 'payload hydrate_context',
        state: 'running',
      },
      steps: [
        {
          id: 'run-summary',
          label: 'visible_process.delta',
          detail: 'payload traceId',
          status: 'running',
          processType: 'run_summary',
        },
      ],
    });

    expect(summary.title).toBe('正在思考下一步');
    expect(summary.visibleSummary).toMatchObject({
      title: '正在思考下一步',
      source: 'client.covering_status',
      displayMode: 'covering_status',
      updateModel: 'latest_state',
      defaultVisibleCount: 1,
      historyVisibility: 'collapsed',
    });
    expect(JSON.stringify(summary)).not.toMatch(
      /planner|traceId|raw JSON|internal|runtime|visible_process\.delta|payload|hydrate_context/i,
    );
  });

  it('synthesizes one product status when legacy process payload has steps but no visible summary', () => {
    const summary = summarizeDataPart('fitmeet-process', {
      steps: [
        {
          id: 'candidate_search.started',
          label: 'candidate_search.started',
          detail: 'search_public_candidates',
          status: 'running',
        },
        {
          id: 'hydrate_context',
          label: 'hydrate_context',
          status: 'complete',
        },
      ],
    });

    expect(summary.visibleSummary).toMatchObject({
      title: '正在筛选公开可发现的人',
      source: 'client.covering_status',
      displayMode: 'covering_status',
      updateModel: 'latest_state',
      defaultVisibleCount: 1,
      historyVisibility: 'collapsed',
      expandable: false,
    });
    expect(summary.historySteps).toEqual([]);
    expect(JSON.stringify(summary.visibleSummary)).not.toMatch(
      /candidate_search|hydrate_context|search_public_candidates/i,
    );
  });

  it('rewrites legacy model and fallback process labels into product language', () => {
    const summary = summarizeDataPart('fitmeet-process', {
      visibleSummary: {
        title: '正在调用 DeepSeek 生成匹配意图',
        detail: 'AI 分析超时，已使用规则匹配继续执行',
        state: 'running',
      },
      steps: [
        {
          id: 'plan',
          label: '正在使用本地策略生成匹配意图',
          detail: 'DeepSeek 规划暂时不可用，已保留上下文；请重试或继续补充。',
          status: 'complete',
        },
      ],
    });

    expect(summary.visibleSummary).toMatchObject({
      title: '正在整理你的匹配意图',
      detail: '分析时间较长，已保留上下文并安全继续',
    });
    expect(summary.steps[0]).toMatchObject({
      label: '正在根据当前信息整理匹配方向',
      detail: '暂时没有得到可靠计划，已保留上下文',
    });
    expect(JSON.stringify(summary)).not.toMatch(/DeepSeek|本地策略|规则匹配|OpenAI|API|SDK/i);
  });

  it('removes LLM/model metadata from visible process copy', () => {
    const summary = summarizeDataPart('fitmeet-process', {
      visibleSummary: {
        title: 'LLM model latency metadata',
        detail: 'schema token metadata model latency',
        state: 'running',
      },
      steps: [
        {
          id: 'model-metadata',
          label: 'model metadata token latency',
          detail: 'LLM schema payload',
          status: 'running',
        },
      ],
    });

    expect(summary.visibleSummary).toMatchObject({
      title: '正在思考下一步',
      source: 'client.covering_status',
      displayMode: 'covering_status',
      updateModel: 'latest_state',
      defaultVisibleCount: 1,
    });
    expect(JSON.stringify(summary)).not.toMatch(
      /\b(LLM|model|metadata|schema|token|latency|payload)\b/i,
    );
  });

  it('strips internal trace key-value fragments before rendering process text', () => {
    const summary = summarizeDataPart('fitmeet-process', {
      visibleSummary: {
        title:
          '正在整理你的约练需求 traceId=trace-hidden runId=run-hidden payload={"stage":"hydrate_context"}',
        detail:
          '已记住：周末下午、散步 metadata=private runtime=worker checkpointId=123 resumeToken=secret',
        state: 'running',
      },
      steps: [
        {
          id: 'traceId=step-hidden',
          label:
            '正在读取你的偏好 agentTrace=hidden structuredIntent={"activity":"walking"}',
          detail: '这一步会保留上下文 idempotencyKey=hidden-key rawJson={"debug":true}',
          status: 'running',
        },
      ],
    });

    expect(summary.visibleSummary).toMatchObject({
      title: '正在整理你的约练需求',
      detail: '已记住：周末下午、散步',
    });
    expect(summary.steps[0]).toMatchObject({
      id: 'step-0',
      label: '正在读取你的偏好',
      detail: '这一步会保留上下文',
    });
    const publicSurface = JSON.stringify({
      title: summary.title,
      visibleSummary: summary.visibleSummary,
      steps: summary.steps,
      historySteps: summary.historySteps,
      resultLines: summary.resultLines,
    });
    expect(publicSurface).not.toMatch(
      /trace-hidden|run-hidden|payload|metadata|runtime|checkpointId|resumeToken|agentTrace|structuredIntent|idempotencyKey|rawJson|debug/i,
    );
  });

  it('preserves replay.summary as a covering status contract', () => {
    const summary = summarizeDataPart('fitmeet-process', {
      visibleSummary: {
        title: '正在筛选公开可发现的人',
        detail: '我会优先使用你已经补充的时间、地点和活动。',
        state: 'running',
        source: 'replay.summary',
        displayMode: 'covering_status',
        updateModel: 'latest_state',
        defaultVisibleCount: 1,
        historyVisibility: 'collapsed',
        expandable: true,
      },
      steps: [
        {
          id: 'social-codex:summary',
          label: '正在筛选公开可发现的人',
          detail: '我会优先使用你已经补充的时间、地点和活动。',
          status: 'running',
          processType: 'run_summary',
        },
      ],
    });

    expect(summary.visibleSummary).toMatchObject({
      title: '正在筛选公开可发现的人',
      source: 'replay.summary',
      displayMode: 'covering_status',
      updateModel: 'latest_state',
      defaultVisibleCount: 1,
      historyVisibility: 'collapsed',
      expandable: true,
    });
  });

  it('treats replay.summary as covering status even when older payloads omit displayMode', () => {
    const summary = summarizeDataPart('fitmeet-process', {
      visibleSummary: {
        title: '正在整理你的约练需求',
        detail: '我会按已经说过的信息继续处理。',
        state: 'running',
        source: 'replay.summary',
      },
      steps: [
        {
          id: 'hydrate-context',
          label: '正在读取你的偏好',
          status: 'complete',
        },
        {
          id: 'slot-memory',
          label: '已记录：今天晚上、散步、青岛大学附近',
          status: 'complete',
        },
      ],
    });

    expect(summary.visibleSummary).toMatchObject({
      title: '正在整理你的约练需求',
      source: 'replay.summary',
      displayMode: 'covering_status',
      updateModel: 'latest_state',
      defaultVisibleCount: 1,
      historyVisibility: 'collapsed',
    });
  });

  it('forces covering status payloads to one visible state even when replay reports a timeline', () => {
    const summary = summarizeDataPart('fitmeet-process', {
      visibleSummary: {
        title: '正在整理你的约练需求',
        detail: '我会用已经补充的信息继续处理。',
        state: 'running',
        source: 'replay.summary',
        displayMode: 'covering_status',
        defaultVisibleCount: 4,
        visibleStepCount: 4,
        historyVisibility: 'collapsed',
        expandable: true,
      },
      steps: [
        {
          id: 'context',
          label: '正在读取你的偏好',
          status: 'complete',
        },
        {
          id: 'slots',
          label: '已记录：周末下午、散步、青岛大学附近',
          status: 'complete',
        },
        {
          id: 'safety',
          label: '正在检查安全边界',
          status: 'running',
        },
      ],
    });

    expect(summary.visibleSummary).toMatchObject({
      source: 'replay.summary',
      displayMode: 'covering_status',
      updateModel: 'latest_state',
      defaultVisibleCount: 1,
      visibleStepCount: 1,
      historyVisibility: 'collapsed',
    });
    expect(summary.historySteps).toEqual([]);
  });

  it('defaults covering status summaries to one latest visible state', () => {
    const summary = summarizeDataPart('fitmeet-process', {
      visibleSummary: {
        title: '正在整理你的约练需求',
        detail: '我会按已经说过的信息继续处理。',
        state: 'running',
        source: 'replay.summary',
        displayMode: 'covering_status',
      },
      steps: [
        {
          id: 'context',
          label: '正在读取你的偏好',
          status: 'complete',
        },
        {
          id: 'slots',
          label: '已记录：周末下午、散步',
          status: 'complete',
        },
      ],
    });

    expect(summary.visibleSummary).toMatchObject({
      title: '正在整理你的约练需求',
      source: 'replay.summary',
      displayMode: 'covering_status',
      updateModel: 'latest_state',
      defaultVisibleCount: 1,
      historyVisibility: 'collapsed',
    });
  });

  it('respects explicit audit visibility for approval-style covering summaries', () => {
    const summary = summarizeDataPart('fitmeet-process', {
      visibleSummary: {
        title: '发送邀请前需要你确认',
        detail: '确认前不会发送给对方。',
        state: 'waiting',
        source: 'approval.required',
        displayMode: 'covering_status',
        historyVisibility: null,
        pendingApproval: true,
      },
      steps: [
        {
          id: 'approval',
          label: '发送邀请前需要你确认',
          status: 'pending',
          processType: 'approval',
        },
      ],
    });

    expect(summary.visibleSummary).toMatchObject({
      title: '发送邀请前需要你确认',
      displayMode: 'covering_status',
      updateModel: 'latest_state',
      defaultVisibleCount: 1,
      historyVisibility: null,
      pendingApproval: true,
    });
  });

  it('keeps raw assistant-ui tool fallback as one covering status instead of a tool timeline', () => {
    const summary = summarizeToolCallFallback({
      toolName: 'search_public_candidates',
      status: { type: 'running' },
    } as never);

    expect(summary.visibleSummary).toMatchObject({
      title: '正在整理合适的信息',
      status: 'running',
      source: 'tool.status',
      displayMode: 'covering_status',
      updateModel: 'latest_state',
      defaultVisibleCount: 1,
      historyVisibility: 'collapsed',
      expandable: false,
    });
    expect(summary.steps).toHaveLength(1);
    expect(summary.historySteps).toEqual([]);
    expect(summary.resultLines).toEqual([]);
  });

  it('turns raw tool completion into a concise product status', () => {
    const summary = summarizeToolCallFallback({
      toolName: 'search_public_candidates',
      status: { type: 'complete' },
      result: '找到 3 个公开可发现的人',
    } as never);

    expect(summary.visibleSummary).toMatchObject({
      title: '已整理合适的信息',
      detail: '找到 3 个公开可发现的人',
      status: 'complete',
      source: 'tool.status',
      displayMode: 'covering_status',
    });
    expect(summary.resultLines).toEqual([]);
  });

  it('keeps raw approval fallback resumable without exposing internal tool names', () => {
    const summary = summarizeToolCallFallback({
      toolName: 'approval_required',
      status: { type: 'requires-action' },
    } as never);

    expect(summary.visibleSummary).toMatchObject({
      title: '需要你确认这一步',
      status: 'waiting',
      source: 'tool.status',
      displayMode: 'covering_status',
      pendingApproval: true,
    });
    expect(summary.pendingCount).toBe(1);
    expect(summary.resumeContext).toMatchObject({
      hasCheckpoint: false,
      hasInterrupt: true,
    });
    expect(JSON.stringify(summary)).not.toMatch(/approval_required|tool_call|traceId|planner/i);
  });
});
