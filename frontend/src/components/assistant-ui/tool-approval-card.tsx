import { useAuiState } from '@assistant-ui/react';
import { CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
import { useState } from 'react';

import { agentApprovalActionLabel } from '../../lib/agentApprovalCopy';
import { cn } from '../../lib/utils';
import { sanitizePublicProcessText as sanitizePublicText } from './public-process-text';
import { ToolActionButton } from './tool-action-button';
import { useFitMeetToolUIActions } from './tool-ui-actions';
import type { ProcessSummary } from './tool-process-model';
import { InterruptResumeState, ResultSummary } from './tool-process-panels';

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
  const confirmations = extractPendingConfirmations(data);
  const resolvedApproval = extractResolvedApproval(data);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      setError(nextError instanceof Error ? nextError.message : '操作没有完成，请重试。');
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
    >
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-100">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-6 text-[#27272a]">需要你确认这一步</p>
          <p className="text-xs leading-5 text-[#71717a]">
            我会等你选择后再继续，不会自动执行高风险动作。
          </p>
        </div>
      </div>
      <InterruptResumeState summary={summary} compact />

      <div className="mt-3 space-y-2">
        {confirmations.length > 0 ? (
          confirmations.map((confirmation, index) => (
            <div
              key={`${confirmation.id ?? index}-${confirmation.actionType ?? confirmation.type ?? 'approval'}`}
              className="rounded-xl bg-[#f7f7f8] px-3 py-2.5 ring-1 ring-black/5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-5 text-[#3f3f46]">
                    {confirmation.summary || '确认是否继续执行这一步'}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[#71717a]">
                    {approvalMetaLine(confirmation)}
                  </p>
                  <ApprovalGuardrailList
                    confirmationLabel="同意后从保存点继续"
                    checkpointLabel={checkpointId ? '进度已保存' : '等待保存点'}
                    riskLevel={confirmation.riskLevel}
                  />
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <ToolActionButton
                    icon={<XCircle className="h-3.5 w-3.5" />}
                    label="拒绝"
                    busyLabel="正在拒绝"
                    busy={busyKey === `reject:${confirmation.id}`}
                    disabled={Boolean(busyKey)}
                    variant="ghost"
                    data-testid="assistant-ui-approval-action"
                    data-approval-action="reject"
                    data-approval-id={String(confirmation.id ?? '')}
                    data-checkpoint-id={String(checkpointId ?? '')}
                    data-action-state={approvalDecisionButtonState(
                      busyKey,
                      `reject:${confirmation.id}`,
                    )}
                    onClick={() => void runDecision('reject', confirmation)}
                  />
                  <ToolActionButton
                    icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                    label="同意并继续"
                    busyLabel="正在继续"
                    busy={busyKey === `approve:${confirmation.id}`}
                    disabled={Boolean(busyKey)}
                    variant="primary"
                    data-testid="assistant-ui-approval-action"
                    data-approval-action="approve"
                    data-approval-id={String(confirmation.id ?? '')}
                    data-checkpoint-id={String(checkpointId ?? '')}
                    data-action-state={approvalDecisionButtonState(
                      busyKey,
                      `approve:${confirmation.id}`,
                    )}
                    onClick={() => void runDecision('approve', confirmation)}
                  />
                </div>
              </div>
            </div>
          ))
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
          {sanitizePublicText(error) ?? '这一步暂时没有完成，可以稍后重试。'}
        </p>
      ) : null}
    </section>
  );
}

export function ApprovalGuardrailList({
  confirmationLabel,
  checkpointLabel,
  riskLevel,
}: {
  confirmationLabel: string;
  checkpointLabel: string;
  riskLevel?: string | null;
}) {
  const items = [
    {
      id: 'no_auto',
      label: '确认前不执行',
      value: '不会自动发送、连接或发布',
    },
    {
      id: 'checkpoint',
      label: '状态已保存',
      value: checkpointLabel,
    },
    {
      id: 'decision',
      label: riskLevel ? `风险等级：${riskLevel}` : '需要你决定',
      value: confirmationLabel,
    },
  ];

  return (
    <div
      className="mt-3 grid gap-1.5 rounded-xl bg-[#f7f7f8] px-3 py-2 ring-1 ring-black/5 sm:grid-cols-3"
      data-testid="assistant-ui-approval-guardrails"
      data-risk-level={riskLevel ?? 'unknown'}
    >
      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-lg bg-white px-2.5 py-2 text-xs leading-5 ring-1 ring-black/[0.04]"
          data-approval-guardrail={item.id}
        >
          <span className="block text-[11px] text-[#8a8f98]">{item.label}</span>
          <span className="mt-0.5 block text-[#3f3f46]">{item.value}</span>
        </div>
      ))}
    </div>
  );
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
        {approved ? '已同意，我会从保存的步骤继续。' : '已拒绝，这一步不会继续执行。'}
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
    summary: publicDetail(item.summary) ?? '确认是否继续执行这一步',
    riskLevel: publicString(item.riskLevel) ?? undefined,
    expiresAt: publicString(item.expiresAt),
  }));
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

function approvalMetaLine(confirmation: PendingConfirmation) {
  const parts = [
    confirmation.riskLevel ? `风险级别：${confirmation.riskLevel}` : null,
    confirmation.actionType ? `动作：${approvalActionLabel(confirmation.actionType)}` : null,
    confirmation.expiresAt ? `有效期至：${confirmation.expiresAt}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : '这一步会影响实际动作，需要你确认。';
}

function approvalActionLabel(actionType: string) {
  return agentApprovalActionLabel(actionType);
}

function publicDetail(value: unknown) {
  if (typeof value === 'string') return sanitizePublicText(value);
  if (isRecord(value)) {
    const keys = ['title', 'message', 'summary', 'detail', 'status'];
    for (const key of keys) {
      const candidate = publicString(value[key]);
      const sanitized = candidate ? sanitizePublicText(candidate) : null;
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
