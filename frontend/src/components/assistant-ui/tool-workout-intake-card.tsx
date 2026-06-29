import { useMemo, useState, type ReactNode } from 'react';
import {
  CalendarClock,
  Loader2,
  MapPin,
  ShieldCheck,
  SlidersHorizontal,
  Dumbbell,
  X,
  type LucideIcon,
} from 'lucide-react';

import { useFitMeetToolUIActions } from './tool-ui-actions';
import type { SchemaDrivenAssistantCard, ToolUISchemaAction } from './tool-ui-schema';

type FormState = {
  activityType: string;
  timePreference: string;
  locationText: string;
  city: string;
  radiusKm: string;
  intensity: string;
  candidatePreference: string;
  safetyBoundary: string;
  visibilityPreference: 'public' | 'private';
};

const defaultSafety = '默认安全设置：公共场所、站内沟通、不交换联系方式、不公开精确位置';

export function WorkoutIntakeCard({ card }: { card: SchemaDrivenAssistantCard }) {
  const toolActions = useFitMeetToolUIActions();
  const [form, setForm] = useState<FormState>(() => ({
    activityType: stringValue(card.data.activityType),
    timePreference: stringValue(card.data.timePreference),
    locationText: stringValue(card.data.locationText),
    city: stringValue(card.data.city),
    radiusKm: String(numberValue(card.data.radiusKm) ?? 3),
    intensity: stringValue(card.data.intensity),
    candidatePreference: stringValue(card.data.candidatePreference),
    safetyBoundary: stringValue(card.data.safetyBoundary) || defaultSafety,
    visibilityPreference: stringValue(card.data.visibilityPreference) === 'private' ? 'private' : 'public',
  }));
  const [status, setStatus] = useState<{ key: string | null; message: string | null; error: string | null }>({
    key: null,
    message: null,
    error: null,
  });
  const missing = useMemo(() => normalizeMissing(card.data.missingFields), [card.data.missingFields]);
  const taskId = numberValue(card.data.taskId);

  const run = async (schemaAction: ToolUISchemaAction, label: string) => {
    if (!toolActions.onCardAction || !taskId) return;
    setStatus({ key: schemaAction, message: null, error: null });
    try {
      const response = await toolActions.onCardAction({
        taskId,
        cardId: card.id,
        action: schemaAction,
        schemaAction,
        payload: {
          taskId,
          slots: schemaAction === 'workout_intake.cancel' ? {} : payloadSlots(form, schemaAction),
        },
      });
      setStatus({
        key: null,
        message: response?.assistantMessage || label,
        error: null,
      });
    } catch (error) {
      setStatus({
        key: null,
        message: null,
        error: error instanceof Error ? error.message : '当前动作可以重试。',
      });
    }
  };

  return (
    <article
      className="w-full overflow-hidden rounded-[22px] border border-teal-100 bg-white text-slate-900 shadow-[0_10px_30px_rgba(15,23,42,0.08)]"
      data-testid="workout-intake-card"
      data-product-component="WorkoutIntakeCard"
    >
      <div className="border-b border-teal-100 bg-gradient-to-br from-teal-50 via-white to-emerald-50 px-4 py-4 sm:px-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-teal-600 text-white shadow-[0_10px_22px_rgba(13,148,136,0.22)]">
            <Dumbbell className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-teal-700">Workout Loop MVP</p>
            <h3 className="mt-1 text-lg font-semibold leading-7 text-slate-950">{card.title}</h3>
            {card.body ? <p className="mt-1 text-sm leading-6 text-slate-600">{card.body}</p> : null}
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4 sm:px-5">
        {missing.length > 0 ? (
          <div className="rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
            还差：{missing.map(missingLabel).join('、')}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field icon={Dumbbell} label="运动类型" value={form.activityType} placeholder="跑步 / 健身 / 羽毛球" onChange={(value) => setForm((prev) => ({ ...prev, activityType: value }))} />
          <Field icon={CalendarClock} label="时间" value={form.timePreference} placeholder="今晚 / 周末下午 / 明天晚上" onChange={(value) => setForm((prev) => ({ ...prev, timePreference: value }))} />
          <Field icon={MapPin} label="地点范围" value={form.locationText} placeholder="青岛大学附近 / 五四广场" onChange={(value) => setForm((prev) => ({ ...prev, locationText: value }))} />
          <Field icon={MapPin} label="城市" value={form.city} placeholder="青岛" onChange={(value) => setForm((prev) => ({ ...prev, city: value }))} />
          <Field icon={SlidersHorizontal} label="半径 km" value={form.radiusKm} placeholder="3" inputMode="numeric" onChange={(value) => setForm((prev) => ({ ...prev, radiusKm: value }))} />
          <Field icon={SlidersHorizontal} label="强度" value={form.intensity} placeholder="轻松 / 中等 / 进阶" onChange={(value) => setForm((prev) => ({ ...prev, intensity: value }))} />
        </div>

        <label className="block rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
          <span className="text-xs font-semibold text-slate-500">希望匹配的人</span>
          <textarea
            value={form.candidatePreference}
            onChange={(event) => setForm((prev) => ({ ...prev, candidatePreference: event.target.value }))}
            placeholder="例如：同校、轻松一点、资料公开完整的人优先"
            rows={2}
            className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
          />
        </label>

        <label className="block rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-3">
          <span className="flex items-center gap-2 text-xs font-semibold text-emerald-800">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            安全边界
          </span>
          <textarea
            value={form.safetyBoundary}
            onChange={(event) => setForm((prev) => ({ ...prev, safetyBoundary: event.target.value }))}
            rows={2}
            className="mt-2 w-full resize-none rounded-xl border border-emerald-100 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <Toggle selected={form.visibilityPreference === 'public'} onClick={() => setForm((prev) => ({ ...prev, visibilityPreference: 'public' }))}>
            发布前确认
          </Toggle>
          <Toggle selected={form.visibilityPreference === 'private'} onClick={() => setForm((prev) => ({ ...prev, visibilityPreference: 'private' }))}>
            不公开，先保存
          </Toggle>
        </div>

        <div className="flex flex-wrap gap-2">
          <ActionButton busy={status.key === 'workout_intake.submit'} onClick={() => void run('workout_intake.submit', '已收到约练需求，我正在生成约练卡。')}>
            生成约练卡
          </ActionButton>
          <ActionButton busy={status.key === 'workout_intake.use_defaults'} tone="secondary" onClick={() => void run('workout_intake.use_defaults', '已使用默认安全设置继续。')}>
            使用默认设置
          </ActionButton>
          <ActionButton busy={status.key === 'workout_intake.cancel'} tone="ghost" onClick={() => void run('workout_intake.cancel', '已取消这次约练卡。')}>
            <X className="h-4 w-4" aria-hidden="true" />
            取消
          </ActionButton>
        </div>

        {status.message ? (
          <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm leading-6 text-emerald-800" role="status">
            {status.message}
          </p>
        ) : null}
        {status.error ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-700" role="alert">
            {status.error}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function Field({
  icon: Icon,
  label,
  value,
  placeholder,
  inputMode,
  onChange,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  placeholder: string;
  inputMode?: 'numeric';
  onChange: (value: string) => void;
}) {
  return (
    <label className="block rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
      <span className="flex items-center gap-2 text-xs font-semibold text-slate-500">
        <Icon className="h-4 w-4 text-teal-700" aria-hidden="true" />
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
      />
    </label>
  );
}

function Toggle({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        selected
          ? 'rounded-full bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white shadow-[0_8px_18px_rgba(13,148,136,0.22)]'
          : 'rounded-full bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200'
      }
    >
      {children}
    </button>
  );
}

function ActionButton({
  busy,
  tone = 'primary',
  onClick,
  children,
}: {
  busy: boolean;
  tone?: 'primary' | 'secondary' | 'ghost';
  onClick: () => void;
  children: ReactNode;
}) {
  const className =
    tone === 'primary'
      ? 'bg-teal-600 text-white ring-teal-600 hover:bg-teal-700'
      : tone === 'secondary'
        ? 'bg-white text-teal-700 ring-teal-500/70 hover:bg-teal-50'
        : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50';
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ring-1 transition ${className} ${busy ? 'cursor-wait opacity-70' : ''}`}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

function payloadSlots(form: FormState, schemaAction: ToolUISchemaAction) {
  return {
    activityType: form.activityType.trim() || undefined,
    timePreference: form.timePreference.trim() || undefined,
    locationText: form.locationText.trim() || undefined,
    city: form.city.trim() || undefined,
    radiusKm: numberValue(form.radiusKm) ?? 3,
    intensity: form.intensity.trim() || undefined,
    candidatePreference: form.candidatePreference.trim() || undefined,
    safetyBoundary:
      schemaAction === 'workout_intake.use_defaults'
        ? defaultSafety
        : form.safetyBoundary.trim() || defaultSafety,
    visibilityPreference: form.visibilityPreference,
  };
}

function normalizeMissing(value: unknown): string[] {
  return Array.isArray(value) ? value.map(stringValue).filter(Boolean) : [];
}

function missingLabel(value: string) {
  if (value === 'activityType') return '运动类型';
  if (value === 'timePreference') return '时间';
  if (value === 'locationText') return '地点范围';
  return value;
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
