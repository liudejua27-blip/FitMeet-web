import {
  CalendarClock,
  Clock3,
  Footprints,
  MapPin,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from 'lucide-react';

import { CardActionSummary } from './tool-card-actions';
import { ProductCardDetails } from './tool-card-shared';
import { normalizeInlineProductText, safeImageSrc } from './tool-card-text';
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
  const primaryActivity = opportunity.interests[0] ?? '约练';
  const headline = candidateHeadline(name, opportunity.title, primaryActivity);
  const statusLabel = opportunity.trustSignals.length > 0 ? '资料可信' : '推荐中';
  const facts = compactFacts([
    { icon: MapPin, label: opportunity.area ?? '地点待确认' },
    { icon: CalendarClock, label: opportunity.time ?? '时间待确认' },
    {
      icon: Clock3,
      label:
        textField(card.data, ['durationLabel', 'duration', 'expectedDuration', 'timeCost']) ??
        '节奏可协商',
    },
    { icon: Footprints, label: primaryActivity },
  ]).slice(0, 4);
  const tags = compactUnique([
    ...opportunity.interests,
    ...opportunity.safetyBadges,
    ...opportunity.confirmedContext,
  ]).slice(0, 6);
  const recommendationReasons = compactUnique(opportunity.reasons).slice(0, 3);
  const safetyLine =
    opportunity.safetyBoundary ??
    opportunity.invitePolicy ??
    '建议先站内沟通，确认前不会发送邀请或公开联系方式。';
  const details = compactUnique([
    opportunity.whyNow,
    opportunity.openerStrategy,
    ...opportunity.discoverySafetySignals,
    ...opportunity.recommendationProtocol.map((item) => item.detail),
  ]).slice(0, 4);

  return (
    <article
      className="w-full overflow-hidden rounded-[22px] border border-slate-200/80 bg-white text-slate-900 shadow-[0_10px_30px_rgba(15,23,42,0.07)]"
      data-testid="opportunity-card"
      data-card-model="assistant-ui-opportunity-card"
      data-layout-model="structured-recommendation-card"
      data-product-component="CandidateCards"
      data-product-renderer="CandidateCards"
      data-opportunity-type="person"
      data-action-placement="bottom-grid"
      data-reasoning-degraded={String(opportunity.reasoningQuality.degraded)}
      data-reasoning-retryable={String(opportunity.reasoningQuality.retryable)}
      data-has-avatar={String(Boolean(avatarUrl || initials))}
      data-has-distance={String(Boolean(opportunity.distanceLabel))}
      data-has-interests={String(opportunity.interests.length > 0)}
      data-has-opener={String(Boolean(opportunity.suggestedOpener))}
      data-action-path="safe-sequenced"
    >
      <span className="sr-only">推荐对象</span>
      <div className="p-4 sm:p-5">
        <div className="flex min-w-0 items-start gap-4 sm:gap-5">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={`${name} 的头像`}
              className="h-[76px] w-[76px] shrink-0 rounded-[26px] object-cover ring-1 ring-slate-200 sm:h-[88px] sm:w-[88px]"
              loading="lazy"
            />
          ) : (
            <div className="flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-[26px] bg-slate-950 text-2xl font-semibold text-white sm:h-[88px] sm:w-[88px]">
              {initials}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-slate-950 sm:text-base">{name}</p>
              <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700 ring-1 ring-teal-100">
                <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                {statusLabel}
              </span>
              {score ? (
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                  {score}
                </span>
              ) : null}
            </div>
            <h3 className="mt-2 text-[1.45rem] font-semibold leading-tight tracking-normal text-slate-950 sm:text-[1.7rem]">
              {headline}
            </h3>
          </div>
        </div>

        <dl className="mt-5 grid gap-3 text-sm font-medium text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
          {facts.map((fact) => {
            const Icon = fact.icon;
            return (
              <div key={`${fact.label}-${fact.icon.displayName ?? fact.label}`} className="flex items-center gap-2">
                <Icon className="h-4.5 w-4.5 shrink-0 text-teal-600" aria-hidden="true" />
                <dd className="min-w-0 truncate">{fact.label}</dd>
              </div>
            );
          })}
        </dl>

        <section className="mt-5 rounded-2xl border border-teal-100 bg-teal-50/55 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-teal-900">
            <Sparkles className="h-4 w-4 shrink-0 text-teal-600" aria-hidden="true" />
            推荐理由
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-700">{opportunity.summary}</p>
          {recommendationReasons.length > 0 ? (
            <ul className="mt-2 space-y-1 text-sm leading-6 text-slate-700">
              {recommendationReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}
        </section>

        {tags.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-teal-50 px-3.5 py-1.5 text-sm font-semibold text-teal-700 ring-1 ring-teal-100"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <div className="flex items-start gap-2 text-sm leading-6 text-slate-700">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
            <p>{safetyLine}</p>
          </div>
          {opportunity.suggestedOpener ? (
            <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-600">
              开场白草稿：{opportunity.suggestedOpener}
            </p>
          ) : null}
        </div>

        {details.length > 0 ? (
          <ProductCardDetails title="查看更多推荐依据">
            <ul className="space-y-1 text-xs leading-5 text-slate-600">
              {details.map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </ProductCardDetails>
        ) : null}

        <CardActionSummary card={card} actions={card.actions} />
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
  );
}

function candidateHeadline(name: string, title: string, activity: string) {
  if (title && title !== name) return title;
  const normalizedActivity = activity.trim();
  if (!normalizedActivity) return `${name}，适合先轻松认识`;
  const friendlyActivity =
    /轻松|慢|聊天|休闲|低强度/u.test(normalizedActivity)
      ? normalizedActivity
      : `轻松${normalizedActivity}`;
  return `${name}，适合从一次${friendlyActivity}开始`;
}

function textField(data: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string') {
      const text = normalizeInlineProductText(value);
      if (text) return text;
    }
  }
  return null;
}

function compactFacts<T extends { label: string | null | undefined }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item): item is T & { label: string } => {
    const label = item.label?.trim();
    if (!label || seen.has(label)) return false;
    seen.add(label);
    return true;
  });
}
