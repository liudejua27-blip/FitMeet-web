import { Plane, Sparkles, UsersRound, Dumbbell } from 'lucide-react';

import { CardActionSummary } from './tool-card-actions';
import type { SchemaDrivenAssistantCard } from './tool-ui-schema';

const choices = [
  { key: 'workout', label: '约练', detail: '最快生成本次约练卡', icon: Dumbbell },
  { key: 'friend', label: '交友', detail: '即将支持完整闭环', icon: UsersRound },
  { key: 'travel', label: '旅游', detail: '即将支持结伴规划', icon: Plane },
];

export function LoopChoiceCard({ card }: { card: SchemaDrivenAssistantCard }) {
  return (
    <article
      className="w-full overflow-hidden rounded-[22px] border border-teal-100 bg-white text-slate-900 shadow-[0_10px_30px_rgba(15,23,42,0.08)]"
      data-testid="loop-choice-card"
      data-product-component="LoopChoiceCard"
    >
      <div className="border-b border-teal-100 bg-gradient-to-br from-teal-50 via-white to-emerald-50 px-4 py-4 sm:px-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-teal-600 text-white shadow-[0_10px_22px_rgba(13,148,136,0.22)]">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold leading-7 text-slate-950">
              {card.title || '你今天想做什么？'}
            </h3>
            {card.body ? <p className="mt-1 text-sm leading-6 text-slate-600">{card.body}</p> : null}
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4 sm:px-5">
        <div className="grid gap-2 sm:grid-cols-3">
          {choices.map((choice) => {
            const Icon = choice.icon;
            return (
              <div key={choice.key} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                <Icon className="h-5 w-5 text-teal-700" aria-hidden="true" />
                <p className="mt-2 text-sm font-semibold text-slate-950">{choice.label}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">{choice.detail}</p>
              </div>
            );
          })}
        </div>
        <CardActionSummary card={card} actions={card.actions} />
      </div>
    </article>
  );
}
