import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import {
  socialProfileApi,
  type UserSocialProfile,
} from '../api/socialProfileApi';
import {
  socialRequestsApi,
  type SocialRequestType,
} from '../api/socialRequestsApi';

const TYPE_OPTIONS: { value: SocialRequestType; label: string }[] = [
  { value: 'coffee_chat', label: '咖啡轻聊' },
  { value: 'running_partner', label: '跑步搭子' },
  { value: 'fitness_partner', label: '健身搭子' },
  { value: 'dog_walking', label: '遛狗搭子' },
  { value: 'city_walk', label: '城市散步' },
  { value: 'study_partner', label: '学习搭子' },
  { value: 'custom', label: '自定义' },
];

const REQUIRED_CHECKS = [
  { id: 'publish', label: '我确认发布以上社交卡片', required: true },
  {
    id: 'match',
    label: '我允许系统根据这张卡片和我的 AI 画像推荐候选人',
    required: true,
  },
  {
    id: 'invite',
    label: '我允许系统生成邀请话术，但发送前仍需要我确认',
    required: false,
  },
  {
    id: 'privacy',
    label: '我不会公开精确住址、手机号、微信号等敏感信息',
    required: true,
  },
];

interface DraftState {
  type: SocialRequestType;
  title: string;
  description: string;
  city: string;
  radiusKm: number;
  rawText: string;
  timeStart?: string;
  timeEnd?: string;
  interestTags: string[];
  locationPreference: string;
  timePreference: string;
  socialGoal: string;
  personalityPreference: string[];
  riskNotes: string[];
  privacyNotes: string[];
}

export function SocialRequestAiPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserSocialProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [rawText, setRawText] = useState('');
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [tagsText, setTagsText] = useState('');
  const [personalityText, setPersonalityText] = useState('');
  const [mode, setMode] = useState<'ai' | 'fallback' | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    socialProfileApi
      .get()
      .then((nextProfile) => {
        if (!cancelled) setProfile(nextProfile);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const profileSummary = useMemo(() => buildProfileSummary(profile), [profile]);
  const allRequiredChecked = REQUIRED_CHECKS.filter((item) => item.required).every(
    (item) => checks[item.id],
  );

  async function generateDraft() {
    if (rawText.trim().length < 2) {
      setError('请先告诉 AI 你想认识什么样的人。');
      return;
    }

    setDrafting(true);
    setError(null);

    try {
      const result = await socialRequestsApi.aiDraft(rawText.trim());
      const draftPayload = result.draft;
      const card = result.card;
      const interestTags = card.interestTags?.length
        ? card.interestTags
        : draftPayload.interestTags ?? [];
      const personalityPreference = card.personalityPreference ?? [];

      setDraft({
        type: draftPayload.type,
        title: card.title || draftPayload.title || '',
        description: card.description || draftPayload.description || '',
        city: draftPayload.city || profile?.city || '',
        radiusKm: draftPayload.radiusKm || 5,
        rawText: draftPayload.rawText || rawText.trim(),
        timeStart: draftPayload.timeStart,
        timeEnd: draftPayload.timeEnd,
        interestTags,
        locationPreference: card.locationPreference || profile?.nearbyArea || '',
        timePreference: card.timePreference || '',
        socialGoal: card.socialGoal || '',
        personalityPreference,
        riskNotes: card.riskNotes || [],
        privacyNotes: card.privacyNotes || [],
      });
      setTagsText(interestTags.join('、'));
      setPersonalityText(personalityPreference.join('、'));
      setMode(result.mode);
      setChecks({});
    } catch (err) {
      setError(formatApiError(err, 'AI 生成社交卡片失败'));
    } finally {
      setDrafting(false);
    }
  }

  function updateDraft<K extends keyof DraftState>(key: K, value: DraftState[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  async function publish() {
    if (!draft) return;
    if (!allRequiredChecked) {
      setError('请先完成必要的发布前确认。');
      return;
    }

    setPublishing(true);
    setError(null);

    try {
      const interestTags = parseList(tagsText);
      const personalityPreference = parseList(personalityText);
      const created = await socialRequestsApi.create({
        type: draft.type,
        title: draft.title || undefined,
        description: draft.description || undefined,
        rawText: draft.rawText || undefined,
        city: draft.city || undefined,
        radiusKm: draft.radiusKm,
        interestTags,
        timeStart: draft.timeStart || undefined,
        timeEnd: draft.timeEnd || undefined,
        metadata: {
          source: 'ai_social_request',
          profileSource: 'users.me.social-profile',
          locationPreference: draft.locationPreference,
          timePreference: draft.timePreference,
          socialGoal: draft.socialGoal,
          personalityPreference,
          riskNotes: draft.riskNotes,
          privacyNotes: draft.privacyNotes,
        },
      });

      await socialRequestsApi.runMatch(created.id, 5).catch(() => undefined);
      const sync = await socialRequestsApi
        .syncPublicIntent(created.id)
        .catch(() => ({ synced: false }));
      const matches = await socialRequestsApi
        .candidates(created.id)
        .catch(() => ({ candidates: [] }));
      const params = new URLSearchParams({
        published: '1',
        synced: sync.synced ? '1' : '0',
        matched: String(matches.candidates.length),
      });

      navigate(`/social-request/${created.id}?${params.toString()}`);
    } catch (err) {
      setError(formatApiError(err, '发布失败'));
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0d0d0b] text-[#F4EFE6]">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <header className="space-y-3">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#C8FF80]">
            AI 社交卡片
          </p>
          <h1 className="text-3xl font-light leading-snug">
            基于我的 AI 画像，生成一张可匹配的社交卡片
          </h1>
          <p className="text-sm leading-7 text-[#C7C2B0]">
            AI 画像和社交画像现在是同一份资料。这里不会再保存第二套画像，只会读取
            <Link to="/ai-profile" className="mx-1 font-bold text-[#C8FF80] underline underline-offset-4">
              AI 画像
            </Link>
            中的城市、兴趣、偏好和隐私边界，再生成可发布的约练或交友卡片。
          </p>
        </header>

        <section className="mt-8 rounded-lg border border-[#2b3322] bg-[#11160d] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.22em] text-[#C8FF80]">
                当前 AI 画像
              </div>
              <p className="mt-2 text-sm leading-6 text-[#C7C2B0]">
                {profileLoading
                  ? '正在读取画像...'
                  : profileSummary || '你还没有完善 AI 画像。先去 AI 画像页保存后，推荐会更准确。'}
              </p>
            </div>
            <Link
              to="/ai-profile"
              className="shrink-0 rounded-lg border border-[#C8FF80]/30 px-3 py-2 text-xs font-bold text-[#C8FF80] hover:bg-[#C8FF80]/10"
            >
              完善画像
            </Link>
          </div>
        </section>

        <section className="mt-8 space-y-3">
          <label className="text-xs font-bold uppercase tracking-[0.16em] text-[#8C8A6E]">
            你想认识什么样的人？
          </label>
          <textarea
            value={rawText}
            onChange={(event) => setRawText(event.target.value)}
            placeholder="例如：周六下午想在三里屯找一个对独立电影感兴趣的人喝咖啡聊一小时，性格安静一点就好。"
            rows={5}
            disabled={drafting || publishing}
            className="w-full resize-none rounded-lg border border-[#26261d] bg-[#15150f] px-4 py-3 text-sm text-[#F4EFE6] outline-none placeholder:text-[#5e5d4a] focus:border-[#C8FF80]/60"
          />
          <button
            type="button"
            disabled={drafting || publishing || !rawText.trim()}
            onClick={generateDraft}
            className="w-full rounded-lg bg-[#C8FF80] px-4 py-3 text-sm font-black text-[#0d0d0b] hover:bg-[#b8ef70] disabled:opacity-40"
          >
            {drafting
              ? 'AI 正在生成社交卡片...'
              : draft
                ? '重新生成社交卡片'
                : '用 AI 生成社交卡片'}
          </button>
          {mode && (
            <p className="text-[11px] text-[#8C8A6E]">
              当前模式：{mode === 'ai' ? 'AI 智能生成' : '本地规则兜底生成'}
            </p>
          )}
        </section>

        {error && (
          <div className="mt-5 rounded-lg border border-red-500/40 bg-red-900/20 px-3 py-2 text-xs text-red-200">
            {error}
          </div>
        )}

        {draft && (
          <section className="mt-10 space-y-6 border-t border-[#26261d] pt-8">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#8C8A6E]">
                发布前确认
              </p>
              <h2 className="mt-2 text-xl font-black text-white">
                AI 整理出的社交卡片
              </h2>
              <p className="mt-1 text-xs text-[#8C8A6E]">
                可以修改字段。发布后会自动跑一次匹配，候选人仍需你确认后才能私信或加好友。
              </p>
            </div>

            <Field label="类型">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {TYPE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => updateDraft('type', option.value)}
                    className={`rounded-lg border px-3 py-2 text-sm transition ${
                      draft.type === option.value
                        ? 'border-[#C8FF80] bg-[#C8FF80]/10 text-white'
                        : 'border-[#26261d] text-[#C7C2B0] hover:border-[#6B7A5A]'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="标题">
              <input
                value={draft.title}
                onChange={(event) => updateDraft('title', event.target.value)}
                className="input"
              />
            </Field>

            <Field label="描述">
              <textarea
                value={draft.description}
                onChange={(event) => updateDraft('description', event.target.value)}
                rows={3}
                className="input resize-none"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="城市">
                <input
                  value={draft.city}
                  onChange={(event) => updateDraft('city', event.target.value)}
                  className="input"
                />
              </Field>
              <Field label={`半径 ${draft.radiusKm} km`}>
                <input
                  type="range"
                  min={1}
                  max={50}
                  value={draft.radiusKm}
                  onChange={(event) =>
                    updateDraft('radiusKm', Number(event.target.value))
                  }
                  className="mt-3 w-full accent-[#C8FF80]"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="开始时间">
                <input
                  type="datetime-local"
                  value={toLocalDateTimeValue(draft.timeStart)}
                  onChange={(event) =>
                    updateDraft(
                      'timeStart',
                      event.target.value
                        ? new Date(event.target.value).toISOString()
                        : undefined,
                    )
                  }
                  className="input"
                />
              </Field>
              <Field label="结束时间">
                <input
                  type="datetime-local"
                  value={toLocalDateTimeValue(draft.timeEnd)}
                  onChange={(event) =>
                    updateDraft(
                      'timeEnd',
                      event.target.value
                        ? new Date(event.target.value).toISOString()
                        : undefined,
                    )
                  }
                  className="input"
                />
              </Field>
            </div>

            <Field label="社交目标">
              <input
                value={draft.socialGoal}
                onChange={(event) => updateDraft('socialGoal', event.target.value)}
                placeholder="一起约练 / 兴趣交流 / 拓展朋友"
                className="input"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="地点偏好">
                <input
                  value={draft.locationPreference}
                  onChange={(event) =>
                    updateDraft('locationPreference', event.target.value)
                  }
                  placeholder="室内 / 公园 / 城市步道"
                  className="input"
                />
              </Field>
              <Field label="时间偏好">
                <input
                  value={draft.timePreference}
                  onChange={(event) => updateDraft('timePreference', event.target.value)}
                  placeholder="工作日晚间 / 周末下午"
                  className="input"
                />
              </Field>
            </div>

            <Field label="兴趣标签">
              <input
                value={tagsText}
                onChange={(event) => setTagsText(event.target.value)}
                placeholder="跑步、咖啡、电影"
                className="input"
              />
            </Field>

            <Field label="性格偏好">
              <input
                value={personalityText}
                onChange={(event) => {
                  setPersonalityText(event.target.value);
                  updateDraft('personalityPreference', parseList(event.target.value));
                }}
                placeholder="安静、守时、尊重边界"
                className="input"
              />
            </Field>

            <InfoList
              tone="amber"
              title="安全提醒"
              items={
                draft.riskNotes.length
                  ? draft.riskNotes
                  : ['首次见面建议选择白天、人流量大的公共场所。']
              }
            />

            <InfoList
              tone="sky"
              title="隐私提醒"
              items={
                draft.privacyNotes.length
                  ? draft.privacyNotes
                  : ['不要在公开卡片中填写精确住址、手机号或微信号。']
              }
            />

            <div className="rounded-lg border border-[#26261d] bg-[#15150f] p-4">
              <div className="text-xs font-black uppercase tracking-[0.16em] text-[#8C8A6E]">
                发布前确认
              </div>
              <div className="mt-3 space-y-2">
                {REQUIRED_CHECKS.map((item) => (
                  <label
                    key={item.id}
                    className="flex cursor-pointer items-start gap-2 text-xs text-[#E7DFC9]"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(checks[item.id])}
                      onChange={(event) =>
                        setChecks((current) => ({
                          ...current,
                          [item.id]: event.target.checked,
                        }))
                      }
                      className="mt-0.5 accent-[#C8FF80]"
                    />
                    <span>
                      {item.label}
                      {item.required && <span className="ml-1 text-amber-300">*</span>}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <button
              type="button"
              disabled={publishing || !allRequiredChecked}
              onClick={publish}
              className="w-full rounded-lg bg-[#C8FF80] px-4 py-3 text-sm font-black text-[#0d0d0b] hover:bg-[#b8ef70] disabled:opacity-40"
            >
              {publishing ? '正在发布并匹配...' : '确认发布并匹配候选人'}
            </button>
          </section>
        )}
      </div>

      <style>{`
        .input {
          width: 100%;
          border: 1px solid #26261d;
          border-radius: 8px;
          background: #15150f;
          padding: 9px 12px;
          color: #F4EFE6;
          font-size: 13px;
          outline: none;
        }
        .input:focus { border-color: rgba(200, 255, 128, 0.6); }
        .input::placeholder { color: #5e5d4a; }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-bold uppercase tracking-[0.14em] text-[#8C8A6E]">
        {label}
      </label>
      {children}
    </div>
  );
}

function InfoList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: 'amber' | 'sky';
}) {
  const toneClass =
    tone === 'amber'
      ? 'border-amber-400/30 bg-amber-400/5 text-amber-200'
      : 'border-sky-400/30 bg-sky-400/5 text-sky-200';

  return (
    <div className={`rounded-lg border p-4 ${toneClass}`}>
      <div className="text-xs font-black">{title}</div>
      <ul className="mt-2 list-inside list-disc space-y-1 text-xs leading-6 text-[#E7DFC9]">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function parseList(value: string): string[] {
  return value
    .split(/[,，、\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildProfileSummary(profile: UserSocialProfile | null): string {
  if (!profile) return '';
  const parts = [
    profile.city ? `城市：${profile.city}` : '',
    profile.nearbyArea ? `常活动区域：${profile.nearbyArea}` : '',
    profile.ageRange ? `年龄段：${profile.ageRange}` : '',
    profile.interestTags?.length
      ? `兴趣：${profile.interestTags.slice(0, 5).join('、')}`
      : '',
    profile.fitnessGoals?.length
      ? `目标：${profile.fitnessGoals.slice(0, 3).join('、')}`
      : '',
    profile.privacyBoundary ? `隐私边界：${profile.privacyBoundary}` : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

function toLocalDateTimeValue(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatApiError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const message = err.message || fallback;
    if (err.status === 401 || err.status === 403) {
      return `${message}（请重新登录或检查权限）`;
    }
    if (err.status >= 500) return `${message}（服务暂时不可用）`;
    return message;
  }
  return err instanceof Error ? err.message : fallback;
}

export default SocialRequestAiPage;
