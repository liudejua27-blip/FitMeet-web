import {
  Brain,
  CalendarClock,
  CheckCircle2,
  HeartHandshake,
  History,
  MapPin,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';

import {
  CardActionSummary,
  visibleCardActions,
} from './tool-card-actions';
import {
  MetaChip,
  ProductCardDetails,
  ReasonList,
} from './tool-card-shared';
import { OpportunityActionPath } from './tool-opportunity-action-path';
import { OpportunityGuardrailStrip } from './tool-opportunity-guardrails';
import {
  ConfirmedContextChips,
  PrimaryReason,
  safeImageSrc,
} from './tool-opportunity-shared';
import {
  normalizeActivityOpportunityView,
  type SchemaDrivenAssistantCard,
} from './tool-ui-schema';

export function ActivityOpportunityCard({ card }: { card: SchemaDrivenAssistantCard }) {
  const opportunity = normalizeActivityOpportunityView(card);
  const imageUrl = safeImageSrc(opportunity.imageUrl);
  const hasDetail = Boolean(
    opportunity.summary ||
      opportunity.location ||
      opportunity.time ||
      opportunity.capacityLabel ||
      opportunity.intensity,
  );

  return (
    <article
      className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/5 transition hover:-translate-y-px hover:shadow-sm hover:ring-black/10"
      data-testid="activity-opportunity-card"
      data-card-model="assistant-ui-opportunity-card"
      data-product-component="OpportunityCard"
      data-opportunity-type="activity"
      data-has-image={String(Boolean(imageUrl))}
      data-has-detail={String(hasDetail)}
      data-action-path="safe-sequenced"
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={`${opportunity.title} 活动图`}
          className="h-28 w-full object-cover"
          loading="lazy"
        />
      ) : null}
      <div className="p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#8a8f98]">
              活动机会
            </p>
            <p className="font-medium leading-5 text-[#27272a]">{opportunity.title}</p>
            {opportunity.subtitle ? (
              <p className="mt-0.5 text-xs leading-5 text-[#71717a]">{opportunity.subtitle}</p>
            ) : null}
          </div>
          {opportunity.host ? (
            <span className="rounded-full bg-[#f7f7f8] px-2 py-0.5 text-[11px] font-medium text-[#52525b] ring-1 ring-black/5">
              {opportunity.host}
            </span>
          ) : null}
        </div>
        <p className="mt-2 leading-6 text-[#52525b]">{opportunity.summary}</p>
        <ConfirmedContextChips items={opportunity.confirmedContext} schemaType={card.schemaType} />
        <ActivityStatusStrip opportunity={opportunity} />
        {opportunity.autoPublished ? (
          <div
            className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-emerald-50/80 px-3 py-2 text-xs leading-5 text-emerald-900 ring-1 ring-emerald-100"
            data-testid="activity-auto-published"
          >
            <span className="flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              已同步到发现页
            </span>
            {opportunity.discoverHref ? (
              <a
                href={opportunity.discoverHref}
                className="rounded-full bg-white px-2.5 py-1 font-medium text-emerald-950 ring-1 ring-emerald-100 transition hover:bg-emerald-50"
              >
                查看公开卡片
              </a>
            ) : null}
          </div>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {opportunity.city ? (
            <MetaChip icon={<MapPin className="h-3 w-3" />} label={opportunity.city} />
          ) : null}
          {opportunity.location ? (
            <MetaChip icon={<MapPin className="h-3 w-3" />} label={opportunity.location} />
          ) : null}
          {opportunity.time ? (
            <MetaChip icon={<CalendarClock className="h-3 w-3" />} label={opportunity.time} />
          ) : null}
          {opportunity.capacityLabel ? (
            <MetaChip icon={<Users className="h-3 w-3" />} label={opportunity.capacityLabel} />
          ) : null}
          {opportunity.intensity ? (
            <MetaChip icon={<Sparkles className="h-3 w-3" />} label={opportunity.intensity} />
          ) : null}
          {opportunity.tags.map((tag) => (
            <MetaChip key={tag} icon={<HeartHandshake className="h-3 w-3" />} label={tag} />
          ))}
          {opportunity.safetyBadges.map((badge) => (
            <MetaChip key={badge} icon={<ShieldCheck className="h-3 w-3" />} label={badge} />
          ))}
        </div>
        <PrimaryReason
          reason={opportunity.reasons[0]}
          fallback={opportunity.nextAction}
          label="适合你的原因"
        />
        <CardActionSummary card={card} actions={card.actions} />
        <ProductCardDetails title="查看发布边界和约练闭环">
          {opportunity.reasons.length > 1 ? (
            <ReasonList title="更多适配理由" reasons={opportunity.reasons.slice(1)} />
          ) : null}
          {opportunity.nextAction ? (
            <p className="rounded-xl bg-[#f7f7f8] px-3 py-2 text-xs leading-5 text-[#52525b] ring-1 ring-black/5">
              下一步：{opportunity.nextAction}
            </p>
          ) : null}
          <OpportunityGuardrailStrip
            schemaType={card.schemaType}
            actions={visibleCardActions(card, card.actions)}
            items={[
              {
                id: 'source',
                label: '来源',
                value: opportunity.host ? `来自 ${opportunity.host} 或公开活动信息` : '只基于公开或授权活动信息整理',
              },
              {
                id: 'location',
                label: '地点',
                value: opportunity.safetyBoundary ?? '优先公共场所和模糊位置',
              },
              {
                id: 'approval',
                label: '确认',
                value: opportunity.approvalPolicy ?? '创建、邀请或公开发布前必须由你确认',
              },
              {
                id: 'loop',
                label: '闭环',
                value: opportunity.meetLoopNextStep ?? '确认后进入等待回复、改期、评价和画像回写流程',
              },
            ]}
          />
          {opportunity.explanationSteps.length > 0 ? (
            <div
              className="mt-3 rounded-xl bg-white px-3 py-2 ring-1 ring-black/5"
              data-testid="activity-explanation-steps"
              aria-label="活动推荐路径"
            >
              <p className="flex items-center gap-1.5 text-xs font-medium leading-5 text-[#3f3f46]">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                推荐路径
              </p>
              <ol className="mt-1 space-y-1 text-xs leading-5 text-[#71717a]">
                {opportunity.explanationSteps.map((step, index) => (
                  <li key={step} className="flex gap-2">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#f4f4f5] text-[10px] font-medium text-[#52525b]">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          {opportunity.activityProtocol.length > 0 ? (
            <div
              className="mt-3 rounded-xl bg-sky-50/70 px-3 py-2 text-xs leading-5 text-sky-950 ring-1 ring-sky-100"
              data-testid="activity-protocol"
              aria-label="约练执行协议"
            >
              <p className="flex items-center gap-1.5 font-medium">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                约练执行协议
              </p>
              <dl className="mt-1.5 grid gap-1.5">
                {opportunity.activityProtocol.map((item) => (
                  <div key={item.key} className="grid gap-0.5 sm:grid-cols-[5.5rem_1fr] sm:gap-2">
                    <dt className="font-medium text-sky-900">{item.label}</dt>
                    <dd className="text-sky-900/80">{item.detail}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
          {activitySafetyLoopItems(opportunity).length > 0 ? (
            <div
              className="mt-3 grid gap-1.5 rounded-xl bg-emerald-50/60 px-3 py-2 text-xs leading-5 text-emerald-900 ring-1 ring-emerald-100"
              data-testid="activity-safety-loop"
              aria-label="约练安全闭环"
            >
              {activitySafetyLoopItems(opportunity).map(({ label, value, icon: Icon }) => (
                <p key={label} className="flex gap-2">
                  <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    <span className="font-medium">{label}：</span>
                    {value}
                  </span>
                </p>
              ))}
            </div>
          ) : null}
          <OpportunityActionPath
            actions={visibleCardActions(card, card.actions)}
            schemaType={card.schemaType}
          />
        </ProductCardDetails>
      </div>
    </article>
  );
}

function ActivityStatusStrip({
  opportunity,
}: {
  opportunity: ReturnType<typeof normalizeActivityOpportunityView>;
}) {
  const schedule = [opportunity.time, opportunity.location ?? opportunity.city]
    .filter(Boolean)
    .join(' · ');
  const items = [
    {
      key: 'schedule',
      label: '活动安排',
      value: schedule || opportunity.subtitle || '先确认时间和地点',
      icon: CalendarClock,
    },
    {
      key: 'safety',
      label: '安全边界',
      value: opportunity.safetyBoundary || '优先公共场所和站内沟通',
      icon: ShieldCheck,
    },
    {
      key: 'approval',
      label: '下一步确认',
      value: opportunity.approvalPolicy || '发起、邀请或公开发布前都会先问你',
      icon: CheckCircle2,
    },
  ];

  return (
    <div
      className="mt-3 grid gap-1.5 rounded-xl bg-[#fafafa] p-2 ring-1 ring-black/[0.04] sm:grid-cols-3"
      data-testid="activity-status-strip"
      aria-label="活动状态摘要"
    >
      {items.map(({ key, label, value, icon: Icon }) => (
        <div key={key} className="min-w-0 rounded-lg bg-white px-2.5 py-2 ring-1 ring-black/[0.04]">
          <p className="flex items-center gap-1.5 text-[11px] font-medium leading-4 text-[#71717a]">
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#3f3f46]">{value}</p>
        </div>
      ))}
    </div>
  );
}

function activitySafetyLoopItems(opportunity: ReturnType<typeof normalizeActivityOpportunityView>) {
  return [
    opportunity.safetyBoundary
      ? { label: '安全边界', value: opportunity.safetyBoundary, icon: ShieldCheck }
      : null,
    opportunity.publishPolicy
      ? { label: '公开策略', value: opportunity.publishPolicy, icon: ShieldCheck }
      : null,
    opportunity.approvalPolicy
      ? { label: '执行边界', value: opportunity.approvalPolicy, icon: History }
      : null,
    opportunity.meetLoopNextStep
      ? { label: '约练闭环', value: opportunity.meetLoopNextStep, icon: CalendarClock }
      : null,
    opportunity.checkinReminder
      ? { label: '签到提醒', value: opportunity.checkinReminder, icon: CalendarClock }
      : null,
    opportunity.reviewPrompt
      ? { label: '评价确认', value: opportunity.reviewPrompt, icon: CheckCircle2 }
      : null,
    opportunity.lifeGraphUpdatePreview
      ? { label: '画像回写', value: opportunity.lifeGraphUpdatePreview, icon: Brain }
      : null,
    opportunity.trustScoreUpdatePreview
      ? { label: '可信度', value: opportunity.trustScoreUpdatePreview, icon: Sparkles }
      : null,
  ].filter((item): item is { label: string; value: string; icon: typeof ShieldCheck } =>
    Boolean(item),
  );
}
