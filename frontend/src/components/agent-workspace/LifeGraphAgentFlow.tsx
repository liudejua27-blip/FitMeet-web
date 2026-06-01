import { type FormEvent, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  lifeGraphApi,
  type LifeGraphAuditLog,
  type LifeGraphCompleteness,
  type LifeGraphFieldCategory,
  type LifeGraphProposal,
  type LifeGraphResponse,
  type UpdateLifeGraphFieldInput,
} from '../../api/lifeGraphApi';

type SignalType = 'core_signal' | 'weak_signal' | 'entertainment_signal' | 'sensitive_signal';
type QuickResult = 'rhythm' | 'weekly' | 'changes' | null;
type FormState = {
  nickname: string;
  birthDate: string;
  city: string;
  nearbyArea: string;
  preferredLanguage: string;
  schoolOrOccupation: string;
  wakeUpTime: string;
  sleepTime: string;
  workdayRoutine: string;
  weekendAvailability: string;
  mealTimePreference: string;
  activeHours: string;
  sportsPreferences: string;
  exerciseFrequency: string;
  fitnessGoals: string;
  interests: string;
  foodPreferences: string;
  activitiesToTry: string;
  currentSocialGoal: string;
  preferredPeople: string;
  preferredSocialStyle: string;
  oneOnOneOrGroup: string;
  acceptsMixedGenderWorkout: boolean;
  acceptsNightMeet: boolean;
  unacceptableBehaviors: string;
  openerStylePreference: string;
  agentTonePreference: string;
  preciseLocationSharing: boolean;
  healthDataEnabled: boolean;
  periodCycleEnabled: boolean;
  contactSharingRequiresApproval: boolean;
  offlineMeetRequiresApproval: boolean;
  paymentAutoExecution: boolean;
  entertainmentSignalsEnabled: boolean;
  mbti: string;
  birthdayPersonality: string;
  mysticInterestTags: string;
};

const defaultForm: FormState = {
  nickname: '',
  birthDate: '',
  city: '',
  nearbyArea: '',
  preferredLanguage: 'zh-CN',
  schoolOrOccupation: '',
  wakeUpTime: '',
  sleepTime: '',
  workdayRoutine: '',
  weekendAvailability: '',
  mealTimePreference: '',
  activeHours: '',
  sportsPreferences: '',
  exerciseFrequency: '',
  fitnessGoals: '',
  interests: '',
  foodPreferences: '',
  activitiesToTry: '',
  currentSocialGoal: '',
  preferredPeople: '',
  preferredSocialStyle: '',
  oneOnOneOrGroup: '先一对一，熟悉后小组',
  acceptsMixedGenderWorkout: true,
  acceptsNightMeet: false,
  unacceptableBehaviors: '',
  openerStylePreference: '自然、低压力',
  agentTonePreference: '温和、直接、有边界感',
  preciseLocationSharing: false,
  healthDataEnabled: false,
  periodCycleEnabled: false,
  contactSharingRequiresApproval: true,
  offlineMeetRequiresApproval: true,
  paymentAutoExecution: false,
  entertainmentSignalsEnabled: true,
  mbti: '',
  birthdayPersonality: '',
  mysticInterestTags: '',
};

const steps = ['基础信息', '生活习惯', '兴趣与运动', '社交偏好', '隐私边界'];

const fieldLabels: Record<string, string> = {
  sportsPreferences: '运动偏好',
  preferredPeople: '匹配偏好',
  publicPlaceOnly: '首次见面边界',
  currentSocialGoal: '当前社交目标',
  preferredSocialStyle: '社交风格',
  openerStylePreference: '开场偏好',
};

export function LifeGraphQuickActions({
  onStartOnboarding,
  onStartMatch,
  onShowResult,
}: {
  onStartOnboarding: () => void;
  onStartMatch: () => void;
  onShowResult: (type: Exclude<QuickResult, null>) => void;
}) {
  return (
    <div className="life-agent-actions" aria-label="Life Graph Agent 快捷任务">
      <button type="button" onClick={onStartOnboarding}>完善 Life Graph</button>
      <button type="button" onClick={onStartMatch}>找附近搭子</button>
      <button type="button" onClick={() => onShowResult('rhythm')}>分析我的生活节奏</button>
      <button type="button" onClick={() => onShowResult('weekly')}>推荐本周活动</button>
      <button type="button" onClick={() => onShowResult('changes')}>查看我的画像变化</button>
    </div>
  );
}

export function LifeGraphOnboardingModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [status, setStatus] = useState('');
  const [completeness, setCompleteness] = useState<LifeGraphCompleteness | null>(null);
  const [followupAnswer, setFollowupAnswer] = useState('');
  const [proposal, setProposal] = useState<LifeGraphProposal | null>(null);

  useEffect(() => {
    if (!open) return;
    setStatus('');
    void lifeGraphApi.getMe().then((data) => {
      setCompleteness(data.completeness);
      setForm((current) => ({
        ...current,
        nickname: stringValue(data.fields.identity?.find((field) => field.fieldKey === 'nickname')?.fieldValue) || current.nickname,
        city: data.profile.city || current.city,
        preferredLanguage: data.profile.preferredLanguage || current.preferredLanguage,
        currentSocialGoal: data.profile.currentSocialGoal || current.currentSocialGoal,
      }));
    }).catch(() => setStatus('暂时无法同步 Life Graph，可以先填写，稍后再提交。'));
  }, [open]);

  if (!open) return null;

  const submitManualFields = async (event: FormEvent) => {
    event.preventDefault();
    setStatus('正在保存你确认填写的字段...');
    try {
      const response = await lifeGraphApi.updateMe({
        city: form.city.trim() || undefined,
        preferredLanguage: form.preferredLanguage.trim() || undefined,
        currentSocialGoal: form.currentSocialGoal.trim() || undefined,
        fields: buildManualFields(form),
      });
      setCompleteness(response.completeness);
      setStatus('Life Graph 已初步完成。再回答几个关键问题，我会生成可确认的画像更新。');
    } catch {
      setStatus('保存没有成功，请确认已登录后再试一次。');
    }
  };

  const extractFollowup = async () => {
    if (!followupAnswer.trim()) {
      setStatus('请先回答 2-3 个关键缺失项。');
      return;
    }
    setStatus('正在识别可更新的画像字段...');
    try {
      const nextProposal = await lifeGraphApi.extractFromChat({
        message: followupAnswer.trim(),
        context: {
          source: 'agent_life_graph_onboarding',
          policy: 'ai_inference_requires_user_confirmation',
          entertainmentSignalsEnabled: form.entertainmentSignalsEnabled,
        },
      });
      setProposal(nextProposal);
      setStatus('我识别到以下画像更新，请确认后再保存。');
    } catch {
      setStatus('这次没有识别出足够明确的画像更新。你可以换一种说法，或先跳过。');
    }
  };

  const confirmProposal = async () => {
    if (!proposal) return;
    setStatus('正在写入已确认的 Life Graph 更新...');
    try {
      const saved = await lifeGraphApi.confirmUpdate({ proposalId: proposal.proposalId });
      setProposal(saved);
      setStatus('已保存到 Life Graph，并写入 audit log。');
      const latest = await lifeGraphApi.getCompleteness();
      setCompleteness(latest);
    } catch {
      setStatus('确认保存失败，请稍后重试。');
    }
  };

  const rejectProposal = async () => {
    if (!proposal) return;
    setStatus('正在忽略这次画像更新...');
    try {
      await lifeGraphApi.rejectUpdate({ proposalId: proposal.proposalId, reason: 'user_rejected_from_agent_onboarding' });
      setProposal(null);
      setStatus('已不保存这次 AI 识别结果。');
    } catch {
      setStatus('暂时无法更新状态，请稍后再试。');
    }
  };

  return (
    <div className="life-modal-backdrop" role="presentation">
      <section className="life-modal" role="dialog" aria-modal="true" aria-labelledby="life-modal-title">
        <header className="life-modal__header">
          <div>
            <span>Life Graph Agent</span>
            <h2 id="life-modal-title">完善你的 Life Graph</h2>
            <p>这些信息只用于帮助 Agent 更准确地理解你、匹配合适的人和活动。你可以随时编辑、撤回或关闭。</p>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭 Life Graph 完善弹窗">关闭</button>
        </header>

        <LifeGraphProgressIndicator current={step} completeness={completeness?.completenessScore ?? 0} />

        <form className="life-modal__body" onSubmit={submitManualFields}>
          <LifeGraphOnboardingStep step={step} form={form} onChange={setForm} />
          <EntertainmentSignalNotice enabled={form.entertainmentSignalsEnabled} />
          <footer className="life-modal__footer">
            <button type="button" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}>上一步</button>
            {step < steps.length - 1 ? (
              <button type="button" onClick={() => setStep((value) => Math.min(steps.length - 1, value + 1))}>下一步</button>
            ) : (
              <button type="submit">保存并生成追问</button>
            )}
          </footer>
        </form>

        <LifeGraphQuestionPrompt
          completeness={completeness}
          answer={followupAnswer}
          status={status}
          onAnswer={setFollowupAnswer}
          onExtract={extractFollowup}
        />
        {proposal ? (
          <LifeGraphProposalConfirm proposal={proposal} onConfirm={confirmProposal} onReject={rejectProposal} />
        ) : null}
      </section>
    </div>
  );
}

export function LifeGraphOnboardingStep({
  step,
  form,
  onChange,
}: {
  step: number;
  form: FormState;
  onChange: (form: FormState) => void;
}) {
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => onChange({ ...form, [key]: value });
  return (
    <div className="life-step">
      <h3>{steps[step]}</h3>
      {step === 0 ? (
        <div className="life-step__grid">
          <TextField label="昵称" value={form.nickname} onChange={(value) => set('nickname', value)} />
          <TextField label="出生日期" type="date" value={form.birthDate} onChange={(value) => set('birthDate', value)} />
          <TextField label="城市" value={form.city} onChange={(value) => set('city', value)} />
          <TextField label="常活动区域" value={form.nearbyArea} onChange={(value) => set('nearbyArea', value)} />
          <TextField label="偏好语言" value={form.preferredLanguage} onChange={(value) => set('preferredLanguage', value)} />
          <TextField label="学校或职业（可选）" value={form.schoolOrOccupation} onChange={(value) => set('schoolOrOccupation', value)} />
          <TextField label="MBTI（可选）" value={form.mbti} onChange={(value) => set('mbti', value)} />
          <TextField label="生日性格 / 趣味人格（可选）" value={form.birthdayPersonality} onChange={(value) => set('birthdayPersonality', value)} />
        </div>
      ) : null}
      {step === 1 ? (
        <div className="life-step__grid">
          <TextField label="通常起床时间" type="time" value={form.wakeUpTime} onChange={(value) => set('wakeUpTime', value)} />
          <TextField label="通常睡觉时间" type="time" value={form.sleepTime} onChange={(value) => set('sleepTime', value)} />
          <TextField label="工作日节奏" value={form.workdayRoutine} onChange={(value) => set('workdayRoutine', value)} />
          <TextField label="周末可约时间" value={form.weekendAvailability} onChange={(value) => set('weekendAvailability', value)} />
          <TextField label="吃饭时间偏好" value={form.mealTimePreference} onChange={(value) => set('mealTimePreference', value)} />
          <TextField label="社交活跃时段" value={form.activeHours} onChange={(value) => set('activeHours', value)} />
        </div>
      ) : null}
      {step === 2 ? (
        <div className="life-step__grid">
          <TextField label="运动偏好" value={form.sportsPreferences} onChange={(value) => set('sportsPreferences', value)} />
          <TextField label="运动频率" value={form.exerciseFrequency} onChange={(value) => set('exerciseFrequency', value)} />
          <TextField label="健身目标" value={form.fitnessGoals} onChange={(value) => set('fitnessGoals', value)} />
          <TextField label="兴趣爱好" value={form.interests} onChange={(value) => set('interests', value)} />
          <TextField label="饮食偏好" value={form.foodPreferences} onChange={(value) => set('foodPreferences', value)} />
          <TextField label="想尝试的活动" value={form.activitiesToTry} onChange={(value) => set('activitiesToTry', value)} />
          <TextField label="玄学 / 算命兴趣标签（可选）" value={form.mysticInterestTags} onChange={(value) => set('mysticInterestTags', value)} />
        </div>
      ) : null}
      {step === 3 ? (
        <div className="life-step__grid">
          <TextField label="当前社交目标" value={form.currentSocialGoal} onChange={(value) => set('currentSocialGoal', value)} />
          <TextField label="想认识的人" value={form.preferredPeople} onChange={(value) => set('preferredPeople', value)} />
          <TextField label="偏好社交风格" value={form.preferredSocialStyle} onChange={(value) => set('preferredSocialStyle', value)} />
          <TextField label="一对一 / 小组偏好" value={form.oneOnOneOrGroup} onChange={(value) => set('oneOnOneOrGroup', value)} />
          <ToggleField label="接受混合性别约练" checked={form.acceptsMixedGenderWorkout} onChange={(value) => set('acceptsMixedGenderWorkout', value)} />
          <ToggleField label="接受夜间见面" checked={form.acceptsNightMeet} onChange={(value) => set('acceptsNightMeet', value)} />
          <TextField label="不可接受行为" value={form.unacceptableBehaviors} onChange={(value) => set('unacceptableBehaviors', value)} />
          <TextField label="开场白风格偏好" value={form.openerStylePreference} onChange={(value) => set('openerStylePreference', value)} />
          <TextField label="Agent 语气偏好" value={form.agentTonePreference} onChange={(value) => set('agentTonePreference', value)} />
        </div>
      ) : null}
      {step === 4 ? (
        <LifeGraphPrivacySettingsMini form={form} onChange={onChange} />
      ) : null}
    </div>
  );
}

export function LifeGraphPrivacySettingsMini({ form, onChange }: { form: FormState; onChange: (form: FormState) => void }) {
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => onChange({ ...form, [key]: value });
  return (
    <div className="life-privacy-mini">
      <ToggleField label="精确位置共享" checked={form.preciseLocationSharing} onChange={(value) => set('preciseLocationSharing', value)} lockedHint="默认关闭" />
      <ToggleField label="健康数据授权" checked={form.healthDataEnabled} onChange={(value) => set('healthDataEnabled', value)} lockedHint="默认关闭" />
      <ToggleField label="生理期数据授权" checked={form.periodCycleEnabled} onChange={(value) => set('periodCycleEnabled', value)} lockedHint="默认关闭" />
      <ToggleField label="联系方式共享需确认" checked={form.contactSharingRequiresApproval} onChange={(value) => set('contactSharingRequiresApproval', value)} />
      <ToggleField label="线下见面需确认" checked={form.offlineMeetRequiresApproval} onChange={(value) => set('offlineMeetRequiresApproval', value)} />
      <ToggleField label="支付 / 钱包自动执行" checked={form.paymentAutoExecution} onChange={() => set('paymentAutoExecution', false)} lockedHint="永远关闭" />
      <ToggleField label="娱乐信号参与轻量推荐" checked={form.entertainmentSignalsEnabled} onChange={(value) => set('entertainmentSignalsEnabled', value)} />
    </div>
  );
}

export function LifeGraphProgressIndicator({ current, completeness }: { current: number; completeness: number }) {
  return (
    <div className="life-progress">
      <div>
        {steps.map((label, index) => (
          <span key={label} className={clsx(index === current && 'is-active', index < current && 'is-done')}>
            {index + 1}
          </span>
        ))}
      </div>
      <p>完整度 {Math.round(completeness || 0)}%</p>
    </div>
  );
}

export function LifeGraphQuestionPrompt({
  completeness,
  answer,
  status,
  onAnswer,
  onExtract,
}: {
  completeness: LifeGraphCompleteness | null;
  answer: string;
  status: string;
  onAnswer: (answer: string) => void;
  onExtract: () => void;
}) {
  const questions = (completeness?.missingFields ?? []).slice(0, 3);
  return (
    <section className="life-followup">
      <h3>Agent 追问</h3>
      <p>你的 Life Graph 已初步完成。为了让我更准确地帮你匹配，还缺这些关键信息：</p>
      <ol>
        {(questions.length ? questions : fallbackQuestions).map((item) => (
          <li key={`${item.category}-${item.fieldKey}`}>{item.label}</li>
        ))}
      </ol>
      <textarea
        value={answer}
        onChange={(event) => onAnswer(event.target.value)}
        placeholder="例如：我更喜欢跑步，希望认识同校或同城的人，第一次见面只接受公共场所。"
      />
      <div>
        <button type="button" onClick={onExtract}>识别画像更新</button>
        {status ? <span role="status">{status}</span> : null}
      </div>
    </section>
  );
}

export function LifeGraphProposalConfirm({
  proposal,
  onConfirm,
  onReject,
}: {
  proposal: LifeGraphProposal;
  onConfirm: () => void;
  onReject: () => void;
}) {
  return (
    <section className="life-proposal-confirm">
      <h3>我识别到以下画像更新</h3>
      <div>
        {proposal.proposedFields.map((field) => (
          <article key={field.proposalFieldId}>
            <span>{fieldLabels[field.fieldKey] ?? field.fieldKey}</span>
            <strong>{displayValue(field.fieldValue)}</strong>
            <small>{field.reason || '来自你刚刚的回答，确认后才会写入 Life Graph。'}</small>
          </article>
        ))}
      </div>
      <footer>
        <button type="button" onClick={onConfirm}>确认保存</button>
        <button type="button">修改</button>
        <button type="button" onClick={onReject}>不保存</button>
      </footer>
    </section>
  );
}

export function LifeGraphChangeSummary({ auditLogs }: { auditLogs: LifeGraphAuditLog[] }) {
  return (
    <section className="life-agent-result">
      <span>Life Graph Changes</span>
      <h3>最近画像变化</h3>
      <div className="life-change-list">
        {auditLogs.slice(0, 5).map((item) => (
          <article key={item.id}>
            <strong>{fieldLabels[item.fieldKey] ?? item.fieldKey}</strong>
            <p>{auditActionText(item.action)} · {displayValue(item.newValue)}</p>
          </article>
        ))}
        {auditLogs.length === 0 ? <p>暂时没有可展示的画像更新。新的 AI 推断会先进入 proposal，确认后才写入。</p> : null}
      </div>
    </section>
  );
}

export function LifeRhythmAnalysisResult({ graph }: { graph: LifeGraphResponse | null }) {
  const fields = graph ? flattenFields(graph) : new Map<string, unknown>();
  const wakeUp = displayValue(fields.get('lifestyle:wakeUpTime'));
  const sleep = displayValue(fields.get('lifestyle:sleepTime'));
  const workday = displayValue(fields.get('lifestyle:workdayRoutine'));
  const activeHours = displayValue(fields.get('lifestyle:activeHours'));
  const weekend = displayValue(fields.get('lifestyle:weekendAvailability'));
  return (
    <section className="life-agent-result">
      <span>Life Rhythm</span>
      <h3>{graph ? '基于 Life Graph 的生活节奏分析' : '正在读取你的生活节奏'}</h3>
      <p>
        {graph
          ? `当前画像完整度 ${Math.round(graph.completeness.completenessScore)}%。Agent 会优先参考你的作息、活跃时段和周末可约时间，而不是盲目推送陌生人。`
          : '登录并完善 Life Graph 后，这里会用你的真实画像生成节奏分析。'}
      </p>
      <ul>
        <li>起床 / 睡觉：{wakeUp !== '未填写' || sleep !== '未填写' ? `${wakeUp} / ${sleep}` : '待补充'}</li>
        <li>工作日节奏：{workday}</li>
        <li>活跃时段：{activeHours}</li>
        <li>周末可约：{weekend}</li>
      </ul>
    </section>
  );
}

export function WeeklyActivityRecommendation({ graph }: { graph: LifeGraphResponse | null }) {
  const fields = graph ? flattenFields(graph) : new Map<string, unknown>();
  const sports = displayValue(fields.get('fitness_activity:sportsPreferences'));
  const interests = displayValue(fields.get('fitness_activity:interests'));
  const activities = displayValue(fields.get('fitness_activity:activitiesToTry'));
  const boundary = displayValue(fields.get('privacy_boundary:offlineMeetRequiresApproval'));
  return (
    <section className="life-agent-result">
      <span>Weekly Suggestions</span>
      <h3>本周活动建议</h3>
      <div className="life-recommendations">
        <article><strong>优先运动搭子</strong><p>{sports !== '未填写' ? `根据你的运动偏好：${sports}，先推荐低压力约练。` : '先完善运动偏好，再生成更准的约练建议。'}</p></article>
        <article><strong>兴趣活动破冰</strong><p>{interests !== '未填写' || activities !== '未填写' ? `可以围绕 ${activities !== '未填写' ? activities : interests} 发起活动。` : '补充兴趣后，Agent 会推荐更自然的破冰场景。'}</p></article>
        <article><strong>安全确认</strong><p>{boundary === '是' || boundary === 'true' ? '线下见面需要你确认，Agent 只会先生成计划。' : '建议保持线下见面确认开关，避免自动推进真实见面。'}</p></article>
      </div>
    </section>
  );
}

export function EntertainmentSignalNotice({ enabled }: { enabled: boolean }) {
  return (
    <aside className="life-entertainment-notice">
      星座、MBTI、生日性格和玄学兴趣只作为 weak_signal / entertainment_signal，用于破冰、自我表达和轻量语气调整。
      {enabled ? ' 当前允许参与轻量推荐。' : ' 当前不会参与推荐排序。'}
    </aside>
  );
}

export function useLifeGraphAgentResults() {
  const [result, setResult] = useState<QuickResult>(null);
  const [graph, setGraph] = useState<LifeGraphResponse | null>(null);
  const [auditLogs, setAuditLogs] = useState<LifeGraphAuditLog[]>([]);

  useEffect(() => {
    if (!result) return;
    if (result === 'changes') {
      void lifeGraphApi.getAudit().then(setAuditLogs).catch(() => setAuditLogs([]));
      return;
    }
    void lifeGraphApi.getMe().then(setGraph).catch(() => setGraph(null));
  }, [result]);

  const resultNode = useMemo(() => {
    if (result === 'rhythm') return <LifeRhythmAnalysisResult graph={graph} />;
    if (result === 'weekly') return <WeeklyActivityRecommendation graph={graph} />;
    if (result === 'changes') return <LifeGraphChangeSummary auditLogs={auditLogs} />;
    return null;
  }, [auditLogs, graph, result]);

  return { result, setResult, resultNode };
}

function TextField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="life-field">
      <span>{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
  lockedHint,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  lockedHint?: string;
}) {
  return (
    <label className="life-toggle">
      <span>{label}<small>{lockedHint}</small></span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function buildManualFields(form: FormState): UpdateLifeGraphFieldInput[] {
  const zodiac = deriveZodiacSign(form.birthDate);
  const entertainmentSignal = {
    signalType: 'entertainment_signal' as SignalType,
    visibleInRecommendationReason: false,
    userCanDisableForMatching: true,
    enabledForMatching: form.entertainmentSignalsEnabled,
  };
  const weakSignal = {
    signalType: 'weak_signal' as SignalType,
    visibleInRecommendationReason: false,
    userCanDisableForMatching: true,
    enabledForMatching: form.entertainmentSignalsEnabled,
  };
  const sensitiveSignal = {
    signalType: 'sensitive_signal' as SignalType,
    visibleInRecommendationReason: false,
    userCanDisableForMatching: false,
    enabledForMatching: false,
  };
  return [
    field('identity', 'nickname', form.nickname),
    field('identity', 'birthDate', form.birthDate, sensitiveSignal),
    field('identity', 'ageRange', deriveAgeRange(form.birthDate)),
    field('identity', 'zodiacSign', zodiac, entertainmentSignal),
    field('identity', 'mbti', form.mbti, weakSignal),
    field('identity', 'birthdayPersonality', form.birthdayPersonality, entertainmentSignal),
    field('identity', 'nearbyArea', form.nearbyArea),
    field('identity', 'schoolOrOccupation', form.schoolOrOccupation),
    field('lifestyle', 'wakeUpTime', form.wakeUpTime),
    field('lifestyle', 'sleepTime', form.sleepTime),
    field('lifestyle', 'workdayRoutine', form.workdayRoutine),
    field('lifestyle', 'weekendAvailability', form.weekendAvailability),
    field('lifestyle', 'mealTimePreference', form.mealTimePreference),
    field('lifestyle', 'activeHours', form.activeHours),
    field('fitness_activity', 'sportsPreferences', splitValue(form.sportsPreferences)),
    field('fitness_activity', 'exerciseFrequency', form.exerciseFrequency),
    field('fitness_activity', 'fitnessGoals', splitValue(form.fitnessGoals)),
    field('fitness_activity', 'interests', splitValue(form.interests)),
    field('fitness_activity', 'foodPreferences', splitValue(form.foodPreferences)),
    field('fitness_activity', 'activitiesToTry', splitValue(form.activitiesToTry)),
    field('interaction_memory', 'mysticInterestTags', splitValue(form.mysticInterestTags), entertainmentSignal),
    field('social_intent', 'currentSocialGoal', form.currentSocialGoal),
    field('social_intent', 'preferredPeople', form.preferredPeople),
    field('social_intent', 'preferredSocialStyle', form.preferredSocialStyle),
    field('social_intent', 'oneOnOneOrGroup', form.oneOnOneOrGroup),
    field('fitness_activity', 'acceptsMixedGenderWorkout', form.acceptsMixedGenderWorkout),
    field('lifestyle', 'acceptsNightMeet', form.acceptsNightMeet),
    field('social_intent', 'unacceptableBehaviors', splitValue(form.unacceptableBehaviors)),
    field('interaction_memory', 'openerStylePreference', form.openerStylePreference),
    field('interaction_memory', 'preferredAgentTone', form.agentTonePreference),
    field('privacy_boundary', 'preciseLocationSharing', form.preciseLocationSharing, sensitiveSignal),
    field('privacy_boundary', 'healthDataEnabled', form.healthDataEnabled, sensitiveSignal),
    field('privacy_boundary', 'periodCycleEnabled', form.periodCycleEnabled, sensitiveSignal),
    field('privacy_boundary', 'contactSharingRequiresApproval', form.contactSharingRequiresApproval, {
      signalType: 'sensitive_signal',
      visibleInRecommendationReason: false,
      userCanDisableForMatching: false,
      enabledForMatching: true,
    }),
    field('privacy_boundary', 'offlineMeetRequiresApproval', form.offlineMeetRequiresApproval, {
      signalType: 'sensitive_signal',
      visibleInRecommendationReason: false,
      userCanDisableForMatching: false,
      enabledForMatching: true,
    }),
    field('privacy_boundary', 'paymentAutoExecution', false, sensitiveSignal),
    field('privacy_boundary', 'entertainmentSignalsEnabled', form.entertainmentSignalsEnabled),
  ].filter((item): item is UpdateLifeGraphFieldInput => Boolean(item));
}

function field(
  category: LifeGraphFieldCategory,
  fieldKey: string,
  fieldValue: unknown,
  signalMetadata: Partial<Pick<
    UpdateLifeGraphFieldInput,
    'signalType' | 'visibleInRecommendationReason' | 'userCanDisableForMatching' | 'enabledForMatching'
  >> = {},
): UpdateLifeGraphFieldInput | null {
  if (fieldValue === '' || fieldValue === null || fieldValue === undefined) return null;
  if (Array.isArray(fieldValue) && fieldValue.length === 0) return null;
  return {
    category,
    fieldKey,
    fieldValue,
    confirmedByUser: true,
    editable: true,
    reason: 'agent_life_graph_onboarding_manual',
    ...signalMetadata,
  };
}

function splitValue(value: string) {
  return value.split(/[，,、]/).map((item) => item.trim()).filter(Boolean);
}

function deriveAgeRange(birthDate: string) {
  if (!birthDate) return '';
  const year = Number(birthDate.slice(0, 4));
  if (!year || Number.isNaN(year)) return '';
  const age = new Date().getFullYear() - year;
  if (age < 18) return '18 岁以下';
  if (age <= 24) return '18-24';
  if (age <= 30) return '25-30';
  if (age <= 40) return '31-40';
  return '40+';
}

function deriveZodiacSign(birthDate: string) {
  if (!birthDate) return '';
  const [, monthText, dayText] = birthDate.split('-');
  const month = Number(monthText);
  const day = Number(dayText);
  const signs = [
    ['摩羯座', 20], ['水瓶座', 19], ['双鱼座', 21], ['白羊座', 20], ['金牛座', 21], ['双子座', 22],
    ['巨蟹座', 23], ['狮子座', 23], ['处女座', 23], ['天秤座', 24], ['天蝎座', 23], ['射手座', 22], ['摩羯座', 32],
  ] as const;
  return day < signs[month - 1]?.[1] ? signs[month - 1]?.[0] ?? '' : signs[month]?.[0] ?? '';
}

function displayValue(value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'value' in value) {
    return displayValue((value as { value: unknown }).value);
  }
  if (Array.isArray(value)) return value.join(' / ');
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (value === null || value === undefined || value === '') return '未填写';
  return String(value);
}

function stringValue(value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'value' in value) {
    return stringValue((value as { value: unknown }).value);
  }
  return typeof value === 'string' ? value : '';
}

function flattenFields(graph: LifeGraphResponse) {
  const map = new Map<string, unknown>();
  for (const [category, fields] of Object.entries(graph.fields)) {
    for (const fieldItem of fields ?? []) {
      if (!fieldItem.revoked) map.set(`${category}:${fieldItem.fieldKey}`, fieldItem.fieldValue);
    }
  }
  return map;
}

function auditActionText(action: string) {
  const map: Record<string, string> = {
    created: '已创建',
    updated: '已更新',
    confirmed: '已确认',
    revoked: '已撤回',
    rejected: '已拒绝',
    ai_proposed: 'AI 提出',
  };
  return map[action] ?? action;
}

const fallbackQuestions = [
  { category: 'fitness_activity' as LifeGraphFieldCategory, fieldKey: 'sportsPreferences', label: '你更喜欢跑步、健身还是散步？' },
  { category: 'social_intent' as LifeGraphFieldCategory, fieldKey: 'preferredPeople', label: '你希望认识同校、同城，还是兴趣相同的人？' },
  { category: 'privacy_boundary' as LifeGraphFieldCategory, fieldKey: 'publicPlaceOnly', label: '第一次见面是否只接受公共场所？' },
];
