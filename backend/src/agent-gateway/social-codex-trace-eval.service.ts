import { Injectable } from '@nestjs/common';

import type { SocialAgentEventV2 } from './social-agent-event-v2.types';

export type SocialCodexTraceEvalIssue = {
  code:
    | 'missing_terminal_event'
    | 'missing_thread_or_run'
    | 'raw_reasoning_leak'
    | 'sensitive_payload_leak'
    | 'high_risk_without_approval'
    | 'high_risk_without_safety_check'
    | 'approval_not_lifecycle_node'
    | 'approval_without_checkpoint'
    | 'approval_without_dry_run_preview'
    | 'approval_without_audit_contract'
    | 'high_risk_without_idempotency_key'
    | 'high_risk_before_approval_resolved'
    | 'duplicate_slot_completion'
    | 'missing_visible_process_trace'
    | 'non_monotonic_sequence'
    | 'raw_life_graph_proposal_leak';
  message: string;
  eventId?: string;
};

export type SocialCodexRegressionCheck = {
  id:
    | 'visible_process_trace'
    | 'thread_task_run_binding'
    | 'memory_slot_state_machine'
    | 'approval_lifecycle'
    | 'social_sandbox'
    | 'replay_terminal';
  label: string;
  status: 'pass' | 'fail' | 'warn';
  detail: string;
};

export type SocialCodexTraceEvalResult = {
  pass: boolean;
  issues: SocialCodexTraceEvalIssue[];
  regressionChecks: SocialCodexRegressionCheck[];
  replayCase: {
    runId: string | null;
    threadId: string | null;
    taskId: number | null;
    eventCount: number;
    stages: string[];
    approvalRequired: boolean;
    terminalType: 'run.completed' | 'run.failed' | null;
  };
  runs: Array<{
    runId: string;
    eventCount: number;
    terminalType: 'run.completed' | 'run.failed' | null;
    approvalRequired: boolean;
    stages: string[];
  }>;
};

const RAW_REASONING_PATTERN =
  /(chain[- ]?of[- ]?thought|raw reasoning|内部思维链|隐藏推理|planner dump|traceId|tool_call_started|hydrate_context)/i;

type SocialCodexRunEvalState = {
  seenSlotKeys: Set<string>;
  approvedApprovalKeys: Set<string>;
  approvedActionTypes: Set<string>;
  previousSeq: number;
  terminalType: 'run.completed' | 'run.failed' | null;
  approvalRequired: boolean;
  safetyChecked: boolean;
  hasVisibleProcessTrace: boolean;
  stages: Set<string>;
  eventCount: number;
  hasHighRiskSideEffect: boolean;
};

@Injectable()
export class SocialCodexTraceEvalService {
  evaluate(events: SocialAgentEventV2[]): SocialCodexTraceEvalResult {
    const ordered = [...events];
    const issues: SocialCodexTraceEvalIssue[] = [];
    const runStates = new Map<string, SocialCodexRunEvalState>();

    for (const event of ordered) {
      const runId = event.runId || 'missing-run';
      const run = this.runState(runStates, runId);
      run.eventCount += 1;
      run.stages.add(event.stage);

      if (!event.threadId || !event.runId) {
        issues.push({
          code: 'missing_thread_or_run',
          message: '事件缺少 threadId 或 runId，无法稳定恢复。',
          eventId: event.eventId,
        });
      }
      if (event.seq <= run.previousSeq) {
        issues.push({
          code: 'non_monotonic_sequence',
          message: '事件 seq 不是单调递增，断线重放可能乱序。',
          eventId: event.eventId,
        });
      }
      run.previousSeq = event.seq;

      const displayText = `${event.display?.title ?? ''} ${event.display?.detail ?? ''}`;
      if (RAW_REASONING_PATTERN.test(displayText)) {
        issues.push({
          code: 'raw_reasoning_leak',
          message: '用户可见过程里出现了内部技术词或推理泄漏。',
          eventId: event.eventId,
        });
      }
      if (this.containsSensitiveLeak(event)) {
        issues.push({
          code: 'sensitive_payload_leak',
          message: '事件中包含联系方式或精确位置明文，不能进入用户可见 trace 或 replay。',
          eventId: event.eventId,
        });
      }
      if (this.containsRawLifeGraphProposal(event)) {
        issues.push({
          code: 'raw_life_graph_proposal_leak',
          message:
            '用户可见 replay 中出现完整 Life Graph 提案或证据，只能暴露脱敏摘要。',
          eventId: event.eventId,
        });
      }

      if (event.type === 'safety_check.done') run.safetyChecked = true;
      if (this.isVisibleProcessTraceEvent(event)) {
        run.hasVisibleProcessTrace = true;
      }
      if (event.type === 'approval.required') {
        run.approvalRequired = true;
        if (event.stage !== 'approval') {
          issues.push({
            code: 'approval_not_lifecycle_node',
            message: 'approval.required 必须作为 Agent 生命周期里的 approval 阶段事件。',
            eventId: event.eventId,
          });
        }
        if (!this.hasApprovalCheckpoint(event)) {
          issues.push({
            code: 'approval_without_checkpoint',
            message: 'approval.required 缺少 approvalId/checkpointId，无法稳定暂停和恢复。',
            eventId: event.eventId,
          });
        }
        if (this.isHighRiskEvent(event) && !this.hasDryRunPreview(event)) {
          issues.push({
            code: 'approval_without_dry_run_preview',
            message: '高风险审批缺少 dry-run 预览，用户无法确认将要发生什么。',
            eventId: event.eventId,
          });
        }
        if (this.isHighRiskEvent(event) && !this.hasAuditContract(event)) {
          issues.push({
            code: 'approval_without_audit_contract',
            message: '高风险审批缺少审计契约，无法证明动作经过确认。',
            eventId: event.eventId,
          });
        }
        if (this.isHighRiskEvent(event) && !this.hasIdempotencyKey(event)) {
          issues.push({
            code: 'high_risk_without_idempotency_key',
            message:
              '高风险审批缺少幂等键，确认恢复或重试时可能重复执行同一动作。',
            eventId: event.eventId,
          });
        }
      }
      if (event.type === 'approval.resolved' && event.stage !== 'approval') {
        issues.push({
          code: 'approval_not_lifecycle_node',
          message: 'approval.resolved 必须作为 Agent 生命周期里的 approval 阶段事件。',
          eventId: event.eventId,
        });
      }
      if (event.type === 'approval.resolved' && this.isApprovalApproved(event)) {
        const approvalKey = this.approvalIdentity(event);
        if (approvalKey) run.approvedApprovalKeys.add(approvalKey);
        const actionType = this.highRiskActionType(event);
        if (actionType) run.approvedActionTypes.add(actionType);
      }
      if (event.type === 'run.completed' || event.type === 'run.failed') {
        run.terminalType = event.type;
      }
      if (event.type === 'slot.completed') {
        const slots = this.readSlots(event.payload);
        for (const key of slots) {
          if (run.seenSlotKeys.has(key)) {
            issues.push({
              code: 'duplicate_slot_completion',
              message: `slot ${key} 被重复完成，可能导致重复追问或重复卡片。`,
              eventId: event.eventId,
            });
          }
          run.seenSlotKeys.add(key);
        }
      }
      if (this.isHighRiskSideEffectEvent(event)) {
        run.hasHighRiskSideEffect = true;
      }
      if (this.isHighRiskEvent(event) && !run.approvalRequired) {
        issues.push({
          code: 'high_risk_without_approval',
          message: '高风险动作出现在 approval.required 之前。',
          eventId: event.eventId,
        });
      }
      if (this.isHighRiskSideEffectEvent(event) && !run.safetyChecked) {
        issues.push({
          code: 'high_risk_without_safety_check',
          message: '高风险真实动作前缺少 safety_check.done，社交 sandbox 未形成闭环。',
          eventId: event.eventId,
        });
      }
      if (
        this.isHighRiskSideEffectEvent(event) &&
        !this.hasApprovedResumeForEvent(run, event)
      ) {
        issues.push({
          code: 'high_risk_before_approval_resolved',
          message: '高风险真实动作发生在用户确认恢复之前。',
          eventId: event.eventId,
        });
      }
      if (
        event.type === 'tool.done' &&
        this.isHighRiskSideEffectEvent(event) &&
        !this.hasIdempotencyKey(event)
      ) {
        issues.push({
          code: 'high_risk_without_idempotency_key',
          message:
            '高风险真实动作缺少幂等键，无法安全重试、回放或避免重复触达。',
          eventId: event.eventId,
        });
      }
    }

    for (const [runId, run] of runStates) {
      if (!run.terminalType) {
        issues.push({
          code: 'missing_terminal_event',
          message: `run ${runId} 没有 completed/failed 终态事件，无法作为稳定回放样本。`,
        });
      }
      if (this.requiresVisibleProcessTrace(run) && !run.hasVisibleProcessTrace) {
        issues.push({
          code: 'missing_visible_process_trace',
          message:
            `run ${runId} 进入了社交/约练执行阶段，但缺少用户可见过程事件。`,
        });
      }
    }

    const first = ordered[0] ?? null;
    const last = ordered.at(-1) ?? null;
    const lastRun = last ? runStates.get(last.runId) : null;
    return {
      pass: issues.length === 0,
      issues,
      regressionChecks: this.buildRegressionChecks(ordered, issues, runStates),
      replayCase: {
        runId: last?.runId ?? first?.runId ?? null,
        threadId: last?.threadId ?? first?.threadId ?? null,
        taskId: last?.taskId ?? first?.taskId ?? null,
        eventCount: ordered.length,
        stages: [...new Set(ordered.map((event) => event.stage))],
        approvalRequired: Array.from(runStates.values()).some(
          (run) => run.approvalRequired,
        ),
        terminalType: lastRun?.terminalType ?? null,
      },
      runs: Array.from(runStates.entries()).map(([runId, run]) => ({
        runId,
        eventCount: run.eventCount,
        terminalType: run.terminalType,
        approvalRequired: run.approvalRequired,
        stages: Array.from(run.stages),
      })),
    };
  }

  private runState(
    states: Map<string, SocialCodexRunEvalState>,
    runId: string,
  ) {
    const existing = states.get(runId);
    if (existing) return existing;
    const created = {
      seenSlotKeys: new Set<string>(),
      approvedApprovalKeys: new Set<string>(),
      approvedActionTypes: new Set<string>(),
      previousSeq: 0,
      terminalType: null,
      approvalRequired: false,
      safetyChecked: false,
      hasVisibleProcessTrace: false,
      stages: new Set<string>(),
      eventCount: 0,
      hasHighRiskSideEffect: false,
    };
    states.set(runId, created);
    return created;
  }

  private buildRegressionChecks(
    events: SocialAgentEventV2[],
    issues: SocialCodexTraceEvalIssue[],
    runStates: Map<string, SocialCodexRunEvalState>,
  ): SocialCodexRegressionCheck[] {
    const issueCodes = new Set(issues.map((issue) => issue.code));
    const allRuns = Array.from(runStates.values());
    const hasAnySocialStage = allRuns.some((run) =>
      this.requiresVisibleProcessTrace(run),
    );
    const hasApproval = allRuns.some((run) => run.approvalRequired);
    const hasHighRiskSideEffect = allRuns.some((run) => run.hasHighRiskSideEffect);
    const hasTerminal = allRuns.length > 0 && allRuns.every((run) => run.terminalType);
    const allBound = events.every((event) => Boolean(event.threadId && event.runId));
    const hasSlotStage = allRuns.some((run) => run.stages.has('slot_filling'));

    return [
      {
        id: 'visible_process_trace',
        label: '过程可见',
        status:
          !hasAnySocialStage || !issueCodes.has('missing_visible_process_trace')
            ? 'pass'
            : 'fail',
        detail: hasAnySocialStage
          ? '社交/约练执行阶段必须有用户可见过程事件。'
          : '普通聊天不强制展示工具过程。',
      },
      {
        id: 'thread_task_run_binding',
        label: 'Thread / Task / Run 可恢复',
        status:
          allBound &&
          !issueCodes.has('missing_thread_or_run') &&
          !issueCodes.has('non_monotonic_sequence')
            ? 'pass'
            : 'fail',
        detail: '每个事件都需要 threadId、runId 和单调 seq，支持断线重放。',
      },
      {
        id: 'memory_slot_state_machine',
        label: '记忆状态机',
        status: issueCodes.has('duplicate_slot_completion') ? 'fail' : 'pass',
        detail: hasSlotStage
          ? 'slot 补齐事件不能重复完成同一字段。'
          : '当前 run 未进入 slot 补齐阶段。',
      },
      {
        id: 'approval_lifecycle',
        label: '审批是生命周期节点',
        status:
          !hasApproval ||
          (!issueCodes.has('approval_not_lifecycle_node') &&
            !issueCodes.has('approval_without_checkpoint') &&
            !issueCodes.has('approval_without_dry_run_preview') &&
            !issueCodes.has('approval_without_audit_contract') &&
            !issueCodes.has('high_risk_without_idempotency_key') &&
            !issueCodes.has('high_risk_before_approval_resolved'))
            ? 'pass'
            : 'fail',
        detail: hasApproval
          ? '高风险动作必须 checkpoint、dry-run、audit，并在确认后 resume。'
          : '当前 run 没有审批节点。',
      },
      {
        id: 'social_sandbox',
        label: '社交安全 sandbox',
        status:
          !hasHighRiskSideEffect ||
          (!issueCodes.has('high_risk_without_approval') &&
            !issueCodes.has('high_risk_without_safety_check') &&
            !issueCodes.has('high_risk_without_idempotency_key') &&
            !issueCodes.has('sensitive_payload_leak'))
            ? 'pass'
            : 'fail',
        detail: hasHighRiskSideEffect
          ? '真实社交副作用前必须先安全检查、审批和隐私脱敏。'
          : '当前 run 没有真实高风险副作用。',
      },
      {
        id: 'replay_terminal',
        label: '可回放终态',
        status: hasTerminal && !issueCodes.has('missing_terminal_event') ? 'pass' : 'fail',
        detail: '每个 run 必须写入 run.completed 或 run.failed 终态。',
      },
    ];
  }

  private readSlots(payload: Record<string, unknown> | undefined): string[] {
    const slots = payload?.slots;
    if (!slots || typeof slots !== 'object' || Array.isArray(slots)) return [];
    return Object.keys(slots);
  }

  private isVisibleProcessTraceEvent(event: SocialAgentEventV2): boolean {
    if (event.visibility !== 'user_visible') return false;
    return (
      event.type === 'visible_process.delta' ||
      event.type === 'tool.started' ||
      event.type === 'tool.progress' ||
      event.type === 'tool.done' ||
      event.type === 'slot.filled' ||
      event.type === 'slot.completed' ||
      event.type === 'memory.saved' ||
      event.type === 'opportunity_card.created' ||
      event.type === 'candidate_search.started' ||
      event.type === 'candidate_search.done' ||
      event.type === 'safety_check.done' ||
      event.type === 'approval.required' ||
      event.type === 'approval.resolved'
    );
  }

  private requiresVisibleProcessTrace(run: { stages: Set<string> }): boolean {
    return [
      'profile_gate',
      'slot_filling',
      'create_opportunity_card',
      'publish_to_discover',
      'search_candidates',
      'safety_filter',
      'rank_candidates',
      'generate_opener',
      'approval',
      'send_invite',
      'life_graph_writeback',
    ].some((stage) => run.stages.has(stage));
  }

  private isHighRiskEvent(event: SocialAgentEventV2): boolean {
    const actionType =
      typeof event.payload?.actionType === 'string'
        ? event.payload.actionType
        : '';
    if (
      /(send_invite|invite_candidate|send_message|send_candidate_message|connect_candidate|exchange_contact|reveal_precise_location|publish_social_request)/.test(
        actionType,
      )
    ) {
      return true;
    }
    if (
      event.stage === 'send_invite' ||
      event.stage === 'publish_to_discover'
    ) {
      return event.type === 'tool.done' || event.type === 'run.completed';
    }
    return false;
  }

  private isHighRiskSideEffectEvent(event: SocialAgentEventV2): boolean {
    if (event.type !== 'tool.done' && event.type !== 'run.completed') return false;
    return this.isHighRiskEvent(event);
  }

  private hasApprovedResumeForEvent(
    run: {
      approvedApprovalKeys: Set<string>;
      approvedActionTypes: Set<string>;
    },
    event: SocialAgentEventV2,
  ): boolean {
    const approvalKey = this.approvalIdentity(event);
    if (approvalKey && run.approvedApprovalKeys.has(approvalKey)) return true;
    const actionType = this.highRiskActionType(event);
    return Boolean(actionType && run.approvedActionTypes.has(actionType));
  }

  private approvalIdentity(event: SocialAgentEventV2): string | null {
    const payload = event.payload ?? {};
    const approvalId = this.scalar(payload.approvalId);
    if (approvalId) return `approval:${approvalId}`;
    const checkpointId =
      this.scalar(payload.checkpointId) ??
      (this.isRecord(payload.resumeCursor)
        ? this.scalar(payload.resumeCursor.checkpointId)
        : null);
    if (checkpointId) return `checkpoint:${checkpointId}`;
    return null;
  }

  private highRiskActionType(event: SocialAgentEventV2): string | null {
    const payloadAction =
      typeof event.payload?.actionType === 'string'
        ? event.payload.actionType
        : null;
    if (payloadAction) return payloadAction;
    if (event.stage === 'send_invite') return 'send_invite';
    if (event.stage === 'publish_to_discover') return 'publish_social_request';
    return null;
  }

  private hasApprovalCheckpoint(event: SocialAgentEventV2): boolean {
    const payload = event.payload ?? {};
    return (
      this.hasScalar(payload.approvalId) ||
      this.hasScalar(payload.checkpointId) ||
      (this.isRecord(payload.resume) && this.hasScalar(payload.resume.checkpointId))
    );
  }

  private hasDryRunPreview(event: SocialAgentEventV2): boolean {
    const payload = event.payload ?? {};
    return (
      this.isRecord(payload.dryRunPreview) ||
      (this.isRecord(payload.socialCodex) &&
        this.isRecord(payload.socialCodex.dryRunPreview)) ||
      (this.isRecord(payload.policy) && this.isRecord(payload.policy.dryRunPreview))
    );
  }

  private hasAuditContract(event: SocialAgentEventV2): boolean {
    const payload = event.payload ?? {};
    if (payload.auditRequired === true || payload.auditLogged === true) return true;
    if (this.isRecord(payload.audit) && payload.audit.required === true) return true;
    if (this.isRecord(payload.socialCodex)) {
      if (payload.socialCodex.auditRequired === true) return true;
      if (
        this.isRecord(payload.socialCodex.approvalPolicy) &&
        payload.socialCodex.approvalPolicy.auditRequired === true
      ) {
        return true;
      }
    }
    if (
      this.isRecord(payload.policy) &&
      (payload.policy.auditRequired === true ||
        (this.isRecord(payload.policy.audit) && payload.policy.audit.required === true))
    ) {
      return true;
    }
    return false;
  }

  private hasIdempotencyKey(event: SocialAgentEventV2): boolean {
    const payload = event.payload ?? {};
    if (this.hasScalar(payload.idempotencyKey)) return true;
    if (
      this.isRecord(payload.idempotency) &&
      this.hasScalar(payload.idempotency.key)
    ) {
      return true;
    }
    if (this.isRecord(payload.socialCodex)) {
      if (this.hasScalar(payload.socialCodex.idempotencyKey)) return true;
      if (
        this.isRecord(payload.socialCodex.idempotency) &&
        this.hasScalar(payload.socialCodex.idempotency.key)
      ) {
        return true;
      }
    }
    if (this.isRecord(payload.policy)) {
      if (this.hasScalar(payload.policy.idempotencyKey)) return true;
      if (
        this.isRecord(payload.policy.idempotency) &&
        this.hasScalar(payload.policy.idempotency.key)
      ) {
        return true;
      }
    }
    return false;
  }

  private isApprovalApproved(event: SocialAgentEventV2): boolean {
    const payload = event.payload ?? {};
    if (payload.approved === true || payload.decision === 'approved') return true;
    if (this.isRecord(payload.result)) {
      return payload.result.approved === true || payload.result.decision === 'approved';
    }
    return false;
  }

  private containsSensitiveLeak(event: SocialAgentEventV2): boolean {
    const visible = event.visibility === 'user_visible' || event.visibility === 'debug_only';
    if (!visible) return false;
    return (
      this.stringContainsSensitiveLeak(event.display?.title ?? '') ||
      this.stringContainsSensitiveLeak(event.display?.detail ?? '') ||
      this.valueContainsSensitiveLeak(event.payload)
    );
  }

  private containsRawLifeGraphProposal(event: SocialAgentEventV2): boolean {
    if (event.visibility !== 'user_visible' && event.visibility !== 'debug_only') {
      return false;
    }
    return this.valueContainsRawLifeGraphProposal(event.payload);
  }

  private valueContainsRawLifeGraphProposal(value: unknown): boolean {
    if (Array.isArray(value)) {
      return value.some((item) => this.valueContainsRawLifeGraphProposal(item));
    }
    if (!this.isRecord(value)) return false;
    return Object.entries(value).some(([key, item]) => {
      if (key === 'lifeGraphFactProposals') return true;
      if (key === 'evidence' && Array.isArray(item)) return true;
      if (key === 'quote' && typeof item === 'string') return true;
      return this.valueContainsRawLifeGraphProposal(item);
    });
  }

  private valueContainsSensitiveLeak(value: unknown): boolean {
    if (typeof value === 'string') return this.stringContainsSensitiveLeak(value);
    if (Array.isArray(value)) {
      return value.some((item) => this.valueContainsSensitiveLeak(item));
    }
    if (!this.isRecord(value)) return false;
    return Object.entries(value).some(([key, item]) => {
      if (this.isSensitiveKey(key) && item !== '[redacted]' && item != null) return true;
      return this.valueContainsSensitiveLeak(item);
    });
  }

  private stringContainsSensitiveLeak(value: string): boolean {
    return /(\b1[3-9]\d{9}\b|微信|wechat|vx[:：]?|门牌|单元|楼栋|宿舍|经度|纬度|坐标|定位|导航|地图链接|高德|百度地图|腾讯地图|amap|gaode|baidu|qq\.com\/map|geo:|\d+\.\d{4,})/i.test(
      value,
    );
  }

  private isSensitiveKey(key: string): boolean {
    return /(phone|mobile|wechat|weChat|contact|address|exactLocation|preciseLocation|privateMessage|conversationText|lat|lng|longitude|latitude)/i.test(
      key,
    );
  }

  private hasScalar(value: unknown): boolean {
    return (
      (typeof value === 'number' && Number.isFinite(value)) ||
      (typeof value === 'string' && value.trim().length > 0)
    );
  }

  private scalar(value: unknown): string | null {
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value === 'string' && value.trim()) return value.trim();
    return null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
