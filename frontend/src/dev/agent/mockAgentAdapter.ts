import type {
  FitMeetAlphaCard,
  UserFacingAgentResponse,
} from '../../api/socialAgentApi';
import type { AgentAdapter } from '../../components/agent-workspace/api/agentAdapter.types';
import type {
  AgentActionRequest,
  AgentLifecycle,
  AgentRunResponse,
  AgentStreamEvent,
} from '../../components/agent-workspace/api/agentApi.types';

const MOCK_TASK_ID = 9001;
const MOCK_AGENT_LABELS = {
  lifeGraph: '画像助手',
  socialMatch: '匹配助手',
  meetLoop: '约见助手',
} as const;
const MOCK_DISCOVERY_INTERESTS = ['咖啡', 'Citywalk', '散步', '轻聊天'] as const;
const MOCK_FLOW_DELAYS = {
  analyzingIntent: 900,
  discoveringScenes: 1300,
  generatingOpener: 900,
} as const;

function includesSocialActionIntent(goal: string) {
  const normalized = goal.trim().toLowerCase();
  if (!normalized) return false;
  if (
    /(不想|不用|不要|不是|先不|暂时不).{0,8}(交友|找人|约练|搭子|匹配|推荐人|活动|加好友|邀请)/.test(
      normalized,
    )
  ) {
    return false;
  }
  return /(找.{0,12}(人|搭子|朋友|用户|候选|活动|局|约练)|找个?搭子|约练|约跑|约球|认识.{0,8}(朋友|人|搭子)|推荐.{0,8}(用户|朋友|人|搭子|候选|活动|局|约练)|搜索.{0,8}(用户|朋友|人|搭子|候选|活动|局|约练)|匹配.{0,8}(用户|朋友|人|搭子|候选)|一起.{0,12}(跑步|健身|羽毛球|网球|篮球|徒步|骑行|运动|训练)|参加.{0,8}(活动|约练)|发起.{0,8}(活动|约练)|加好友|发邀请|线下见面|线下活动)/.test(
    normalized,
  );
}

function includesSensitiveIntent(goal: string) {
  return /线下|见面|联系方式|微信|手机号|跳过站内聊|直接约|加好友/.test(goal);
}

function cancelsPendingSocialSearch(goal: string) {
  return /(取消|先不找|不找了|不用找|暂停|算了)/.test(goal.trim().toLowerCase());
}

function includesCheckpointFailureQaIntent(goal: string) {
  return /checkpoint\s*qa|检查点|保存点/i.test(goal) && /(失败|重试|retry)/i.test(goal);
}

function includesCheckpointCompleteQaIntent(goal: string) {
  return /checkpoint\s*qa|检查点|保存点/i.test(goal) && /(完成|replay|fork|分支|新版本)/i.test(goal);
}

type MockOpportunityClarification = {
  complete: boolean;
  missing: Array<'city' | 'time' | 'activity' | 'intensity' | 'boundary'>;
  assistantMessage: string;
};

export function createMockAgentAdapter(): AgentAdapter {
  let pendingOpportunityGoal: string | null = null;

  return {
    async run(request, handlers) {
      assertNotAborted(handlers.signal);
      if (!request.goal.trim()) throw new Error('MISSING_INFO');

      const analyzingDuration = MOCK_FLOW_DELAYS.analyzingIntent;
      const discoveringDuration = MOCK_FLOW_DELAYS.discoveringScenes;
      const hasPendingOpportunityClarification = pendingOpportunityGoal !== null;
      if (hasPendingOpportunityClarification && cancelsPendingSocialSearch(request.goal)) {
        pendingOpportunityGoal = null;
      }
      const socialIntent =
        includesSocialActionIntent(request.goal) || pendingOpportunityGoal !== null;
      const opportunityGoal = [pendingOpportunityGoal, request.goal]
        .filter(Boolean)
        .join(' ')
        .trim();

      emit(handlers, mockCoveringStatus('analyzing_intent'));
      emit(handlers, mockProgress('understand', '分析中', '正在理解你的需求', 'analysis'));
      await delay(analyzingDuration, handlers.signal);

      if (includesCheckpointFailureQaIntent(request.goal)) {
        emit(handlers, {
          type: 'progress',
          id: 'rank',
          title: '排序步骤没有完成',
          detail: '候选排序服务临时不可用，可从保存点重试这一小步。',
          kind: 'tool',
          state: 'failed',
          metadata: { agentName: MOCK_AGENT_LABELS.socialMatch },
          snapshot: {
            schemaVersion: 'fitmeet.step-snapshot.v1',
            observation: ['召回结果已保存', '排序阶段返回临时失败'],
            critique: '只需要重试排序步骤，不要重新发送邀请或写入记忆。',
            result: '等待用户选择是否重试。',
          },
        });
        await delay(120, handlers.signal);
        const response = createMockCheckpointFailureResponse();
        emitStreamingAnswer(handlers, response.assistantMessage, 'failed');
        emit(handlers, {
          type: 'result',
          lifecycle: 'failed',
          result: response,
        });
        return toRunResponse(response, 'failed');
      }

      if (includesCheckpointCompleteQaIntent(request.goal)) {
        emit(handlers, {
          type: 'progress',
          id: 'rank',
          title: '排序步骤已完成',
          detail: '结果已保存，可以重新运行或生成一个新版本。',
          kind: 'tool',
          state: 'done',
          metadata: { agentName: MOCK_AGENT_LABELS.socialMatch },
          snapshot: {
            schemaVersion: 'fitmeet.step-snapshot.v1',
            observation: ['已完成候选排序', '保存点可用于回放或分支'],
            critique: '重新运行会复用上下文，新版本会保留原回答。',
            result: '已准备可回放状态。',
          },
        });
        await delay(120, handlers.signal);
        const response = createMockCheckpointCompleteResponse();
        emitStreamingAnswer(handlers, response.assistantMessage, 'completed');
        emit(handlers, {
          type: 'result',
          lifecycle: 'completed',
          result: response,
        });
        return toRunResponse(response, 'completed');
      }

      if (!socialIntent) {
        emit(handlers, mockCoveringStatus('analyzing_intent'));
        emit(handlers, mockProgress('reply', '整理回复', '正在把回答组织得更清楚', 'status'));
        await delay(220, handlers.signal);
        const response = createMockConversationResponse(request.goal);
        emitStreamingAnswer(handlers, response.assistantMessage, 'completed');
        emit(handlers, {
          type: 'result',
          lifecycle: 'completed',
          result: response,
        });
        return toRunResponse(response, 'completed');
      }

      const clarification = evaluateMockOpportunityClarification(opportunityGoal);
      if (!clarification.complete) {
        pendingOpportunityGoal = opportunityGoal;
        emit(handlers, mockCoveringStatus('analyzing_intent'));
        emit(handlers, mockProgress('clarify', '确认需求', '正在整理还需要补充的信息', 'analysis'));
        await delay(220, handlers.signal);
        const response = createMockClarificationResponse(clarification.assistantMessage);
        emitStreamingAnswer(handlers, response.assistantMessage, 'completed');
        emit(handlers, {
          type: 'result',
          lifecycle: 'completed',
          result: response,
        });
        return toRunResponse(response, 'completed');
      }
      pendingOpportunityGoal = null;

      emit(handlers, mockCoveringStatus('searching_candidates'));
      emit(
        handlers,
        mockProgress(
          'life-graph-boundary',
          '整理你的社交边界',
          '只使用本轮明确表达的城市、时间、强度和安全边界。',
          'analysis',
          { agentName: MOCK_AGENT_LABELS.lifeGraph },
        ),
      );
      await delay(120, handlers.signal);
      emit(
        handlers,
        mockProgress(
          'social-match-search',
          '正在查找合适的人',
          '正在筛选合适的人和公开活动。',
          'tool',
          { agentName: MOCK_AGENT_LABELS.socialMatch },
        ),
      );

      for (let index = 0; index < MOCK_DISCOVERY_INTERESTS.length; index += 1) {
        await delay(index === 0 ? 100 : 180, handlers.signal);
        emit(handlers, {
          type: 'lifecycle',
          lifecycle: 'searching_candidates',
          metadata: {
            activeInterestIndex: index,
            activeInterest: MOCK_DISCOVERY_INTERESTS[index],
          },
        });
      }

      emit(
        handlers,
        mockProgress(
          'meet-loop-plan',
          '规划安全推进路径',
          '把查看详情、生成开场白、确认后发送拆成可恢复步骤。',
          'tool',
          { agentName: MOCK_AGENT_LABELS.meetLoop },
        ),
      );
      await delay(
        Math.max(0, discoveringDuration - 100 - MOCK_DISCOVERY_INTERESTS.length * 180),
        handlers.signal,
      );
      const sensitive = includesSensitiveIntent(opportunityGoal);
      const response = createMockRecommendationResponse(opportunityGoal, sensitive);
      const lifecycle: AgentLifecycle = sensitive ? 'checking_safety' : 'completed';
      emit(handlers, {
        type: 'result',
        lifecycle,
        result: response,
      });
      return toRunResponse(response, lifecycle);
    },

    async performAction(
      _taskId: number,
      request: AgentActionRequest,
      handlers = { onEvent: () => undefined },
    ) {
      assertNotAborted(handlers.signal);
      if (!request.idempotencyKey) throw new Error('MISSING_INFO: idempotencyKey is required');
      emit(
        handlers,
        mockCoveringStatus(
          request.action === 'candidate.generate_opener'
            ? 'drafting_opener'
            : 'checking_safety',
        ),
      );
      if (request.action === 'candidate.view_detail') {
        await delay(420, handlers.signal);
        const response = createMockCandidateDetailResponse();
        emitStreamingAnswer(handlers, response.assistantMessage, 'completed');
        emit(handlers, { type: 'result', lifecycle: 'completed', result: response });
        return toRunResponse(response, 'completed');
      }
      if (request.action === 'candidate.generate_opener' || request.action === 'opener.regenerate') {
        await delay(MOCK_FLOW_DELAYS.generatingOpener, handlers.signal);
        const response = createMockOpenerResponse();
        emitStreamingAnswer(handlers, response.assistantMessage, 'drafting_opener');
        emit(handlers, { type: 'result', lifecycle: 'completed', result: response });
        return toRunResponse(response, 'completed');
      }
      if (request.action === 'opener.confirm_send') {
        const confirmed = request.payload?.confirmed === true;
        const response = confirmed
          ? createMockInviteSuccessResponse()
          : createMockInviteConfirmationResponse();
        emitStreamingAnswer(
          handlers,
          response.assistantMessage,
          confirmed ? 'completed' : 'waiting_confirmation',
        );
        emit(handlers, {
          type: 'result',
          lifecycle: confirmed ? 'completed' : 'waiting_confirmation',
          result: response,
        });
        return toRunResponse(
          response,
          confirmed ? 'completed' : 'waiting_confirmation',
        );
      }
      const response = createMockSafetyReminderResponse();
      emitStreamingAnswer(handlers, response.assistantMessage, 'checking_safety');
      emit(handlers, { type: 'result', lifecycle: 'checking_safety', result: response });
      return toRunResponse(response, 'checking_safety');
    },

    async restoreSession() {
      return null;
    },
  };
}

function createMockConversationResponse(goal: string): UserFacingAgentResponse {
  const shortGoal = goal.length > 42 ? `${goal.slice(0, 42)}...` : goal;
  return {
    assistantMessage: `我理解了。关于“${shortGoal}”，我会先按普通对话帮你梳理：先明确你真正想解决的问题，再给出一个可以马上尝试的小步骤。如果你后面想找人、约练或参加活动，再直接告诉我，我会再切换到社交推荐流程。`,
    lightStatus: '已整理回复',
    permissionMode: 'limited_auto',
    safeStatus: {
      blocked: false,
      level: 'low',
      boundaryNotes: [],
      requiredConfirmations: [],
    },
    pendingConfirmations: [],
    cards: [],
  };
}

function createMockClarificationResponse(assistantMessage: string): UserFacingAgentResponse {
  return {
    assistantMessage,
    lightStatus: '正在整理回复',
    permissionMode: 'limited_auto',
    safeStatus: {
      blocked: false,
      level: 'low',
      boundaryNotes: [],
      requiredConfirmations: [],
    },
    pendingConfirmations: [],
    cards: [],
  };
}

function createMockCheckpointFailureResponse(): UserFacingAgentResponse {
  return {
    assistantMessage: '这一步没有完成，但我已经保存了进度。你可以只重试排序步骤，不会重复执行前面的召回或发送动作。',
    lightStatus: '正在整理回复',
    permissionMode: 'limited_auto',
    safeStatus: {
      blocked: false,
      level: 'low',
      boundaryNotes: ['重试只会从保存点继续，不会自动发送消息。'],
      requiredConfirmations: [],
    },
    pendingConfirmations: [],
    cards: [],
    runtime: {
      checkpointId: 321,
      checkpointType: 'step',
      canResume: false,
      canReplay: true,
      canFork: false,
      threadId: 'mock-thread-checkpoint',
      idempotencyKey: 'mock-checkpoint-failure',
      checkpointAction: 'retry',
      resumeCursor: {
        threadId: 'mock-thread-checkpoint',
        parentCheckpointId: 321,
        action: 'retry',
        stepId: 'rank',
      },
    },
  };
}

function createMockCheckpointCompleteResponse(): UserFacingAgentResponse {
  return {
    assistantMessage: '这一步已经完成，并且保存了可恢复状态。你可以重新运行这一步，也可以生成一个新版本继续比较。',
    lightStatus: '已整理回复',
    permissionMode: 'limited_auto',
    safeStatus: {
      blocked: false,
      level: 'low',
      boundaryNotes: ['重新运行和新版本都会保留在同一对话里。'],
      requiredConfirmations: [],
    },
    pendingConfirmations: [],
    cards: [],
    runtime: {
      checkpointId: 123,
      checkpointType: 'step',
      canResume: false,
      canReplay: true,
      canFork: true,
      threadId: 'mock-thread-checkpoint',
      idempotencyKey: 'mock-checkpoint-complete',
      checkpointAction: 'replay',
      resumeCursor: {
        threadId: 'mock-thread-checkpoint',
        parentCheckpointId: 123,
        action: 'replay',
        stepId: 'rank',
      },
    },
  };
}

function evaluateMockOpportunityClarification(goal: string): MockOpportunityClarification {
  const fields = {
    city: extractMockCity(goal),
    time: extractMockTime(goal),
    activity: extractMockActivity(goal),
    intensity: extractMockIntensity(goal),
    boundary: extractMockBoundary(goal),
  };
  const missing = (Object.keys(fields) as MockOpportunityClarification['missing']).filter(
    (field) => !fields[field],
  );
  if (missing.length === 0) {
    return {
      complete: true,
      missing,
      assistantMessage: '',
    };
  }
  const labels: Record<MockOpportunityClarification['missing'][number], string> = {
    city: '城市/大致区域',
    time: '时间',
    activity: '运动或见面场景',
    intensity: '运动强度',
    boundary: '社交边界',
  };
  const known = [
    fields.city ? `城市：${fields.city}` : '',
    fields.time ? `时间：${fields.time}` : '',
    fields.activity ? `场景：${fields.activity}` : '',
    fields.intensity ? `强度：${fields.intensity}` : '',
    fields.boundary ? `边界：${fields.boundary}` : '',
  ].filter(Boolean);
  return {
    complete: false,
    missing,
    assistantMessage: `${known.length ? `我已经记下 ${known.join('，')}。` : ''}为了只推荐安全、合适的机会，还差 ${missing
      .map((field) => labels[field])
      .join('、')}。你可以一句话补齐，比如“青岛周末下午，轻松跑步，只在公共场所，先站内聊”。`,
  };
}

function extractMockCity(text: string): string {
  const match = text.match(
    /(青岛|北京|上海|深圳|广州|杭州|成都|南京|武汉|西安|重庆|苏州|天津|厦门|长沙|郑州|济南|大连|沈阳|同城|附近)/,
  );
  return match?.[1] ?? '';
}

function extractMockTime(text: string): string {
  const match = text.match(
    /(今晚|明天|后天|周末|本周末|工作日|上午|中午|下午|晚上|早上|午后|周[一二三四五六日天]|星期[一二三四五六日天])/,
  );
  return match?.[1] ?? '';
}

function extractMockActivity(text: string): string {
  const match = text.match(
    /(跑步|慢跑|夜跑|羽毛球|瑜伽|健身|撸铁|普拉提|徒步|骑行|篮球|足球|网球|游泳|飞盘|咖啡|散步|拍照|city\s*walk|citywalk)/i,
  );
  return match?.[1] ?? '';
}

function extractMockIntensity(text: string): string {
  if (/(低压力|轻松|随便|慢跑|散步|新手|不卷|别太累|轻量)/i.test(text)) {
    return '轻松/低压力';
  }
  if (/(中等|正常强度|适中|配速)/i.test(text)) return '中等强度';
  if (/(高强度|冲刺|间歇|训练|进阶|认真练|强一点)/i.test(text)) return '较高强度';
  return '';
}

function extractMockBoundary(text: string): string {
  const parts = [
    /(公共场所|公开场所)/i.test(text) ? '公共场所' : '',
    /(站内聊|先聊天|不交换|不加微信|不留电话)/i.test(text) ? '先站内沟通' : '',
    /(先确认|不要自动|发送前确认)/i.test(text) ? '发送前确认' : '',
  ].filter(Boolean);
  return parts.join('、');
}

function emit(
  handlers: { onEvent: (event: AgentStreamEvent) => void; signal?: AbortSignal },
  event: AgentStreamEvent,
) {
  assertNotAborted(handlers.signal);
  handlers.onEvent(event);
}

function mockProgress(
  id: string,
  title: string,
  detail: string,
  kind: 'analysis' | 'tool' | 'status',
  metadata?: Record<string, unknown>,
): AgentStreamEvent {
  return {
    type: 'progress',
    id,
    title,
    detail,
    kind,
    state: 'running',
    metadata,
  };
}

function mockCoveringStatus(lifecycle: AgentLifecycle): AgentStreamEvent {
  return {
    type: 'progress',
    id: 'social-codex:summary',
    title: mockTitleForLifecycle(lifecycle),
    kind: 'status',
    state: 'running',
    lifecycle,
    metadata: {
      processType: 'run_summary',
      originalProcessType: 'mock_status',
      sourceProtocol: 'mock_agent_stream',
      displayMode: 'covering_status',
      updateModel: 'latest_state',
      defaultVisibleCount: 1,
      historyVisibility: 'collapsed',
    },
  };
}

function mockTitleForLifecycle(lifecycle: AgentLifecycle): string {
  if (lifecycle === 'reading_life_graph') return '正在读取你的偏好';
  if (lifecycle === 'searching_candidates') return '正在筛选公开可发现的人';
  if (lifecycle === 'ranking_matches') return '正在整理合适机会';
  if (lifecycle === 'checking_safety') return '正在检查安全边界';
  if (lifecycle === 'drafting_opener') return '正在生成开场白';
  if (lifecycle === 'waiting_confirmation') return '需要你确认这一步';
  return '正在理解你的需求';
}

function emitStreamingAnswer(
  handlers: { onEvent: (event: AgentStreamEvent) => void; signal?: AbortSignal },
  text: string,
  lifecycle: AgentLifecycle,
) {
  for (const delta of text.match(/.{1,10}/g) ?? [text]) {
    emit(handlers, {
      type: 'assistant_delta',
      lifecycle,
      delta,
      source: 'fallback',
    });
  }
  emit(handlers, {
    type: 'assistant_done',
    lifecycle,
    source: 'fallback',
  });
}

function toRunResponse(response: UserFacingAgentResponse, lifecycle: AgentLifecycle): AgentRunResponse {
  return {
    response,
    lifecycle,
    taskId: findTaskId(response),
  };
}

function delay(ms: number, signal?: AbortSignal) {
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

function findTaskId(response: UserFacingAgentResponse): number | null {
  for (const card of response.cards) {
    const taskId = Number(card.data.taskId ?? card.data.agentTaskId);
    if (Number.isFinite(taskId) && taskId > 0) return taskId;
  }
  return null;
}

function createMockRecommendationResponse(
  goal: string,
  sensitive: boolean,
): UserFacingAgentResponse {
  return {
    assistantMessage: sensitive
      ? '我先找到几个适合线下认识的场景，但会把安全边界放在最前面。'
      : '我找到了一些更自然、更容易开口的场景，你可以先从轻松的方向开始。',
    lightStatus: sensitive ? '正在检查安全边界' : '正在筛选合适的人',
    permissionMode: 'limited_auto',
    safeStatus: {
      blocked: false,
      level: sensitive ? 'medium' : 'low',
      boundaryNotes: ['建议先站内聊几句，第一次见面优先选择公共场所。'],
      requiredConfirmations: sensitive ? ['发送邀请前需要你确认'] : [],
    },
    pendingConfirmations: [],
    cards: [
      {
        id: 'mock-candidate-coffee',
        type: 'candidate_card',
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'social_match.candidate',
        title: goal.includes('咖啡') ? '咖啡轻聊搭子' : '轻松社交搭子',
        body: '你们都偏好低压力、可先站内聊的轻社交方式。',
        status: 'ready',
        data: {
          taskId: MOCK_TASK_ID,
          schemaName: 'OpportunityCard',
          schemaVersion: 'fitmeet.tool-ui.v1',
          schemaType: 'social_match.candidate',
          opportunityCard: true,
          displayName: goal.includes('咖啡') ? '咖啡轻聊搭子' : '轻松社交搭子',
          opportunity: {
            id: 'mock-opportunity-candidate',
            type: 'person',
            name: goal.includes('咖啡') ? '咖啡轻聊搭子' : '轻松社交搭子',
            title: goal.includes('咖啡') ? '咖啡轻聊搭子' : '轻松社交搭子',
            subtitle: '同城附近 · 本周末下午 · 低压力',
            score: 88,
            summary: '你们都偏好低压力、可先站内聊的轻社交方式。',
            area: '同城附近',
            time: '今晚或本周末',
            distanceLabel: '约 2.4km',
            interests: ['跑步', 'Citywalk', '低压力'],
            safetyBadges: ['公共场所', '站内沟通'],
            reasons: ['都偏好低压力见面', '兴趣话题容易展开', '可以先站内聊', '公共场所选择充足'],
            explanationSteps: ['来源：城市和时间匹配', '匹配：活动强度接近', '安全：只建议公共场所和站内沟通'],
            discoverySafetySignals: [
              '公开可发现',
              '已开启 Agent 匹配',
              '资料已脱敏',
              '无拉黑/投诉风险信号',
              '邀请前保留确认边界',
            ],
            recommendationProtocol: [
              {
                key: 'discoverability',
                label: '可发现来源',
                detail: '公开可发现且已允许 Agent 推荐',
              },
              {
                key: 'consent',
                label: '推荐授权',
                detail: '仅展示公开可发现且已授权推荐的资料',
              },
              {
                key: 'privacy',
                label: '隐私处理',
                detail: '资料已脱敏，不展示手机号、精确位置或私聊内容',
              },
              {
                key: 'approval',
                label: '触达边界',
                detail: '发送邀请、加好友或创建活动前必须由你确认',
              },
            ],
            suggestedOpener:
              '我也想找个轻松一点的咖啡或散步搭子，要不要先聊聊你平时喜欢的地方？',
            recommendedNextAction: '先生成开场白，确认后再发送邀请。',
            safetyBoundary: '建议先站内聊几句，第一次见面优先选择公共场所。',
            confirmedContext: ['同城附近', '本周末下午', '轻松跑步', '公共场所', '先站内聊'],
          },
          confirmedContext: ['同城附近', '本周末下午', '轻松跑步', '公共场所', '先站内聊'],
          recommendationProtocol: [
            {
              key: 'discoverability',
              label: '可发现来源',
              detail: '公开可发现且已允许 Agent 推荐',
            },
            {
              key: 'approval',
              label: '触达边界',
              detail: '发送邀请、加好友或创建活动前必须由你确认',
            },
          ],
          matchScore: '88%',
          area: '同城附近',
          distanceLabel: '约 2.4km',
          timePreference: '今晚或本周末',
          socialPreference: '先站内聊，公共场所优先',
          recommendationLine: '咖啡、散步和 Citywalk 都比较适合自然破冰。',
          fitReasons: ['都偏好低压力见面', '兴趣话题容易展开', '可以先站内聊', '公共场所选择充足'],
          whyNow: '你当前的需求适合从轻量场景开始。',
          safetyBoundary: '建议先站内聊几句，第一次见面优先选择公共场所。',
          suggestedOpener: '我也想找个轻松一点的咖啡或散步搭子，要不要先聊聊你平时喜欢的地方？',
        },
        actions: [
          {
            id: 'mock-view-candidate',
            label: '查看详情',
            action: 'candidate.view_detail',
            schemaAction: 'candidate.view_detail',
            requiresConfirmation: false,
            payload: { taskId: MOCK_TASK_ID },
          },
          {
            id: 'mock-generate-opener',
            label: '生成开场白',
            action: 'generate_opener',
            schemaAction: 'candidate.generate_opener',
            requiresConfirmation: false,
            payload: { taskId: MOCK_TASK_ID },
          },
          {
            id: 'mock-connect-candidate',
            label: '确认后发邀请',
            action: 'candidate.connect',
            schemaAction: 'candidate.connect',
            requiresConfirmation: true,
            payload: { taskId: MOCK_TASK_ID },
          },
          {
            id: 'mock-send-invite',
            label: '发送邀请',
            action: 'send_message',
            schemaAction: 'opener.confirm_send',
            requiresConfirmation: true,
            payload: { taskId: MOCK_TASK_ID },
          },
        ],
      },
      {
        id: 'mock-activity-citywalk',
        type: 'activity_plan',
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'social_match.activity',
        title: '周末轻松 Citywalk',
        body: '公开活动比直接连接陌生人更低压力，适合先自然认识。',
        status: 'ready',
        data: {
          taskId: MOCK_TASK_ID,
          schemaName: 'OpportunityCard',
          schemaVersion: 'fitmeet.tool-ui.v1',
          schemaType: 'social_match.activity',
          opportunityCard: true,
          opportunity: {
            id: 'mock-opportunity-activity',
            type: 'activity',
            title: '周末轻松 Citywalk',
            subtitle: '同城 · 公共路线 · 本周末下午',
            summary: '公开活动比直接连接陌生人更低压力，适合先自然认识。',
            city: '同城',
            location: '公共路线',
            time: '本周末下午',
            activityType: 'Citywalk',
            participants: '3/8 人',
            intensity: '轻松',
            tags: ['Citywalk', '公开活动'],
            safetyBadges: ['公共场所', '站内沟通'],
            reasons: ['和你的低压力偏好一致', '公开活动更适合第一次认识'],
            recommendedNextAction: '先查看活动详情，确认后再发起或加入。',
            safetyBoundary: '不共享精确位置，第一次只选公共场所。',
            confirmedContext: ['同城', '本周末下午', 'Citywalk', '公共场所'],
          },
          confirmedContext: ['同城', '本周末下午', 'Citywalk', '公共场所'],
          activityTitle: '周末轻松 Citywalk',
          subtitle: '同城 · 公共路线 · 本周末下午',
          city: '同城',
          locationName: '公共路线',
          timeLabel: '本周末下午',
          joinedCount: 3,
          maxParticipants: 8,
          intensity: '轻松',
          tags: ['Citywalk', '公开活动'],
          safetyBadges: ['公共场所', '站内沟通'],
          fitReasons: ['和你的低压力偏好一致', '公开活动更适合第一次认识'],
          recommendationLine: '这个活动适合先从公开场景认识新朋友。',
          recommendedNextAction: '先查看活动详情，确认后再发起或加入。',
        },
        actions: [
          {
            id: 'mock-view-activity',
            label: '查看活动详情',
            action: 'view_activity',
            schemaAction: 'activity.view_detail',
            requiresConfirmation: false,
            payload: { taskId: MOCK_TASK_ID },
          },
        ],
      },
      {
        id: 'mock-life-graph-update',
        type: 'profile_proposal',
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'life_graph.diff',
        title: '画像更新建议',
        body: '只在你确认后写入长期记忆。',
        status: 'waiting_confirmation',
        data: {
          taskId: MOCK_TASK_ID,
          schemaName: 'LifeGraphDiffCard',
          schemaVersion: 'fitmeet.tool-ui.v1',
          schemaType: 'life_graph.diff',
          before: '低压力社交偏好不明确',
          after: '更适合先站内聊、公共场所、轻量活动',
          proposedFields: ['社交边界', '活动偏好'],
          conflicts: ['如果你只想普通聊天，这条不会写入'],
          sensitivityLevel: '中',
          sourceSignals: ['本轮对话提到公共场所', '明确要求先站内聊'],
          confirmationBoundary: '只更新社交边界，不写入精确位置或联系方式。',
        },
        actions: [],
      },
      {
        id: 'mock-meet-loop',
        type: 'review_card',
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'meet_loop.timeline',
        title: '邀约进展',
        body: '我会把线下行动拆成可确认、可恢复的步骤。',
        status: 'ready',
        data: {
          taskId: MOCK_TASK_ID,
          schemaName: 'MeetLoopTimelineCard',
          schemaVersion: 'fitmeet.tool-ui.v1',
          schemaType: 'meet_loop.timeline',
          loopStage: 'draft_created',
          timeline: {
            title: '安全邀约进展',
            description: '每一步都保留确认点，不会自动触达对方。',
            nextAction: '确认后发送邀请，后续等待对方回复。',
            steps: [
              {
                key: 'draft',
                label: '发起',
                state: 'done',
                description: '已整理邀请草稿和公共场所边界。',
                actionLabel: '草稿已保存',
                checkpointReady: true,
                resumeMode: 'resume',
              },
              {
                key: 'sent',
                label: '等待回复',
                state: 'current',
                description: '确认后发送，不重复打扰。',
                actionLabel: '确认后发送',
                checkpointReady: true,
                resumeMode: 'resume',
              },
            ],
          },
        },
        actions: [],
      },
    ],
  };
}

function createMockCandidateDetailResponse(): UserFacingAgentResponse {
  return {
    assistantMessage: '我把这个候选机会的详情整理好了。你可以先看匹配理由，再决定是否生成邀请。',
    lightStatus: '已整理回复',
    permissionMode: 'limited_auto',
    safeStatus: {
      blocked: false,
      level: 'low',
      boundaryNotes: ['仅展示公开资料和匹配理由，不共享联系方式或精确位置。'],
      requiredConfirmations: [],
    },
    pendingConfirmations: [],
    cards: [
      {
        id: 'mock-candidate-detail',
        type: 'candidate_card',
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'social_match.candidate',
        title: '轻松社交搭子详情',
        body: '这个机会适合先从站内聊天开始，之后再决定是否约在公共场所见面。',
        status: 'ready',
        data: {
          taskId: MOCK_TASK_ID,
          schemaName: 'OpportunityCard',
          schemaVersion: 'fitmeet.tool-ui.v1',
          schemaType: 'social_match.candidate',
          opportunityCard: true,
          displayName: '轻松社交搭子详情',
          opportunity: {
            id: 'mock-opportunity-candidate-detail',
            type: 'person',
            name: '轻松社交搭子详情',
            title: '轻松社交搭子详情',
            subtitle: '青岛同城附近 · 本周末下午 · 先站内聊',
            score: 88,
            summary: '这个机会适合先从站内聊天开始，之后再决定是否约在公共场所见面。',
            area: '青岛同城附近',
            time: '本周末下午',
            distanceLabel: '约 2.4km',
            interests: ['轻松跑步', '低压力认识', '站内沟通'],
            safetyBadges: ['公共场所', '不共享联系方式', '确认后再发送'],
            reasons: ['时间窗口一致', '运动强度接近', '都接受先站内沟通', '公共场所边界明确'],
            explanationSteps: [
              '来源：青岛同城和周末下午匹配',
              '匹配：轻松跑步和低压力认识更接近',
              '安全：确认前不会发送邀请或共享联系方式',
            ],
            discoverySafetySignals: [
              '公开可发现',
              '已开启 Agent 匹配',
              '资料已脱敏',
              '无拉黑/投诉风险信号',
            ],
            recommendationProtocol: [
              {
                key: 'discoverability',
                label: '可发现来源',
                detail: '公开可发现且已允许 Agent 推荐',
              },
              {
                key: 'privacy',
                label: '隐私处理',
                detail: '资料已脱敏，不展示手机号、精确位置或私聊内容',
              },
              {
                key: 'approval',
                label: '触达边界',
                detail: '发送邀请、加好友或创建活动前必须由你确认',
              },
            ],
            suggestedOpener:
              '周末下午如果方便，我们可以先在公共场所轻松跑一圈，先站内聊聊时间也可以。',
            recommendedNextAction: '先生成开场白，确认后再发送邀请。',
            safetyBoundary: '确认前不会发送邀请，不会共享联系方式或精确位置。',
            confirmedContext: ['青岛同城附近', '本周末下午', '轻松跑步', '公共场所', '先站内聊'],
          },
          confirmedContext: ['青岛同城附近', '本周末下午', '轻松跑步', '公共场所', '先站内聊'],
          matchScore: '88%',
          area: '青岛同城附近',
          distanceLabel: '约 2.4km',
          timePreference: '本周末下午',
          socialPreference: '先站内聊，公共场所优先',
          recommendationLine: '你们都偏好轻松跑步和低压力认识。',
          fitReasons: ['时间窗口一致', '运动强度接近', '都接受先站内沟通', '公共场所边界明确'],
          whyNow: '本周末下午的时间更容易安排，也不需要马上交换联系方式。',
          safetyBoundary: '确认前不会发送邀请，不会共享联系方式或精确位置。',
          suggestedOpener: '周末下午如果方便，我们可以先在公共场所轻松跑一圈，先站内聊聊时间也可以。',
        },
        actions: [
          {
            id: 'mock-detail-generate-opener',
            label: '生成开场白',
            action: 'generate_opener',
            schemaAction: 'candidate.generate_opener',
            requiresConfirmation: false,
            payload: { taskId: MOCK_TASK_ID },
          },
          {
            id: 'mock-detail-send-invite',
            label: '发送邀请',
            action: 'send_message',
            schemaAction: 'opener.confirm_send',
            requiresConfirmation: true,
            payload: { taskId: MOCK_TASK_ID },
          },
        ],
      },
    ],
  };
}

function createMockOpenerResponse(): UserFacingAgentResponse {
  return {
    assistantMessage: '我先帮你写了一条自然一点的开场白。确认前不会替你发送。',
    lightStatus: '正在生成开场白',
    permissionMode: 'limited_auto',
    safeStatus: {
      blocked: false,
      level: 'low',
      boundaryNotes: ['确认前不会发送。建议先站内沟通。'],
      requiredConfirmations: [],
    },
    pendingConfirmations: [],
    cards: [
      {
        id: 'mock-opener-draft',
        type: 'candidate_card',
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'social_match.candidate',
        title: '咖啡轻聊搭子',
        body: '你好，我也想找一个轻松一点的咖啡或散步搭子。如果你方便，我们可以先站内聊几句，看看时间和地点是否合适。',
        status: 'ready',
        data: {
          taskId: MOCK_TASK_ID,
          schemaName: 'OpportunityCard',
          schemaVersion: 'fitmeet.tool-ui.v1',
          schemaType: 'social_match.candidate',
          opportunityCard: true,
          displayName: '咖啡轻聊搭子',
          opportunity: {
            id: 'mock-opportunity-opener-draft',
            type: 'person',
            name: '咖啡轻聊搭子',
            title: '咖啡轻聊搭子',
            subtitle: '同城附近 · 今晚或本周末 · 邀请待确认',
            score: 88,
            summary: '开场白已经准备好，你确认发送前我不会联系对方。',
            area: '同城附近',
            time: '今晚或本周末',
            interests: ['咖啡', '散步', '站内沟通'],
            safetyBadges: ['确认前不发送', '站内沟通', '公共场所'],
            reasons: ['语气轻松自然', '保留站内沟通边界', '没有交换联系方式或精确位置'],
            explanationSteps: [
              '生成：基于你确认的时间和边界',
              '安全：保留站内沟通和公共场所提醒',
              '执行：点击发送邀请后仍需二次确认',
            ],
            suggestedOpener:
              '你好，我也想找一个轻松一点的咖啡或散步搭子。如果你方便，我们可以先站内聊几句，看看时间和地点是否合适。',
            recommendedNextAction: '确认后发送邀请，或先再改一下开场白。',
            safetyBoundary: '确认前不会发送。建议先站内沟通。',
            confirmedContext: ['同城附近', '今晚或本周末', '咖啡或散步', '公共场所', '先站内聊'],
          },
          confirmedContext: ['同城附近', '今晚或本周末', '咖啡或散步', '公共场所', '先站内聊'],
          matchScore: '88%',
          area: '同城附近',
          timePreference: '今晚或本周末',
          socialPreference: '先站内聊，公共场所优先',
          nextStep: '发送邀请',
          recommendationLine: '开场白已经准备好，你确认发送前我不会联系对方。',
          fitReasons: ['语气轻松自然', '保留站内沟通边界', '没有交换联系方式或精确位置'],
          whyNow: '你的需求适合先用低压力话题破冰，再确认是否继续聊天。',
          safetyBoundary: '确认前不会发送。建议先站内沟通。',
          suggestedOpener: '你好，我也想找一个轻松一点的咖啡或散步搭子。如果你方便，我们可以先站内聊几句，看看时间和地点是否合适。',
        },
        actions: [
          {
            id: 'mock-send-opener-invite',
            label: '发送邀请',
            action: 'send_message',
            schemaAction: 'opener.confirm_send',
            requiresConfirmation: true,
            payload: { taskId: MOCK_TASK_ID },
          },
          {
            id: 'mock-regenerate',
            label: '再改一下',
            action: 'generate_opener',
            schemaAction: 'opener.regenerate',
            requiresConfirmation: false,
            payload: { taskId: MOCK_TASK_ID },
          },
        ],
      },
    ],
  };
}

function createMockInviteConfirmationResponse(): UserFacingAgentResponse {
  return {
    assistantMessage: '发送邀请属于关键动作，我会先等你确认。',
    lightStatus: '正在等待你确认',
    permissionMode: 'limited_auto',
    safeStatus: {
      blocked: false,
      level: 'medium',
      boundaryNotes: ['建议先站内聊几句，第一次见面优先选择公共场所。'],
      requiredConfirmations: ['发送邀请前需要确认'],
    },
    pendingConfirmations: [],
    cards: [
      {
        id: 'mock-invite-confirm',
        type: 'opener_approval',
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'safety.approval',
        title: '是否确认发送这个邀请？',
        body: '我会保留站内沟通边界，不共享联系方式或精确位置。',
        status: 'waiting_confirmation',
        data: {
          taskId: MOCK_TASK_ID,
          schemaName: 'SafetyApprovalCard',
          schemaVersion: 'fitmeet.tool-ui.v1',
          schemaType: 'safety.approval',
          approval: {
            title: '是否确认发送这个邀请？',
            boundary: '我会保留站内沟通边界，不共享联系方式或精确位置。',
            riskLevel: 'medium',
            reasons: ['这是一次真实触达动作', '发送后对方会收到邀请', '需要保留站内沟通和公共场所边界'],
            auditNote: '确认或拒绝都会写入本次 run 的安全审计记录。',
            confirmationLabel: '确认前不执行',
            checkpointLabel: '状态已保存',
          },
          riskLevel: 'medium',
          riskReasons: ['这是一次真实触达动作', '发送后对方会收到邀请', '需要保留站内沟通和公共场所边界'],
          confirmationLabel: '确认前不执行',
          checkpointLabel: '状态已保存',
          safetyBoundary: '确认前不会发送，不会交换联系方式。',
        },
        actions: [
          {
            id: 'mock-confirm-invite-send',
            label: '确认发送',
            action: 'send_message',
            schemaAction: 'opener.confirm_send',
            requiresConfirmation: true,
            payload: { taskId: MOCK_TASK_ID, confirmed: true },
          },
          {
            id: 'mock-edit-invite',
            label: '再改一下',
            action: 'generate_opener',
            schemaAction: 'opener.regenerate',
            requiresConfirmation: false,
            payload: { taskId: MOCK_TASK_ID },
          },
        ],
      },
    ],
  };
}

function createMockInviteSuccessResponse(): UserFacingAgentResponse {
  return {
    assistantMessage: '完成了。我已经为你准备好下一步建议，你可以继续补充时间或地点。进度已保存。',
    lightStatus: '正在检查安全边界',
    permissionMode: 'limited_auto',
    safeStatus: {
      blocked: false,
      level: 'low',
      boundaryNotes: ['继续保持站内沟通，第一次见面优先选择公共场所。'],
      requiredConfirmations: [],
    },
    pendingConfirmations: [],
    cards: [
      {
        id: 'mock-success-next-step',
        type: 'review_card',
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'meet_loop.timeline',
        title: '下一步建议',
        body: '先等对方回复，继续保持站内沟通，再确认时间和公共见面地点。',
        status: 'completed',
        data: {
          schemaName: 'MeetLoopTimelineCard',
          schemaVersion: 'fitmeet.tool-ui.v1',
          schemaType: 'meet_loop.timeline',
          loopStage: 'sent',
          timeline: {
            title: '下一步建议',
            description: '先等对方回复，继续保持站内沟通，再确认时间和公共见面地点。',
            nextAction: '进度已保存。下一步等待对方回复；如对方接受，再确认公共见面地点。',
            steps: [
              {
                key: 'sent',
                label: '邀请已发送',
                state: 'done',
                description: '站内邀请已经按你的确认发送。',
                actionLabel: '进度已保存',
                checkpointReady: true,
                resumeMode: 'resume',
              },
              {
                key: 'reply',
                label: '等待回复',
                state: 'current',
                description: '继续站内沟通，不共享联系方式或精确位置。',
                actionLabel: '等待对方回复',
                checkpointReady: true,
                resumeMode: 'resume',
              },
              {
                key: 'meet',
                label: '公共场所确认',
                state: 'next',
                description: '对方接受后再确认时间和公共见面地点。',
                actionLabel: '确认地点',
                checkpointReady: false,
                resumeMode: null,
              },
            ],
          },
        },
        actions: [],
      },
    ],
  };
}

function createMockSafetyReminderResponse(): UserFacingAgentResponse {
  const card: FitMeetAlphaCard = {
    id: 'mock-safety-reminder',
    type: 'safety_boundary',
    title: '先保护好边界',
    body: '建议先站内聊几句，第一次见面优先选择公共场所。',
    status: 'blocked',
    data: {},
    actions: [],
  };
  return {
    assistantMessage: '我会先把安全边界放在前面，再继续帮你调整。',
    lightStatus: '正在检查安全边界',
    permissionMode: 'limited_auto',
    safeStatus: {
      blocked: false,
      level: 'medium',
      boundaryNotes: ['建议先站内聊几句，第一次见面优先选择公共场所。'],
      requiredConfirmations: [],
    },
    pendingConfirmations: [],
    cards: [card],
  };
}
