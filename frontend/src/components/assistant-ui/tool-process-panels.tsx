import { AlertCircle, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../../lib/utils';
import type { ProcessStatus, ProcessSummary, ResumeContext } from './tool-process-model';

export function ResultSummary({ lines, status }: { lines: string[]; status: ProcessStatus }) {
  return (
    <section
      className={cn(
        'ml-8 rounded-xl bg-white px-3 py-2.5 ring-1 ring-black/5',
        status === 'error' && 'bg-red-50/40',
        status === 'waiting' && 'bg-amber-50/50',
      )}
      aria-label="结果摘要"
    >
      <p className="mb-1 text-xs font-medium text-[#52525b]">结果摘要</p>
      <div className="space-y-1 leading-6 text-[#71717a]">
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </section>
  );
}

export function InterruptResumeState({
  summary,
  compact,
}: {
  summary: ProcessSummary;
  compact?: boolean;
}) {
  const context = summary.resumeContext;
  if (summary.status === 'complete' && !context.hasInterrupt) return null;
  if (!context.hasCheckpoint && !context.hasInterrupt && summary.status !== 'waiting') {
    return null;
  }
  const title =
    summary.status === 'waiting'
      ? '已暂停，等待你确认'
      : summary.status === 'error'
        ? '可以继续处理'
        : '可以从这里继续';
  const detail =
    summary.status === 'waiting'
      ? '确认后会沿同一个对话继续，不会重新执行已经确认过的动作。'
      : summary.status === 'error'
        ? '我保留了这段需求，你可以继续处理，或让我换一种方式整理。'
        : '后续可以基于这次进度继续处理，不需要从头开始。';
  const compactTitle =
    summary.status === 'waiting'
      ? '需要你确认'
      : summary.status === 'error'
        ? '可以继续处理'
        : '进度已整理';
  const compactDetail =
    summary.status === 'waiting'
      ? '确认前不会触达对方；确认后我会接着当前进度继续。'
      : summary.status === 'error'
        ? '刚才没有顺利完成，但当前需求还在，可以从这里继续。'
        : '可以继续追问、重新整理，或换一种方案。';
  const chips = [
    context.hasCheckpoint ? '可以从这里继续' : null,
    context.parentCheckpointId != null ? '接着上一步' : null,
    context.threadId ? '同一对话继续' : null,
    context.idempotencyKey ? '不会重复提交' : null,
    context.stepScope?.mode === 'through_step' ? '只接着当前进度' : null,
    context.sideEffectPolicy ? '不会重复执行' : null,
    context.interruptKind ? interruptKindLabel(context.interruptKind) : null,
    context.mode ? resumeModeLabel(context.mode) : null,
  ].filter(Boolean) as string[];

  return (
    <section
      className={cn(
        'rounded-xl bg-white px-3 py-2.5 ring-1 ring-black/5',
        compact ? 'mt-2 bg-[#f7f7f8] ring-black/[0.04]' : 'ml-8',
        summary.status === 'waiting' && 'bg-amber-50/60 ring-amber-200/60',
        summary.status === 'error' && 'bg-red-50/40 ring-red-100',
      )}
      aria-label="中断恢复状态"
      data-testid={compact ? 'assistant-ui-compact-resume-state' : undefined}
      data-display-model={compact ? 'compact-product-copy' : 'detailed-recovery-protocol'}
    >
      <div className="flex items-start gap-2">
        <StatusBadge status={summary.status}>
          {summary.status === 'error' ? (
            <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </StatusBadge>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium leading-5 text-[#3f3f46]">
            {compact ? compactTitle : title}
          </p>
          <p className="text-xs leading-5 text-[#71717a]">{compact ? compactDetail : detail}</p>
          {!compact && chips.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {chips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full bg-white px-2 py-0.5 text-[11px] text-[#71717a] ring-1 ring-black/5"
                >
                  {chip}
                </span>
              ))}
            </div>
          ) : null}
          {!compact ? <ResumeScopeSummary context={context} /> : null}
          {!compact ? <ResumeFlow status={summary.status} context={context} /> : null}
        </div>
      </div>
    </section>
  );
}

function ResumeScopeSummary({ context }: { context: ResumeContext }) {
  if (!context.sourceStep && !context.stepScope && !context.sideEffectPolicy) return null;
  const scopeText =
    context.stepScope?.mode === 'through_step'
      ? `会从「${context.sourceStep?.label ?? '当前进度'}」继续，前面已经完成的进度不会重复执行。`
      : '会沿着当前对话继续，不会丢失刚才的上下文。';
  const idempotencyText = context.sideEffectPolicy
    ? '涉及发送、创建或写入这类动作时，会避免重复执行。'
    : null;

  return (
    <div
      className="mt-2 rounded-lg bg-[#f7f7f8] px-2.5 py-2 text-[11px] leading-5 text-[#71717a] ring-1 ring-black/5"
      data-testid="assistant-ui-resume-scope"
      data-scope-mode={context.stepScope?.mode ?? 'unknown'}
      data-source-step-id={context.sourceStep?.stepId ?? ''}
      data-has-side-effect-policy={String(Boolean(context.sideEffectPolicy))}
    >
      <p>{scopeText}</p>
      {idempotencyText ? <p>{idempotencyText}</p> : null}
    </div>
  );
}

function ResumeFlow({ status, context }: { status: ProcessStatus; context: ResumeContext }) {
  const isWaiting = status === 'waiting';
  const isError = status === 'error';
  const steps = [
    {
      label: context.hasCheckpoint ? '已准备继续' : '正在准备继续',
      state: context.hasCheckpoint ? ('done' as const) : ('current' as const),
    },
    {
      label: isWaiting ? '等待你确认' : isError ? '选择继续方式' : '可继续追问',
      state: isWaiting || isError ? ('current' as const) : ('done' as const),
    },
    {
      label:
        context.mode === 'fork'
          ? '换一种方案'
          : context.mode === 'replay'
            ? '重新整理'
            : context.mode === 'retry'
              ? '继续处理'
              : '接着处理',
      state: isWaiting || isError ? ('next' as const) : ('done' as const),
    },
  ];

  return (
    <ol
      className="mt-2 grid gap-1.5 text-[11px] sm:grid-cols-3"
      data-testid="assistant-ui-resume-flow"
      aria-label="可以继续的流程"
    >
      {steps.map((step) => (
        <li
          key={step.label}
          className={cn(
            'rounded-lg px-2 py-1.5 ring-1',
            step.state === 'done' && 'bg-emerald-50 text-emerald-700 ring-emerald-100',
            step.state === 'current' && 'bg-[#18181b] text-white ring-[#18181b]',
            step.state === 'next' && 'bg-white text-[#71717a] ring-black/5',
          )}
        >
          {step.label}
        </li>
      ))}
    </ol>
  );
}

function StatusBadge({ status, children }: { status: ProcessStatus; children: ReactNode }) {
  return (
    <span
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
        status === 'running' && 'bg-blue-50 text-blue-600',
        status === 'complete' && 'bg-emerald-50 text-emerald-600',
        status === 'waiting' && 'bg-amber-50 text-amber-600',
        status === 'error' && 'bg-red-50 text-red-600',
      )}
    >
      {children}
    </span>
  );
}

function resumeModeLabel(mode: NonNullable<ResumeContext['mode']>) {
  if (mode === 'retry') return '继续处理';
  if (mode === 'replay') return '重新整理';
  if (mode === 'fork') return '换一种方案';
  return '确认后继续';
}

function interruptKindLabel(kind: string) {
  const normalized = kind.toLowerCase();
  if (/approval|confirm|human/.test(normalized)) return '人工确认';
  if (/safety|risk/.test(normalized)) return '安全检查';
  if (/missing|clarify|input/.test(normalized)) return '需要补充信息';
  return '可以从这里继续';
}
