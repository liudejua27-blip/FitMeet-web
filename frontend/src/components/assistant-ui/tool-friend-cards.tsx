import { useMemo, useState, type ReactNode } from 'react';
import {
  Loader2,
  MapPin,
  MessageCircle,
  ShieldCheck,
  Tags,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';

import { useFitMeetToolUIActions } from './tool-ui-actions';
import type { SchemaDrivenAssistantCard, ToolUISchemaAction } from './tool-ui-schema';

type FriendFormState = {
  friendGoal: string;
  city: string;
  locationText: string;
  topicTags: string;
  genderPreference: string;
  bodyPreference: string;
  appearancePreference: string;
  scenePreference: string;
  timePreference: string;
  candidatePreference: string;
  safetyBoundary: string;
};

const defaultSafety = '默认安全设置：站内先聊、低压力认识、不交换联系方式、不公开精确位置';

export function FriendIntakeCard({ card }: { card: SchemaDrivenAssistantCard }) {
  const toolActions = useFitMeetToolUIActions();
  const [form, setForm] = useState<FriendFormState>(() => ({
    friendGoal: stringValue(card.data.friendGoal),
    city: stringValue(card.data.city),
    locationText: stringValue(card.data.locationText),
    topicTags: listValue(card.data.topicTags).join('、'),
    genderPreference: stringValue(card.data.genderPreference),
    bodyPreference: stringValue(card.data.bodyPreference),
    appearancePreference: stringValue(card.data.appearancePreference),
    scenePreference: stringValue(card.data.scenePreference),
    timePreference: stringValue(card.data.timePreference),
    candidatePreference: stringValue(card.data.candidatePreference),
    safetyBoundary: stringValue(card.data.safetyBoundary) || defaultSafety,
  }));
  const [status, setStatus] = useState<{
    key: string | null;
    message: string | null;
    error: string | null;
  }>({
    key: null,
    message: null,
    error: null,
  });
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
          slots: schemaAction === 'friend_intake.cancel' ? {} : payloadSlots(form),
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
      className="w-full overflow-hidden rounded-[22px] border border-sky-100 bg-white text-slate-900 shadow-[0_10px_30px_rgba(15,23,42,0.08)]"
      data-testid="friend-intake-card"
      data-product-component="FriendIntakeCard"
    >
      <div className="border-b border-sky-100 bg-gradient-to-br from-sky-50 via-white to-cyan-50 px-4 py-4 sm:px-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-600 text-white shadow-[0_10px_22px_rgba(2,132,199,0.22)]">
            <UsersRound className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-sky-700">Friend Loop MVP</p>
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
            icon={UsersRound}
            label="交友目标"
            value={form.friendGoal}
            placeholder="认识新朋友 / 聊天搭子"
            onChange={(value) => setForm((prev) => ({ ...prev, friendGoal: value }))}
          />
          <Field
            icon={MapPin}
            label="城市"
            value={form.city}
            placeholder="青岛 / 上海 / 成都"
            onChange={(value) => setForm((prev) => ({ ...prev, city: value }))}
          />
          <Field
            icon={MapPin}
            label="地点范围"
            value={form.locationText}
            placeholder="市南区 / 学校附近 / 公司附近"
            onChange={(value) => setForm((prev) => ({ ...prev, locationText: value }))}
          />
          <Field
            icon={Tags}
            label="兴趣话题"
            value={form.topicTags}
            placeholder="咖啡、电影、摄影"
            onChange={(value) => setForm((prev) => ({ ...prev, topicTags: value }))}
          />
          <Field
            icon={UsersRound}
            label="性别偏好"
            value={form.genderPreference}
            placeholder="不限性别 / 女生优先 / 男生优先"
            onChange={(value) => setForm((prev) => ({ ...prev, genderPreference: value }))}
          />
          <Field
            icon={UsersRound}
            label="身材偏好"
            value={form.bodyPreference}
            placeholder="身材不限 / 爱运动 / 健康体型"
            onChange={(value) => setForm((prev) => ({ ...prev, bodyPreference: value }))}
          />
          <Field
            icon={UsersRound}
            label="外观偏好"
            value={form.appearancePreference}
            placeholder="外貌不限 / 清爽 / 照片真实"
            onChange={(value) => setForm((prev) => ({ ...prev, appearancePreference: value }))}
          />
          <Field
            icon={MessageCircle}
            label="场景偏好"
            value={form.scenePreference}
            placeholder="先站内聊天 / 同城低压力认识"
            onChange={(value) => setForm((prev) => ({ ...prev, scenePreference: value }))}
          />
        </div>

        <Field
          icon={MessageCircle}
          label="时间偏好"
          value={form.timePreference}
          placeholder="下班后 / 周末 / 晚上"
          onChange={(value) => setForm((prev) => ({ ...prev, timePreference: value }))}
        />

        <label className="block rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
          <span className="text-xs font-semibold text-slate-500">希望匹配的人</span>
          <textarea
            value={form.candidatePreference}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, candidatePreference: event.target.value }))
            }
            placeholder="例如：兴趣相近、低压力、资料公开完整的人优先"
            rows={2}
            className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10"
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
            busy={status.key === 'friend_intake.submit'}
            onClick={() => void run('friend_intake.submit', '已收到交友需求，我正在生成交友卡。')}
          >
            生成交友卡
          </ActionButton>
          <ActionButton
            busy={status.key === 'friend_intake.use_defaults'}
            tone="secondary"
            onClick={() => void run('friend_intake.use_defaults', '已使用默认安全设置继续。')}
          >
            使用默认安全设置
          </ActionButton>
          <ActionButton
            busy={status.key === 'friend_intake.cancel'}
            tone="ghost"
            onClick={() => void run('friend_intake.cancel', '已取消这次交友卡。')}
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

export function FriendDraftCard({ card }: { card: SchemaDrivenAssistantCard }) {
  const toolActions = useFitMeetToolUIActions();
  const [status, setStatus] = useState<{
    key: string | null;
    message: string | null;
    error: string | null;
  }>({
    key: null,
    message: null,
    error: null,
  });
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

  const tags = listValue(card.data.topicTags);
  return (
    <article
      className="w-full overflow-hidden rounded-[22px] border border-sky-100 bg-white text-slate-900 shadow-[0_10px_30px_rgba(15,23,42,0.08)]"
      data-testid="friend-draft-card"
      data-product-component="FriendDraftCard"
    >
      <div className="border-b border-sky-100 bg-gradient-to-br from-sky-50 via-white to-cyan-50 px-4 py-4 sm:px-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-600 text-white">
            <UsersRound className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-sky-700">Friend Loop Draft</p>
            <h3 className="mt-1 text-lg font-semibold leading-7 text-slate-950">{card.title}</h3>
            {card.body ? (
              <p className="mt-1 text-sm leading-6 text-slate-600">{card.body}</p>
            ) : null}
          </div>
        </div>
      </div>
      <div className="space-y-4 px-4 py-4 sm:px-5">
        <dl className="grid gap-3 sm:grid-cols-2">
          <SummaryItem label="目标" value={stringValue(card.data.friendGoal) || '认识新朋友'} />
          <SummaryItem label="城市" value={stringValue(card.data.city) || '同城'} />
          <SummaryItem label="地点范围" value={stringValue(card.data.locationText) || '同城'} />
          <SummaryItem label="兴趣话题" value={tags.length ? tags.join('、') : '不限'} />
          <SummaryItem label="性别偏好" value={stringValue(card.data.genderPreference) || '不限'} />
          <SummaryItem label="身材偏好" value={stringValue(card.data.bodyPreference) || '不限'} />
          <SummaryItem
            label="外观偏好"
            value={stringValue(card.data.appearancePreference) || '不限'}
          />
          <SummaryItem
            label="场景"
            value={stringValue(card.data.scenePreference) || '先站内聊天'}
          />
        </dl>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-3 text-sm leading-6 text-emerald-800">
          {stringValue(card.data.safetyBoundary) || defaultSafety}
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton
            busy={status.key === 'friend_draft.publish'}
            onClick={() => void run('friend_draft.publish', '已发布到发现，并进入交友匹配队列。')}
          >
            发布到发现
          </ActionButton>
          <ActionButton
            busy={status.key === 'friend_draft.private_match'}
            tone="secondary"
            onClick={() => void run('friend_draft.private_match', '已进入私密匹配。')}
          >
            不公开，开始私密匹配
          </ActionButton>
          <ActionButton
            busy={status.key === 'friend_draft.edit'}
            tone="ghost"
            onClick={() => void run('friend_draft.edit', '可以继续修改交友需求。')}
          >
            修改
          </ActionButton>
          <ActionButton
            busy={status.key === 'friend_draft.cancel'}
            tone="ghost"
            onClick={() => void run('friend_draft.cancel', '已取消这次交友卡。')}
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
        <Icon className="h-4 w-4 text-sky-700" aria-hidden="true" />
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10"
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
      ? 'bg-sky-600 text-white hover:bg-sky-700'
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

function payloadSlots(form: FriendFormState) {
  return {
    friendGoal: form.friendGoal.trim(),
    city: form.city.trim(),
    locationText: form.locationText.trim(),
    topicTags: splitTags(form.topicTags),
    genderPreference: form.genderPreference.trim(),
    bodyPreference: form.bodyPreference.trim(),
    appearancePreference: form.appearancePreference.trim(),
    scenePreference: form.scenePreference.trim(),
    timePreference: form.timePreference.trim(),
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
  if (key === 'friendGoal') return '交友目标';
  if (key === 'city') return '城市';
  if (key === 'locationText') return '地点范围';
  if (key === 'topicTags') return '兴趣话题';
  if (key === 'genderPreference') return '性别偏好';
  if (key === 'bodyPreference') return '身材偏好';
  if (key === 'appearancePreference') return '外观偏好';
  return key;
}
