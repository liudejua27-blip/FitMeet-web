import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
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
import {
  OpportunityGuardrailStrip,
  candidatePrivacyGuardrail,
  candidateSourceGuardrail,
} from './tool-opportunity-guardrails';
import {
  ConfirmedContextChips,
  PrimaryReason,
  safeImageSrc,
} from './tool-opportunity-shared';
import {
  normalizeCandidateOpportunityView,
  type SchemaDrivenAssistantCard,
} from './tool-ui-schema';

export function CandidateResultCard({ card }: { card: SchemaDrivenAssistantCard }) {
  const opportunity = normalizeCandidateOpportunityView(card);
  const name = opportunity.name;
  const score = opportunity.score != null ? `${Math.round(opportunity.score)} 分` : null;
  const avatarUrl = safeImageSrc(opportunity.avatarUrl);
  const initials = name.slice(0, 1).toUpperCase();
  const hasDistance = Boolean(opportunity.distanceLabel);
  const hasOpener = Boolean(opportunity.suggestedOpener);
  const hasInterests = opportunity.interests.length > 0;

  return (
    <article
      className="rounded-2xl bg-white p-3 ring-1 ring-black/5 transition hover:-translate-y-px hover:shadow-sm hover:ring-black/10"
      data-testid="opportunity-card"
      data-card-model="assistant-ui-opportunity-card"
      data-product-component="CandidateCards"
      data-opportunity-type="person"
      data-reasoning-degraded={String(opportunity.reasoningQuality.degraded)}
      data-reasoning-retryable={String(opportunity.reasoningQuality.retryable)}
      data-has-avatar={String(Boolean(avatarUrl || initials))}
      data-has-distance={String(hasDistance)}
      data-has-interests={String(hasInterests)}
      data-has-opener={String(hasOpener)}
      data-action-path="safe-sequenced"
    >
      <div className="flex items-start gap-3">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={`${name} 的头像`}
            className="h-11 w-11 shrink-0 rounded-full object-cover ring-1 ring-black/10"
            loading="lazy"
          />
        ) : (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#18181b] text-sm font-semibold text-white">
            {initials}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#8a8f98]">
                推荐对象
              </p>
              <p className="font-medium leading-5 text-[#27272a]">{opportunity.title}</p>
              {opportunity.subtitle ? (
                <p className="mt-0.5 text-xs leading-5 text-[#71717a]">{opportunity.subtitle}</p>
              ) : null}
            </div>
            {score ? (
              <span className="rounded-full bg-[#f7f7f8] px-2 py-0.5 text-[11px] font-medium text-[#52525b] ring-1 ring-black/5">
                {score}
              </span>
            ) : null}
          </div>
          <p className="mt-1 leading-6 text-[#52525b]">{opportunity.summary}</p>
          <CandidateReasoningQualityNotice quality={opportunity.reasoningQuality} />
          <CandidateIntentChips opportunity={opportunity} />
          <ConfirmedContextChips
            items={opportunity.confirmedContext}
            schemaType={card.schemaType}
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {opportunity.area ? (
              <MetaChip icon={<MapPin className="h-3 w-3" />} label={opportunity.area} />
            ) : null}
            {opportunity.time ? (
              <MetaChip icon={<CalendarClock className="h-3 w-3" />} label={opportunity.time} />
            ) : null}
            {opportunity.distanceLabel ? (
              <MetaChip icon={<MapPin className="h-3 w-3" />} label={opportunity.distanceLabel} />
            ) : null}
            {opportunity.safetyBadges.map((badge) => (
              <MetaChip key={badge} icon={<ShieldCheck className="h-3 w-3" />} label={badge} />
            ))}
            {opportunity.interests.map((interest) => (
              <MetaChip key={interest} icon={<Users className="h-3 w-3" />} label={interest} />
            ))}
          </div>
          <PrimaryReason
            reason={opportunity.reasons[0]}
            fallback={opportunity.recommendedNextAction}
            label="推荐理由"
          />
          <ProductCardDetails title="查看推荐依据和安全边界">
            <OpportunityGuardrailStrip
              schemaType={card.schemaType}
              actions={visibleCardActions(card, card.actions)}
              items={[
                {
                  id: 'source',
                  label: '来源',
                  value: candidateSourceGuardrail(opportunity),
                },
                {
                  id: 'privacy',
                  label: '资料',
                  value: candidatePrivacyGuardrail(opportunity),
                },
                {
                  id: 'touch',
                  label: '触达',
                  value: opportunity.invitePolicy ?? '发送邀请、加好友或连接前必须由你确认',
                },
                {
                  id: 'recover',
                  label: '恢复',
                  value: '可跳过、重试开场白，或从确认点继续',
                },
              ]}
            />
            <CandidateRankingBreakdown items={opportunity.rankingBreakdown} />
            {opportunity.reasons.length > 1 ? (
              <ReasonList title="更多推荐理由" reasons={opportunity.reasons.slice(1)} />
            ) : null}
            {opportunity.discoverySafetySignals.length > 0 ? (
              <div
                className="mt-3 rounded-xl bg-emerald-50/70 px-3 py-2 ring-1 ring-emerald-100"
                data-testid="assistant-ui-candidate-discovery-safety"
                aria-label="可发现门槛"
              >
                <p className="flex items-center gap-1.5 text-xs font-medium leading-5 text-emerald-950">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  可发现门槛
                </p>
                <ul className="mt-1 grid gap-1 text-xs leading-5 text-emerald-900 sm:grid-cols-2">
                  {opportunity.discoverySafetySignals.map((signal) => (
                    <li key={signal} className="flex gap-1.5">
                      <CheckCircle2 className="mt-1 h-3 w-3 shrink-0" aria-hidden="true" />
                      <span>{signal}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {opportunity.recommendationProtocol.length > 0 ? (
              <div
                className="mt-3 rounded-xl bg-white px-3 py-2 ring-1 ring-black/5"
                data-testid="assistant-ui-recommendation-protocol"
                aria-label="推荐协议"
              >
                <p className="flex items-center gap-1.5 text-xs font-medium leading-5 text-[#3f3f46]">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  推荐协议
                </p>
                <dl className="mt-1 grid gap-1.5 text-xs leading-5 text-[#71717a] sm:grid-cols-2">
                  {opportunity.recommendationProtocol.map((item) => (
                    <div key={item.key}>
                      <dt className="font-medium text-[#3f3f46]">{item.label}</dt>
                      <dd>{item.detail}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
            {opportunity.trustSignals.length > 0 || opportunity.coldStartSignals.length > 0 ? (
              <div
                className="mt-3 rounded-xl bg-white px-3 py-2 ring-1 ring-black/5"
                data-testid="assistant-ui-candidate-trust-signals"
              >
                <p className="flex items-center gap-1.5 text-xs font-medium leading-5 text-[#3f3f46]">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  推荐边界
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {[...opportunity.trustSignals, ...opportunity.coldStartSignals].map((signal) => (
                    <span
                      key={signal}
                      className="rounded-full bg-[#f7f7f8] px-2 py-0.5 text-[11px] leading-5 text-[#52525b] ring-1 ring-black/5"
                    >
                      {signal}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {opportunity.recentPublicActivity.length > 0 ? (
              <div
                className="mt-3 rounded-xl bg-white px-3 py-2 ring-1 ring-black/5"
                data-testid="assistant-ui-candidate-recent-public-activity"
                aria-label="最近公开动态"
              >
                <p className="flex items-center gap-1.5 text-xs font-medium leading-5 text-[#3f3f46]">
                  <History className="h-3.5 w-3.5" aria-hidden="true" />
                  最近公开动态
                </p>
                <ul className="mt-1 space-y-1 text-xs leading-5 text-[#71717a]">
                  {opportunity.recentPublicActivity.map((signal) => (
                    <li key={signal}>• {signal}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {opportunity.preferenceHistorySignals.length > 0 ? (
              <div
                className="mt-3 rounded-xl bg-[#f7f7f8] px-3 py-2 ring-1 ring-black/5"
                data-testid="assistant-ui-candidate-preference-history"
                aria-label="最近确认偏好"
              >
                <p className="flex items-center gap-1.5 text-xs font-medium leading-5 text-[#3f3f46]">
                  <History className="h-3.5 w-3.5" aria-hidden="true" />
                  最近确认偏好
                </p>
                <ul className="mt-1 space-y-1 text-xs leading-5 text-[#71717a]">
                  {opportunity.preferenceHistorySignals.map((signal) => (
                    <li key={signal}>• {signal}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <CandidateActionRhythm opportunity={opportunity} />
            {opportunity.explanationSteps.length > 0 ? (
              <CandidateExplanationTrace steps={opportunity.explanationSteps} />
            ) : null}
            <OpportunityActionPath
              actions={visibleCardActions(card, card.actions)}
              schemaType={card.schemaType}
            />
          </ProductCardDetails>
          {opportunity.suggestedOpener ? (
            <p className="mt-2 rounded-xl bg-[#f7f7f8] px-3 py-2 text-xs leading-5 text-[#3f3f46] ring-1 ring-black/5">
              开场白预览：{opportunity.suggestedOpener}
            </p>
          ) : null}
          <ProductCardDetails title="查看下一步和安全边界">
            {opportunity.recommendedNextAction ? (
              <p className="rounded-xl bg-[#f7f7f8] px-3 py-2 text-xs leading-5 text-[#52525b] ring-1 ring-black/5">
                下一步：{opportunity.recommendedNextAction}
              </p>
            ) : null}
            {opportunity.safetyBoundary ? (
              <p className="mt-2 rounded-xl bg-[#f7f7f8] px-3 py-2 text-xs leading-5 text-[#71717a] ring-1 ring-black/5">
                安全边界：{opportunity.safetyBoundary}
              </p>
            ) : null}
          </ProductCardDetails>
          <CardActionSummary card={card} actions={card.actions} />
        </div>
      </div>
    </article>
  );
}

function CandidateReasoningQualityNotice({
  quality,
}: {
  quality: ReturnType<typeof normalizeCandidateOpportunityView>['reasoningQuality'];
}) {
  if (!quality.degraded || !quality.label) return null;

  return (
    <div
      className="mt-2 rounded-xl bg-amber-50/80 px-3 py-2 text-xs leading-5 text-amber-950 ring-1 ring-amber-100"
      data-testid="assistant-ui-candidate-reasoning-quality"
      data-reasoning-source={quality.source ?? 'unknown'}
      data-retryable={quality.retryable ? 'true' : 'false'}
      aria-label="候选推荐解释状态"
    >
      <p className="flex items-center gap-1.5 font-medium">
        <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
        {quality.label}
      </p>
      {quality.detail ? <p className="mt-0.5 text-amber-900">{quality.detail}</p> : null}
      {quality.actionLabel ? (
        <p className="mt-1 text-[11px] font-medium text-amber-800">{quality.actionLabel}</p>
      ) : null}
    </div>
  );
}

function CandidateActionRhythm({
  opportunity,
}: {
  opportunity: ReturnType<typeof normalizeCandidateOpportunityView>;
}) {
  const openerStrategy =
    opportunity.openerStrategy ??
    (opportunity.suggestedOpener
      ? '先用开场白轻量试探，确认对方有兴趣后再推进到邀请。'
      : '先围绕共同时间、地点或兴趣轻量开口，确认对方有兴趣后再推进。');
  const items = [
    opportunity.whyNow ? { id: 'why-now', label: '为什么现在', value: opportunity.whyNow } : null,
    { id: 'opener-strategy', label: '怎么开口', value: openerStrategy },
  ].filter(Boolean) as Array<{ id: string; label: string; value: string }>;
  if (items.length === 0) return null;

  return (
    <div
      className="mt-3 grid gap-1.5 rounded-xl bg-[#f7f7f8] px-3 py-2 ring-1 ring-black/5 sm:grid-cols-2"
      data-testid="assistant-ui-candidate-action-rhythm"
      aria-label="推荐行动节奏"
    >
      {items.map((item) => (
        <div key={item.id} className="text-xs leading-5" data-candidate-rhythm={item.id}>
          <span className="block font-medium text-[#3f3f46]">{item.label}</span>
          <span className="mt-0.5 block text-[#71717a]">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function CandidateRankingBreakdown({
  items,
}: {
  items: ReturnType<typeof normalizeCandidateOpportunityView>['rankingBreakdown'];
}) {
  if (items.length === 0) return null;

  return (
    <div
      className="mt-3 rounded-xl bg-white px-3 py-2 ring-1 ring-black/5"
      data-testid="assistant-ui-candidate-ranking-breakdown"
      aria-label="候选排序依据"
    >
      <p className="flex items-center gap-1.5 text-xs font-medium leading-5 text-[#3f3f46]">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        匹配依据
      </p>
      <div className="mt-1.5 space-y-1.5">
        {items.map((item) => (
          <div
            key={item.key}
            className="grid gap-1 rounded-lg bg-[#f7f7f8] px-2.5 py-2 text-xs leading-5 text-[#52525b] sm:grid-cols-[92px_1fr]"
            data-ranking-key={item.key}
          >
            <span className="font-medium text-[#3f3f46]">
              {item.label}
              {item.score != null ? (
                <span className="ml-1 font-normal text-[#8a8f98]">{item.score}</span>
              ) : null}
            </span>
            <span className="text-[#71717a]">{item.reason}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CandidateIntentChips({
  opportunity,
}: {
  opportunity: ReturnType<typeof normalizeCandidateOpportunityView>;
}) {
  const items = [
    opportunity.relationshipGoal
      ? { id: 'relationship-goal', label: '关系目标', value: opportunity.relationshipGoal }
      : null,
    opportunity.idealType ? { id: 'ideal-type', label: '理想型', value: opportunity.idealType } : null,
    opportunity.invitePolicy
      ? { id: 'invite-policy', label: '邀请边界', value: opportunity.invitePolicy }
      : null,
  ].filter(Boolean) as Array<{ id: string; label: string; value: string }>;
  if (items.length === 0) return null;

  return (
    <div
      className="mt-2 grid gap-1.5 sm:grid-cols-3"
      data-testid="assistant-ui-candidate-intent-chips"
      aria-label="候选机会意图摘要"
    >
      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-xl bg-[#f7f7f8] px-2.5 py-2 text-xs leading-5 ring-1 ring-black/5"
          data-candidate-intent={item.id}
        >
          <span className="block text-[11px] text-[#8a8f98]">{item.label}</span>
          <span className="mt-0.5 block text-[#3f3f46]">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function CandidateExplanationTrace({ steps }: { steps: string[] }) {
  return (
    <details
      className="group/trace mt-3 rounded-xl bg-white px-3 py-2 ring-1 ring-black/5"
      data-testid="candidate-explanation-trace"
      data-schema-type="social_match.candidate"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium leading-5 text-[#3f3f46] marker:hidden">
        <span className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          推荐依据
        </span>
        <ChevronDown
          className="h-3.5 w-3.5 text-[#a1a1aa] transition-transform group-open/trace:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <ol className="mt-1 grid gap-1.5 text-xs leading-5 text-[#71717a] sm:grid-cols-3">
        {steps.slice(0, 3).map((step, index) => (
          <li
            key={`${step}-${index}`}
            className="rounded-lg bg-[#f7f7f8] px-2 py-1.5 ring-1 ring-black/[0.04]"
          >
            {step}
          </li>
        ))}
      </ol>
    </details>
  );
}
