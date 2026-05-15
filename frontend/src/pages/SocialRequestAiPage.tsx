import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  socialRequestsApi,
  type SocialRequestType,
} from '../api/socialRequestsApi';
import {
  socialProfileApi,
  type UserSocialProfile,
} from '../api/socialProfileApi';
import { ApiError } from '../api/client';

function formatApiError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    const raw =
      (e.payload && typeof e.payload.message === 'string'
        ? e.payload.message
        : Array.isArray(e.payload?.message)
          ? e.payload!.message!.join('；')
          : e.message) || fallback;
    if (e.status >= 500) return `${raw}（服务器繁忙 ${e.status}）`;
    if (e.status === 401 || e.status === 403)
      return `${raw}（请重新登录或检查权限 ${e.status}）`;
    if (e.status >= 400) return `${raw}（${e.status}）`;
    return raw;
  }
  return e instanceof Error ? e.message : fallback;
}

/**
 * AI 社交需求助手 (`/social-request/ai`)
 *
 * 9 字段完整卡片：
 *   title / description / interestTags / locationPreference / timePreference /
 *   socialGoal / personalityPreference  (可编辑)
 *   riskNotes / privacyNotes                                         (只读提示)
 *
 * 流程：
 *   Step 1  自然语言输入  + 展示已读取的画像
 *   Step 2  AI 生成卡片 → 可编辑 → 安全/隐私只读提示
 *   Step 3  发布前 checklist → 满足必要勾选才允许发布
 *           发布走现有 POST /social-requests，title / description / city /
 *           radiusKm / interestTags 持久化为主字段；locationPreference /
 *           timePreference / socialGoal / personalityPreference 等进入 metadata，
 *           用于同步大厅与匹配解释。
 */

const TYPE_OPTIONS: { value: SocialRequestType; label: string }[] = [
  { value: 'coffee_chat', label: '咖啡轻聊' },
  { value: 'running_partner', label: '跑步搭子' },
  { value: 'fitness_partner', label: '健身搭子' },
  { value: 'dog_walking', label: '遛狗搭子' },
  { value: 'city_walk', label: '城市散步' },
  { value: 'study_partner', label: '学习搭子' },
  { value: 'custom', label: '自定义' },
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
  // 9-field card surface
  interestTags: string[];
  locationPreference: string;
  timePreference: string;
  socialGoal: string;
  personalityPreference: string[];
  riskNotes: string[];
  privacyNotes: string[];
}

const REQUIRED_CHECKS = [
  { id: 'publish', label: '我确认发布以上社交需求', required: true },
  {
    id: 'match',
    label: '我允许系统根据该需求推荐候选人',
    required: true,
  },
  {
    id: 'invite',
    label: '我允许系统生成邀约话术',
    required: false,
  },
  {
    id: 'privacy',
    label: '我不会公开精确住址、手机号、微信号等敏感信息',
    required: true,
  },
];

export function SocialRequestAiPage() {
  const navigate = useNavigate();
  const [rawText, setRawText] = useState('');
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [tagsText, setTagsText] = useState('');
  const [personalityText, setPersonalityText] = useState('');
  const [mode, setMode] = useState<'ai' | 'fallback' | null>(null);
  const [profileSummary, setProfileSummary] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string, boolean>>({});

  // 用户社交画像（进入页面时从后端拉取）
  const [profile, setProfile] = useState<UserSocialProfile | null>(null);
  const [profileForm, setProfileForm] = useState<UserSocialProfile | null>(
    null,
  );
  const [profileFormText, setProfileFormText] = useState({
    fitnessGoals: '',
    interestTags: '',
    availableTimes: '',
  });
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSavedAt, setProfileSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await socialProfileApi.get();
        if (cancelled) return;
        setProfile(p);
        setProfileForm(p);
        setProfileFormText({
          fitnessGoals: (p.fitnessGoals || []).join('、'),
          interestTags: (p.interestTags || []).join('、'),
          availableTimes: (p.availableTimes || []).join('、'),
        });
      } catch {
        // 没拿到画像不破坏页面使用。
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function parseList(v: string): string[] {
    return v
      .split(/[,，、\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function updateProfileField<K extends keyof UserSocialProfile>(
    key: K,
    value: UserSocialProfile[K],
  ) {
    setProfileForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function saveProfile() {
    if (!profileForm) return;
    setProfileSaving(true);
    setError(null);
    try {
      const payload = {
        gender: profileForm.gender,
        ageRange: profileForm.ageRange,
        city: profileForm.city,
        nearbyArea: profileForm.nearbyArea,
        fitnessGoals: parseList(profileFormText.fitnessGoals),
        interestTags: parseList(profileFormText.interestTags),
        availableTimes: parseList(profileFormText.availableTimes),
        socialPreference: profileForm.socialPreference,
        rejectRules: profileForm.rejectRules,
        privacyBoundary: profileForm.privacyBoundary,
      };
      const saved = await socialProfileApi.save(payload);
      setProfile(saved);
      setProfileForm(saved);
      setProfileFormText({
        fitnessGoals: (saved.fitnessGoals || []).join('、'),
        interestTags: (saved.interestTags || []).join('、'),
        availableTimes: (saved.availableTimes || []).join('、'),
      });
      setProfileSavedAt(Date.now());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '画像保存失败');
    } finally {
      setProfileSaving(false);
    }
  }

  const allRequiredChecked = REQUIRED_CHECKS.filter((c) => c.required).every(
    (c) => checks[c.id],
  );

  async function generateDraft() {
    if (rawText.trim().length < 2) {
      setError('请先告诉 AI 你想认识什么样的人。');
      return;
    }
    setDrafting(true);
    setError(null);
    try {
      const res = await socialRequestsApi.aiDraft(rawText.trim());
      const d = res.draft;
      const c = res.card;
      setDraft({
        type: d.type,
        title: c.title || d.title || '',
        description: c.description || d.description || '',
        city: d.city || '',
        radiusKm: d.radiusKm || 5,
        rawText: d.rawText || rawText.trim(),
        interestTags: c.interestTags || d.interestTags || [],
        locationPreference: c.locationPreference || '',
        timePreference: c.timePreference || '',
        socialGoal: c.socialGoal || '',
        personalityPreference: c.personalityPreference || [],
        riskNotes: c.riskNotes || [],
        privacyNotes: c.privacyNotes || [],
      });
      setTagsText((c.interestTags || d.interestTags || []).join('、'));
      setPersonalityText((c.personalityPreference || []).join('、'));
      setMode(res.mode);
      const parts: string[] = [];
      if (res.profileUsed.city) parts.push(`城市：${res.profileUsed.city}`);
      if (res.profileUsed.nearbyArea)
        parts.push(`区域：${res.profileUsed.nearbyArea}`);
      if (res.profileUsed.ageRange)
        parts.push(`年龄段：${res.profileUsed.ageRange}`);
      if (res.profileUsed.interestTags?.length)
        parts.push(
          `兴趣：${res.profileUsed.interestTags.slice(0, 5).join('、')}`,
        );
      if (res.profileUsed.fitnessGoals?.length)
        parts.push(
          `目标：${res.profileUsed.fitnessGoals.slice(0, 3).join('、')}`,
        );
      if (res.profileUsed.availableTimes?.length)
        parts.push(
          `可约：${res.profileUsed.availableTimes.slice(0, 3).join('、')}`,
        );
      setProfileSummary(parts.join(' · '));
      setChecks({});
    } catch (e: unknown) {
      setError(formatApiError(e, 'AI 生成失败'));
    } finally {
      setDrafting(false);
    }
  }

  function updateDraft<K extends keyof DraftState>(
    key: K,
    value: DraftState[K],
  ) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function publish() {
    if (!draft) return;
    if (!allRequiredChecked) {
      setError('请先完成必要的发布前确认项。');
      return;
    }
    setPublishing(true);
    setError(null);
    try {
      const tags = tagsText
        .split(/[,，、\s]+/)
        .map((t) => t.trim())
        .filter(Boolean);
      const created = await socialRequestsApi.create({
        type: draft.type,
        title: draft.title || undefined,
        description: draft.description || undefined,
        rawText: draft.rawText || undefined,
        city: draft.city || undefined,
        radiusKm: draft.radiusKm,
        interestTags: tags,
        timeStart: draft.timeStart || undefined,
        timeEnd: draft.timeEnd || undefined,
        metadata: {
          source: 'ai_social_request',
          locationPreference: draft.locationPreference,
          timePreference: draft.timePreference,
          socialGoal: draft.socialGoal,
          personalityPreference: draft.personalityPreference,
          riskNotes: draft.riskNotes,
          privacyNotes: draft.privacyNotes,
        },
      });
      await socialRequestsApi.runMatch(created.id, 5).catch(() => undefined);
      const sync = await socialRequestsApi
        .syncPublicIntent(created.id)
        .catch(() => ({ publicIntentId: '', synced: false }));
      const matches = await socialRequestsApi
        .candidates(created.id)
        .catch(() => ({ candidates: [] as unknown[] }));
      const params = new URLSearchParams({
        published: '1',
        synced: sync.synced ? '1' : '0',
        matched: String(matches.candidates?.length ?? 0),
      });
      navigate(`/social-request/${created.id}?${params.toString()}`);
    } catch (e: unknown) {
      setError(formatApiError(e, '发布失败'));
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0d0d0b] text-[#F4EFE6]">
      <div className="max-w-2xl mx-auto px-6 py-10 space-y-8">
        <header className="space-y-3">
          <div className="text-[10px] uppercase tracking-[0.3em] text-[#C8FF80]">
            AI 社交需求助手
          </div>
          <h1 className="text-2xl sm:text-3xl font-light leading-snug">
            告诉 AI 你想认识什么样的人
          </h1>
          <p className="text-sm text-[#C7C2B0] leading-7">
            告诉 AI 你想认识什么样的人，FitMeet 会帮你整理需求、生成社交卡片，并推荐合适的人选。
          </p>
        </header>

        {/* 用户社交画像（持久化到后端，AI 会基于此生成卡片） */}
        <section className="rounded-xl border border-[#26261d] bg-[#15150f]">
          <button
            type="button"
            onClick={() => setProfileOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-left"
          >
            <div className="space-y-0.5">
              <div className="text-[10px] uppercase tracking-[0.3em] text-[#C8FF80]">
                我的社交画像
              </div>
              <div className="text-xs text-[#C7C2B0]">
                {profileLoading
                  ? '正在读取你的画像…'
                  : profileFilled(profile)
                    ? '已保存 · 进入页面时会自动作为 AI 的输入'
                    : '尚未填写 · 点击展开并保存后，AI 会更懂你'}
              </div>
            </div>
            <span className="text-[#8C8A6E] text-xs">
              {profileOpen ? '收起 ▴' : '展开 ▾'}
            </span>
          </button>
          {profileOpen && profileForm && (
            <div className="border-t border-[#26261d] p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="性别">
                  <input
                    value={profileForm.gender}
                    onChange={(e) =>
                      updateProfileField('gender', e.target.value)
                    }
                    placeholder="女 / 男 / 其他 / 不公开"
                    className="input"
                  />
                </Field>
                <Field label="年龄段">
                  <input
                    value={profileForm.ageRange}
                    onChange={(e) =>
                      updateProfileField('ageRange', e.target.value)
                    }
                    placeholder="例如 25-34"
                    className="input"
                  />
                </Field>
                <Field label="常驻城市">
                  <input
                    value={profileForm.city}
                    onChange={(e) =>
                      updateProfileField('city', e.target.value)
                    }
                    placeholder="北京"
                    className="input"
                  />
                </Field>
                <Field label="常活动区域">
                  <input
                    value={profileForm.nearbyArea}
                    onChange={(e) =>
                      updateProfileField('nearbyArea', e.target.value)
                    }
                    placeholder="朝阳-三里屯"
                    className="input"
                  />
                </Field>
              </div>
              <Field label="健身目标（顿号或逗号分隔）">
                <input
                  value={profileFormText.fitnessGoals}
                  onChange={(e) =>
                    setProfileFormText((p) => ({
                      ...p,
                      fitnessGoals: e.target.value,
                    }))
                  }
                  placeholder="减脂、增肌、塑形"
                  className="input"
                />
              </Field>
              <Field label="兴趣标签（顿号或逗号分隔）">
                <input
                  value={profileFormText.interestTags}
                  onChange={(e) =>
                    setProfileFormText((p) => ({
                      ...p,
                      interestTags: e.target.value,
                    }))
                  }
                  placeholder="跑步、咖啡、独立电影、摄影"
                  className="input"
                />
              </Field>
              <Field label="可约时间（顿号或逗号分隔）">
                <input
                  value={profileFormText.availableTimes}
                  onChange={(e) =>
                    setProfileFormText((p) => ({
                      ...p,
                      availableTimes: e.target.value,
                    }))
                  }
                  placeholder="工作日晚上、周六下午"
                  className="input"
                />
              </Field>
              <Field label="社交偏好">
                <input
                  value={profileForm.socialPreference}
                  onChange={(e) =>
                    updateProfileField('socialPreference', e.target.value)
                  }
                  placeholder="安静、慢热、尊重边界"
                  className="input"
                />
              </Field>
              <Field label="拒绝规则">
                <input
                  value={profileForm.rejectRules}
                  onChange={(e) =>
                    updateProfileField('rejectRules', e.target.value)
                  }
                  placeholder="不接受夜间私人场所约见"
                  className="input"
                />
              </Field>
              <Field label="隐私边界">
                <input
                  value={profileForm.privacyBoundary}
                  onChange={(e) =>
                    updateProfileField('privacyBoundary', e.target.value)
                  }
                  placeholder="不公开手机号 / 工作单位"
                  className="input"
                />
              </Field>
              <div className="flex items-center justify-between pt-2">
                <span className="text-[11px] text-[#5e5d4a]">
                  {profileSavedAt
                    ? '已保存 ✓'
                    : '保存后会作为 AI 生成卡片的输入'}
                </span>
                <button
                  type="button"
                  disabled={profileSaving}
                  onClick={saveProfile}
                  className="px-4 py-2 rounded-lg bg-[#C8FF80] text-[#0d0d0b] text-xs font-medium hover:bg-[#b8ef70] disabled:opacity-40"
                >
                  {profileSaving ? '正在保存…' : '保存画像'}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Step 1: free-text input */}
        <section className="space-y-2">
          <label className="text-xs uppercase tracking-wider text-[#8C8A6E]">
            你想认识什么样的人？
          </label>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="例如：周六下午想在三里屯找一个对独立电影感兴趣的人喝杯咖啡聊一小时，性格安静一点就好。"
            rows={4}
            disabled={drafting || publishing}
            className="w-full bg-[#15150f] border border-[#26261d] rounded-xl px-4 py-3 text-sm placeholder:text-[#5e5d4a] resize-none focus:outline-none focus:border-[#C8FF80]/60"
          />
          <button
            type="button"
            disabled={drafting || publishing || !rawText.trim()}
            onClick={generateDraft}
            className="w-full px-4 py-3 rounded-xl bg-[#C8FF80] text-[#0d0d0b] text-sm font-medium hover:bg-[#b8ef70] disabled:opacity-40"
          >
            {drafting
              ? 'AI 正在整理你的需求...'
              : draft
                ? '重新让 AI 生成'
                : '用 AI 生成社交卡片 →'}
          </button>
          {mode && (
            <p className="text-[11px] text-[#8C8A6E]">
              当前模式：
              {mode === 'ai' ? (
                <span className="text-[#C8FF80]">AI 智能模式（DeepSeek）</span>
              ) : (
                <span className="text-[#C7C2B0]">
                  基础规则模式（未配置 DEEPSEEK_API_KEY 或模型不可用）
                </span>
              )}
            </p>
          )}
          {profileSummary && (
            <p className="text-[11px] text-[#8C8A6E]">
              已读取你的画像 · {profileSummary}
            </p>
          )}
        </section>

        {error && (
          <div className="text-xs text-red-300 bg-red-900/20 border border-red-500/40 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        {/* Step 2: editable card */}
        {draft && (
          <section className="space-y-6 border-t border-[#26261d] pt-8">
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-[0.3em] text-[#8C8A6E]">
                STEP 2 · 检查并编辑
              </div>
              <h2 className="text-lg font-light">AI 为你整理的社交卡片</h2>
              <p className="text-xs text-[#8C8A6E]">
                所有可编辑字段都可以修改，确认后再发布。
              </p>
            </div>

            <div className="space-y-3">
              <label className="text-xs uppercase tracking-wider text-[#8C8A6E]">
                类型
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateDraft('type', opt.value)}
                    className={`px-3 py-2 rounded-xl border text-sm transition ${
                      draft.type === opt.value
                        ? 'border-[#C8FF80] bg-[#C8FF80]/10 text-[#F4EFE6]'
                        : 'border-[#26261d] text-[#C7C2B0] hover:border-[#6B7A5A]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <Field label="标题">
              <input
                value={draft.title}
                onChange={(e) => updateDraft('title', e.target.value)}
                className="input"
              />
            </Field>

            <Field label="需求描述">
              <textarea
                value={draft.description}
                onChange={(e) => updateDraft('description', e.target.value)}
                rows={3}
                className="input resize-none"
              />
            </Field>

            <Field label="社交目标 (socialGoal)">
              <input
                value={draft.socialGoal}
                onChange={(e) => updateDraft('socialGoal', e.target.value)}
                placeholder="一起约练 / 兴趣交流 / 拓展朋友圈"
                className="input"
              />
            </Field>

            <Field label="地点偏好 (locationPreference)">
              <input
                value={draft.locationPreference}
                onChange={(e) =>
                  updateDraft('locationPreference', e.target.value)
                }
                placeholder="室内 / 公园 / 城市步道"
                className="input"
              />
            </Field>

            <Field label="时间偏好 (timePreference)">
              <input
                value={draft.timePreference}
                onChange={(e) => updateDraft('timePreference', e.target.value)}
                placeholder="工作日晚上 / 周末下午"
                className="input"
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="城市">
                <input
                  value={draft.city}
                  onChange={(e) => updateDraft('city', e.target.value)}
                  placeholder="北京"
                  className="input"
                />
              </Field>
              <Field label={`半径 (${draft.radiusKm} km)`}>
                <input
                  type="range"
                  min={1}
                  max={50}
                  value={draft.radiusKm}
                  onChange={(e) =>
                    updateDraft('radiusKm', Number(e.target.value))
                  }
                  className="mt-3 w-full accent-[#C8FF80]"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="开始时间（可选）">
                <input
                  type="datetime-local"
                  value={draft.timeStart ?? ''}
                  onChange={(e) =>
                    updateDraft(
                      'timeStart',
                      e.target.value
                        ? new Date(e.target.value).toISOString()
                        : undefined,
                    )
                  }
                  className="input"
                />
              </Field>
              <Field label="结束时间（可选）">
                <input
                  type="datetime-local"
                  value={draft.timeEnd ?? ''}
                  onChange={(e) =>
                    updateDraft(
                      'timeEnd',
                      e.target.value
                        ? new Date(e.target.value).toISOString()
                        : undefined,
                    )
                  }
                  className="input"
                />
              </Field>
            </div>

            <Field label="兴趣标签（5-8 个，逗号或顿号分隔）">
              <input
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                placeholder="独立电影、咖啡、摄影"
                className="input"
              />
            </Field>

            <Field label="性格偏好 personalityPreference（逗号或顿号分隔）">
              <input
                value={personalityText}
                onChange={(e) => {
                  setPersonalityText(e.target.value);
                  updateDraft(
                    'personalityPreference',
                    e.target.value
                      .split(/[,，、\s]+/)
                      .map((s) => s.trim())
                      .filter(Boolean),
                  );
                }}
                placeholder="安静、尊重边界"
                className="input"
              />
            </Field>

            {/* Read-only safety / privacy panels */}
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 space-y-2">
              <div className="text-xs font-medium text-amber-300">
                ⚠️ 线下安全提醒
              </div>
              <ul className="text-xs text-[#E7DFC9] space-y-1 list-disc list-inside leading-6">
                {draft.riskNotes.length === 0 && (
                  <li>建议首次见面选择白天、人流量大的公共场所。</li>
                )}
                {draft.riskNotes.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-sky-400/30 bg-sky-400/5 p-4 space-y-2">
              <div className="text-xs font-medium text-sky-300">
                🔒 隐私提醒
              </div>
              <ul className="text-xs text-[#E7DFC9] space-y-1 list-disc list-inside leading-6">
                {draft.privacyNotes.length === 0 && (
                  <li>不要在公开需求中填写精确住址、手机号或微信号。</li>
                )}
                {draft.privacyNotes.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>

            {/* Pre-publish confirmation checklist */}
            <div className="rounded-xl border border-[#26261d] bg-[#15150f] p-4 space-y-3">
              <div className="text-xs uppercase tracking-wider text-[#8C8A6E]">
                STEP 3 · 发布前确认
              </div>
              <div className="space-y-2">
                {REQUIRED_CHECKS.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-start gap-2 text-xs text-[#E7DFC9] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={!!checks[c.id]}
                      onChange={(e) =>
                        setChecks((prev) => ({
                          ...prev,
                          [c.id]: e.target.checked,
                        }))
                      }
                      className="mt-0.5 accent-[#C8FF80]"
                    />
                    <span>
                      {c.label}
                      {c.required && (
                        <span className="text-amber-300/80 ml-1">*</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <button
              type="button"
              disabled={publishing || !allRequiredChecked}
              onClick={publish}
              className="w-full px-4 py-3 rounded-xl bg-[#C8FF80] text-[#0d0d0b] text-sm font-medium hover:bg-[#b8ef70] disabled:opacity-40"
            >
              {publishing
                ? '正在发布并匹配...'
                : allRequiredChecked
                  ? '确认发布并匹配候选人 →'
                  : '请先勾选必要项'}
            </button>
            <p className="text-[11px] text-[#5e5d4a] text-center">
              发布后会自动跑一次匹配，下一页可以查看 AI 推荐的候选人、发送邀约、并发起活动。
            </p>
          </section>
        )}
      </div>

      {/* Local utility classes to keep the markup compact. */}
      <style>{`
        .input {
          width: 100%;
          background: #15150f;
          border: 1px solid #26261d;
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 13px;
          color: #F4EFE6;
        }
        .input::placeholder { color: #5e5d4a; }
        .input:focus { outline: none; border-color: rgba(200,255,128,0.6); }
        textarea.input { border-radius: 12px; padding: 10px 14px; }
      `}</style>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs uppercase tracking-wider text-[#8C8A6E]">
        {label}
      </label>
      {children}
    </div>
  );
}

function profileFilled(p: UserSocialProfile | null): boolean {
  if (!p) return false;
  return !!(
    p.gender ||
    p.ageRange ||
    p.city ||
    p.nearbyArea ||
    (p.fitnessGoals && p.fitnessGoals.length) ||
    (p.interestTags && p.interestTags.length) ||
    (p.availableTimes && p.availableTimes.length) ||
    p.socialPreference ||
    p.rejectRules ||
    p.privacyBoundary
  );
}

export default SocialRequestAiPage;
