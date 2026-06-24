import { summarizeSocialCodexRun } from './social-codex-run-summary';
import type { SocialAgentEventV2 } from './social-agent-event-v2.types';

describe('summarizeSocialCodexRun', () => {
  function event(
    seq: number,
    type: SocialAgentEventV2['type'],
    overrides: Partial<SocialAgentEventV2> = {},
  ): SocialAgentEventV2 {
    return {
      type,
      eventId: `run-1:${seq}`,
      seq,
      createdAt: new Date('2026-06-18T00:00:00.000Z').toISOString(),
      userId: '7',
      threadId: 'agent-task:44',
      taskId: 44,
      runId: 'run-1',
      stage: 'detect_social_intent',
      visibility: 'user_visible',
      display: { title: '正在整理你的需求', state: 'running' },
      ...overrides,
    };
  }

  it('summarizes the latest visible process as the current lightweight status', () => {
    const summary = summarizeSocialCodexRun([
      event(1, 'run.started'),
      event(2, 'visible_process.delta', {
        stage: 'slot_filling',
        display: {
          title: '已记住：周末下午、散步、青岛大学附近',
          state: 'done',
        },
      }),
      event(3, 'candidate_search.done', {
        stage: 'search_candidates',
        display: { title: '找到 3 个公开可发现的人', state: 'done' },
        payload: { candidateCount: 3 },
      }),
    ]);

    expect(summary).toMatchObject({
      state: 'running',
      title: '找到 3 个公开可发现的人',
      displayMode: 'covering_status',
      updateModel: 'latest_state',
      defaultVisibleCount: 1,
      historyVisibility: 'collapsed',
      currentStage: 'search_candidates',
      candidateCount: 3,
      visibleStepCount: 3,
      expandable: true,
    });
  });

  it('deduplicates repeated visible process events so old replays do not expand into timelines', () => {
    const summary = summarizeSocialCodexRun([
      event(1, 'run.started', {
        display: { title: '正在理解你的需求', state: 'done' },
      }),
      event(2, 'visible_process.delta', {
        stage: 'detect_social_intent',
        display: { title: '正在理解你的需求', state: 'done' },
      }),
      event(3, 'visible_process.delta', {
        stage: 'detect_social_intent',
        display: { title: '正在理解你的需求', state: 'done' },
      }),
      event(4, 'visible_process.delta', {
        stage: 'safety_filter',
        display: { title: '正在检查安全边界', state: 'done' },
      }),
      event(5, 'visible_process.delta', {
        stage: 'safety_filter',
        display: { title: '正在检查安全边界', state: 'done' },
      }),
    ]);

    expect(summary).toMatchObject({
      title: '正在检查安全边界',
      currentStage: 'safety_filter',
      visibleStepCount: 2,
      expandable: true,
    });
  });

  it('treats one repeated visible status as a single covering status', () => {
    const summary = summarizeSocialCodexRun([
      event(1, 'run.started', {
        display: { title: '正在理解你的需求', state: 'done' },
      }),
      event(2, 'visible_process.delta', {
        stage: 'detect_social_intent',
        display: { title: '正在理解你的需求', state: 'done' },
      }),
      event(3, 'visible_process.delta', {
        stage: 'detect_social_intent',
        display: { title: '正在理解你的需求', state: 'done' },
      }),
    ]);

    expect(summary).toMatchObject({
      title: '正在理解你的需求',
      visibleStepCount: 1,
      expandable: false,
    });
  });

  it('does not let a late duplicate status replace a newer meaningful covering status', () => {
    const summary = summarizeSocialCodexRun([
      event(1, 'run.started', {
        display: { title: '正在理解你的需求', state: 'done' },
      }),
      event(2, 'visible_process.delta', {
        stage: 'slot_filling',
        display: {
          title: '已记住：今天晚上、散步、青岛大学附近',
          state: 'done',
        },
      }),
      event(3, 'visible_process.delta', {
        stage: 'detect_social_intent',
        display: { title: '正在理解你的需求', state: 'done' },
      }),
      event(4, 'visible_process.delta', {
        stage: 'detect_social_intent',
        display: { title: '正在理解你的需求', state: 'done' },
      }),
    ]);

    expect(summary).toMatchObject({
      title: '已记住：今天晚上、散步、青岛大学附近',
      currentStage: 'slot_filling',
      currentSeq: 2,
      visibleStepCount: 2,
      expandable: true,
    });
  });

  it('keeps approval as waiting until the matching approval is resolved', () => {
    const waiting = summarizeSocialCodexRun([
      event(1, 'run.started'),
      event(2, 'approval.required', {
        stage: 'approval',
        display: { title: '发送邀请前需要你确认', state: 'waiting' },
        payload: { approvalId: 88, actionType: 'send_invite' },
      }),
      event(3, 'run.completed'),
    ]);

    expect(waiting).toMatchObject({
      state: 'waiting',
      pendingApproval: true,
      title: '发送邀请前需要你确认',
      currentStage: 'approval',
      currentSeq: 2,
    });

    const resolved = summarizeSocialCodexRun([
      event(1, 'run.started'),
      event(2, 'approval.required', {
        stage: 'approval',
        display: { title: '发送邀请前需要你确认', state: 'waiting' },
        payload: { approvalId: 88, actionType: 'send_invite' },
      }),
      event(3, 'approval.resolved', {
        stage: 'approval',
        display: { title: '已确认这一步', state: 'done' },
        payload: { approvalId: 88, actionType: 'send_invite' },
      }),
      event(4, 'run.completed', {
        display: { title: '邀请已准备好', state: 'done' },
      }),
    ]);

    expect(resolved).toMatchObject({
      state: 'completed',
      pendingApproval: false,
      title: '邀请已准备好',
    });
  });

  it('returns safe fallback language for failed runs without exposing internals', () => {
    const summary = summarizeSocialCodexRun([
      event(1, 'run.started', { display: undefined }),
      event(2, 'run.failed', {
        stage: 'search_candidates',
        display: undefined,
        payload: { rawError: 'stack trace should not be copied to summary' },
      }),
    ]);

    expect(summary).toMatchObject({
      state: 'failed',
      title: '连接中断了，可以继续',
      detail: '我保留了这段需求，可以继续处理或补充一句新的要求。',
      currentStage: 'search_candidates',
    });
  });

  it('rewrites generic terminal titles into stage-specific product status', () => {
    const invite = summarizeSocialCodexRun([
      event(1, 'run.started'),
      event(2, 'run.completed', {
        stage: 'send_invite',
        display: { title: '这一步处理完成', state: 'done' },
      }),
    ]);

    expect(invite).toMatchObject({
      state: 'completed',
      title: '邀请已准备好',
      currentStage: 'send_invite',
    });

    const opportunity = summarizeSocialCodexRun([
      event(1, 'run.started'),
      event(2, 'run.completed', {
        stage: 'create_opportunity_card',
        display: { title: '已完成这一步', state: 'done' },
      }),
    ]);

    expect(opportunity).toMatchObject({
      state: 'completed',
      title: '这张约练卡可以发布到发现',
      currentStage: 'create_opportunity_card',
    });
  });

  it('rewrites generic running titles into the current stage instead of tool-log copy', () => {
    const summary = summarizeSocialCodexRun([
      event(1, 'visible_process.delta', {
        stage: 'rank_candidates',
        display: { title: '正在处理', detail: '处理中', state: 'running' },
      }),
    ]);

    expect(summary).toMatchObject({
      state: 'running',
      title: '正在筛选公开可发现的人',
      detail: '只使用公开可发现的信息，联系对方前仍需要你确认。',
      currentStage: 'rank_candidates',
    });
    expect(JSON.stringify(summary)).not.toMatch(/正在处理|处理中|工具|tool/i);
  });

  it('rewrites cross-stage generic titles into the actual Social Codex stage', () => {
    const summary = summarizeSocialCodexRun([
      event(1, 'candidate_search.started', {
        stage: 'search_candidates',
        display: {
          title: '正在理解你的需求',
          detail: '我们已经理解你的需求，下一步处理',
          state: 'running',
        },
      }),
    ]);

    expect(summary).toMatchObject({
      state: 'running',
      title: '正在筛选公开可发现的人',
      detail: '只使用公开可发现的信息，联系对方前仍需要你确认。',
      currentStage: 'search_candidates',
      currentSeq: 1,
    });
    expect(JSON.stringify(summary)).not.toMatch(/正在理解你的需求|下一步处理/);
  });

  it('sanitizes persisted internal process text before returning replay.summary', () => {
    const summary = summarizeSocialCodexRun([
      event(1, 'run.started', {
        stage: 'hydrate_context',
        display: {
          title: 'hydrate_context planner payload traceId',
          detail: 'raw JSON stack internal runtime',
          state: 'running',
        },
      }),
      event(2, 'tool.progress', {
        stage: 'search_candidates',
        display: {
          title: '正在调用 tool_call_started',
          detail: 'candidate search planner payload traceId',
          state: 'running',
        },
      }),
    ]);

    expect(summary).toMatchObject({
      state: 'running',
      title: '正在筛选公开可发现的人',
      detail: '只使用公开可发现的信息，联系对方前仍需要你确认。',
      currentStage: 'search_candidates',
    });
    expect(JSON.stringify(summary)).not.toMatch(
      /hydrate_context|planner|payload|traceId|raw JSON|tool_call_started|internal|runtime/i,
    );
  });

  it('tracks opportunity and memory markers for product UI hints', () => {
    const summary = summarizeSocialCodexRun([
      event(1, 'memory.saved', {
        stage: 'life_graph_writeback',
        display: { title: '已记住你的偏好', state: 'done' },
      }),
      event(2, 'opportunity_card.created', {
        stage: 'create_opportunity_card',
        display: { title: '这张约练卡可以发布到发现', state: 'waiting' },
      }),
    ]);

    expect(summary).toMatchObject({
      state: 'waiting',
      savedMemory: true,
      hasOpportunityCard: true,
    });
  });

  it('uses the latest unresolved approval as replay.summary even after later terminal events', () => {
    const summary = summarizeSocialCodexRun([
      event(1, 'run.started'),
      event(2, 'approval.required', {
        stage: 'approval',
        display: {
          title: '发送邀请前需要你确认',
          detail: '确认前不会触达对方。',
          state: 'waiting',
        },
        payload: { approvalId: 88, actionType: 'send_invite' },
      }),
      event(3, 'visible_process.delta', {
        stage: 'send_invite',
        display: { title: '这一步处理完成', state: 'done' },
      }),
      event(4, 'run.completed', {
        stage: 'send_invite',
        display: { title: '这一步处理完成', state: 'done' },
      }),
    ]);

    expect(summary).toMatchObject({
      state: 'waiting',
      pendingApproval: true,
      title: '发送邀请前需要你确认',
      detail: '确认前不会触达对方。',
      currentStage: 'approval',
      currentSeq: 2,
      currentEventId: 'run-1:2',
    });
  });
});
