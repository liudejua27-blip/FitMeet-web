import {
  CalendarCheck2,
  MessageCircle,
  ShieldCheck,
  UserRound,
} from 'lucide-react';

import { CardActionSummary } from './tool-card-actions';
import { MetaChip, ProductCardDetails } from './tool-card-shared';
import {
  normalizePublicIntentApplicationView,
  type SchemaDrivenAssistantCard,
} from './tool-ui-schema';

export function PublicIntentApplicationCard({
  card,
}: {
  card: SchemaDrivenAssistantCard;
}) {
  const application = normalizePublicIntentApplicationView(card);
  const isPending = application.status === 'pending';
  const isAccepted = application.status === 'accepted';
  const statusClass = isPending
    ? 'bg-amber-50 text-amber-800 ring-amber-100'
    : isAccepted
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
      : 'bg-slate-100 text-slate-600 ring-slate-200';

  return (
    <article
      className="w-full overflow-hidden rounded-[22px] border border-slate-200/80 bg-white text-slate-900 shadow-[0_10px_30px_rgba(15,23,42,0.08)]"
      data-testid="public-intent-application-card"
      data-card-model="assistant-ui-public-intent-application-card"
      data-product-component="PublicIntentApplicationCard"
    >
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-teal-700">约练报名申请</p>
            <h3 className="mt-1 text-xl font-semibold leading-tight text-slate-950">
              {application.publicIntentTitle}
            </h3>
          </div>
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusClass}`}
          >
            {application.statusLabel}
          </span>
        </div>

        <section className="mt-5 flex items-start gap-4 rounded-2xl border border-teal-100 bg-teal-50/55 px-4 py-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-teal-700 ring-1 ring-teal-100">
            <UserRound className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-950">
              {application.applicantName}
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-700">
              {application.message}
            </p>
          </div>
        </section>

        <div className="mt-4 flex flex-wrap gap-2">
          <MetaChip
            icon={<ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />}
            label="接受后才开聊"
          />
          <MetaChip
            icon={<MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />}
            label={application.conversationId ? '会话已创建' : '会话待确认'}
          />
          {application.meetId ? (
            <MetaChip
              icon={<CalendarCheck2 className="h-3.5 w-3.5" aria-hidden="true" />}
              label={`约练 #${String(application.meetId)}`}
            />
          ) : null}
        </div>

        <ProductCardDetails title="安全边界">
          <p className="text-xs leading-5 text-slate-600">
            {application.safetyBoundary}
          </p>
        </ProductCardDetails>

        <CardActionSummary card={card} actions={card.actions} />

        {application.messagesHref ? (
          <a
            href={application.messagesHref}
            className="mt-3 inline-flex text-sm font-semibold text-teal-700 hover:text-teal-800"
          >
            去消息页继续
          </a>
        ) : null}
      </div>
    </article>
  );
}
