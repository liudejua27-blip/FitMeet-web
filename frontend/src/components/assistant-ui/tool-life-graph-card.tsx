import {
  AlertCircle,
  Brain,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import {
  CardActionSummary,
} from './tool-card-actions';
import {
  DiffPane,
  MetaChip,
  ProductCardDetails,
} from './tool-card-shared';
import {
  normalizeLifeGraphDiffView,
  type SchemaDrivenAssistantCard,
} from './tool-ui-schema';

export function LifeGraphDiffCard({ card }: { card: SchemaDrivenAssistantCard }) {
  const diff = normalizeLifeGraphDiffView(card);
  const isCounterpartReply = diff.source === 'counterpart_reply';

  return (
    <article
      className="rounded-2xl bg-white p-3 ring-1 ring-black/5"
      data-testid="assistant-ui-life-graph-diff-card"
      data-product-component="LifeGraphDiffCard"
      data-life-graph-source={diff.source ?? 'unknown'}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f7f7f8] text-[#3f3f46]">
          <Brain className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-5 text-[#27272a]">{diff.title}</p>
          <p className="mt-1 text-xs leading-5 text-[#71717a]">{diff.description}</p>
          <div
            className="mt-3 flex flex-wrap items-center gap-1.5"
            data-testid="life-graph-source-boundary"
            data-life-graph-source-label={diff.sourceLabel}
          >
            <MetaChip icon={<ShieldCheck className="h-3 w-3" />} label={diff.sourceLabel} />
            <MetaChip icon={<Sparkles className="h-3 w-3" />} label="确认前不写入长期画像" />
          </div>
          {isCounterpartReply ? (
            <p
              className="mt-3 rounded-xl bg-emerald-50/70 px-3 py-2 text-xs leading-5 text-emerald-800 ring-1 ring-emerald-100"
              data-testid="life-graph-counterpart-reply-note"
            >
              这是对方回应后的弱信号：确认前不会写入长期画像，也不会保存私聊原文；确认后仍可撤回或纠正。
            </p>
          ) : null}
          {diff.currentValue || diff.proposedValue ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <DiffPane title="当前" value={diff.currentValue} />
              <DiffPane title="建议" value={diff.proposedValue} emphasized />
            </div>
          ) : null}
          {diff.conflicts.length > 0 ? (
            <div className="mt-3 rounded-xl bg-amber-50/70 px-3 py-2 ring-1 ring-amber-100">
              <p className="flex items-center gap-1.5 text-xs font-medium leading-5 text-amber-900">
                <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                需要确认的冲突
              </p>
              <ul className="mt-1 space-y-1 text-xs leading-5 text-amber-800">
                {diff.conflicts.map((conflict) => (
                  <li key={conflict}>• {conflict}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <ProductCardDetails title="查看记忆写入依据">
            <MemoryWriteChecklist diff={diff} />
            {diff.fields.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {diff.fields.map((field) => (
                  <MetaChip key={field} icon={<Sparkles className="h-3 w-3" />} label={field} />
                ))}
                {diff.sensitivityLevel ? (
                  <MetaChip
                    icon={<ShieldCheck className="h-3 w-3" />}
                    label={`敏感度：${diff.sensitivityLevel}`}
                  />
                ) : null}
              </div>
            ) : null}
            {diff.sourceSignals.length > 0 ? (
              <div className="mt-3 rounded-xl bg-[#f7f7f8] px-3 py-2 ring-1 ring-black/5">
                <p className="text-xs font-medium leading-5 text-[#3f3f46]">依据</p>
                <ul className="mt-1 space-y-1 text-xs leading-5 text-[#71717a]">
                  {diff.sourceSignals.map((signal) => (
                    <li key={signal}>• {signal}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {diff.confirmationBoundary ? (
              <p className="mt-3 rounded-xl bg-[#f7f7f8] px-3 py-2 text-xs leading-5 text-[#52525b] ring-1 ring-black/5">
                确认边界：{diff.confirmationBoundary}
              </p>
            ) : null}
            {diff.privacyBoundary && diff.privacyBoundary !== diff.confirmationBoundary ? (
              <p className="mt-2 rounded-xl bg-[#f7f7f8] px-3 py-2 text-xs leading-5 text-[#52525b] ring-1 ring-black/5">
                隐私边界：{diff.privacyBoundary}
              </p>
            ) : null}
            {diff.revokeHint ? (
              <p
                className="mt-2 rounded-xl bg-[#f7f7f8] px-3 py-2 text-xs leading-5 text-[#52525b] ring-1 ring-black/5"
                data-testid="life-graph-revoke-hint"
              >
                撤回与纠正：{diff.revokeHint}
              </p>
            ) : null}
          </ProductCardDetails>
          <CardActionSummary card={card} actions={card.actions} />
        </div>
      </div>
    </article>
  );
}

function MemoryWriteChecklist({ diff }: { diff: ReturnType<typeof normalizeLifeGraphDiffView> }) {
  const items = [
    {
      id: 'source',
      label: '来源类型',
      value: diff.sourceLabel,
      tone: diff.source === 'counterpart_reply' ? ('safe' as const) : ('neutral' as const),
    },
    {
      id: 'fields',
      label: '写入字段',
      value: diff.fields.length > 0 ? diff.fields.join('、') : '等待确认',
      tone: 'neutral' as const,
    },
    {
      id: 'sensitivity',
      label: '敏感等级',
      value: diff.sensitivityLevel ?? '未标记为敏感',
      tone: diff.sensitivityLevel ? ('warning' as const) : ('neutral' as const),
    },
    {
      id: 'evidence',
      label: '依据来源',
      value:
        diff.sourceSignals.length > 0 ? `${diff.sourceSignals.length} 条对话信号` : '暂无明确依据',
      tone: 'neutral' as const,
    },
    {
      id: 'history',
      label: '历史保留',
      value: '保留旧偏好记录，不直接覆盖',
      tone: 'safe' as const,
    },
    {
      id: 'boundary',
      label: '写入边界',
      value:
        diff.conflicts.length > 0
          ? `${diff.conflicts.length} 个冲突需确认`
          : diff.confirmationBoundary
            ? '仅按边界写入'
            : '确认后写入',
      tone: diff.conflicts.length > 0 ? ('warning' as const) : ('safe' as const),
    },
  ];

  return (
    <div
      className="mt-3 grid gap-1.5 rounded-xl bg-[#f7f7f8] px-3 py-2 ring-1 ring-black/5 sm:grid-cols-2"
      data-testid="life-graph-memory-checklist"
      data-conflict-count={String(diff.conflicts.length)}
      data-source-count={String(diff.sourceSignals.length)}
    >
      <p className="col-span-full flex items-center gap-1.5 text-xs font-medium leading-5 text-[#3f3f46]">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
        记忆写入检查
      </p>
      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-lg bg-white px-2.5 py-2 text-xs leading-5 ring-1 ring-black/[0.04]"
          data-memory-check={item.id}
          data-tone={item.tone}
        >
          <span className="block text-[11px] text-[#8a8f98]">{item.label}</span>
          <span className="mt-0.5 block text-[#3f3f46]">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
