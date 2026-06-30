import { MapPin, ShieldCheck } from 'lucide-react';

import { CardActionSummary } from './tool-card-actions';
import type { SchemaDrivenAssistantCard } from './tool-ui-schema';

export function ClarificationGeoCandidatesCard({ card }: { card: SchemaDrivenAssistantCard }) {
  const candidates = Array.isArray(card.data.candidates)
    ? card.data.candidates.filter(isRecord).slice(0, 5)
    : [];
  return (
    <article
      className="w-full overflow-hidden rounded-[22px] border border-teal-100 bg-white text-slate-900 shadow-[0_10px_30px_rgba(15,23,42,0.08)]"
      data-testid="clarification-geo-candidates-card"
      data-product-component="ClarificationGeoCandidatesCard"
    >
      <div className="border-b border-teal-100 bg-gradient-to-br from-teal-50 via-white to-emerald-50 px-4 py-4 sm:px-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-teal-600 text-white shadow-[0_10px_22px_rgba(13,148,136,0.22)]">
            <MapPin className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-teal-700">地点选择</p>
            <h3 className="mt-1 text-lg font-semibold leading-7 text-slate-950">
              {card.title || '选择约练地点'}
            </h3>
            {card.body ? <p className="mt-1 text-sm leading-6 text-slate-700">{card.body}</p> : null}
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4 sm:px-5">
        {candidates.length > 0 ? (
          <div className="space-y-2">
            {candidates.map((candidate, index) => (
              <div
                key={`${text(candidate.name)}-${index}`}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">
                      {displayLocation(candidate)}
                    </p>
                    {text(candidate.address) ? (
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">
                        {text(candidate.address)}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-teal-700 ring-1 ring-teal-100">
                    {confidenceLabel(candidate.confidence)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : null}
        <section className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
            <ShieldCheck className="h-4 w-4 text-emerald-700" aria-hidden="true" />
            选择地点不会自动发布或联系任何人
          </p>
          <p className="mt-1 text-xs leading-5 text-emerald-800">
            我只会把地点写回约练填写卡，公开前仍会让你确认。
          </p>
        </section>
        <CardActionSummary card={card} actions={card.actions} />
      </div>
    </article>
  );
}

function displayLocation(candidate: Record<string, unknown>) {
  return [candidate.city, candidate.district, candidate.name]
    .map(text)
    .filter(Boolean)
    .join(' · ');
}

function confidenceLabel(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '待确认';
  return `${Math.round(Math.max(0, Math.min(number, 1)) * 100)}%`;
}

function text(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
