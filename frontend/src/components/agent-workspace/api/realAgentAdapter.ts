import {
  socialAgentApi,
  type SocialAgentPermissionMode,
  type UserFacingAgentResponse,
  type UserFacingAgentSessionSnapshot,
  type UserFacingAgentStreamEvent,
} from '../../../api/socialAgentApi';
import type { AgentAdapter } from './agentAdapter.types';
import type { AgentLifecycle, AgentRunResponse, AgentStreamEvent } from './agentApi.types';
import { lifecycleFromLightStatus, lifecycleFromResponse, mapAgentError } from './agentLifecycle';

type SocialAgentApiClient = Pick<
  typeof socialAgentApi,
  'runUserFacingStream' | 'handleMessage' | 'performAction' | 'restoreSession'
> & {
  handleMessageStream?: typeof socialAgentApi.handleMessageStream;
  performActionStream?: typeof socialAgentApi.performActionStream;
};

export function createRealAgentAdapter(
  apiClient: SocialAgentApiClient = socialAgentApi,
): AgentAdapter {
  return {
    async run(request, handlers) {
      let observedTaskId = request.taskId ?? null;
      try {
        const response = await apiClient.runUserFacingStream(
          {
            goal: request.goal,
            permissionMode: request.permissionMode,
            taskId: request.taskId,
            city: request.city,
            idempotencyKey: request.idempotencyKey,
            clientContext: request.clientContext,
          },
          (event) => {
            observedTaskId = taskIdFromStreamEvent(event) ?? observedTaskId;
            const mapped = withLifecycle(event);
            if (mapped) handlers.onEvent(mapped);
          },
          handlers.signal,
        );
        return toRunResponse(response, observedTaskId);
      } catch (error) {
        if (handlers.signal?.aborted) throw mapAgentError(error);
        const restored = await recoverInterruptedStream(apiClient, observedTaskId);
        if (restored) {
          const response = toRunResponsePreferTask(restored, observedTaskId);
          handlers.onEvent({
            type: 'result',
            lifecycle: response.lifecycle,
            result: response.response,
          });
          return response;
        }
        throw mapAgentError(error);
      }
    },

    async performAction(taskId, request, handlers) {
      if (!request.idempotencyKey)
        throw mapAgentError(new Error('MISSING_INFO: idempotencyKey is required'));
      try {
        const actionInput = {
          taskId,
          action: request.action,
          idempotencyKey: request.idempotencyKey,
          payload: { ...(request.payload ?? {}) },
        };
        const response = apiClient.performActionStream
          ? await apiClient.performActionStream(
              actionInput,
              (event) => {
                const mapped = withLifecycle(event);
                if (mapped) handlers?.onEvent(mapped);
              },
              handlers?.signal,
            )
          : await apiClient.performAction(actionInput);
        return toRunResponse(response);
      } catch (error) {
        if (handlers?.signal?.aborted) throw mapAgentError(error);
        const restored = await recoverInterruptedStream(apiClient, taskId);
        if (restored) {
          const response = toRunResponsePreferTask(restored, taskId);
          handlers?.onEvent({
            type: 'result',
            lifecycle: response.lifecycle,
            result: response.response,
          });
          return response;
        }
        throw mapAgentError(error);
      }
    },

    async restoreSession(taskId) {
      try {
        const snapshot = await apiClient.restoreSession(taskId);
        const restored = responseFromSessionSnapshot(snapshot);
        if (restored) {
          const response = toRunResponse(restored);
          return {
            ...response,
            taskId: snapshot.activeTaskId ?? response.taskId ?? null,
            taskStatus: typeof snapshot.task?.status === 'string' ? snapshot.task.status : null,
          };
        }
      } catch {
        // Keep restore non-blocking. A failed restore should not break a fresh Agent page.
      }
      if (!taskId) return null;
      try {
        const fallback = await apiClient.handleMessage({
          message: '继续当前会话',
          taskId,
        });
        return toRunResponse(fallback);
      } catch {
        return null;
      }
    },
  };
}

export function mapUserFacingAgentStreamEvent(
  event: UserFacingAgentStreamEvent,
): AgentStreamEvent | null {
  return withLifecycle(event);
}

async function recoverInterruptedStream(
  apiClient: SocialAgentApiClient,
  taskId: number | null,
): Promise<UserFacingAgentResponse | null> {
  if (!taskId) return null;
  try {
    const snapshot = await apiClient.restoreSession(taskId);
    return responseFromSessionSnapshot(snapshot);
  } catch {
    return null;
  }
}

function withLifecycle(event: UserFacingAgentStreamEvent): AgentStreamEvent | null {
  const explicitLifecycle = readLifecycle(event);
  if (event.type === 'status') {
    return {
      ...event,
      lifecycle: explicitLifecycle ?? lifecycleFromLightStatus(event.lightStatus),
    };
  }
  if (isSocialAgentEventV2(event)) {
    if (event.visibility !== 'user_visible') return null;
    return socialAgentV2ToProgress(event);
  }
  if (event.type === 'result') {
    return { ...event, lifecycle: explicitLifecycle ?? lifecycleFromResponse(event.result) };
  }
  if (event.type === 'error') {
    return { ...event, lifecycle: explicitLifecycle ?? 'failed' };
  }
  if (event.type === 'assistant_delta' || event.type === 'assistant_done') {
    return explicitLifecycle
      ? { ...event, lifecycle: explicitLifecycle }
      : { ...event, lifecycle: undefined };
  }
  if (event.type === 'agent_loop_step') {
    const stepId = safeProgressId(event.stepId, `${event.phase}-${event.title}`);
    return {
      type: 'progress',
      id: stepId,
      kind: event.toolName ? 'tool' : 'analysis',
      title: event.title,
      detail: event.detail,
      state: progressStateFromStatus(event.status),
      lifecycle: explicitLifecycle ?? undefined,
      metadata: {
        stepId,
        phase: event.phase,
        agentName: event.agentName,
        toolName: event.toolName,
      },
    };
  }
  if (event.type === 'tool_call' || event.type === 'tool_result') {
    const stepId = safeProgressId(event.stepId, event.toolName);
    return {
      type: 'progress',
      id: stepId,
      kind: 'tool',
      title: event.title,
      detail: event.detail,
      state: event.type === 'tool_call' ? 'running' : progressStateFromStatus(event.status),
      lifecycle: explicitLifecycle ?? undefined,
      metadata: {
        stepId,
        agentName: event.agentName,
        toolName: event.toolName,
      },
    };
  }
  if (event.type === 'approval_required') {
    return {
      type: 'progress',
      id: `approval-${event.approvalId ?? event.actionType}`,
      kind: 'status',
      title: '等待你确认',
      detail: event.summary,
      state: 'waiting',
      lifecycle: explicitLifecycle ?? 'waiting_confirmation',
      metadata: {
        approvalId: event.approvalId,
        actionType: event.actionType,
        riskLevel: event.riskLevel,
      },
    };
  }
  const safeEvent = {
    type: event.type,
    id: event.id,
    kind: event.kind,
    title: event.title,
    detail: event.detail,
    state: event.state,
    metadata: event.metadata,
    snapshot: event.snapshot,
  };
  return explicitLifecycle ? { ...safeEvent, lifecycle: explicitLifecycle } : safeEvent;
}

function isSocialAgentEventV2(
  event: UserFacingAgentStreamEvent,
): event is Extract<UserFacingAgentStreamEvent, { eventId: string }> {
  return (
    typeof (event as { eventId?: unknown }).eventId === 'string' &&
    typeof (event as { seq?: unknown }).seq === 'number' &&
    typeof (event as { stage?: unknown }).stage === 'string'
  );
}

function socialAgentV2ToProgress(
  event: Extract<UserFacingAgentStreamEvent, { eventId: string }>,
): AgentStreamEvent {
  if (event.type === 'assistant.delta') {
    const delta = typeof event.payload?.delta === 'string' ? event.payload.delta : '';
    return {
      type: 'assistant_delta',
      lifecycle: lifecycleFromV2Stage(event.stage),
      messageId: event.messageId,
      delta,
      source: 'llm',
    };
  }
  const title = publicV2Title(event);
  const detail = publicV2Detail(event);
  return {
    type: 'progress',
    id: safeProgressId(event.eventId, title),
    kind: kindFromV2(event),
    title,
    detail,
    state: progressStateFromV2(event.display?.state),
    lifecycle: lifecycleFromV2Stage(event.stage),
    metadata: publicV2Metadata(event),
  };
}

function publicV2Title(event: Extract<UserFacingAgentStreamEvent, { eventId: string }>): string {
  const explicit = sanitizePublicV2DisplayText(event.display?.title);
  if (explicit) return explicit;
  if (event.type === 'run.started') return titleForV2Stage(event.stage, 'running');
  if (event.type === 'visible_process.delta') return titleForV2Stage(event.stage, 'running');
  if (event.type === 'tool.started') return titleForV2Stage(event.stage, 'running');
  if (event.type === 'tool.progress') return titleForV2Stage(event.stage, 'running');
  if (event.type === 'tool.done') return titleForV2Stage(event.stage, 'done');
  if (event.type === 'slot.filled') return '已记住你刚补充的信息';
  if (event.type === 'slot.completed') return '已记录你的关键信息';
  if (event.type === 'opportunity_card.created') return '已生成约练卡草稿';
  if (event.type === 'candidate_search.started') return '正在查找公开可发现的人';
  if (event.type === 'memory.saved') return '这些信息下次会继续使用';
  if (event.type === 'candidate_search.done') return '找到合适机会';
  if (event.type === 'safety_check.done') return '已检查安全边界';
  if (event.type === 'approval.required') return '发送前需要你确认';
  if (event.type === 'approval.resolved') return '已处理你的确认';
  if (event.type === 'run.completed') return '这一步处理完成';
  if (event.type === 'run.failed') return '这次处理没有完成';
  return '正在处理';
}

function publicV2Detail(
  event: Extract<UserFacingAgentStreamEvent, { eventId: string }>,
): string | undefined {
  const explicit = sanitizePublicV2DisplayText(event.display?.detail);
  if (explicit) return explicit;
  const slotSummary = publicSlotSummary(event.payload?.slots);
  if (event.type === 'slot.filled' && slotSummary) return `已记住：${slotSummary}`;
  if (event.type === 'slot.completed' && slotSummary) return `已确认：${slotSummary}`;
  if (event.type === 'candidate_search.done') {
    const candidateCount =
      readPositiveNumber(event.payload?.candidateCount) ??
      readPositiveNumber(event.payload?.count) ??
      readPositiveNumber(event.payload?.activityCount);
    if (candidateCount) return `找到 ${candidateCount} 个公开可发现的人或活动。`;
  }
  if (event.type === 'memory.saved') {
    const factSummary = publicLifeGraphFactSummary(event.payload);
    if (factSummary) return `已整理：${factSummary}`;
    const factCount = readLifeGraphFactCount(event.payload);
    if (factCount) return `已保存 ${factCount} 条稳定偏好，后续约练会继续参考。`;
  }
  if (event.type === 'opportunity_card.created') return '你确认后，它可以发布到发现页。';
  if (event.type === 'approval.required') return '确认前不会发布、发送邀请或交换敏感信息。';
  if (event.type === 'safety_check.done') return '涉及位置、联系方式和陌生人连接时会继续征得确认。';
  return undefined;
}

function titleForV2Stage(stage: string, state: 'running' | 'done'): string {
  const done = state === 'done';
  if (stage === 'detect_social_intent') return done ? '已理解你的约练需求' : '正在理解你的约练需求';
  if (stage === 'hydrate_context') return done ? '已读取你的偏好' : '正在读取你的偏好';
  if (stage === 'profile_gate') return done ? '已检查画像完整度' : '正在检查画像完整度';
  if (stage === 'slot_filling') return done ? '已记录约练信息' : '正在补齐约练信息';
  if (stage === 'create_opportunity_card') return done ? '已生成约练卡' : '正在生成约练卡';
  if (stage === 'publish_to_discover') return done ? '这张约练卡可以发布到发现' : '正在准备发布到发现';
  if (stage === 'search_candidates') return done ? '已筛选公开可发现的人' : '正在筛选公开可发现的人';
  if (stage === 'safety_filter') return done ? '已检查安全边界' : '正在检查安全边界';
  if (stage === 'rank_candidates') return done ? '已整理合适机会' : '正在排序合适机会';
  if (stage === 'generate_opener') return done ? '已生成开场白' : '正在生成开场白';
  if (stage === 'approval') return done ? '已处理你的确认' : '发送邀请前需要你确认';
  if (stage === 'send_invite') return done ? '已处理邀请' : '正在准备邀请';
  if (stage === 'life_graph_writeback') return done ? '已整理长期偏好' : '正在整理可记住的偏好';
  return done ? '这一步处理完成' : '正在处理';
}

function publicV2Metadata(
  event: Extract<UserFacingAgentStreamEvent, { eventId: string }>,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    eventId: event.eventId,
    seq: event.seq,
    taskId: event.taskId,
    processType: publicV2ProcessType(event.type),
    stageLabel: publicV2StageLabel(event.stage),
    displayState: event.display?.state ?? 'running',
  };
  if (event.type === 'approval.required' || event.type === 'approval.resolved') {
    const approvalId = publicScalar(event.payload?.approvalId);
    const riskLevel = publicScalar(event.payload?.riskLevel);
    const actionType = publicScalar(event.payload?.actionType);
    if (approvalId) metadata.approvalId = approvalId;
    if (riskLevel) metadata.riskLevel = riskLevel;
    if (actionType) metadata.actionType = actionType;
    const approvalRuntime = publicApprovalRuntimeMetadata(event.payload);
    Object.assign(metadata, approvalRuntime);
  }
  if (event.type === 'candidate_search.done') {
    const candidateCount =
      readPositiveNumber(event.payload?.candidateCount) ??
      readPositiveNumber(event.payload?.count) ??
      readPositiveNumber(event.payload?.activityCount);
    if (candidateCount) metadata.candidateCount = candidateCount;
  }
  if (event.type === 'slot.filled' || event.type === 'slot.completed') {
    const slotSummary = publicSlotSummary(event.payload?.slots);
    if (slotSummary) metadata.slotSummary = slotSummary;
  }
  if (event.type === 'memory.saved') {
    const factCount = readLifeGraphFactCount(event.payload);
    if (factCount) metadata.lifeGraphFactCount = factCount;
  }
  return metadata;
}

function publicApprovalRuntimeMetadata(
  payload: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const source = isRecord(payload) ? payload : {};
  const socialCodex = isRecord(source.socialCodex) ? source.socialCodex : {};
  const approvalPolicy = isRecord(socialCodex.approvalPolicy)
    ? socialCodex.approvalPolicy
    : {};
  const policy = isRecord(source.policy) ? source.policy : {};
  const dryRunPreview =
    firstRecord(source.dryRunPreview, socialCodex.dryRunPreview, policy.dryRunPreview);
  const title = sanitizePublicV2Text(dryRunPreview?.title);
  const summary = sanitizePublicV2Text(dryRunPreview?.summary);
  const sideEffectAllowed =
    typeof dryRunPreview?.sideEffectAllowedBeforeApproval === 'boolean'
      ? dryRunPreview.sideEffectAllowedBeforeApproval
      : approvalPolicy.sideEffectsBeforeApproval === 'none'
        ? false
        : undefined;
  const auditRequired =
    typeof source.auditRequired === 'boolean'
      ? source.auditRequired
      : typeof socialCodex.auditRequired === 'boolean'
        ? socialCodex.auditRequired
        : typeof approvalPolicy.auditRequired === 'boolean'
          ? approvalPolicy.auditRequired
          : undefined;
  const executionContract =
    typeof socialCodex.executionContract === 'string'
      ? socialCodex.executionContract
      : typeof source.executionContract === 'string'
        ? source.executionContract
        : null;
  const out: Record<string, unknown> = {
    dryRunAvailable: Boolean(title || summary || dryRunPreview),
  };
  if (title) out.dryRunPreviewTitle = title;
  if (summary) out.dryRunPreviewSummary = summary;
  if (typeof sideEffectAllowed === 'boolean') {
    out.sideEffectAllowedBeforeApproval = sideEffectAllowed;
  }
  if (typeof auditRequired === 'boolean') out.auditRequired = auditRequired;
  const boundary = publicExecutionBoundary(executionContract);
  if (boundary) out.executionBoundary = boundary;
  if (approvalPolicy.resumeAfterDecision === true || isRecord(source.resumeCursor)) {
    out.resumePolicy = '同意后从保存点继续';
  }
  return out;
}

function firstRecord(...values: unknown[]): Record<string, unknown> | null {
  for (const value of values) {
    if (isRecord(value)) return value;
  }
  return null;
}

function publicExecutionBoundary(contract: string | null): string | null {
  if (!contract) return null;
  if (/approval_required|dry_run|audit/i.test(contract)) {
    return '需要预览、确认和审计后继续';
  }
  if (/blocked/i.test(contract)) return '这一步已被安全边界拦截';
  return null;
}

function publicV2ProcessType(type: string): string {
  if (type.startsWith('tool.')) return 'tool_progress';
  if (type.startsWith('slot.')) return 'slot_memory';
  if (type.startsWith('approval.')) return 'approval';
  if (type.startsWith('candidate_search.')) return 'candidate_search';
  if (type === 'opportunity_card.created') return 'opportunity_card';
  if (type === 'memory.saved') return 'memory';
  if (type === 'safety_check.done') return 'safety';
  if (type.startsWith('run.')) return 'run';
  return 'visible_process';
}

function publicV2StageLabel(stage: string): string {
  if (stage === 'detect_social_intent') return '理解需求';
  if (stage === 'hydrate_context') return '读取上下文';
  if (stage === 'profile_gate') return '检查画像';
  if (stage === 'slot_filling') return '补齐信息';
  if (stage === 'create_opportunity_card') return '生成约练卡';
  if (stage === 'publish_to_discover') return '发布到发现';
  if (stage === 'search_candidates') return '查找候选';
  if (stage === 'safety_filter') return '安全检查';
  if (stage === 'rank_candidates') return '整理推荐';
  if (stage === 'generate_opener') return '生成开场白';
  if (stage === 'approval') return '等待确认';
  if (stage === 'send_invite') return '发送邀请';
  if (stage === 'life_graph_writeback') return '更新记忆';
  return '处理进度';
}

function sanitizePublicV2DisplayText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (containsTechnicalV2Text(value)) return null;
  if (containsSensitivePublicV2Text(value)) return null;
  return sanitizePublicV2Text(value);
}

function containsTechnicalV2Text(value: string): boolean {
  const normalized = value.toLowerCase();
  return [
    /\bvisible_process\.delta\b/,
    /\bassistant\.delta\b/,
    /\btool\.(started|progress|done)\b/,
    /\bslot\.(filled|completed)\b/,
    /\bmemory\.saved\b/,
    /\bapproval\.(required|resolved)\b/,
    /\brun\.(started|completed|failed)\b/,
    /\bhydrate_context\b/,
    /\bslot_filling\b/,
    /\btool[_\s-]?call\w*\b/,
    /\btool[_\s-]?result\w*\b/,
    /\bplanner\b/,
    /\btraceid\b/,
    /\brunid\b/,
    /\bpayload\b/,
    /\braw\s+json\b/,
    /\bdebug\b/,
    /\binternal\b/,
  ].some((pattern) => pattern.test(normalized));
}

function publicScalar(value: unknown): string | number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/trace|planner|raw|debug|stack|internal/i.test(trimmed)) return null;
  if (containsSensitivePublicV2Text(trimmed)) return null;
  return trimmed.slice(0, 80);
}

function sanitizePublicV2Text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (containsSensitivePublicV2Text(trimmed)) return null;
  const normalized = trimmed.toLowerCase();
  const technicalMatches = [
    /\bhydrate_context\b/,
    /\bslot_filling\b/,
    /\btool[_\s-]?call\w*\b/,
    /\btool[_\s-]?result\w*\b/,
    /\bplanner\b/,
    /\btraceid\b/,
    /\brunid\b/,
    /\bpayload\b/,
    /\braw\s+json\b/,
    /\bdebug\b/,
    /\binternal\b/,
  ].filter((pattern) => pattern.test(normalized)).length;
  if (technicalMatches >= 1 && !/[\u4e00-\u9fff]/.test(trimmed)) return null;
  const withoutForbidden = trimmed
    .replace(/\bhydrate_context\b/gi, '读取上下文')
    .replace(/\bslot_filling\b/gi, '补齐信息')
    .replace(/\btool[_\s-]?call\w*\b/gi, '处理步骤')
    .replace(/\btool[_\s-]?result\w*\b/gi, '处理结果')
    .replace(/\bplanner\b/gi, '下一步')
    .replace(/\btraceid\b/gi, '')
    .replace(/\brunid\b/gi, '')
    .replace(/\bpayload\b/gi, '')
    .replace(/\braw\s+json\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!withoutForbidden) return null;
  return withoutForbidden.slice(0, 160);
}

function containsSensitivePublicV2Text(value: string): boolean {
  return [
    /\b1[3-9]\d{9}\b/,
    /\b(?:wechat|weixin|wx|vx)\b/i,
    /微信|电话|手机号|联系方式|门牌|单元|楼栋|宿舍|寝室/,
    /经度|纬度|坐标|定位|导航|地图链接|高德|百度地图|腾讯地图/,
    /\b(?:amap|gaode|baidu|qq\.com\/map|geo:)/i,
    /[-+]?(?:[1-8]?\d(?:\.\d{4,})?|90(?:\.0{4,})?)\s*[,，]\s*[-+]?(?:1[0-7]\d|\d{1,2}|180)(?:\.\d{4,})?/,
  ].some((pattern) => pattern.test(value));
}

function publicSlotSummary(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const labels = [
    publicScalar(record.time_window),
    publicScalar(record.activity),
    publicScalar(record.location_text ?? record.geo_area),
    publicScalar(record.intensity),
    publicScalar(record.safety_boundary),
  ]
    .filter((item): item is string | number => item !== null)
    .map(String);
  return labels.length > 0 ? labels.join('、').slice(0, 120) : null;
}

function kindFromV2(
  event: Extract<UserFacingAgentStreamEvent, { eventId: string }>,
): 'analysis' | 'tool' | 'status' {
  if (
    event.type.startsWith('tool.') ||
    event.type.startsWith('candidate_search') ||
    event.type === 'opportunity_card.created'
  ) {
    return 'tool';
  }
  if (event.type.includes('approval') || event.type.includes('memory') || event.type.includes('slot')) {
    return 'status';
  }
  return 'analysis';
}

function progressStateFromV2(
  state?: 'running' | 'done' | 'waiting' | 'failed',
): 'running' | 'done' | 'failed' | 'waiting' {
  if (state === 'done') return 'done';
  if (state === 'failed') return 'failed';
  if (state === 'waiting') return 'waiting';
  return 'running';
}

function lifecycleFromV2Stage(stage: string): AgentLifecycle {
  if (stage === 'hydrate_context' || stage === 'profile_gate') return 'reading_life_graph';
  if (stage === 'search_candidates') return 'searching_candidates';
  if (stage === 'rank_candidates') return 'ranking_matches';
  if (stage === 'safety_filter') return 'checking_safety';
  if (stage === 'generate_opener') return 'drafting_opener';
  if (stage === 'approval') return 'waiting_confirmation';
  if (stage === 'life_graph_writeback') return 'completed';
  return 'analyzing_intent';
}

function taskIdFromStreamEvent(event: UserFacingAgentStreamEvent): number | null {
  if (event.type === 'status') {
    return readPositiveNumber(event.taskId);
  }
  if (isSocialAgentEventV2(event)) {
    return readPositiveNumber(event.taskId);
  }
  if (event.type === 'result') {
    return findTaskId(event.result);
  }
  return null;
}

function readLifeGraphFactCount(payload: Record<string, unknown> | undefined): number | null {
  if (Array.isArray(payload?.lifeGraphFacts)) return payload.lifeGraphFacts.length;
  return readPositiveNumber(payload?.factCount);
}

function publicLifeGraphFactSummary(payload: Record<string, unknown> | undefined): string | null {
  if (!Array.isArray(payload?.lifeGraphFacts)) return null;
  const lines = payload.lifeGraphFacts
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const fact = item as Record<string, unknown>;
      const label = sanitizePublicV2Text(fact.label);
      const value = sanitizePublicV2Text(fact.displayValue);
      if (!label || !value) return null;
      return `${label}：${value}`;
    })
    .filter((item): item is string => Boolean(item));
  if (lines.length === 0) return null;
  return lines.slice(0, 3).join('；').slice(0, 180);
}

function readPositiveNumber(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
}

function progressStateFromStatus(
  status?: string | null,
): 'running' | 'done' | 'failed' | 'waiting' {
  if (status === 'done' || status === 'succeeded' || status === 'success') return 'done';
  if (status === 'failed' || status === 'error') return 'failed';
  if (status === 'waiting' || status === 'blocked') return 'waiting';
  return 'running';
}

function safeProgressId(value: unknown, fallback: string): string {
  const raw = typeof value === 'string' && value.trim() ? value : fallback;
  return (
    raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._:-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'step-unknown'
  );
}

function toRunResponse(
  response: UserFacingAgentResponse,
  restoredTaskId?: number | null,
): AgentRunResponse {
  return {
    response,
    lifecycle: lifecycleFromResponse(response),
    taskId: restoredTaskId ?? findTaskId(response) ?? null,
  };
}

function toRunResponsePreferTask(
  response: UserFacingAgentResponse,
  taskId: number | null,
): AgentRunResponse {
  return {
    response,
    lifecycle: lifecycleFromResponse(response),
    taskId,
  };
}

function findTaskId(response: UserFacingAgentResponse): number | null {
  for (const card of response.cards) {
    const taskId = Number(card.data.taskId ?? card.data.agentTaskId);
    if (Number.isFinite(taskId) && taskId > 0) return taskId;
    for (const action of card.actions) {
      const actionTaskId = Number(action.payload?.taskId ?? action.payload?.agentTaskId);
      if (Number.isFinite(actionTaskId) && actionTaskId > 0) return actionTaskId;
    }
  }
  return null;
}

function responseFromSessionSnapshot(
  snapshot: UserFacingAgentSessionSnapshot,
): UserFacingAgentResponse | null {
  if (!snapshot.hasSession) return null;
  const raw = snapshot.result;
  if (!isRecord(raw)) return null;
  if (isUserFacingAgentResponse(raw)) return raw;
  const cards = Array.isArray(raw.cards) ? raw.cards : [];
  if (typeof raw.assistantMessage !== 'string' && cards.length === 0) return null;
  const permissionMode =
    readPermissionMode(raw.permissionMode) ??
    readPermissionMode(snapshot.task?.permissionMode) ??
    'limited_auto';
  return {
    assistantMessage:
      typeof raw.assistantMessage === 'string'
        ? raw.assistantMessage
        : '我已经恢复了上一次 Agent 会话。',
    lightStatus: inferLightStatus(raw, cards),
    cards: cards as UserFacingAgentResponse['cards'],
    safeStatus: isSafeStatus(raw.safeStatus)
      ? raw.safeStatus
      : {
          blocked: false,
          level: 'low',
          boundaryNotes: [],
          requiredConfirmations: [],
        },
    pendingConfirmations: Array.isArray(raw.pendingConfirmations)
      ? (raw.pendingConfirmations as UserFacingAgentResponse['pendingConfirmations'])
      : [],
    permissionMode,
    lifeGraphWritebackProposal: isRecord(raw.lifeGraphWritebackProposal)
      ? raw.lifeGraphWritebackProposal
      : undefined,
    runtime: isRecord(raw.runtime)
      ? (raw.runtime as UserFacingAgentResponse['runtime'])
      : undefined,
  };
}

function readLifecycle(value: unknown): AgentLifecycle | null {
  if (!isRecord(value)) return null;
  const lifecycle = value.lifecycle;
  return isAgentLifecycle(lifecycle) ? lifecycle : null;
}

function isAgentLifecycle(value: unknown): value is AgentLifecycle {
  return (
    value === 'received' ||
    value === 'idle' ||
    value === 'input_focused' ||
    value === 'user_submitted' ||
    value === 'analyzing_intent' ||
    value === 'reading_life_graph' ||
    value === 'searching_candidates' ||
    value === 'ranking_matches' ||
    value === 'checking_safety' ||
    value === 'drafting_opener' ||
    value === 'waiting_confirmation' ||
    value === 'completed' ||
    value === 'failed'
  );
}

function isUserFacingAgentResponse(value: unknown): value is UserFacingAgentResponse {
  if (!isRecord(value)) return false;
  return (
    typeof value.assistantMessage === 'string' &&
    typeof value.lightStatus === 'string' &&
    Array.isArray(value.cards) &&
    isSafeStatus(value.safeStatus) &&
    Array.isArray(value.pendingConfirmations) &&
    readPermissionMode(value.permissionMode) !== null
  );
}

function isSafeStatus(value: unknown): value is UserFacingAgentResponse['safeStatus'] {
  return (
    isRecord(value) &&
    typeof value.blocked === 'boolean' &&
    typeof value.level === 'string' &&
    Array.isArray(value.boundaryNotes) &&
    Array.isArray(value.requiredConfirmations)
  );
}

function readPermissionMode(value: unknown): SocialAgentPermissionMode | null {
  if (
    value === 'assist' ||
    value === 'confirm' ||
    value === 'manual_confirm' ||
    value === 'limited_auto' ||
    value === 'open' ||
    value === 'lab'
  ) {
    return value;
  }
  return null;
}

function inferLightStatus(
  raw: Record<string, unknown>,
  cards: unknown[],
): UserFacingAgentResponse['lightStatus'] {
  if (isSafeStatus(raw.safeStatus) && (raw.safeStatus.blocked || raw.safeStatus.level !== 'low')) {
    return '正在检查安全边界';
  }
  if (cards.some((card) => isRecord(card) && card.status === 'waiting_confirmation')) {
    return '正在等待你确认';
  }
  if (cards.some((card) => isRecord(card) && card.type === 'opener_approval')) {
    return '正在等待你确认';
  }
  if (cards.some((card) => isRecord(card) && card.type === 'candidate_card')) {
    return '正在筛选合适的人';
  }
  return '正在理解你的需求';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}
