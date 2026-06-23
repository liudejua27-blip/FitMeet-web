import { Clock3, Eye, Footprints, ShieldCheck } from 'lucide-react';

import { CardActionSummary } from './tool-card-actions';
import { ProductCardDetails } from './tool-card-shared';
import { safeImageSrc } from './tool-card-text';
import { normalizeActivityOpportunityView, type SchemaDrivenAssistantCard } from './tool-ui-schema';

export function ActivityOpportunityCard({ card }: { card: SchemaDrivenAssistantCard }) {
  const opportunity = normalizeActivityOpportunityView(card);
  const imageUrl = safeImageSrc(opportunity.imageUrl);
  const published = opportunity.autoPublished || Boolean(opportunity.publicIntentId);
  const statusLabel = published ? '已发布' : '草稿待确认';
  const statusClass = published
    ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
    : 'bg-cyan-50 text-teal-700 ring-cyan-100';
  const activity = opportunity.tags[0] ?? opportunity.intensity ?? '跑步';
  const distance = opportunity.capacityLabel ?? '找 1 人';
  const pace = opportunity.intensity ?? '轻松';
  const chips = compactUnique([opportunity.location, opportunity.time, activity, pace]);
  const privacyLine = published
    ? '已被公开可发现用户看到，Agent 正在帮你寻找合适对象。'
    : '公开范围：附近 3km 可见 · 仅站内沟通 · 不展示手机号';

  return (
    <article
      className="w-full overflow-hidden rounded-[22px] border border-slate-200/80 bg-white px-4 py-4 text-slate-900 shadow-[0_10px_30px_rgba(15,23,42,0.08)] sm:px-5 sm:py-5"
      data-testid="activity-opportunity-card"
      data-card-model="assistant-ui-opportunity-card"
      data-product-component="OpportunityCard"
      data-opportunity-type="activity"
      data-has-image={String(Boolean(imageUrl))}
      data-has-detail="true"
      data-action-path="safe-sequenced"
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 pb-4">
        <h3 className="text-base font-semibold leading-6 text-slate-950 sm:text-lg">
          我的约练卡片
        </h3>
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusClass}`}
        >
          {statusLabel}
        </span>
      </div>

      <div className="pt-5">
        <div className="flex items-start gap-3">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={`${opportunity.title} 活动图`}
              className="mt-0.5 h-10 w-10 rounded-2xl object-cover ring-1 ring-slate-200"
              loading="lazy"
            />
          ) : (
            <span className="mt-1 text-3xl leading-none" aria-hidden="true">
              🏃
            </span>
          )}
          <div className="min-w-0">
            <h4 className="text-[1.65rem] font-semibold leading-tight tracking-[-0.01em] text-slate-950 sm:text-[1.9rem]">
              {opportunity.title}
            </h4>
          </div>
        </div>

        <div className="mt-4 grid gap-3 text-sm font-medium leading-6 text-slate-700 sm:text-base">
          <p className="flex items-center gap-2">
            <Clock3 className="h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />
            <span>
              {opportunity.time ?? '时间待确认'} ·{' '}
              {opportunity.location ?? opportunity.city ?? '地点待确认'}
            </span>
          </p>
          <p className="flex items-center gap-2">
            <Footprints className="h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />
            <span>
              {activity} · {distance} · {pace}
            </span>
          </p>
          {published ? (
            <p className="flex items-center gap-2">
              <Eye className="h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />
              <span>{privacyLine}</span>
            </p>
          ) : null}
        </div>

        {!published ? (
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-700 sm:text-base">
            {opportunity.summary}
          </p>
        ) : null}

        {chips.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <span
                key={chip}
                className="rounded-full bg-teal-50 px-4 py-1.5 text-sm font-semibold text-teal-700"
              >
                {chip}
              </span>
            ))}
          </div>
        ) : null}

        {!published ? (
          <div className="mt-5 border-t border-dashed border-slate-200 pt-4">
            <p className="flex items-center gap-2 text-sm leading-6 text-slate-500">
              <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
              {privacyLine}
            </p>
          </div>
        ) : (
          <div className="mt-5 border-t border-slate-200 pt-4" />
        )}

        <CardActionSummary card={card} actions={card.actions} />
        <div hidden>
          <ProductCardDetails title="查看下一步和安全边界">
            <p>{opportunity.safetyBoundary ?? opportunity.summary}</p>
          </ProductCardDetails>
        </div>

        {published && opportunity.discoverHref ? (
          <a
            href={opportunity.discoverHref}
            className="mt-3 inline-flex text-sm font-semibold text-teal-700 hover:text-teal-800"
          >
            查看发现详情
          </a>
        ) : null}
      </div>
    </article>
  );
}

function compactUnique(items: Array<string | null | undefined>) {
  return Array.from(
    new Set(items.map((item) => item?.trim()).filter((item): item is string => Boolean(item))),
  ).slice(0, 4);
}
