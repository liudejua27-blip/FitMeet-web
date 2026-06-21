import { AgentTaskPermissionMode } from './entities/agent-task.entity';
import { SocialCodexApprovalSchemaService } from './social-codex-approval-schema.service';
import { SocialCodexEventPipelineService } from './social-codex-event-pipeline.service';
import { SocialAgentEventV2Service } from './social-agent-event-v2.service';
import { SocialAgentTaskMemoryStateMachineService } from './social-agent-task-memory-state-machine.service';
import type { UserFacingAgentResponse } from './user-facing-agent-response';

describe('SocialCodexEventPipelineService', () => {
  function makePipeline(writes: Array<{ event: string; data: unknown }>) {
    return new SocialCodexEventPipelineService(
      new SocialAgentEventV2Service(),
      undefined,
      undefined,
      undefined,
      undefined,
      new SocialCodexApprovalSchemaService(),
    ).createWriter({
      write: (event, data) => writes.push({ event, data }),
      userId: 7,
      taskId: 42,
      threadId: 'agent-task:42',
      runId: 'run:test',
    });
  }

  function makePipelineWithSlots(
    writes: Array<{ event: string; data: unknown }>,
    input: {
      taskId?: number | null;
      threadId?: string | number | null;
    } = {},
  ) {
    const taskId = input.taskId ?? null;
    const threadId = input.threadId ?? (taskId ? `agent-task:${taskId}` : null);
    const pipeline = new SocialCodexEventPipelineService(
      new SocialAgentEventV2Service(),
      undefined,
      new SocialAgentTaskMemoryStateMachineService(),
      undefined,
      undefined,
      new SocialCodexApprovalSchemaService(),
    );
    const writer = pipeline.createWriter({
      write: (event, data) => writes.push({ event, data }),
      userId: 7,
      taskId,
      threadId,
      runId: 'run:test',
    });
    return { pipeline, writer };
  }

  it('emits approval.required with action-specific schema and dry-run payload', async () => {
    const writes: Array<{ event: string; data: unknown }> = [];
    const pipeline = new SocialCodexEventPipelineService(
      new SocialAgentEventV2Service(),
      undefined,
      undefined,
      undefined,
      undefined,
      new SocialCodexApprovalSchemaService(),
    );
    const writer = makePipeline(writes);
    const response: UserFacingAgentResponse = {
      assistantMessage: '发布前需要确认。',
      lightStatus: '正在等待你确认',
      cards: [],
      safeStatus: {
        blocked: false,
        level: 'medium',
        boundaryNotes: [],
        requiredConfirmations: [],
      },
      pendingConfirmations: [
        {
          id: 'approval-publish',
          type: 'approval',
          actionType: 'publish_social_request',
          summary: '发布周末青岛大学散步约练卡到发现',
          riskLevel: 'medium',
          payload: { checkpointId: 42 },
          expiresAt: null,
        },
      ],
      permissionMode: AgentTaskPermissionMode.Confirm,
    };

    await pipeline.writeResultEvents(writer, response);

    const approval = writes.find((item) => item.event === 'approval.required')
      ?.data as {
      display?: { title?: string; detail?: string };
      payload?: Record<string, unknown>;
    };
    expect(approval.display).toMatchObject({
      title: '发布到发现前需要你确认',
      detail: '发布周末青岛大学散步约练卡到发现',
    });
    expect(approval.payload?.socialCodexApproval).toMatchObject({
      actionType: 'publish_social_request',
      confirmationLabel: '确认发布',
    });
    expect(approval.payload?.dryRunPreview).toMatchObject({
      title: '预览将公开的约练卡',
      visibleTo: '发现页公开可发现用户',
    });
  });

  it('does not emit product process events for legacy cards without canonical Tool UI schema', async () => {
    const writes: Array<{ event: string; data: unknown }> = [];
    const pipeline = new SocialCodexEventPipelineService(
      new SocialAgentEventV2Service(),
      undefined,
      undefined,
      undefined,
      undefined,
      new SocialCodexApprovalSchemaService(),
    );
    const writer = makePipeline(writes);
    const response: UserFacingAgentResponse = {
      assistantMessage: '我先整理了候选方向。',
      lightStatus: '正在筛选合适的人',
      cards: [
        {
          id: 'legacy-candidate',
          type: 'candidate_card',
          title: '旧候选卡',
          body: '旧候选摘要',
          data: {
            schemaType: 'social_match.candidate',
            displayName: '旧候选人',
          },
          actions: [],
        },
        {
          id: 'legacy-opportunity',
          type: 'activity_plan',
          title: '旧约练卡',
          body: '旧约练摘要',
          data: {
            schemaType: 'opportunity.card',
            opportunity: { title: '旧约练卡' },
          },
          actions: [],
        },
      ],
      safeStatus: {
        blocked: false,
        level: 'low',
        boundaryNotes: [],
        requiredConfirmations: [],
      },
      pendingConfirmations: [],
      permissionMode: AgentTaskPermissionMode.Confirm,
    };

    await pipeline.writeResultEvents(writer, response);

    expect(writes.map((item) => item.event)).not.toContain(
      'candidate_search.started',
    );
    expect(writes.map((item) => item.event)).not.toContain(
      'candidate_search.done',
    );
    expect(writes.map((item) => item.event)).not.toContain(
      'opportunity_card.created',
    );
  });

  it('does not emit safety process for ordinary chat opt-out boundary notes', async () => {
    const writes: Array<{ event: string; data: unknown }> = [];
    const pipeline = new SocialCodexEventPipelineService(
      new SocialAgentEventV2Service(),
      undefined,
      undefined,
      undefined,
      undefined,
      new SocialCodexApprovalSchemaService(),
    );
    const writer = makePipeline(writes);
    const response: UserFacingAgentResponse = {
      assistantMessage: '可以，我们先安静聊聊，不会推荐人或进入约练流程。',
      lightStatus: '正在理解你的需求',
      cards: [],
      safeStatus: {
        blocked: false,
        level: 'low',
        boundaryNotes: ['用户明确说不要推荐人，也不要约练。'],
        requiredConfirmations: [],
      },
      pendingConfirmations: [],
      permissionMode: AgentTaskPermissionMode.Confirm,
    };

    await pipeline.writeResultEvents(writer, response);

    expect(writes.map((item) => item.event)).not.toContain(
      'safety_check.done',
    );
  });

  it('does not emit early slot events for ordinary chat with time and place but no social execution intent', async () => {
    const writes: Array<{ event: string; data: unknown }> = [];
    const { pipeline, writer } = makePipelineWithSlots(writes);

    await pipeline.writeEarlySlotInferenceEvents(
      writer,
      '今晚青岛大学附近天气怎么样？',
    );

    expect(writes.map((item) => item.event)).not.toContain('slot.filled');
    expect(JSON.stringify(writes)).not.toContain('已记录你补充的信息');
  });

  it('emits early slot events for explicit social execution requests', async () => {
    const writes: Array<{ event: string; data: unknown }> = [];
    const { pipeline, writer } = makePipelineWithSlots(writes);

    await pipeline.writeEarlySlotInferenceEvents(
      writer,
      '今晚在青岛大学附近散步，帮我找人',
    );

    const slotEvent = writes.find((item) => item.event === 'slot.filled')
      ?.data as {
      display?: { title?: string; detail?: string };
      payload?: Record<string, unknown>;
    };
    expect(slotEvent?.display).toMatchObject({
      title: '已记录你补充的信息',
    });
    expect(slotEvent?.display?.detail).toContain('今晚');
    expect(slotEvent?.display?.detail).toContain('散步');
    expect(slotEvent?.display?.detail).toContain('青岛大学附近');
    expect(slotEvent?.payload?.provisional).toBe(true);
  });

  it('shows the concrete social constraints in the early visible process summary', async () => {
    const writes: Array<{ event: string; data: unknown }> = [];
    const { pipeline, writer } = makePipelineWithSlots(writes);

    await pipeline.writeEarlySlotInferenceEvents(
      writer,
      '我想在青岛大学、今天晚上、找个女生散步、最好是舞蹈生。',
    );

    const slotEvent = writes.find((item) => item.event === 'slot.filled')
      ?.data as {
      display?: { title?: string; detail?: string };
      payload?: Record<string, unknown>;
    };
    expect(slotEvent?.display).toMatchObject({
      title: '已记录你补充的信息',
    });
    expect(slotEvent?.display?.detail).toContain('今天晚上');
    expect(slotEvent?.display?.detail).toContain('散步');
    expect(slotEvent?.display?.detail).toContain('青岛大学');
    expect(slotEvent?.display?.detail).toContain('女生');
    expect(slotEvent?.payload?.slots).toMatchObject({
      time_window: expect.objectContaining({ value: '今天晚上' }),
      location_text: expect.objectContaining({ value: '青岛大学' }),
      activity: expect.objectContaining({ value: '散步' }),
      candidate_preference: expect.objectContaining({
        value: expect.stringContaining('舞蹈'),
      }),
    });
  });

  it('emits early slot events for short follow-up messages inside an existing task context', async () => {
    const writes: Array<{ event: string; data: unknown }> = [];
    const { pipeline, writer } = makePipelineWithSlots(writes, {
      taskId: 42,
      threadId: 'agent-task:42',
    });

    await pipeline.writeEarlySlotInferenceEvents(writer, '今晚', {
      taskId: 42,
      threadId: 'agent-task:42',
    });

    const slotEvent = writes.find((item) => item.event === 'slot.filled')
      ?.data as {
      display?: { title?: string; detail?: string };
    };
    expect(slotEvent?.display).toMatchObject({
      title: '已记录你补充的信息',
      detail: '今晚',
    });
  });

  it('deduplicates repeated visible process events without suppressing assistant deltas', async () => {
    const writes: Array<{ event: string; data: unknown }> = [];
    const pipeline = new SocialCodexEventPipelineService(
      new SocialAgentEventV2Service(),
      undefined,
      undefined,
      undefined,
      undefined,
      new SocialCodexApprovalSchemaService(),
    );
    const writer = makePipeline(writes);

    await pipeline.writeStep(writer, {
      label: '理解用户需求',
      status: 'running',
      detail: '结合最近对话和已确认偏好。',
    });
    await pipeline.writeStep(writer, {
      label: '理解用户需求',
      status: 'running',
      detail: '结合最近对话和已确认偏好。',
    });
    await pipeline.writeAssistantDelta(writer, '你好');
    await pipeline.writeAssistantDelta(writer, '你好');

    const processEvents = writes.filter(
      (item) => item.event === 'tool.progress',
    );
    const assistantEvents = writes.filter(
      (item) => item.event === 'assistant.delta',
    );
    expect(processEvents).toHaveLength(1);
    expect(assistantEvents).toHaveLength(2);
  });

  it('deduplicates repeated process copy across event types while preserving distinct approvals', async () => {
    const writes: Array<{ event: string; data: unknown }> = [];
    const writer = makePipeline(writes);

    await writer('run.started', 'detect_social_intent', '正在理解你的需求', {
      state: 'running',
      detail: '会结合最近对话和已确认偏好。',
    });
    await writer(
      'visible_process.delta',
      'detect_social_intent',
      '正在理解你的需求',
      {
        state: 'running',
        detail: '会结合最近对话和已确认偏好。',
      },
    );
    await writer('tool.progress', 'detect_social_intent', '正在理解你的需求', {
      state: 'running',
      detail: '会结合最近对话和已确认偏好。',
    });
    await writer('approval.required', 'approval', '发送邀请前需要你确认', {
      state: 'waiting',
      detail: '确认前不会触达对方。',
      payload: { approvalId: 'approval-a', actionType: 'send_invite' },
    });
    await writer('approval.required', 'approval', '发送邀请前需要你确认', {
      state: 'waiting',
      detail: '确认前不会触达对方。',
      payload: { approvalId: 'approval-b', actionType: 'send_invite' },
    });

    expect(
      writes.filter(
        (item) =>
          (item.data as { display?: { title?: string } }).display?.title ===
          '正在理解你的需求',
      ),
    ).toHaveLength(1);
    expect(writes.filter((item) => item.event === 'approval.required')).toHaveLength(
      2,
    );
  });

  it('starts with neutral GPT-style process copy for ordinary chat', async () => {
    const writes: Array<{ event: string; data: unknown }> = [];
    const pipeline = new SocialCodexEventPipelineService(
      new SocialAgentEventV2Service(),
      undefined,
      undefined,
      undefined,
      undefined,
      new SocialCodexApprovalSchemaService(),
    );
    const writer = makePipeline(writes);

    await pipeline.writeRunStarted(writer);
    await pipeline.writeHydrateContext(writer);

    const serialized = JSON.stringify(writes.map((item) => item.data));
    expect(serialized).toContain('正在理解你的需求');
    expect(serialized).toContain('会结合最近对话和已确认偏好，整理成自然回复。');
    expect(serialized).toContain('会结合最近对话、当前任务和已确认偏好');
    expect(serialized).not.toMatch(/进入约练\/社交流程|约练流程|Life Graph 摘要/);
  });

  it('completes ordinary chat with neutral conversation copy instead of generic tool copy', async () => {
    const writes: Array<{ event: string; data: unknown }> = [];
    const pipeline = new SocialCodexEventPipelineService(
      new SocialAgentEventV2Service(),
      undefined,
      undefined,
      undefined,
      undefined,
      new SocialCodexApprovalSchemaService(),
    );
    const writer = makePipeline(writes);

    await pipeline.writeRunCompleted(writer, 'casual_chatting');

    const completed = writes.find((item) => item.event === 'run.completed')
      ?.data as {
      stage?: string;
      display?: { title?: string; detail?: string; state?: string };
      payload?: Record<string, unknown>;
    };
    expect(completed).toMatchObject({
      stage: 'detect_social_intent',
      display: {
        title: '已理解你的需求',
        detail: '我会继续沿用当前对话上下文。',
        state: 'done',
      },
      payload: {
        summary: expect.objectContaining({
          title: '已理解你的需求',
          state: 'completed',
          displayMode: 'covering_status',
          updateModel: 'latest_state',
          defaultVisibleCount: 1,
          historyVisibility: 'collapsed',
        }),
      },
    });
    expect(JSON.stringify(completed)).not.toContain('这一步处理完成');
    expect(JSON.stringify(completed)).not.toContain('已整理画像变化建议');
  });

  it('completes candidate search with candidate-specific process copy', async () => {
    const writes: Array<{ event: string; data: unknown }> = [];
    const pipeline = new SocialCodexEventPipelineService(
      new SocialAgentEventV2Service(),
      undefined,
      undefined,
      undefined,
      undefined,
      new SocialCodexApprovalSchemaService(),
    );
    const writer = makePipeline(writes);

    await pipeline.writeRunCompleted(writer, 'searching_candidates');

    const completed = writes.find((item) => item.event === 'run.completed')
      ?.data as {
      stage?: string;
      display?: { title?: string; detail?: string; state?: string };
    };
    expect(completed).toMatchObject({
      stage: 'search_candidates',
      display: {
        title: '已筛选公开可发现的人',
        detail: '只使用公开资料、公开动态、活动报名和公开约练意图。',
        state: 'done',
      },
    });
    expect(JSON.stringify(completed)).not.toContain('这一步处理完成');
  });

  it('keeps approval completion as a waiting checkpoint node', async () => {
    const writes: Array<{ event: string; data: unknown }> = [];
    const pipeline = new SocialCodexEventPipelineService(
      new SocialAgentEventV2Service(),
      undefined,
      undefined,
      undefined,
      undefined,
      new SocialCodexApprovalSchemaService(),
    );
    const writer = makePipeline(writes);

    await pipeline.writeRunCompleted(writer, 'waiting_confirmation');

    const completed = writes.find((item) => item.event === 'run.completed')
      ?.data as {
      stage?: string;
      display?: { title?: string; detail?: string; state?: string };
      payload?: Record<string, unknown>;
    };
    expect(completed).toMatchObject({
      stage: 'approval',
      display: {
        title: '发送邀请前需要你确认',
        detail: '确认前不会发布、触达对方或公开敏感信息。',
        state: 'waiting',
      },
      payload: {
        summary: expect.objectContaining({
          title: '发送邀请前需要你确认',
          state: 'waiting',
          displayMode: 'covering_status',
        }),
      },
    });
  });

  it('keeps assistant delta source explicit so fallback never masquerades as LLM output', async () => {
    const writes: Array<{ event: string; data: unknown }> = [];
    const pipeline = new SocialCodexEventPipelineService(
      new SocialAgentEventV2Service(),
      undefined,
      undefined,
      undefined,
      undefined,
      new SocialCodexApprovalSchemaService(),
    );
    const writer = makePipeline(writes);

    await pipeline.writeAssistantDelta(writer, '真实模型输出', 'm-llm');
    await pipeline.writeAssistantDelta(
      writer,
      '兜底输出',
      'm-fallback',
      'fallback',
    );

    const assistantEvents = writes.filter(
      (item) => item.event === 'assistant.delta',
    ) as Array<{ data: { payload?: Record<string, unknown> } }>;
    expect(assistantEvents[0]?.data.payload).toMatchObject({
      messageId: 'm-llm',
      source: 'llm',
    });
    expect(assistantEvents[0]?.data).toMatchObject({
      messageId: 'm-llm',
    });
    expect(assistantEvents[1]?.data.payload).toMatchObject({
      messageId: 'm-fallback',
      source: 'fallback',
    });
    expect(assistantEvents[1]?.data).toMatchObject({
      messageId: 'm-fallback',
    });
  });

  it('emits product-language process display text even when callers pass internal labels', async () => {
    const writes: Array<{ event: string; data: unknown }> = [];
    const writer = makePipeline(writes);

    await writer(
      'tool.progress',
      'search_candidates',
      '正在调用 tool_call_started',
      {
        state: 'running',
        detail: 'candidate search planner payload traceId',
        payload: {
          toolName: 'search_public_candidates',
          traceId: 'hidden-trace',
        },
      },
    );

    const event = writes[0]?.data as {
      display?: { title?: string; detail?: string };
    };
    expect(event.display).toMatchObject({
      title: '正在筛选公开可发现的人',
      detail: '只使用公开可发现的信息，联系对方前仍需要你确认。',
    });
    expect(JSON.stringify(event.display)).not.toMatch(
      /tool_call_started|planner|payload|traceId|internal|runtime/i,
    );
  });

  it('classifies mixed step labels by the most specific Social Codex stage', async () => {
    const writes: Array<{ event: string; data: unknown }> = [];
    const pipeline = new SocialCodexEventPipelineService(
      new SocialAgentEventV2Service(),
      undefined,
      undefined,
      undefined,
      undefined,
      new SocialCodexApprovalSchemaService(),
    );
    const writer = makePipeline(writes);

    await pipeline.writeStep(writer, {
      label: '候选安全筛选',
      status: 'running',
    });
    await pipeline.writeStep(writer, {
      label: '按时间排除候选并排序',
      status: 'running',
    });
    await pipeline.writeStep(writer, {
      label: '保存 message 到当前 thread',
      status: 'running',
    });

    expect(
      writes.map((item) => {
        const data = item.data as {
          stage?: string;
          display?: { title?: string };
        };
        return { stage: data.stage, title: data.display?.title };
      }),
    ).toEqual([
      { stage: 'safety_filter', title: '正在检查安全边界' },
      { stage: 'rank_candidates', title: '正在整理合适选项' },
      { stage: 'detect_social_intent', title: '正在理解你的需求' },
    ]);
  });

  it('sanitizes user-visible event payloads before streaming and replay persistence', async () => {
    const writes: Array<{ event: string; data: unknown }> = [];
    const appendEventByTaskId = jest.fn().mockResolvedValue(undefined);
    const pipeline = new SocialCodexEventPipelineService(
      new SocialAgentEventV2Service(),
      { appendEventByTaskId } as never,
      undefined,
      undefined,
      undefined,
      new SocialCodexApprovalSchemaService(),
    );
    const writer = pipeline.createWriter({
      write: (event, data) => writes.push({ event, data }),
      userId: 7,
      taskId: 42,
      threadId: 'agent-task:42',
      runId: 'run:test',
    });

    await writer('candidate_search.done', 'rank_candidates', '找到 3 个公开可发现的人', {
      state: 'done',
      payload: {
        candidateCount: 3,
        safeSummary: '公开资料显示都偏好周末下午散步。',
        traceId: 'hidden-trace',
        planner: { rawJson: true },
        rawJson: { debug: true },
        payload: { toolInput: 'internal' },
        messages: [{ role: 'system', content: 'hidden prompt' }],
        phone: '15253005312',
        latitude: 36.123456,
        nested: {
          summary: '只使用公开可发现资料。',
          toolCalls: [{ name: 'search_public_candidates' }],
          preciseLocation: '青岛大学某宿舍楼 3 单元 401',
        },
      },
    });

    const streamedEvent = writes[0]?.data as { payload?: Record<string, unknown> };
    expect(streamedEvent.payload).toMatchObject({
      candidateCount: 3,
      safeSummary: '公开资料显示都偏好周末下午散步。',
      nested: {
        summary: '只使用公开可发现资料。',
      },
    });
    expect(JSON.stringify(streamedEvent.payload)).not.toMatch(
      /hidden-trace|planner|rawJson|toolInput|system|hidden prompt|15253005312|36\.123456|宿舍楼|toolCalls|preciseLocation/i,
    );
    expect(appendEventByTaskId).toHaveBeenCalledWith(
      7,
      42,
      expect.objectContaining({
        payload: streamedEvent.payload,
      }),
    );
  });

  it('hydrates context with the caller thread id instead of collapsing everything to task id', async () => {
    const writes: Array<{ event: string; data: unknown }> = [];
    const contextHydrator = {
      hydrateContext: jest.fn().mockResolvedValue({
        taskSlots: {
          activity: { value: '散步', state: 'completed' },
          time_window: { value: '周末下午', state: 'completed' },
        },
        lifeGraphFactProposals: [],
        lifeGraphFactDisplaySummaries: [],
        lifeGraphGovernanceSummary: {
          total: 0,
          autoSaveCount: 0,
          confirmationRequiredCount: 0,
          blockedCount: 0,
          sensitiveCount: 0,
          expiringFactKeys: [],
        },
      }),
    };
    const pipeline = new SocialCodexEventPipelineService(
      new SocialAgentEventV2Service(),
      undefined,
      undefined,
      contextHydrator as never,
      undefined,
      new SocialCodexApprovalSchemaService(),
    );
    const writer = pipeline.createWriter({
      write: (event, data) => writes.push({ event, data }),
      userId: 7,
      taskId: 42,
      threadId: 'agent-task:42',
      runId: 'run:test',
    });

    await pipeline.writeContextEvents(
      writer,
      7,
      42,
      'run:test',
      'agent-task:42',
    );

    expect(contextHydrator.hydrateContext).toHaveBeenCalledWith({
      userId: 7,
      taskId: 42,
      threadId: 'agent-task:42',
    });
    expect(writes.map((item) => item.event)).toEqual(
      expect.arrayContaining(['slot.completed', 'memory.saved']),
    );
  });

  it('derives context task id from canonical thread id when the result omits task id', async () => {
    const writes: Array<{ event: string; data: unknown }> = [];
    const contextHydrator = {
      hydrateContext: jest.fn().mockResolvedValue({
        taskSlots: {
          activity: { value: '散步', state: 'completed' },
          location_text: { value: '青岛大学附近', state: 'completed' },
        },
        lifeGraphFactProposals: [],
        lifeGraphFactDisplaySummaries: [],
        lifeGraphGovernanceSummary: {
          total: 0,
          autoSaveCount: 0,
          confirmationRequiredCount: 0,
          blockedCount: 0,
          sensitiveCount: 0,
          expiringFactKeys: [],
        },
      }),
    };
    const pipeline = new SocialCodexEventPipelineService(
      new SocialAgentEventV2Service(),
      undefined,
      undefined,
      contextHydrator as never,
      undefined,
      new SocialCodexApprovalSchemaService(),
    );
    const writer = pipeline.createWriter({
      write: (event, data) => writes.push({ event, data }),
      userId: 7,
      taskId: null,
      threadId: 'agent-task:42',
      runId: 'run:test',
    });

    await pipeline.writeContextEvents(
      writer,
      7,
      null,
      'run:test',
      'agent-task:42',
    );

    expect(contextHydrator.hydrateContext).toHaveBeenCalledWith({
      userId: 7,
      taskId: 42,
      threadId: 'agent-task:42',
    });
    expect(writes.map((item) => item.event)).toEqual(
      expect.arrayContaining(['slot.completed', 'memory.saved']),
    );
    expect(
      writes.map((item) => item.data as { taskId?: number | null }),
    ).toEqual(expect.arrayContaining([expect.objectContaining({ taskId: 42 })]));
  });

  it('uses lightweight recovery copy instead of backend-style saved-conversation copy', async () => {
    const writes: Array<{ event: string; data: unknown }> = [];
    const pipeline = new SocialCodexEventPipelineService(
      new SocialAgentEventV2Service(),
      undefined,
      undefined,
      undefined,
      undefined,
      new SocialCodexApprovalSchemaService(),
    );
    const writer = pipeline.createWriter({
      write: (event, data) => writes.push({ event, data }),
      userId: 7,
      taskId: 42,
      threadId: 'agent-task:42',
      runId: 'run:test',
    });

    await pipeline.writeRunFailed(writer);
    await pipeline.writeRunCompleted(writer, 'error_recovery');

    const serialized = JSON.stringify(writes);
    expect(serialized).toContain('连接中断了，可以继续');
    expect(serialized).toContain('这段需求还在，可以直接继续');
    expect(serialized).not.toContain('已保留当前对话');
    expect(serialized).not.toContain('我已经保留当前对话');
    expect(serialized).not.toContain('刚才的处理没有继续执行高风险动作');
  });
});
