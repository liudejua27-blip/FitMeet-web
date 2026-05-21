import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import {
  socialProfileApi,
  type AiProfilePrivacyState,
  type AiProfileBuilderCard,
  type AiProfileQuestion,
  type PendingSensitiveTag,
  type SocialProfileCompletion,
} from '../api/socialProfileApi';
import { cleanDisplayText, sanitizeDisplayValue } from '../lib/displayText';

const fallbackQuestions: AiProfileQuestion[] = [
  { key: 'sports', question: '你平时喜欢什么运动？' },
  { key: 'socialStyle', question: '你更喜欢主动社交还是慢热相处？' },
  { key: 'wantToMeet', question: '你想认识什么样的人？' },
  { key: 'avoidTraits', question: '你不接受什么行为？' },
  { key: 'weekendAvailability', question: '你周末通常怎么安排？' },
  { key: 'preferredTraits', question: '你更看重颜值、性格、财富、共同兴趣，还是长期陪伴？' },
  { key: 'city', question: '你常驻或优先匹配的城市是哪里？' },
  { key: 'mbti', question: '你的 MBTI 或性格关键词是什么？' },
  { key: 'relationshipGoals', question: '你希望这次匹配更偏交友、约练、人脉还是长期陪伴？' },
  { key: 'privacyBoundary', question: '哪些信息你不希望 AI 自动公开？' },
];

const emptyCompletion: SocialProfileCompletion = {
  completedFields: [],
  missingFields: [],
  percent: 0,
};

const aiModuleLayers = [
  {
    title: 'AI 画像工作室',
    desc: '你用自然语言说自己是谁、想认识谁、不想遇到谁，DeepSeek 自动整理成结构化人物画像。',
  },
  {
    title: 'AI 匹配解释器',
    desc: '推荐不只给分数，还说明为什么推荐、有什么风险、下一步怎么做，并给出开场白草稿。',
  },
  {
    title: 'OpenClaw 代理闭环',
    desc: 'OpenClaw 通过 social-skills 访谈主人、生成草稿、读取推荐；保存和联系都必须真人确认。',
  },
];

const workflowSteps = [
  '让 AI 了解我',
  '回答几个问题',
  'AI 生成画像',
  '确认标签与隐私',
  '开启匹配池 / 查看推荐',
];

const missingFieldLabels: Record<string, string> = {
  nickname: '昵称',
  gender: '性别',
  ageRange: '年龄段',
  city: '城市',
  nearbyArea: '活动区域',
  mbti: 'MBTI',
  zodiac: '星座',
  traits: '性格标签',
  fitnessGoals: '运动目标',
  interestTags: '兴趣标签',
  lifestyleTags: '生活方式',
  socialScenes: '社交场景',
  wantToMeet: '想认识的人',
  preferredTraits: '偏好特质',
  avoidTraits: '避雷项',
  relationshipGoals: '社交目标',
  availableTimes: '可用时间',
  socialPreference: '社交节奏',
  rejectRules: '拒绝规则',
  privacyBoundary: '隐私边界',
};

export function AiProfileBuilderPage() {
  const [questions, setQuestions] = useState<AiProfileQuestion[]>(fallbackQuestions);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [rawText, setRawText] = useState('');
  const [draft, setDraft] = useState<AiProfileBuilderCard | null>(null);
  const [completion, setCompletion] = useState<SocialProfileCompletion>(emptyCompletion);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enableMatching, setEnableMatching] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [savedResult, setSavedResult] = useState<{
    matchingEnabled: boolean;
    missingFields: string[];
  } | null>(null);
  const [sensitiveTagsConfirmed, setSensitiveTagsConfirmed] = useState(false);
  const [privacy, setPrivacy] = useState<AiProfilePrivacyState | null>(null);
  const [pendingSensitiveTags, setPendingSensitiveTags] = useState<PendingSensitiveTag[]>([]);
  const [privacySaving, setPrivacySaving] = useState<string | null>(null);
  const [tagDecisionPending, setTagDecisionPending] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [result, privacyState, pendingTags] = await Promise.all([
          socialProfileApi.questions(),
          socialProfileApi.privacy(),
          socialProfileApi.pendingSensitiveTags(),
        ]);
        if (cancelled) return;
        const nextQuestions = (result.questions.length ? result.questions : fallbackQuestions).map(
          (question) => ({
            ...question,
            question: cleanDisplayText(question.question, '请补充一个真实偏好。'),
          }),
        );
        setQuestions(nextQuestions.slice(0, 12));
        setCompletion(result.completion);
        setPrivacy(privacyState);
        setPendingSensitiveTags(pendingTags.pending);
      } catch {
        if (!cancelled) setQuestions(fallbackQuestions);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const answeredCount = useMemo(
    () => Object.values(answers).filter((value) => value.trim()).length,
    [answers],
  );

  const activeStep = useMemo(() => {
    if (savedResult) return 5;
    if (draft) return 4;
    if (answeredCount >= 3 || rawText.trim().length >= 20) return 3;
    if (answeredCount > 0 || rawText.trim()) return 2;
    return 1;
  }, [answeredCount, draft, rawText, savedResult]);

  const hasSensitiveTags = Boolean(draft?.matchSignals?.sensitivePrivateTags?.length);

  async function reloadPrivacy() {
    const [privacyState, pendingTags] = await Promise.all([
      socialProfileApi.privacy(),
      socialProfileApi.pendingSensitiveTags(),
    ]);
    setPrivacy(privacyState);
    setPendingSensitiveTags(pendingTags.pending);
  }

  async function updatePrivacySwitch<K extends keyof Pick<AiProfilePrivacyState, 'profileDiscoverable' | 'agentCanRecommendMe' | 'agentCanStartChatAfterApproval' | 'hideSensitiveTags'>>(
    key: K,
    value: boolean,
  ) {
    const enablingVisibility =
      value === true &&
      key !== 'hideSensitiveTags';
    if (enablingVisibility && !confirmProfileAuthorization()) {
      return;
    }
    setPrivacySaving(key);
    setError('');
    setMessage('');
    try {
      const next = await socialProfileApi.updatePrivacy({
        [key]: value,
        ...(enablingVisibility ? explicitProfileAuthorizationPayload() : {}),
      });
      setPrivacy(next);
      setMessage(next.matchPoolEnabled ? '隐私设置已更新，画像匹配池保持开启。' : '隐私设置已更新，画像暂不进入匹配池。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '隐私设置保存失败');
    } finally {
      setPrivacySaving(null);
    }
  }

  async function decideSensitiveTag(tag: string, action: 'confirm' | 'reject') {
    setTagDecisionPending(`${tag}:${action}`);
    setError('');
    setMessage('');
    try {
      if (action === 'confirm') await socialProfileApi.confirmSensitiveTag(tag);
      else await socialProfileApi.rejectSensitiveTag(tag);
      await reloadPrivacy();
      setMessage(action === 'confirm' ? '敏感标签已允许参与私密匹配。' : '敏感标签已排除出匹配。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '敏感标签处理失败');
    } finally {
      setTagDecisionPending(null);
    }
  }

  function updateAnswer(key: string, value: string) {
    setAnswers((current) => ({ ...current, [key]: value }));
  }

  function parseList(value: string): string[] {
    return value
      .split(/[,，、;；\n]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function updateBasic<K extends keyof AiProfileBuilderCard['basic']>(
    key: K,
    value: AiProfileBuilderCard['basic'][K],
  ) {
    setDraft((current) =>
      current ? { ...current, basic: { ...current.basic, [key]: value } } : current,
    );
  }

  function updatePersonality<K extends keyof AiProfileBuilderCard['personality']>(
    key: K,
    value: AiProfileBuilderCard['personality'][K],
  ) {
    setDraft((current) =>
      current ? { ...current, personality: { ...current.personality, [key]: value } } : current,
    );
  }

  function updateInterests<K extends keyof AiProfileBuilderCard['interests']>(
    key: K,
    value: AiProfileBuilderCard['interests'][K],
  ) {
    setDraft((current) =>
      current ? { ...current, interests: { ...current.interests, [key]: value } } : current,
    );
  }

  function updatePreferences<K extends keyof AiProfileBuilderCard['preferences']>(
    key: K,
    value: AiProfileBuilderCard['preferences'][K],
  ) {
    setDraft((current) =>
      current ? { ...current, preferences: { ...current.preferences, [key]: value } } : current,
    );
  }

  function updateRelationship<K extends keyof AiProfileBuilderCard['relationshipIntent']>(
    key: K,
    value: AiProfileBuilderCard['relationshipIntent'][K],
  ) {
    setDraft((current) =>
      current
        ? {
            ...current,
            relationshipIntent: { ...current.relationshipIntent, [key]: value },
          }
        : current,
    );
  }

  function updateAvailability<K extends keyof AiProfileBuilderCard['availability']>(
    key: K,
    value: AiProfileBuilderCard['availability'][K],
  ) {
    setDraft((current) =>
      current ? { ...current, availability: { ...current.availability, [key]: value } } : current,
    );
  }

  function updateVisibility<K extends keyof AiProfileBuilderCard['visibility']>(
    key: K,
    value: AiProfileBuilderCard['visibility'][K],
  ) {
    setDraft((current) =>
      current ? { ...current, visibility: { ...current.visibility, [key]: value } } : current,
    );
  }

  function updateMatchSignals<K extends keyof AiProfileBuilderCard['matchSignals']>(
    key: K,
    value: AiProfileBuilderCard['matchSignals'][K],
  ) {
    if (key === 'sensitivePrivateTags') setSensitiveTagsConfirmed(false);
    setDraft((current) =>
      current
        ? {
            ...current,
            matchSignals: {
              ...defaultMatchSignals(),
              ...current.matchSignals,
              [key]: value,
            },
          }
        : current,
    );
  }

  async function generateDraft() {
    const payloadAnswers = questions
      .map((question) => ({
        key: question.key,
        question: question.question,
        answer: answers[question.key] || '',
      }))
      .filter((item) => item.answer.trim());
    if (payloadAnswers.length < 3 && rawText.trim().length < 20) {
      setError('至少回答 3 个问题，或者用一段话描述你自己。');
      return;
    }

    setGenerating(true);
    setError('');
    setMessage('');
    setSavedResult(null);
    try {
      const result = await socialProfileApi.aiDraft({
        answers: payloadAnswers,
        rawText,
        source: 'fitmeet_ai_profile_builder',
      });
      const safeDraft = sanitizeDisplayValue(result.draft) as AiProfileBuilderCard;
      setDraft({
        ...safeDraft,
        matchSignals: { ...defaultMatchSignals(), ...safeDraft.matchSignals },
      });
      setSensitiveTagsConfirmed(false);
      setCompletion(result.completion);
      setMessage(
        result.mode === 'ai'
          ? 'DeepSeek 已生成画像草稿，请确认后保存。'
          : '已使用本地规则生成画像草稿，请确认后保存。',
      );
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) setError('登录已过期，请重新登录后再生成画像。');
        else if (err.status === 403) setError('权限不足，无法生成 AI 画像。');
        else if (err.status >= 500) setError('AI 画像服务暂时不可用，请稍后重试。');
        else setError(err.message || 'AI 画像生成失败');
      } else {
        setError(err instanceof Error ? err.message : 'AI 画像生成失败');
      }
    } finally {
      setGenerating(false);
    }
  }

  async function saveDraft() {
    if (!draft) return;
    if (hasSensitiveTags && !sensitiveTagsConfirmed) {
      setError('请先确认敏感标签只用于私密匹配，不会公开展示。');
      return;
    }
    const wantsMatching =
      enableMatching &&
      (draft.visibility.profileDiscoverable || draft.visibility.agentCanRecommendMe);
    if (wantsMatching && !confirmProfileAuthorization()) {
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    setSavedResult(null);
    try {
      const result = await socialProfileApi.aiSave({
        profile: draft,
        enableMatching,
        ...(wantsMatching ? explicitProfileAuthorizationPayload() : {}),
        sensitiveTagsConfirmed,
      });
      await reloadPrivacy();
      setCompletion(result.completion);
      setSavedResult({
        matchingEnabled: result.matchingEnabled,
        missingFields: result.completion.missingFields,
      });
      setMessage(
        result.matchingEnabled
          ? '画像已保存，已进入 AI 匹配池。'
          : '画像已保存，暂未开启被推荐（未进入匹配池）。',
      );
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) setError('登录已过期，请重新登录后再保存画像。');
        else if (err.status === 403) setError('权限不足，无法保存画像。');
        else if (err.status >= 500) setError('画像保存服务异常，请稍后重试。');
        else setError(err.message || '画像保存失败');
      } else {
        setError(err instanceof Error ? err.message : '画像保存失败');
      }
    } finally {
      setSaving(false);
    }
  }

  function confirmProfileAuthorization() {
    return window.confirm(
      '请确认：你同意 FitMeet 使用这份 AI 画像进入匹配池，并允许 Agent 在推荐场景中使用公开标签和私密偏好。敏感标签只会在你确认后用于私密匹配，不会公开展示。',
    );
  }

  function explicitProfileAuthorizationPayload() {
    return {
      ownerConfirmed: true,
      matchingConsent: true,
      profileVisibilityConsent: true,
    };
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-[#0d0d0b] text-[#d7f8b7]">
        AI 画像工作室加载中...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0d0b] text-[#f6efe5]">
      <div className="border-b border-white/10 bg-black/30 px-4 py-6 backdrop-blur sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#c8ff80]">
              AI Profile Studio
            </p>
            <h1 className="mt-2 text-2xl font-black text-white sm:text-3xl">
              让 AI 了解我，并开启长期画像匹配
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#c9c0b4]">
              从自然语言访谈开始，DeepSeek
              会生成公开画像、私密偏好、敏感标签和匹配关键词；你确认后才会进入画像匹配池。
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {aiModuleLayers.map((layer) => (
                <article
                  key={layer.title}
                  className="rounded-lg border border-white/10 bg-white/[0.04] p-3"
                >
                  <h2 className="text-sm font-black text-white">{layer.title}</h2>
                  <p className="mt-1 text-xs leading-5 text-[#b8afa2]">{layer.desc}</p>
                </article>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-[#c8ff80]/20 bg-[#c8ff80]/5 p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-[#c9c0b4]">画像完成度</div>
                <div className="mt-2 flex items-end gap-2">
                  <span className="text-4xl font-black text-[#c8ff80]">{completion.percent}%</span>
                  {completion.readinessLevel && (
                    <span className="pb-1 text-xs font-bold text-[#c9c0b4]">
                      {profileReadinessLabel(completion.readinessLevel)}
                    </span>
                  )}
                  <span className="pb-1 text-xs text-[#9b9184]">已回答 {answeredCount} 项</span>
                </div>
              </div>
              <Link
                to="/agent-inbox"
                className="rounded-lg border border-[#c8ff80]/30 px-3 py-2 text-xs font-black text-[#c8ff80] transition hover:bg-[#c8ff80]/10"
              >
                查看推荐
              </Link>
            </div>
            <div className="mt-4 space-y-2">
              {workflowSteps.map((step, index) => {
                const stepNumber = index + 1;
                const done = activeStep > stepNumber;
                const current = activeStep === stepNumber;
                return (
                  <div key={step} className="flex items-center gap-2 text-xs">
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full font-black ${
                        done
                          ? 'bg-[#c8ff80] text-[#10160c]'
                          : current
                            ? 'border border-[#c8ff80] text-[#c8ff80]'
                            : 'border border-white/10 text-[#7d7469]'
                      }`}
                    >
                      {done ? '✓' : stepNumber}
                    </span>
                    <span className={current ? 'font-black text-white' : 'text-[#b8afa2]'}>
                      {step}
                    </span>
                  </div>
                );
              })}
            </div>
            {privacy && (
              <div className="mt-5 space-y-3 border-t border-[#c8ff80]/15 pt-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-[#c9c0b4]">AI 画像隐私</div>
                    <div className="mt-1 text-sm font-black text-white">
                      {privacy.matchPoolEnabled ? '匹配池已开启' : '匹配池未开启'}
                    </div>
                  </div>
                  <span className="rounded-md border border-white/10 px-2 py-1 text-[10px] font-black text-[#c8ff80]">
                    待确认 {privacy.sensitiveTagSummary.pending}
                  </span>
                </div>
                <div className="grid gap-2">
                  <PrivacySwitch
                    label="进入发现池"
                    checked={privacy.profileDiscoverable}
                    disabled={privacySaving === 'profileDiscoverable'}
                    onChange={(value) => void updatePrivacySwitch('profileDiscoverable', value)}
                  />
                  <PrivacySwitch
                    label="AI 持续推荐"
                    checked={privacy.agentCanRecommendMe}
                    disabled={privacySaving === 'agentCanRecommendMe'}
                    onChange={(value) => void updatePrivacySwitch('agentCanRecommendMe', value)}
                  />
                  <PrivacySwitch
                    label="确认后开聊"
                    checked={privacy.agentCanStartChatAfterApproval}
                    disabled={privacySaving === 'agentCanStartChatAfterApproval'}
                    onChange={(value) =>
                      void updatePrivacySwitch('agentCanStartChatAfterApproval', value)
                    }
                  />
                  <PrivacySwitch
                    label="隐藏敏感标签"
                    checked={privacy.hideSensitiveTags}
                    disabled={privacySaving === 'hideSensitiveTags'}
                    onChange={(value) => void updatePrivacySwitch('hideSensitiveTags', value)}
                  />
                </div>
                {pendingSensitiveTags.length > 0 && (
                  <div className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-3">
                    <div className="text-xs font-black text-amber-100">敏感标签确认</div>
                    <div className="mt-2 space-y-2">
                      {pendingSensitiveTags.slice(0, 4).map((item) => (
                        <div
                          key={item.tag}
                          className="flex items-center justify-between gap-2 rounded-md border border-amber-200/10 bg-black/20 px-2 py-2"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-xs font-black text-white">{item.tag}</div>
                            <div className="text-[10px] text-amber-100/60">{item.category}</div>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <button
                              onClick={() => void decideSensitiveTag(item.tag, 'confirm')}
                              disabled={Boolean(tagDecisionPending)}
                              className="rounded-md bg-[#c8ff80] px-2 py-1 text-[10px] font-black text-[#11160b] disabled:opacity-50"
                            >
                              {tagDecisionPending === `${item.tag}:confirm` ? '处理中' : '允许'}
                            </button>
                            <button
                              onClick={() => void decideSensitiveTag(item.tag, 'reject')}
                              disabled={Boolean(tagDecisionPending)}
                              className="rounded-md border border-white/10 px-2 py-1 text-[10px] font-black text-amber-100 disabled:opacity-50"
                            >
                              {tagDecisionPending === `${item.tag}:reject` ? '处理中' : '排除'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:px-8">
        <section className="space-y-5">
          <div className="rounded-lg border border-[#c8ff80]/20 bg-[#c8ff80]/5 p-5">
            <h2 className="text-lg font-black text-white">让 AI 了解我</h2>
            <p className="mt-2 text-sm leading-6 text-[#d7f8b7]">
              你可以直接描述自己，也可以回答下面的问题。AI 会把这些内容拆成：
              <span className="font-black text-white">公开标签</span>、
              <span className="font-black text-white">私密匹配偏好</span>、
              <span className="font-black text-white">敏感私密标签</span> 和
              <span className="font-black text-white">匹配关键词</span>。
            </p>
            <div className="mt-4 grid gap-2 text-xs leading-5 text-[#c9c0b4]">
              <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                示例：我在青岛，ENFP，喜欢健身、创业和高质量社交，想认识自律真诚、有事业心的人。
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                避雷：不接受骚扰、索要联系方式、炫富、低质量闲聊；线下见面必须先线上了解。
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-white">对话采样</h2>
                <p className="mt-1 text-sm text-[#b8afa2]">回答越具体，画像越适合后续匹配。</p>
              </div>
              <span className="rounded-md border border-[#c8ff80]/30 bg-[#c8ff80]/10 px-3 py-1 text-xs font-black text-[#c8ff80]">
                {questions.length} 问
              </span>
            </div>

            <div className="mt-5 space-y-4">
              {questions.map((question, index) => (
                <label key={question.key} className="block">
                  <span className="text-sm font-bold text-[#f6efe5]">
                    {index + 1}. {cleanDisplayText(question.question, '请补充一个真实偏好。')}
                  </span>
                  <textarea
                    value={answers[question.key] || ''}
                    onChange={(event) => updateAnswer(question.key, event.target.value)}
                    rows={2}
                    className="field mt-2 resize-none"
                    placeholder="按你的真实偏好回答"
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
            <label className="block">
              <span className="text-sm font-black text-white">补充描述</span>
              <textarea
                value={rawText}
                onChange={(event) => setRawText(event.target.value)}
                rows={5}
                className="field mt-2 resize-none"
                placeholder="例如：我在青岛，喜欢健身和 AI 创业，社交偏主动，希望认识真诚自律的人，不接受骚扰和低质量闲聊。"
              />
            </label>
            <button
              onClick={generateDraft}
              disabled={generating}
              className="mt-4 w-full rounded-lg bg-[#c8ff80] px-5 py-3 text-sm font-black text-[#11160b] transition hover:bg-[#d8ffa2] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {generating ? '生成中...' : 'AI 生成我的人物画像'}
            </button>
          </div>
        </section>

        <section className="space-y-5">
          {(message || error) && (
            <div
              className={`rounded-lg border px-4 py-3 text-sm font-bold ${
                error
                  ? 'border-red-400/30 bg-red-500/10 text-red-200'
                  : 'border-[#c8ff80]/30 bg-[#c8ff80]/10 text-[#d7f8b7]'
              }`}
            >
              {error || message}
            </div>
          )}

          {savedResult && (
            <div
              className={`rounded-lg border px-4 py-3 text-sm ${
                savedResult.matchingEnabled
                  ? 'border-[#c8ff80]/30 bg-[#c8ff80]/5'
                  : 'border-amber-300/20 bg-amber-300/5'
              }`}
            >
              <div
                className={`font-black ${savedResult.matchingEnabled ? 'text-[#c8ff80]' : 'text-amber-200'}`}
              >
                {savedResult.matchingEnabled ? '✓ 已进入画像匹配池' : '⚑ 未进入画像匹配池'}
              </div>
              {savedResult.missingFields.length > 0 && (
                <div className="mt-2">
                  <span className="text-xs font-bold text-[#b8afa2]">还需补充：</span>
                  <span className="ml-1 text-xs text-[#c9c0b4]">
                    {savedResult.missingFields
                      .slice(0, 5)
                      .map((field) => missingFieldLabels[field] ?? field)
                      .join('、')}
                    {savedResult.missingFields.length > 5 &&
                      ` 等 ${savedResult.missingFields.length} 项`}
                  </span>
                </div>
              )}
            </div>
          )}

          {!draft ? (
            <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-dashed border-white/15 bg-white/[0.03] p-8 text-center">
              <div>
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg border border-[#c8ff80]/30 bg-[#c8ff80]/10 text-xl font-black text-[#c8ff80]">
                  AI
                </div>
                <h2 className="mt-5 text-xl font-black text-white">人物卡会显示在这里</h2>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#b8afa2]">
                  生成后你会先确认公开标签、私密偏好和敏感标签，再决定是否开启画像匹配池。
                </p>
                <div className="mx-auto mt-5 grid max-w-md gap-2 text-left text-xs text-[#9b9184]">
                  <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                    1. 公开画像：可展示给其他用户的兴趣、地区、性格标签。
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                    2. 私密偏好：只用于匹配，不直接显示给候选人。
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                    3. 敏感标签：财富、收入、颜值、身份等必须你确认后才参与匹配。
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
                <h2 className="text-lg font-black text-white">人物卡确认</h2>
                <label className="mt-4 block">
                  <span className="text-sm font-bold text-[#c9c0b4]">一句话摘要</span>
                  <textarea
                    value={cleanDisplayText(draft.summary)}
                    onChange={(event) =>
                      setDraft((current) =>
                        current ? { ...current, summary: event.target.value } : current,
                      )
                    }
                    rows={3}
                    className="field mt-2 resize-none"
                  />
                </label>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <TextField
                    label="昵称"
                    value={draft.basic.nickname}
                    onChange={(value) => updateBasic('nickname', value)}
                  />
                  <TextField
                    label="城市"
                    value={draft.basic.city}
                    onChange={(value) => updateBasic('city', value)}
                  />
                  <TextField
                    label="年龄段"
                    value={draft.basic.ageRange}
                    onChange={(value) => updateBasic('ageRange', value)}
                  />
                  <TextField
                    label="性别"
                    value={draft.basic.gender}
                    onChange={(value) => updateBasic('gender', value)}
                  />
                  <TextField
                    label="星座"
                    value={draft.basic.zodiac}
                    onChange={(value) => updateBasic('zodiac', value)}
                  />
                  <TextField
                    label="MBTI"
                    value={draft.personality.mbti}
                    onChange={(value) => updatePersonality('mbti', value)}
                  />
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
                <h3 className="text-base font-black text-white">性格与兴趣</h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <TextField
                    label="社交风格"
                    value={draft.personality.socialStyle}
                    onChange={(value) => updatePersonality('socialStyle', value)}
                  />
                  <TextField
                    label="沟通风格"
                    value={draft.personality.communicationStyle}
                    onChange={(value) => updatePersonality('communicationStyle', value)}
                  />
                  <TextField
                    label="性格标签"
                    value={draft.personality.traits.join('、')}
                    onChange={(value) => updatePersonality('traits', parseList(value))}
                  />
                  <TextField
                    label="运动"
                    value={draft.interests.sports.join('、')}
                    onChange={(value) => updateInterests('sports', parseList(value))}
                  />
                  <TextField
                    label="生活方式"
                    value={draft.interests.lifestyle.join('、')}
                    onChange={(value) => updateInterests('lifestyle', parseList(value))}
                  />
                  <TextField
                    label="社交场景"
                    value={draft.interests.socialScenes.join('、')}
                    onChange={(value) => updateInterests('socialScenes', parseList(value))}
                  />
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
                <h3 className="text-base font-black text-white">匹配偏好</h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <TextField
                    label="想认识"
                    value={draft.preferences.wantToMeet.join('、')}
                    onChange={(value) => updatePreferences('wantToMeet', parseList(value))}
                  />
                  <TextField
                    label="偏好特质"
                    value={draft.preferences.preferredTraits.join('、')}
                    onChange={(value) => updatePreferences('preferredTraits', parseList(value))}
                  />
                  <TextField
                    label="避开行为"
                    value={draft.preferences.avoid.join('、')}
                    onChange={(value) => updatePreferences('avoid', parseList(value))}
                  />
                  <TextField
                    label="关系目标"
                    value={draft.relationshipIntent.goals.join('、')}
                    onChange={(value) => updateRelationship('goals', parseList(value))}
                  />
                  <TextField
                    label="开放度"
                    value={draft.relationshipIntent.openness}
                    onChange={(value) => updateRelationship('openness', value)}
                  />
                  <TextField
                    label="工作日"
                    value={draft.availability.weekdays}
                    onChange={(value) => updateAvailability('weekdays', value)}
                  />
                  <TextField
                    label="周末"
                    value={draft.availability.weekends}
                    onChange={(value) => updateAvailability('weekends', value)}
                  />
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
                <h3 className="text-base font-black text-white">可见性与隐私</h3>
                <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-black text-white">
                        确认公开标签 / 私密偏好 / 敏感标签
                      </h4>
                      <p className="mt-1 text-xs leading-5 text-[#b8afa2]">
                        公开标签可被其他用户预览；私密和敏感标签仅用于算法匹配，不对外展示。
                      </p>
                    </div>
                    <Link
                      to="/agent-inbox"
                      className="rounded-lg border border-[#c8ff80]/30 px-3 py-2 text-xs font-black text-[#c8ff80] transition hover:bg-[#c8ff80]/10"
                    >
                      查看推荐
                    </Link>
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <TextField
                      label="公开标签（可展示）"
                      value={(draft.matchSignals?.publicTags ?? []).join(', ')}
                      onChange={(value) => updateMatchSignals('publicTags', parseList(value))}
                    />
                    <TextField
                      label="私密匹配偏好（不展示）"
                      value={(draft.matchSignals?.privatePreferenceTags ?? []).join(', ')}
                      onChange={(value) =>
                        updateMatchSignals('privatePreferenceTags', parseList(value))
                      }
                    />
                    <TextField
                      label="敏感私密标签（需确认）"
                      value={(draft.matchSignals?.sensitivePrivateTags ?? []).join(', ')}
                      onChange={(value) =>
                        updateMatchSignals('sensitivePrivateTags', parseList(value))
                      }
                    />
                    <TextField
                      label="匹配关键词"
                      value={(draft.matchSignals?.matchKeywords ?? []).join(', ')}
                      onChange={(value) => updateMatchSignals('matchKeywords', parseList(value))}
                    />
                  </div>
                  <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-xs leading-5 text-amber-100">
                    <div className="font-black text-amber-200">敏感标签说明</div>
                    <p className="mt-1">以下类型的标签不会公开展示，只有在你确认后才会参与匹配：</p>
                    <ul className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-amber-100/80">
                      <li>• 财富 / 收入</li>
                      <li>• 颜值 / 外貌</li>
                      <li>• 身份地位</li>
                      <li>• 感情关系状态</li>
                      <li>• 联系方式</li>
                      <li>• 精确位置</li>
                      <li>• 单位 / 学校</li>
                      <li>• 证件信息</li>
                    </ul>
                    <p className="mt-2 text-amber-100/60">如不确定，可以留空或使用模糊描述。</p>
                    {hasSensitiveTags && (
                      <label className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200/20 bg-black/20 px-3 py-2">
                        <input
                          type="checkbox"
                          checked={sensitiveTagsConfirmed}
                          onChange={(event) => setSensitiveTagsConfirmed(event.target.checked)}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-[#c8ff80]"
                        />
                        <span className="text-xs font-bold leading-5 text-amber-100">
                          我已确认这些敏感标签只用于私密匹配，不会在公开画像、推荐卡或 OpenClaw
                          公开读取接口中展示。
                        </span>
                      </label>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <Toggle
                    label="进入发现池"
                    description="开启后其他用户可以在搜索和推荐中看到你的公开画像。"
                    checked={draft.visibility.profileDiscoverable}
                    onChange={(value) => updateVisibility('profileDiscoverable', value)}
                  />
                  <Toggle
                    label="允许被推荐"
                    description="开启后 AI 和 Agent 可以把你的画像推荐给画像兼容的用户。"
                    checked={draft.visibility.agentCanRecommendMe}
                    onChange={(value) => updateVisibility('agentCanRecommendMe', value)}
                  />
                  <Toggle
                    label="确认后开聊"
                    description="对方发起联系后，需要你手动确认才能开始对话。"
                    checked={draft.visibility.agentCanStartChatAfterApproval}
                    onChange={(value) => updateVisibility('agentCanStartChatAfterApproval', value)}
                  />
                </div>
                <label className="mt-4 flex items-start gap-3 rounded-lg border border-white/10 bg-black/20 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={enableMatching}
                    onChange={(event) => setEnableMatching(event.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[#c8ff80]"
                  />
                  <span>
                    <span className="block text-sm font-bold text-[#f6efe5]">
                      保存后同步进入 AI 匹配池
                    </span>
                    <span className="mt-0.5 block text-xs leading-5 text-[#9b9184]">
                      开启后，即使你没有发布社交卡片，FitMeet 也会根据
                      MBTI、性格、星座、地区、兴趣和匹配要求生成 review 状态推荐。
                    </span>
                  </span>
                </label>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    onClick={saveDraft}
                    disabled={saving || (hasSensitiveTags && !sensitiveTagsConfirmed)}
                    className="rounded-lg bg-[#c8ff80] px-5 py-3 text-sm font-black text-[#11160b] transition hover:bg-[#d8ffa2] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? '保存中...' : '确认保存画像'}
                  </button>
                  <button
                    onClick={() => {
                      setDraft(null);
                      setMessage('');
                      setError('');
                      setSavedResult(null);
                    }}
                    disabled={saving || generating}
                    className="rounded-lg border border-white/10 px-5 py-3 text-sm font-black text-[#f6efe5] transition hover:border-[#c8ff80]/40 hover:text-[#c8ff80] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    重新生成画像
                  </button>
                  <Link
                    to="/agent-inbox"
                    className="rounded-lg border border-white/10 px-5 py-3 text-sm font-black text-[#f6efe5] transition hover:border-[#c8ff80]/40 hover:text-[#c8ff80]"
                  >
                    查看推荐
                  </Link>
                  <Link
                    to="/social-agent"
                    className="rounded-lg border border-white/10 px-5 py-3 text-sm font-black text-[#f6efe5] transition hover:border-[#c8ff80]/40 hover:text-[#c8ff80]"
                  >
                    问 Social Agent 匹配
                  </Link>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function profileReadinessLabel(level: NonNullable<SocialProfileCompletion['readinessLevel']>) {
  switch (level) {
    case 'agent_ready':
      return 'Agent 可稳定推荐';
    case 'match_ready':
      return '可进入匹配';
    case 'basic':
      return '基础画像';
    case 'empty':
    default:
      return '待补全';
  }
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-[#c9c0b4]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="field mt-2"
      />
    </label>
  );
}

function defaultMatchSignals(): AiProfileBuilderCard['matchSignals'] {
  return {
    publicTags: [],
    privatePreferenceTags: [],
    sensitivePrivateTags: [],
    matchKeywords: [],
    confidence: 0.5,
    source: 'fallback',
  };
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-black/20 px-4 py-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[#c8ff80]"
      />
      <div>
        <span className="text-sm font-bold text-[#f6efe5]">{label}</span>
        {description && <p className="mt-0.5 text-xs leading-5 text-[#9b9184]">{description}</p>}
      </div>
    </label>
  );
}

function PrivacySwitch({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
      <span className="text-xs font-bold text-[#f6efe5]">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 shrink-0 accent-[#c8ff80] disabled:cursor-not-allowed disabled:opacity-50"
      />
    </label>
  );
}
