import { CheckCircle2, ListChecks, ShieldCheck, SlidersHorizontal } from 'lucide-react';

import { CardActionSummary } from './tool-card-actions';
import type { SchemaDrivenAssistantCard } from './tool-ui-schema';

type SlotItem = {
  key: string;
  label: string;
  value?: string | null;
  prompt?: string | null;
  required?: boolean;
  skippable?: boolean;
};

type RankingPreferenceView = {
  labels: string[];
  reason: string | null;
};

export function SlotClarificationCard({ card }: { card: SchemaDrivenAssistantCard }) {
  const missingSlots = normalizeSlotItems(card.data.missingSlots);
  const completedSlots = normalizeSlotItems(card.data.completedSlots);
  const optionalSlots = normalizeSlotItems(card.data.optionalSlots);
  const rankingPreference = normalizeRankingPreference(card.data.rankingPreference);
  const safetyMissing = missingSlots.some((slot) => slot.key === 'safety_boundary');

  return (
    <article
      className="w-full overflow-hidden rounded-[22px] border border-teal-100 bg-white text-slate-900 shadow-[0_10px_30px_rgba(15,23,42,0.08)]"
      data-product-component="SlotClarificationCard"
      data-testid="assistant-ui-slot-clarification-card"
      data-workflow-state={stringOrNull(card.data.workflowState) ?? 'COLLECTING_SLOTS'}
      data-waiting-for={stringOrNull(card.data.waitingFor) ?? 'opportunity_slot_completion'}
    >
      <div className="border-b border-teal-100 bg-gradient-to-br from-teal-50 via-white to-emerald-50 px-4 py-4 sm:px-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-teal-600 text-white shadow-[0_10px_22px_rgba(13,148,136,0.22)]">
            <ListChecks className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-teal-700">生成约练卡前确认</p>
            <h3 className="mt-1 text-lg font-semibold leading-7 text-slate-950">
              {card.title || '补齐约练卡信息'}
            </h3>
            {card.body ? (
              <p className="mt-1 text-sm leading-6 text-slate-600">{card.body}</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4 sm:px-5">
        {missingSlots.length > 0 ? (
          <section aria-label="仍需补充的信息">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-950">还差这些信息</p>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-100">
                {missingSlots.length} 项
              </span>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {missingSlots.map((slot) => (
                <SlotPill key={`${slot.key}:${slot.label}`} slot={slot} tone="missing" />
              ))}
            </div>
          </section>
        ) : null}

        {completedSlots.length > 0 ? (
          <section aria-label="已确认的信息">
            <p className="text-sm font-semibold text-slate-950">已确认</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {completedSlots.map((slot) => (
                <SlotPill key={`${slot.key}:${slot.label}`} slot={slot} tone="completed" />
              ))}
            </div>
          </section>
        ) : null}

        {rankingPreference.labels.length > 0 || rankingPreference.reason ? (
          <section className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-950">
              <SlidersHorizontal className="h-4 w-4 text-teal-600" aria-hidden="true" />
              当前排序偏好
            </p>
            {rankingPreference.labels.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {rankingPreference.labels.map((label) => (
                  <span
                    key={label}
                    className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200"
                  >
                    {label}
                  </span>
                ))}
              </div>
            ) : null}
            {rankingPreference.reason ? (
              <p className="mt-2 text-xs leading-5 text-slate-600">{rankingPreference.reason}</p>
            ) : null}
          </section>
        ) : null}

        <section className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
            <ShieldCheck className="h-4 w-4 text-emerald-700" aria-hidden="true" />
            {safetyMissing ? '可直接使用默认安全设置' : '安全边界不会被自动放宽'}
          </p>
          <p className="mt-1 text-xs leading-5 text-emerald-800">
            补齐后只会生成待确认约练卡；发布、匹配、私信和加好友都会继续单独确认。
          </p>
        </section>

        {optionalSlots.length > 0 ? (
          <section aria-label="可选补充项">
            <p className="text-sm font-semibold text-slate-950">可选补充</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {optionalSlots.map((slot) => (
                <span
                  key={`${slot.key}:${slot.label}`}
                  className="rounded-full bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200"
                >
                  {slot.label}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        <CardActionSummary card={card} actions={card.actions} />
      </div>
    </article>
  );
}

function SlotPill({ slot, tone }: { slot: SlotItem; tone: 'missing' | 'completed' }) {
  const completed = tone === 'completed';
  return (
    <div
      className={
        completed
          ? 'rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2'
          : 'rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2'
      }
    >
      <p
        className={
          completed
            ? 'flex items-center gap-1.5 text-xs font-semibold text-emerald-800'
            : 'text-xs font-semibold text-amber-800'
        }
      >
        {completed ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : null}
        {slot.label}
      </p>
      {slot.value ? (
        <p className="mt-1 truncate text-sm font-semibold text-slate-900">{slot.value}</p>
      ) : slot.prompt ? (
        <p className="mt-1 text-xs leading-5 text-slate-600">{slot.prompt}</p>
      ) : null}
    </div>
  );
}

function normalizeSlotItems(value: unknown): SlotItem[] {
  if (!Array.isArray(value)) return [];
  const items: SlotItem[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const label = stringOrNull(item.label);
    if (!label) continue;
    items.push({
      key: stringOrNull(item.key) ?? label,
      label,
      value: stringOrNull(item.value),
      prompt: stringOrNull(item.prompt),
      required: item.required === true,
      skippable: item.skippable === true,
    });
  }
  return items;
}

function normalizeRankingPreference(value: unknown): RankingPreferenceView {
  if (!isRecord(value)) return { labels: [], reason: null };
  const labels = Array.isArray(value.labels)
    ? value.labels.map(stringOrNull).filter((item): item is string => Boolean(item))
    : [];
  return {
    labels: Array.from(new Set(labels)).slice(0, 5),
    reason: stringOrNull(value.reason),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
