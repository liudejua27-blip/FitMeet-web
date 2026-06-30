import { CalendarClock, MapPin, ShieldCheck, SlidersHorizontal, Dumbbell } from 'lucide-react';

import { CardActionSummary } from './tool-card-actions';
import type { SchemaDrivenAssistantCard } from './tool-ui-schema';

export function WorkoutDraftCard({ card }: { card: SchemaDrivenAssistantCard }) {
  const facts = [
    { icon: Dumbbell, label: '活动', value: stringValue(card.data.activityType) || '运动' },
    { icon: CalendarClock, label: '时间', value: stringValue(card.data.timePreference) || '待确认' },
    { icon: MapPin, label: '地点', value: stringValue(card.data.locationText) || '待确认' },
    { icon: SlidersHorizontal, label: '范围', value: `${numberValue(card.data.radiusKm) ?? 3}km` },
  ];
  const preference = stringValue(card.data.candidatePreference);
  const safety = stringValue(card.data.safetyBoundary);
  const visibility =
    stringValue(card.data.visibilityPreference) === 'private' ? '不公开，继续私密匹配' : '发布前确认';

  return (
    <article
      className="w-full overflow-hidden rounded-[22px] border border-teal-100 bg-white text-slate-900 shadow-[0_10px_30px_rgba(15,23,42,0.08)]"
      data-testid="workout-draft-card"
      data-product-component="WorkoutDraftCard"
    >
      <div className="border-b border-teal-100 bg-gradient-to-br from-teal-50 via-white to-emerald-50 px-4 py-4 sm:px-5">
        <p className="text-sm font-semibold text-teal-700">约练卡草稿</p>
        <h3 className="mt-1 text-xl font-semibold leading-8 text-slate-950">{card.title}</h3>
        {card.body ? <p className="mt-1 text-sm leading-6 text-slate-600">{card.body}</p> : null}
      </div>
      <div className="space-y-4 px-4 py-4 sm:px-5">
        <dl className="grid gap-3 sm:grid-cols-2">
          {facts.map((fact) => {
            const Icon = fact.icon;
            return (
              <div key={fact.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                <dt className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                  <Icon className="h-4 w-4 text-teal-700" aria-hidden="true" />
                  {fact.label}
                </dt>
                <dd className="mt-1 truncate text-sm font-semibold text-slate-950">{fact.value}</dd>
              </div>
            );
          })}
        </dl>
        <section className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
            <ShieldCheck className="h-4 w-4 text-emerald-700" aria-hidden="true" />
            安全设置
          </p>
          <p className="mt-1 text-xs leading-5 text-emerald-800">
            {safety || '公共场所、站内沟通、不交换联系方式、不公开精确位置'}
          </p>
        </section>
        <div className="grid gap-2 text-sm leading-6 text-slate-700 sm:grid-cols-2">
          <p className="rounded-2xl border border-slate-200 px-3 py-2">
            匹配偏好：{preference || '不限制，优先安全和时间地点匹配'}
          </p>
          <p className="rounded-2xl border border-slate-200 px-3 py-2">公开设置：{visibility}</p>
        </div>
        <CardActionSummary card={card} actions={card.actions} />
      </div>
    </article>
  );
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
