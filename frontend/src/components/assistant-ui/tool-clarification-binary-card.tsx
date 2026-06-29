import { HelpCircle, ShieldCheck } from 'lucide-react';

import { CardActionSummary } from './tool-card-actions';
import type { SchemaDrivenAssistantCard } from './tool-ui-schema';

export function ClarificationBinaryCard({ card }: { card: SchemaDrivenAssistantCard }) {
  return (
    <article
      className="w-full overflow-hidden rounded-[22px] border border-amber-100 bg-white text-slate-900 shadow-[0_10px_30px_rgba(15,23,42,0.08)]"
      data-testid="clarification-binary-card"
      data-product-component="ClarificationBinaryCard"
    >
      <div className="border-b border-amber-100 bg-gradient-to-br from-amber-50 via-white to-teal-50 px-4 py-4 sm:px-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-[0_10px_22px_rgba(245,158,11,0.22)]">
            <HelpCircle className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-700">是 / 否确认</p>
            <h3 className="mt-1 text-lg font-semibold leading-7 text-slate-950">
              {card.title || '确认一下'}
            </h3>
            {card.body ? <p className="mt-1 text-sm leading-6 text-slate-700">{card.body}</p> : null}
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4 sm:px-5">
        <section className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
            <ShieldCheck className="h-4 w-4 text-emerald-700" aria-hidden="true" />
            点击后不会自动发布或联系任何人
          </p>
          <p className="mt-1 text-xs leading-5 text-emerald-800">
            我只会根据你的确认生成下一张约练卡或填写卡。
          </p>
        </section>
        <CardActionSummary card={card} actions={card.actions} />
      </div>
    </article>
  );
}
