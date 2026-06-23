import { MapPin } from 'lucide-react';

import { CardActionSummary } from './tool-card-actions';
import { ProductCardDetails } from './tool-card-shared';
import { safeImageSrc } from './tool-card-text';
import {
  normalizeCandidateOpportunityView,
  type SchemaDrivenAssistantCard,
} from './tool-ui-schema';

export function CandidateResultCard({ card }: { card: SchemaDrivenAssistantCard }) {
  const opportunity = normalizeCandidateOpportunityView(card);
  const name = opportunity.name || opportunity.title;
  const score = opportunity.score != null ? matchLevelLabel(opportunity.score) : null;
  const avatarUrl = safeImageSrc(opportunity.avatarUrl);
  const initials = name.slice(0, 1).toUpperCase();
  const tags = compactUnique([opportunity.area, ...opportunity.interests]).slice(0, 3);
  const meta = compactUnique([opportunity.area, opportunity.interests[0], opportunity.time]).join(
    ' · ',
  );

  return (
    <article
      className="w-full rounded-[22px] border border-slate-200/80 bg-white px-4 py-4 text-slate-900 shadow-[0_8px_26px_rgba(15,23,42,0.06)] sm:px-5 sm:py-5"
      data-testid="opportunity-card"
      data-card-model="assistant-ui-opportunity-card"
      data-product-component="CandidateCards"
      data-product-renderer="CandidateCards"
      data-opportunity-type="person"
      data-reasoning-degraded={String(opportunity.reasoningQuality.degraded)}
      data-reasoning-retryable={String(opportunity.reasoningQuality.retryable)}
      data-has-avatar={String(Boolean(avatarUrl || initials))}
      data-has-distance={String(Boolean(opportunity.distanceLabel))}
      data-has-interests={String(opportunity.interests.length > 0)}
      data-has-opener={String(Boolean(opportunity.suggestedOpener))}
      data-action-path="safe-sequenced"
    >
      <span className="sr-only">推荐对象</span>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={`${name} 的头像`}
              className="h-[86px] w-[86px] shrink-0 rounded-full object-cover ring-1 ring-slate-200"
              loading="lazy"
            />
          ) : (
            <div className="flex h-[86px] w-[86px] shrink-0 items-center justify-center rounded-full bg-slate-950 text-2xl font-semibold text-white">
              {initials}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-2xl font-semibold leading-tight text-slate-950">{name}</h3>
              {score ? (
                <span className="rounded-full bg-emerald-50 px-4 py-1 text-sm font-semibold text-emerald-700">
                  {score}
                </span>
              ) : null}
            </div>
            {meta ? (
              <p className="mt-2 flex items-center gap-2 text-sm leading-6 text-slate-500">
                <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{meta}</span>
              </p>
            ) : null}
            <p className="mt-2 text-sm leading-7 text-slate-700 sm:text-base">
              {opportunity.summary}
            </p>
            {tags.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-teal-50 px-4 py-1.5 text-sm font-semibold text-teal-700"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
            {opportunity.suggestedOpener ? (
              <p className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-600">
                开场白：{opportunity.suggestedOpener}
              </p>
            ) : null}
          </div>
        </div>

        <div className="sm:min-w-[460px]">
          <CardActionSummary card={card} actions={card.actions} />
          <div hidden>
            <ProductCardDetails title="查看推荐依据和安全边界">
              <p>{opportunity.safetyBoundary ?? opportunity.summary}</p>
            </ProductCardDetails>
          </div>
        </div>
      </div>
    </article>
  );
}

function matchLevelLabel(score: number) {
  if (score >= 85) return '匹配度：很高';
  if (score >= 68) return '匹配度：较高';
  return '匹配度：中等';
}

function compactUnique(items: Array<string | null | undefined>) {
  return Array.from(
    new Set(items.map((item) => item?.trim()).filter((item): item is string => Boolean(item))),
  ).slice(0, 5);
}
