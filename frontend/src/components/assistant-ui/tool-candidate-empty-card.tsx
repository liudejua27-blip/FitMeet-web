import { SearchX, ShieldCheck } from 'lucide-react';

import { CardActionSummary } from './tool-card-actions';
import {
  normalizeCandidateEmptyStateView,
  type SchemaDrivenAssistantCard,
} from './tool-ui-schema';

export function CandidateEmptyStateCard({ card }: { card: SchemaDrivenAssistantCard }) {
  const view = normalizeCandidateEmptyStateView(card);

  return (
    <article
      className="rounded-2xl bg-white p-3 ring-1 ring-black/5"
      data-product-component="CandidateEmptyStateCard"
      data-testid="assistant-ui-candidate-empty-card"
      data-no-fake-candidates="true"
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f7f7f8] text-[#52525b] ring-1 ring-black/5">
          <SearchX className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="font-medium leading-5 text-[#27272a]">{view.title}</p>
          <p className="mt-1 text-sm leading-6 text-[#52525b]">{view.summary}</p>
        </div>
      </div>

      {view.criteria.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="已使用的搜索条件">
          {view.criteria.map((item) => (
            <span
              key={item}
              className="rounded-full bg-[#f7f7f8] px-2 py-0.5 text-[11px] font-medium leading-5 text-[#52525b] ring-1 ring-black/5"
            >
              {item}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {view.recoveryOptions.map((option) => (
          <div
            key={option.key}
            className="rounded-xl bg-[#f7f7f8] px-3 py-2 text-xs leading-5 text-[#52525b] ring-1 ring-black/5"
            data-requires-confirmation={option.requiresConfirmation ? 'true' : 'false'}
          >
            <p className="font-medium text-[#27272a]">{option.label}</p>
            <p className="mt-0.5">{option.detail}</p>
          </div>
        ))}
      </div>

      {view.safetyBoundary || view.nextBestStep ? (
        <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-800 ring-1 ring-emerald-100">
          <p className="flex items-center gap-1.5 font-medium">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            安全边界
          </p>
          {view.safetyBoundary ? <p className="mt-1">{view.safetyBoundary}</p> : null}
          {view.nextBestStep ? <p className="mt-1">{view.nextBestStep}</p> : null}
        </div>
      ) : null}

      <CardActionSummary card={card} actions={card.actions} />
    </article>
  );
}
