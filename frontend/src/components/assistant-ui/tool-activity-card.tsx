import {
  CalendarClock,
  Clock3,
  Eye,
  Footprints,
  MapPin,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from 'lucide-react';

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
  const participantLabel = safeParticipantLabel(opportunity.capacityLabel) ?? '人数可协商';
  const pace = opportunity.intensity ?? '轻松';
  const chips = compactUnique([
    activity,
    pace,
    ...opportunity.tags,
    ...opportunity.safetyBadges,
  ]).slice(0, 6);
  const facts = compactFacts([
    { icon: MapPin, label: opportunity.location ?? opportunity.city ?? '地点待确认' },
    { icon: CalendarClock, label: opportunity.time ?? '时间待确认' },
    { icon: Clock3, label: opportunity.subtitle ?? '时长可协商' },
    { icon: UsersRound, label: participantLabel },
    { icon: Footprints, label: pace },
  ]).slice(0, 5);
  const privacyLine = published
    ? '已被公开可发现用户看到，Agent 正在帮你寻找合适对象。'
    : '公开范围：附近 3km 可见 · 仅站内沟通 · 不展示手机号';
  const details = compactUnique([
    opportunity.nextAction,
    opportunity.publishPolicy,
    opportunity.approvalPolicy,
    opportunity.meetLoopNextStep,
  ]);

  return (
    <article
      className="w-full overflow-hidden rounded-[22px] border border-slate-200/80 bg-white text-slate-900 shadow-[0_10px_30px_rgba(15,23,42,0.08)]"
      data-testid="activity-opportunity-card"
      data-card-model="assistant-ui-opportunity-card"
      data-layout-model="structured-activity-card"
      data-product-component="OpportunityCard"
      data-opportunity-type="activity"
      data-has-image={String(Boolean(imageUrl))}
      data-has-detail="true"
      data-action-placement="bottom-grid"
      data-action-path="safe-sequenced"
    >
      <div className="p-4 sm:p-5">
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
          <div className="flex items-start gap-4 sm:gap-5">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={`${opportunity.title} 活动图`}
                className="h-[72px] w-[72px] shrink-0 rounded-[24px] object-cover ring-1 ring-slate-200 sm:h-[84px] sm:w-[84px]"
                loading="lazy"
              />
            ) : (
              <span className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-[24px] bg-teal-50 text-teal-700 ring-1 ring-teal-100 sm:h-[84px] sm:w-[84px]">
                <Footprints className="h-8 w-8" aria-hidden="true" />
              </span>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-teal-700">
                {published ? '已同步到发现' : '发布前确认'}
              </p>
              <h4 className="mt-1 text-[1.5rem] font-semibold leading-tight tracking-normal text-slate-950 sm:text-[1.85rem]">
                {opportunity.title}
              </h4>
            </div>
          </div>

          <dl className="mt-5 grid gap-3 text-sm font-medium leading-6 text-slate-700 sm:grid-cols-2 lg:grid-cols-5">
            {facts.map((fact) => {
              const Icon = fact.icon;
              return (
                <div key={fact.label} className="flex min-w-0 items-center gap-2">
                  <Icon className="h-4.5 w-4.5 shrink-0 text-teal-600" aria-hidden="true" />
                  <dd className="min-w-0 truncate">{fact.label}</dd>
                </div>
              );
            })}
          </dl>

          <section className="mt-5 rounded-2xl border border-teal-100 bg-teal-50/55 px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-teal-900">
              <Sparkles className="h-4 w-4 shrink-0 text-teal-600" aria-hidden="true" />
              约练说明
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-700">{opportunity.summary}</p>
          </section>

          <div className="mt-4 grid gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700">
            {published ? (
              <div className="flex items-start gap-2">
                <Eye className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                <p>{privacyLine}</p>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <ShieldCheck
                  className="mt-0.5 h-4 w-4 shrink-0 text-slate-500"
                  aria-hidden="true"
                />
                <p>{privacyLine}</p>
              </div>
            )}
          </div>

          {chips.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {chips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full bg-teal-50 px-3.5 py-1.5 text-sm font-semibold text-teal-700 ring-1 ring-teal-100"
                >
                  {chip}
                </span>
              ))}
            </div>
          ) : null}

          {details.length > 0 ? (
            <ProductCardDetails title="查看更多设置">
              <ul className="space-y-1 text-xs leading-5 text-slate-600">
                {details.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </ProductCardDetails>
          ) : null}

          <CardActionSummary card={card} actions={card.actions} />

          {published && (opportunity.publicIntentHref || opportunity.discoverHref) ? (
            <div className="mt-3 flex flex-wrap gap-3">
              {opportunity.publicIntentHref ? (
                <a
                  href={opportunity.publicIntentHref}
                  className="inline-flex text-sm font-semibold text-teal-700 hover:text-teal-800"
                >
                  查看公开详情
                </a>
              ) : null}
              {opportunity.discoverHref ? (
                <a
                  href={opportunity.discoverHref}
                  className="inline-flex text-sm font-semibold text-slate-600 hover:text-slate-900"
                >
                  在发现页查看
                </a>
              ) : null}
            </div>
          ) : null}

          {opportunity.messagesHref ? (
            <a
              href={opportunity.messagesHref}
              className="mt-3 inline-flex text-sm font-semibold text-teal-700 hover:text-teal-800"
            >
              去消息页继续
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function compactUnique(items: Array<string | null | undefined>) {
  return Array.from(
    new Set(items.map((item) => item?.trim()).filter((item): item is string => Boolean(item))),
  );
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

function safeParticipantLabel(value: string | null) {
  const label = value?.trim();
  if (!label) return null;
  if (/^\d+\s*\/\s*\d+\s*(?:人|位)?$/u.test(label)) return null;
  return label;
}
