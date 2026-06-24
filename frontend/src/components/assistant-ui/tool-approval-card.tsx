import { useAuiState } from '@assistant-ui/react';
import { CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
import { useState } from 'react';

import {
  agentApprovalEffectText,
  agentApprovalUserFacingText,
} from '../../lib/agentApprovalCopy';
import { cn } from '../../lib/utils';
import { sanitizePublicProcessText as sanitizePublicText } from './public-process-text';
import { ToolActionButton } from './tool-action-button';
import { useFitMeetToolUIActions } from './tool-ui-actions';
import type { ProcessSummary } from './tool-process-model';
import { ResultSummary } from './tool-process-panels';

type PendingConfirmation = {
  id: number | string | null;
  type?: string;
  actionType?: string;
  summary: string;
  riskLevel?: string;
  expiresAt?: string | null;
};

type ResolvedApproval = {
  id: number | string | null;
  decision: 'approved' | 'rejected';
  summary?: string | null;
};

export function ApprovalToolUI({ data, summary }: { data: unknown; summary: ProcessSummary }) {
  const actions = useFitMeetToolUIActions();
  const messageId = useAuiState((state) => state.message.id);
  const checkpointId = checkpointIdFromData(data);
  const allConfirmations = extractPendingConfirmations(data);
  const confirmations = allConfirmations.filter(isActionRequiringInlineApproval);
  const visibleConfirmations = confirmations.slice(0, 1);
  const hiddenConfirmations = confirmations.slice(visibleConfirmations.length);
  const hiddenConfirmationCount = hiddenConfirmations.length;
  const resolvedApproval = extractResolvedApproval(data);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (allConfirmations.length > 0 && confirmations.length === 0 && !resolvedApproval) {
    return null;
  }

  const runDecision = async (decision: 'approve' | 'reject', confirmation: PendingConfirmation) => {
    if (!confirmation.id) return;
    const key = `${decision}:${confirmation.id}`;
    setBusyKey(key);
    setError(null);
    try {
      const handler = decision === 'approve' ? actions.onApproveApproval : actions.onRejectApproval;
      await handler?.({
        messageId,
        approvalId: confirmation.id,
        checkpointId,
      });
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : '当前确认可以重试，我不会重复执行真实动作。',
      );
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <section
      className="my-3 rounded-2xl border border-black/10 bg-white px-3 py-3 text-sm text-[#52525b] shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
      data-testid="assistant-ui-approval-tool"
      data-density="inline"
      data-has-checkpoint={String(Boolean(checkpointId))}
      data-checkpoint-id={String(checkpointId ?? '')}
      data-approval-state={resolvedApproval ? resolvedApproval.decision : 'pending'}
      data-visible-confirmation-count={String(visibleConfirmations.length)}
      data-hidden-confirmation-count={String(hiddenConfirmationCount)}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-100">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-6 text-[#27272a]">确认后我再继续</p>
          <p className="text-xs leading-5 text-[#71717a]">
            这次操作可能会触达对方或公开内容，我会先让你看清楚再执行。
          </p>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {visibleConfirmations.length > 0 ? (
          <>
            {visibleConfirmations.map((confirmation, index) => (
              <ApprovalConfirmationRow
                key={`${confirmation.id ?? index}-${confirmation.actionType ?? confirmation.type ?? 'approval'}`}
                confirmation={confirmation}
                checkpointId={checkpointId}
                busyKey={busyKey}
                onReject={() => void runDecision('reject', confirmation)}
                onApprove={() => void runDecision('approve', confirmation)}
              />
            ))}
            {hiddenConfirmationCount > 0 ? (
              <QueuedApprovalSummary confirmations={hiddenConfirmations} />
            ) : null}
          </>
        ) : resolvedApproval ? (
          <ResolvedApprovalStatus resolvedApproval={resolvedApproval} />
        ) : (
          <ResultSummary lines={summary.resultLines} status={summary.status} />
        )}
      </div>
      {error ? (
        <p
          className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs leading-5 text-red-700"
          role="status"
          aria-live="polite"
          data-testid="assistant-ui-approval-action-error"
          data-checkpoint-id={String(checkpointId ?? '')}
        >
          {sanitizePublicText(error) ?? '当前确认可以重试，我不会重复执行真实动作。'}
        </p>
      ) : null}
    </section>
  );
}

function QueuedApprovalSummary({
  confirmations,
}: {
  confirmations: PendingConfirmation[];
}) {
  const labels = Array.from(
    new Set(
      confirmations
        .map((confirmation) => approvalTitleForConfirmation(confirmation))
        .filter(Boolean),
    ),
  );
  if (labels.length === 0) return null;

  return (
    <div
      className="rounded-xl bg-[#f7f7f8] px-3 py-2 text-xs leading-5 text-[#71717a] ring-1 ring-black/5"
      data-testid="assistant-ui-approval-collapsed-count"
      data-queued-approval-count={String(confirmations.length)}
    >
      <p>
        还有 {confirmations.length} 个动作也在这张卡里。先处理当前确认，后续我会按顺序继续问你。
      </p>
      <div
        className="mt-1.5 flex flex-wrap gap-1.5"
        data-testid="assistant-ui-approval-queued-actions"
        aria-label="后续待确认动作"
      >
        {labels.map((label) => (
          <span
            key={label}
            className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-[#52525b] ring-1 ring-black/5"
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ApprovalConfirmationRow({
  confirmation,
  checkpointId,
  busyKey,
  onReject,
  onApprove,
}: {
  confirmation: PendingConfirmation;
  checkpointId: number | string | null;
  busyKey: string | null;
  onReject: () => void;
  onApprove: () => void;
}) {
  const confirmLabel = approvalConfirmButtonLabel(confirmation);
  const confirmBusyLabel = approvalConfirmBusyLabel(confirmation);
  return (
    <div
      className="rounded-xl bg-[#f7f7f8] px-3 py-2.5 ring-1 ring-black/5"
      data-testid="assistant-ui-approval-confirmation-row"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-5 text-[#3f3f46]">
            {approvalTitleForConfirmation(confirmation)}
          </p>
          <p className="mt-1 text-xs leading-5 text-[#71717a]">
            {approvalDetailForConfirmation(confirmation)}
          </p>
          <p className="mt-1 text-xs leading-5 text-[#71717a]">
            {approvalEffectLine(confirmation)}
          </p>
          <ApprovalGuardrailList
            checkpointLabel="我会接着处理"
            riskLevel={confirmation.riskLevel}
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ToolActionButton
            icon={<XCircle className="h-3.5 w-3.5" />}
            label="取消"
            busyLabel="正在取消"
            busy={busyKey === `reject:${confirmation.id}`}
            disabled={Boolean(busyKey)}
            variant="ghost"
            data-testid="assistant-ui-approval-action"
            data-approval-action="reject"
            data-approval-id={String(confirmation.id ?? '')}
            data-checkpoint-id={String(checkpointId ?? '')}
            data-action-state={approvalDecisionButtonState(busyKey, `reject:${confirmation.id}`)}
            onClick={onReject}
          />
          <ToolActionButton
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            label={confirmLabel}
            busyLabel={confirmBusyLabel}
            busy={busyKey === `approve:${confirmation.id}`}
            disabled={Boolean(busyKey)}
            variant="primary"
            data-testid="assistant-ui-approval-action"
            data-approval-action="approve"
            data-approval-id={String(confirmation.id ?? '')}
            data-checkpoint-id={String(checkpointId ?? '')}
            data-action-state={approvalDecisionButtonState(busyKey, `approve:${confirmation.id}`)}
            onClick={onApprove}
          />
        </div>
      </div>
    </div>
  );
}

export function ApprovalGuardrailList({
  checkpointLabel,
  riskLevel,
}: {
  checkpointLabel: string;
  riskLevel?: string | null;
}) {
  const progressLabel = approvalProgressLabel(checkpointLabel);
  return (
    <p
      className="mt-2 rounded-xl bg-white px-3 py-2 text-xs leading-5 text-[#71717a] ring-1 ring-black/[0.04]"
      data-testid="assistant-ui-approval-guardrails"
      data-risk-level={riskLevel ?? 'unknown'}
    >
      不同意就不会执行；同意后{progressLabel}。想改内容，直接告诉我。
    </p>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function approvalProgressLabel(value?: string | null) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '我会接着处理';
  if (/checkpoint|resume|保存点|进度已保存|状态已保存|等待保存点|保存进度|从保存/i.test(text)) {
    return '我会接着处理';
  }
  const sanitized = sanitizePublicText(text);
  return sanitized ?? '我会接着处理';
}

function approvalDecisionButtonState(busyKey: string | null, ownKey: string) {
  if (busyKey === ownKey) return 'running';
  if (busyKey) return 'locked';
  return 'idle';
}

function ResolvedApprovalStatus({ resolvedApproval }: { resolvedApproval: ResolvedApproval }) {
  const approved = resolvedApproval.decision === 'approved';
  return (
    <div
      role="status"
      className={cn(
        'rounded-xl px-3 py-2.5 text-xs leading-5 ring-1',
        approved
          ? 'bg-emerald-50/80 text-emerald-800 ring-emerald-100'
          : 'bg-[#f7f7f8] text-[#52525b] ring-black/5',
      )}
    >
      <p className="flex items-center gap-1.5 font-medium">
        {approved ? (
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {approved ? '已同意，我会继续处理。' : '已取消，这次操作不会继续执行。'}
      </p>
      {resolvedApproval.summary ? (
        <p className="mt-1 text-[11px] opacity-80">{resolvedApproval.summary}</p>
      ) : null}
    </div>
  );
}

function extractPendingConfirmations(data: unknown): PendingConfirmation[] {
  if (!isRecord(data) || !Array.isArray(data.pendingConfirmations)) return [];
  return data.pendingConfirmations.filter(isRecord).map((item) => ({
    id:
      typeof item.id === 'number' || typeof item.id === 'string' || item.id === null
        ? item.id
        : null,
    type: publicString(item.type) ?? undefined,
    actionType: publicString(item.actionType) ?? undefined,
    summary: publicDetail(item.summary) ?? '确认是否继续执行',
    riskLevel: publicString(item.riskLevel) ?? undefined,
    expiresAt: publicString(item.expiresAt),
  })).map((item) => ({
    ...item,
    actionType:
      item.actionType ??
      item.type ??
      inferApprovalActionType([item.summary, item.riskLevel].filter(Boolean).join(' ')),
  }));
}

const LOW_RISK_APPROVAL_ACTIONS = new Set([
  'candidate.like',
  'candidate.save',
  'candidate.favorite',
  'candidate.bookmark',
  'candidate.generate_opener',
  'candidate.view_detail',
  'candidate.skip',
  'candidate.more_like_this',
  'save_candidate',
  'favorite_candidate',
  'bookmark_candidate',
  'collect_candidate',
  'generate_opener',
  'draft_opener',
  'view_candidate',
  'skip_candidate',
]);

const HIGH_RISK_APPROVAL_ACTIONS = new Set([
  'publish_social_request',
  'publish_to_discover',
  'create_activity',
  'activity.confirm_create',
  'send_invite',
  'send_message',
  'send_message_to_candidate',
  'opener.confirm_send',
  'connect_candidate',
  'add_friend',
  'candidate.connect',
  'exchange_contact',
  'reveal_precise_location',
  'update_sensitive_profile',
]);

function isActionRequiringInlineApproval(confirmation: PendingConfirmation) {
  const action = normalizeApprovalActionType(confirmation.actionType ?? confirmation.type);
  if (LOW_RISK_APPROVAL_ACTIONS.has(action)) return false;
  if (HIGH_RISK_APPROVAL_ACTIONS.has(action)) return true;

  const risk = confirmation.riskLevel?.trim().toLowerCase();
  if (risk === 'low') return false;
  if (risk === 'critical' || risk === 'high' || risk === 'medium') return true;

  return true;
}

function normalizeApprovalActionType(value?: string | null) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function inferApprovalActionType(text: string) {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return undefined;
  if (/收藏|保存|喜欢|like|save|favorite|collect|bookmark/.test(normalized)) {
    return 'candidate.like';
  }
  if (/开场白|草稿|opener|draft/.test(normalized) && !/发送|send|invite|message|私信|邀请/.test(normalized)) {
    return 'candidate.generate_opener';
  }
  if (/发送|私信|邀请|send|message|invite/.test(normalized)) return 'send_invite';
  if (/加好友|好友|连接|connect|friend/.test(normalized)) return 'connect_candidate';
  if (/发布|发现|约练|活动|publish|social_request|activity|meet/.test(normalized)) {
    return 'publish_social_request';
  }
  if (/位置|联系方式|联系|contact|location|precise/.test(normalized)) {
    return 'exchange_contact';
  }
  return undefined;
}

function extractResolvedApproval(data: unknown): ResolvedApproval | null {
  if (!isRecord(data) || !isRecord(data.resolvedApproval)) return null;
  const decision = publicString(data.resolvedApproval.decision);
  if (decision !== 'approved' && decision !== 'rejected') return null;
  const id = data.resolvedApproval.id;
  return {
    id: typeof id === 'number' || typeof id === 'string' || id === null ? id : null,
    decision,
    summary: publicDetail(data.resolvedApproval.summary),
  };
}

function checkpointIdFromData(data: unknown): number | string | null {
  if (!isRecord(data)) return null;
  const runtime = isRecord(data.runtime) ? data.runtime : null;
  const value = runtime?.checkpointId ?? data.checkpointId;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function approvalEffectLine(confirmation: PendingConfirmation) {
  const actionType = confirmation.actionType ?? confirmation.type ?? '';
  if (/send|message|invite|opener\.confirm_send/i.test(actionType)) {
    return '确认后才会发出邀请；不同意就不会触达对方。';
  }
  if (/connect|friend|candidate\.connect/i.test(actionType)) {
    return '确认后才会发出好友申请；不同意就不会触达对方。';
  }
  if (/publish|social_request|activity|meet|create/i.test(actionType)) {
    return '确认后才会发布到发现；不同意就不会公开内容。';
  }
  if (/contact|location|precise|exchange/i.test(actionType)) {
    return '确认后才会公开给对方；不同意就不会公开位置或联系方式。';
  }
  return '不同意就不会触达对方，也不会公开任何内容。';
}

function approvalTitleForConfirmation(confirmation: PendingConfirmation) {
  const actionType = confirmation.actionType ?? confirmation.type ?? '';
  if (/send|message|invite|opener\.confirm_send/i.test(actionType)) return '确认发送邀请';
  if (/connect|friend|candidate\.connect/i.test(actionType)) return '确认加好友并聊天';
  if (/publish|social_request|activity|meet|create/i.test(actionType)) return '确认发布到发现';
  if (/contact|location|precise|exchange/i.test(actionType)) return '确认公开敏感信息';

  const summary = publicDetail(confirmation.summary);
  if (summary && !isTechnicalApprovalCopy(summary)) return summary;
  return '确认后再继续';
}

function approvalConfirmButtonLabel(confirmation: PendingConfirmation) {
  const actionType = confirmation.actionType ?? confirmation.type ?? '';
  if (/send|message|invite|opener\.confirm_send/i.test(actionType)) return '确认发送';
  if (/connect|friend|candidate\.connect/i.test(actionType)) return '确认加好友';
  if (/publish|social_request|activity|meet|create/i.test(actionType)) return '确认发布';
  if (/contact|location|precise|exchange/i.test(actionType)) return '确认公开';
  return '确认继续';
}

function approvalConfirmBusyLabel(confirmation: PendingConfirmation) {
  const label = approvalConfirmButtonLabel(confirmation);
  if (label === '确认加好友') return '正在加好友';
  if (label === '确认发送') return '正在发送';
  if (label === '确认发布') return '正在发布';
  if (label === '确认公开') return '正在公开';
  return '正在继续';
}

function approvalDetailForConfirmation(confirmation: PendingConfirmation) {
  const summary = publicDetail(confirmation.summary);
  if (summary && !isTechnicalApprovalCopy(summary)) return summary;
  if (confirmation.actionType) return agentApprovalEffectText(confirmation.actionType);
  return '这次操作可能触达对方或公开内容，我会先等你确认。';
}

function isTechnicalApprovalCopy(value: string) {
  return /\b(actionType|schemaAction|approval|checkpoint|riskLevel|idempotency|dry[-_ ]?run|audit|medium|high|low|critical|connect_candidate|send_invite|publish_social_request)\b|风险等级|风险级别|动作[：:]|等待保存点|保存点|审计|幂等|审批/i.test(
    value,
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function approvalRiskLabel(riskLevel?: string | null) {
  const normalized = typeof riskLevel === 'string' ? riskLevel.trim().toLowerCase() : '';
  if (normalized === 'critical') return '必须由你确认';
  if (normalized === 'high') return '必须由你确认';
  if (normalized === 'medium') return '需要你确认';
  if (normalized === 'low') return '可直接处理，可撤回';
  return '需要你确认';
}

function publicDetail(value: unknown) {
  if (typeof value === 'string') {
    return agentApprovalUserFacingText(sanitizePublicText(value));
  }
  if (isRecord(value)) {
    const keys = ['title', 'message', 'summary', 'detail', 'status'];
    for (const key of keys) {
      const candidate = publicString(value[key]);
      const sanitized = candidate
        ? agentApprovalUserFacingText(sanitizePublicText(candidate))
        : null;
      if (sanitized) return sanitized;
    }
  }
  return null;
}

function publicString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
