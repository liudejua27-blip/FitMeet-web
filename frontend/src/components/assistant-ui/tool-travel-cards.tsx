import { useMemo, useState, type ReactNode } from 'react';
import {
  BedDouble,
  CalendarDays,
  Camera,
  Loader2,
  MapPin,
  Plane,
  ShieldCheck,
  Tags,
  Train,
  UsersRound,
  Utensils,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';

import { useFitMeetToolUIActions } from './tool-ui-actions';
import type { SchemaDrivenAssistantCard, ToolUISchemaAction } from './tool-ui-schema';

type TravelFormState = {
  destination: string;
  departureTime: string;
  duration: string;
  budgetRange: string;
  transportMode: string;
  tags: string;
  genderPreference: string;
  photoPreference: string;
  accommodationPreference: string;
  foodPreference: string;
  candidatePreference: string;
  safetyBoundary: string;
};

const defaultSafety =
  '默认安全设置：先站内沟通，确认行程前不交换联系方式，不公开证件、酒店或精确住址。';

export function TravelIntakeCard({ card }: { card: SchemaDrivenAssistantCard }) {
  const toolActions = useFitMeetToolUIActions();
  const [form, setForm] = useState<TravelFormState>(() => ({
    destination: stringValue(card.data.destination),
    departureTime: stringValue(card.data.departureTime),
    duration: stringValue(card.data.duration),
    budgetRange: stringValue(card.data.budgetRange),
    transportMode: stringValue(card.data.transportMode),
    tags: listValue(card.data.tags).join('、'),
    genderPreference: stringValue(card.data.genderPreference),
    photoPreference: stringValue(card.data.photoPreference),
    accommodationPreference: stringValue(card.data.accommodationPreference),
    foodPreference: stringValue(card.data.foodPreference),
    candidatePreference: stringValue(card.data.candidatePreference),
    safetyBoundary: stringValue(card.data.safetyBoundary) || defaultSafety,
  }));
  const [status, setStatus] = useState<{
    key: string | null;
    message: string | null;
    error: string | null;
  }>({ key: null, message: null, error: null });
  const missing = useMemo(
    () => normalizeMissing(card.data.missingFields),
    [card.data.missingFields],
  );
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
          slots: schemaAction === 'travel_intake.cancel' ? {} : payloadSlots(form),
        },
      });
      setStatus({ key: null, message: response?.assistantMessage || label, error: null });
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
      className="w-full overflow-hidden rounded-[22px] border border-cyan-100 bg-white text-slate-900 shadow-[0_10px_30px_rgba(15,23,42,0.08)]"
      data-testid="travel-intake-card"
      data-product-component="TravelIntakeCard"
    >
      <div className="border-b border-cyan-100 bg-gradient-to-br from-cyan-50 via-white to-teal-50 px-4 py-4 sm:px-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-cyan-700 text-white shadow-[0_10px_22px_rgba(14,116,144,0.22)]">
            <Plane className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-cyan-700">Travel Loop MVP</p>
            <h3 className="mt-1 text-lg font-semibold leading-7 text-slate-950">{card.title}</h3>
            {card.body ? (
              <p className="mt-1 text-sm leading-6 text-slate-600">{card.body}</p>
            ) : null}
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
          <Field
            icon={MapPin}
            label="目的地"
            value={form.destination}
            placeholder="成都 / 大理 / 三亚"
            onChange={(value) => setForm((prev) => ({ ...prev, destination: value }))}
          />
          <Field
            icon={CalendarDays}
            label="出发时间"
            value={form.departureTime}
            placeholder="周末 / 下周末 / 国庆"
            onChange={(value) => setForm((prev) => ({ ...prev, departureTime: value }))}
          />
          <Field
            icon={CalendarDays}
            label="行程时长"
            value={form.duration}
            placeholder="两天一晚 / 三天两晚"
            onChange={(value) => setForm((prev) => ({ ...prev, duration: value }))}
          />
          <Field
            icon={Wallet}
            label="预算"
            value={form.budgetRange}
            placeholder="人均1000元 / AA / 穷游"
            onChange={(value) => setForm((prev) => ({ ...prev, budgetRange: value }))}
          />
          <Field
            icon={Train}
            label="交通方式"
            value={form.transportMode}
            placeholder="高铁 / 飞机 / 自驾"
            onChange={(value) => setForm((prev) => ({ ...prev, transportMode: value }))}
          />
          <Field
            icon={Tags}
            label="旅行标签"
            value={form.tags}
            placeholder="美食、拍照、徒步"
            onChange={(value) => setForm((prev) => ({ ...prev, tags: value }))}
          />
          <Field
            icon={UsersRound}
            label="性别偏好"
            value={form.genderPreference}
            placeholder="不限 / 女生 / 男生"
            onChange={(value) => setForm((prev) => ({ ...prev, genderPreference: value }))}
          />
          <Field
            icon={Camera}
            label="拍照偏好"
            value={form.photoPreference}
            placeholder="会拍照优先 / 低拍照需求"
            onChange={(value) => setForm((prev) => ({ ...prev, photoPreference: value }))}
          />
          <Field
            icon={BedDouble}
            label="住宿偏好"
            value={form.accommodationPreference}
            placeholder="不拼房 / 酒店 / 青旅"
            onChange={(value) => setForm((prev) => ({ ...prev, accommodationPreference: value }))}
          />
          <Field
            icon={Utensils}
            label="饮食偏好"
            value={form.foodPreference}
            placeholder="美食探店 / 能吃辣 / 清淡"
            onChange={(value) => setForm((prev) => ({ ...prev, foodPreference: value }))}
          />
        </div>

        <label className="block rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
          <span className="text-xs font-semibold text-slate-500">希望匹配的人</span>
          <textarea
            value={form.candidatePreference}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, candidatePreference: event.target.value }))
            }
            placeholder="例如：预算相近、同城出发、不赶路、会拍照"
            rows={2}
            className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-cyan-600 focus:ring-4 focus:ring-cyan-500/10"
          />
        </label>

        <label className="block rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-3">
          <span className="flex items-center gap-2 text-xs font-semibold text-emerald-800">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            安全边界
          </span>
          <textarea
            value={form.safetyBoundary}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, safetyBoundary: event.target.value }))
            }
            rows={2}
            className="mt-2 w-full resize-none rounded-xl border border-emerald-100 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <ActionButton
            busy={status.key === 'travel_intake.submit'}
            onClick={() =>
              void run('travel_intake.submit', '已收到旅行需求，我正在生成旅行寻伴卡。')
            }
          >
            生成旅行寻伴卡
          </ActionButton>
          <ActionButton
            busy={status.key === 'travel_intake.use_defaults'}
            tone="secondary"
            onClick={() => void run('travel_intake.use_defaults', '已使用默认安全设置继续。')}
          >
            使用默认安全设置
          </ActionButton>
          <ActionButton
            busy={status.key === 'travel_intake.cancel'}
            tone="ghost"
            onClick={() => void run('travel_intake.cancel', '已取消这次旅行寻伴卡。')}
          >
            <X className="h-4 w-4" aria-hidden="true" />
            取消
          </ActionButton>
        </div>

        <StatusMessage status={status} />
      </div>
    </article>
  );
}

export function TravelDraftCard({ card }: { card: SchemaDrivenAssistantCard }) {
  const toolActions = useFitMeetToolUIActions();
  const [status, setStatus] = useState<{
    key: string | null;
    message: string | null;
    error: string | null;
  }>({ key: null, message: null, error: null });
  const taskId = numberValue(card.data.taskId);
  const actionPayload = {
    taskId,
    socialRequestId: card.data.socialRequestId,
    slots: card.data,
    socialRequestDraft: card.data.socialRequestDraft,
  };

  const run = async (schemaAction: ToolUISchemaAction, label: string) => {
    if (!toolActions.onCardAction || !taskId) return;
    setStatus({ key: schemaAction, message: null, error: null });
    try {
      const response = await toolActions.onCardAction({
        taskId,
        cardId: card.id,
        action: schemaAction,
        schemaAction,
        payload: actionPayload,
      });
      setStatus({ key: null, message: response?.assistantMessage || label, error: null });
    } catch (error) {
      setStatus({
        key: null,
        message: null,
        error: error instanceof Error ? error.message : '当前动作可以重试。',
      });
    }
  };

  const tags = listValue(card.data.tags);
  return (
    <article
      className="w-full overflow-hidden rounded-[22px] border border-cyan-100 bg-white text-slate-900 shadow-[0_10px_30px_rgba(15,23,42,0.08)]"
      data-testid="travel-draft-card"
      data-product-component="TravelDraftCard"
    >
      <div className="border-b border-cyan-100 bg-gradient-to-br from-cyan-50 via-white to-teal-50 px-4 py-4 sm:px-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-cyan-700 text-white">
            <Plane className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-cyan-700">Travel Loop Draft</p>
            <h3 className="mt-1 text-lg font-semibold leading-7 text-slate-950">{card.title}</h3>
            {card.body ? (
              <p className="mt-1 text-sm leading-6 text-slate-600">{card.body}</p>
            ) : null}
          </div>
        </div>
      </div>
      <div className="space-y-4 px-4 py-4 sm:px-5">
        <dl className="grid gap-3 sm:grid-cols-2">
          <SummaryItem label="目的地" value={stringValue(card.data.destination) || '目的地待定'} />
          <SummaryItem label="出发时间" value={stringValue(card.data.departureTime) || '待确认'} />
          <SummaryItem label="行程时长" value={stringValue(card.data.duration) || '待确认'} />
          <SummaryItem label="预算" value={stringValue(card.data.budgetRange) || '待确认'} />
          <SummaryItem label="交通" value={stringValue(card.data.transportMode) || '待确认'} />
          <SummaryItem label="标签" value={tags.length ? tags.join('、') : '不限'} />
        </dl>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-3 text-sm leading-6 text-emerald-800">
          {stringValue(card.data.safetyBoundary) || defaultSafety}
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton
            busy={status.key === 'travel_draft.private_match'}
            onClick={() => void run('travel_draft.private_match', '已进入私密旅行匹配。')}
          >
            不公开，开始私密匹配
          </ActionButton>
          <ActionButton
            busy={status.key === 'travel_draft.edit'}
            tone="secondary"
            onClick={() => void run('travel_draft.edit', '可以继续修改旅行寻伴需求。')}
          >
            修改
          </ActionButton>
          <ActionButton
            busy={status.key === 'travel_draft.cancel'}
            tone="ghost"
            onClick={() => void run('travel_draft.cancel', '已取消这次旅行寻伴卡。')}
          >
            <X className="h-4 w-4" aria-hidden="true" />
            取消
          </ActionButton>
        </div>
        <StatusMessage status={status} />
      </div>
    </article>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  value,
  placeholder,
  onChange,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
      <span className="flex items-center gap-2 text-xs font-semibold text-slate-500">
        <Icon className="h-4 w-4 text-cyan-700" aria-hidden="true" />
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-cyan-600 focus:ring-4 focus:ring-cyan-500/10"
      />
    </label>
  );
}

function ActionButton({
  busy,
  tone = 'primary',
  onClick,
  children,
}: {
  busy?: boolean;
  tone?: 'primary' | 'secondary' | 'ghost';
  onClick: () => void;
  children: ReactNode;
}) {
  const className =
    tone === 'primary'
      ? 'bg-cyan-700 text-white hover:bg-cyan-800'
      : tone === 'secondary'
        ? 'bg-slate-900 text-white hover:bg-slate-800'
        : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50';
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className={`inline-flex min-h-10 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

function StatusMessage({ status }: { status: { message: string | null; error: string | null } }) {
  if (status.message) {
    return (
      <p
        className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm leading-6 text-emerald-800"
        role="status"
      >
        {status.message}
      </p>
    );
  }
  if (status.error) {
    return (
      <p
        className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-700"
        role="alert"
      >
        {status.error}
      </p>
    );
  }
  return null;
}

function payloadSlots(form: TravelFormState) {
  return {
    destination: form.destination.trim(),
    departureTime: form.departureTime.trim(),
    duration: form.duration.trim(),
    budgetRange: form.budgetRange.trim(),
    transportMode: form.transportMode.trim(),
    tags: splitTags(form.tags),
    genderPreference: form.genderPreference.trim(),
    photoPreference: form.photoPreference.trim(),
    accommodationPreference: form.accommodationPreference.trim(),
    foodPreference: form.foodPreference.trim(),
    candidatePreference: form.candidatePreference.trim(),
    safetyBoundary: form.safetyBoundary.trim() || defaultSafety,
    visibilityPreference: 'private',
  };
}

function splitTags(value: string) {
  return value
    .split(/[、,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function listValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => stringValue(item)).filter(Boolean);
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function numberValue(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeMissing(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => stringValue(item)).filter(Boolean);
}

function missingLabel(key: string) {
  if (key === 'destination') return '目的地';
  if (key === 'departureTime') return '出发时间';
  if (key === 'budgetRange') return '预算';
  if (key === 'transportMode') return '交通方式';
  return key;
}
