import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, Loader2, Sparkles } from 'lucide-react';

import {
  socialProfileApi,
  type ProfileUpdateProposal,
  type SocialProfileBuilderCard,
  type SocialProfileCompletion,
} from '../../api/socialProfileApi';
import type { SchemaDrivenAssistantCard } from './tool-ui-schema';

type ProfileQuestion = {
  key: string;
  label: string;
  question: string;
  placeholder?: string;
  options: string[];
};

type DraftState = {
  status: 'idle' | 'drafting' | 'preview' | 'saving' | 'saved' | 'authorizing' | 'error';
  draft: SocialProfileBuilderCard | null;
  proposal: ProfileUpdateProposal | null;
  completion: SocialProfileCompletion | null;
  message: string | null;
};

export function ProfileCompletionCard({ card }: { card: SchemaDrivenAssistantCard }) {
  const questions = useMemo(() => readQuestions(card.data.questions), [card.data.questions]);
  const pendingProposal = useMemo(
    () => readPendingProposal(card.data.pendingProposal),
    [card.data.pendingProposal],
  );
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(questions.map((question) => [question.key, ''])),
  );
  const [state, setState] = useState<DraftState>({
    status: pendingProposal ? 'preview' : 'idle',
    draft: pendingProposal?.draft ?? null,
    proposal: pendingProposal,
    completion: null,
    message: pendingProposal
      ? '已恢复上次未确认的更新预览。确认后才会保存到个人信息。'
      : null,
  });

  const answered = questions
    .map((question) => ({
      key: question.key,
      question: question.question,
      answer: answers[question.key]?.trim() ?? '',
    }))
    .filter((item) => item.answer && item.answer !== '跳过');
  const canPreview =
    answered.length > 0 && state.status !== 'drafting' && state.status !== 'saving';
  const canSave = state.status === 'preview' && Boolean(state.draft);

  async function createPreview() {
    if (!canPreview) return;
    setState({ status: 'drafting', draft: null, proposal: null, completion: null, message: null });
    try {
      const result = await socialProfileApi.aiDraft({
        answers: answered,
        source: 'agent_profile_completion_card',
      });
      setState({
        status: 'preview',
        draft: result.draft,
        proposal: result.proposal,
        completion: result.completion,
        message: '已生成更新预览。确认后才会保存到个人信息。',
      });
    } catch (error) {
      setState({
        status: 'error',
        draft: null,
        proposal: null,
        completion: null,
        message: error instanceof Error ? error.message : '生成预览失败，请稍后重试。',
      });
    }
  }

  async function saveProfile() {
    if (!canSave || !state.draft) return;
    setState({ ...state, status: 'saving', message: null });
    try {
      const result = await socialProfileApi.aiSave({
        profile: state.draft,
        proposalId: state.proposal?.proposalId,
        expectedProfileVersion: state.proposal?.baseProfileVersion,
      });
      setState({
        status: 'saved',
        draft: state.draft,
        proposal: result.proposal ?? state.proposal,
        completion: result.completion,
        message: savedProfileMessage(result.completion),
      });
    } catch (error) {
      setState({
        status: 'error',
        draft: state.draft,
        proposal: state.proposal,
        completion: state.completion,
        message: error instanceof Error ? error.message : '保存失败，请稍后重试。',
      });
    }
  }

  async function authorizeMatching() {
    if (!state.completion) return;
    setState({ ...state, status: 'authorizing', message: null });
    try {
      const result = await socialProfileApi.updatePrivacy({
        profileDiscoverable: true,
        agentCanRecommendMe: true,
        agentCanStartChatAfterApproval: false,
        ownerConfirmed: true,
        matchingConsent: true,
        profileVisibilityConsent: true,
      });
      setState({
        ...state,
        status: 'saved',
        completion: result.completion ?? state.completion,
        message: '已开启匹配授权。之后 Agent 才可以基于你的资料推荐和被推荐。',
      });
    } catch (error) {
      setState({
        ...state,
        status: 'error',
        message: error instanceof Error ? error.message : '开启匹配授权失败，请稍后重试。',
      });
    }
  }

  function useOnce() {
    setState({
      status: 'idle',
      draft: null,
      proposal: null,
      completion: null,
      message: '本次先跳过资料补全。你仍然可以继续创建本次约练卡；资料不会自动进入匹配池。',
    });
  }

  return (
    <article
      className="overflow-hidden rounded-3xl border border-[#12b89f]/20 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.10)]"
      data-product-component="ProfileCompletionCard"
      data-testid="profile-completion-card"
    >
      <div className="border-b border-slate-200/80 bg-gradient-to-br from-[#effffb] via-white to-[#fff8ed] px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#0f9f8b] text-white shadow-[0_12px_28px_rgba(15,159,139,0.24)]">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-base font-black text-slate-950">{card.title}</p>
            {card.body ? (
              <p className="mt-1 text-sm leading-6 text-slate-600">{card.body}</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-5">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
          资料还不完整，我可以帮你补充。你也可以先创建本次约练卡。所有问题都可以跳过；保存前会展示预览，不会自动开始匹配或发布卡片。
        </div>

        <div className="grid gap-4">
          {questions.map((question, index) => (
            <section key={question.key} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-xs font-bold text-[#0f9f8b]">
                    {String(index + 1).padStart(2, '0')} · {question.label}
                  </span>
                  <p className="mt-1 text-sm font-bold text-slate-900">{question.question}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAnswers((prev) => ({ ...prev, [question.key]: '跳过' }))}
                  className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-500 transition hover:border-slate-300 hover:text-slate-800"
                >
                  跳过
                </button>
              </div>
              {question.options.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {question.options.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setAnswers((prev) => ({ ...prev, [question.key]: option }))}
                      className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                        answers[question.key] === option
                          ? 'bg-[#0f9f8b] text-white shadow-[0_8px_18px_rgba(15,159,139,0.22)]'
                          : 'bg-[#eafaf7] text-[#087f70] hover:bg-[#d8f5ef]'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              ) : null}
              <input
                value={answers[question.key] ?? ''}
                onChange={(event) =>
                  setAnswers((prev) => ({ ...prev, [question.key]: event.target.value }))
                }
                placeholder={question.placeholder || '可以自由填写，也可以选择跳过'}
                className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#0f9f8b] focus:ring-4 focus:ring-[#0f9f8b]/10"
              />
            </section>
          ))}
        </div>

        {state.draft ? <ProfileDraftPreview draft={state.draft} /> : null}

        {shouldShowMatchingAuthorization(state) ? (
          <MatchingAuthorizationPanel
            disabled={state.status === 'authorizing'}
            onAuthorize={() => void authorizeMatching()}
          />
        ) : null}

        {state.message ? (
          <div
            className={`rounded-2xl px-4 py-3 text-sm leading-6 ${
              state.status === 'error'
                ? 'border border-red-200 bg-red-50 text-red-700'
                : 'border border-emerald-200 bg-emerald-50 text-emerald-800'
            }`}
            role="status"
          >
            {state.message}
          </div>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={!canPreview}
            onClick={() => void createPreview()}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#0f9f8b] px-4 py-3 text-sm font-black text-white transition hover:bg-[#0d8d7c] disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {state.status === 'drafting' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            )}
            快速补充资料
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => void saveProfile()}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-[#0f9f8b]/40 px-4 py-3 text-sm font-black text-[#087f70] transition hover:bg-[#eafaf7] disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
          >
            {state.status === 'saving' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            )}
            确认保存
          </button>
          <button
            type="button"
            onClick={useOnce}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
          >
            本次先跳过
          </button>
        </div>
      </div>
    </article>
  );
}

function ProfileDraftPreview({ draft }: { draft: SocialProfileBuilderCard }) {
  const rows = [
    ['城市', draft.basic.city],
    ['兴趣', [...draft.interests.sports, ...draft.interests.lifestyle].join('、')],
    ['想认识的人', draft.preferences.wantToMeet.join('、')],
    [
      '可约时间',
      [draft.availability.weekdays, draft.availability.weekends].filter(Boolean).join('；'),
    ],
  ].filter(([, value]) => value);
  return (
    <section className="rounded-2xl border border-[#0f9f8b]/20 bg-[#f3fffc] p-4">
      <p className="text-sm font-black text-slate-950">更新预览</p>
      {draft.summary ? (
        <p className="mt-2 text-sm leading-6 text-slate-700">{draft.summary}</p>
      ) : null}
      <div className="mt-3 grid gap-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4 text-sm">
            <span className="text-slate-500">{label}</span>
            <strong className="max-w-[70%] text-right font-semibold text-slate-900">{value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function MatchingAuthorizationPanel({
  disabled,
  onAuthorize,
}: {
  disabled: boolean;
  onAuthorize: () => void;
}) {
  return (
    <section
      className="rounded-2xl border border-amber-200 bg-amber-50 p-4"
      data-testid="profile-matching-authorization-card"
    >
      <p className="text-sm font-black text-slate-950">开启匹配授权</p>
      <p className="mt-2 text-sm leading-6 text-slate-700">
        资料已保存。只有你单独确认后，资料才会进入匹配池或被 Agent 推荐。
      </p>
      <button
        type="button"
        disabled={disabled}
        onClick={onAuthorize}
        className="mt-3 inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {disabled ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        确认开启匹配授权
      </button>
    </section>
  );
}

function shouldShowMatchingAuthorization(state: DraftState) {
  return (
    state.status === 'saved' &&
    state.completion?.canEnterMatchPool === true &&
    state.completion.authorizationRequired === true
  );
}

function savedProfileMessage(completion: SocialProfileCompletion) {
  const rounded = Math.round(completion.percent);
  const missing = completion.missingFields
    .map((field) => userFacingProfileFieldLabel(field.trim()))
    .filter(Boolean);
  if (missing.length === 0) {
    return `已保存到个人信息。当前资料完整度 ${rounded}%。匹配授权需要单独确认。`;
  }
  return `已保存到个人信息。当前资料完整度 ${rounded}%。还可以继续补充：${missing.slice(0, 4).join('、')}。`;
}

function userFacingProfileFieldLabel(field: string) {
  const labels: Record<string, string> = {
    nickname: '昵称',
    gender: '性别展示偏好',
    ageRange: '年龄段展示偏好',
    city: '城市',
    nearbyArea: '常活动区域',
    mbti: '性格关键词',
    zodiac: '星座',
    traits: '性格标签',
    socialStyle: '社交风格',
    communicationStyle: '沟通方式',
    fitnessGoals: '运动目标',
    interestTags: '兴趣活动',
    lifestyleTags: '生活方式',
    socialScenes: '社交场景',
    wantToMeet: '想认识的人',
    preferredTraits: '偏好的特质',
    avoidTraits: '不接受的行为',
    relationshipGoals: '社交目标',
    availableTimes: '可约时间',
    weekdayAvailability: '工作日可约时间',
    weekendAvailability: '周末可约时间',
    socialPreference: '相处节奏',
    rejectRules: '拒绝规则',
    privacyBoundary: '隐私与安全边界',
    profileDiscoverable: '发现页可见授权',
    agentCanRecommendMe: '匹配授权',
    agentCanStartChatAfterApproval: '站内联系授权',
  };
  return labels[field] ?? field;
}

function readPendingProposal(value: unknown): ProfileUpdateProposal | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<ProfileUpdateProposal>;
  if (typeof record.proposalId !== 'number') return null;
  if (typeof record.baseProfileVersion !== 'number') return null;
  if (!record.draft || typeof record.draft !== 'object') return null;
  return record as ProfileUpdateProposal;
}

function readQuestions(value: unknown): ProfileQuestion[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item, index) => ({
      key: text(item.key) || `question_${index}`,
      label: text(item.label) || '补充信息',
      question: text(item.question) || '请补充这项信息',
      placeholder: text(item.placeholder),
      options: Array.isArray(item.options) ? item.options.map(text).filter(Boolean) : [],
    }))
    .slice(0, 5);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
