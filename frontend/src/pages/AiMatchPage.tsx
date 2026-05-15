import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import * as dataService from '../services/dataService';
import type {
  AiAutopilotHistoryItem,
  AiAutopilotRunResult,
  AiDelegateProfile,
  AiMatchCandidate,
  AiMatchSession,
} from '../types';
import { useAuthStore } from '../stores';

const sportOptions = ['跑步', '健身', '瑜伽', '羽毛球', '徒步', '骑行', '篮球', '游泳'];
const defaultProfile: AiDelegateProfile = {
  userId: 0,
  enabled: false,
  privacyConsent: false,
  autoChatEnabled: false,
  dailyAutoChatLimit: 3,
  preferredName: '',
  city: '',
  favoriteSports: [],
  interests: '',
  workExperience: '',
  idealPartner: '',
  trainingGoals: '',
  boundaries: '',
  availability: '',
};

export const AiMatchPage = memo(function AiMatchPage() {
  const { user } = useAuthStore();
  const [profile, setProfile] = useState<AiDelegateProfile>(defaultProfile);
  const [candidates, setCandidates] = useState<AiMatchCandidate[]>([]);
  const [autopilotHistory, setAutopilotHistory] = useState<AiAutopilotHistoryItem[]>([]);
  const [autopilotResult, setAutopilotResult] = useState<AiAutopilotRunResult | null>(null);
  const [selectedSession, setSelectedSession] = useState<AiMatchSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningAutopilot, setRunningAutopilot] = useState(false);
  const [simulatingId, setSimulatingId] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'profile' | 'candidates' | 'autopilot'>('profile');

  const canMatch = profile.enabled && profile.privacyConsent;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const saved = await dataService.getAiDelegateProfile();
      setProfile({ ...defaultProfile, ...saved });
      if (saved.enabled && saved.privacyConsent) {
        const [nextCandidates, history] = await Promise.all([
          dataService.getAiMatchCandidates(),
          dataService.getAiAutopilotHistory(),
        ]);
        setCandidates(nextCandidates);
        setAutopilotHistory(history);
      } else {
        setCandidates([]);
        setAutopilotHistory([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 托管资料加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updateField = <K extends keyof AiDelegateProfile>(key: K, value: AiDelegateProfile[K]) => {
    setProfile((current) => ({ ...current, [key]: value }));
  };

  const toggleSport = (sport: string) => {
    setProfile((current) => {
      const hasSport = current.favoriteSports.includes(sport);
      return {
        ...current,
        favoriteSports: hasSport
          ? current.favoriteSports.filter((item) => item !== sport)
          : [...current.favoriteSports, sport],
      };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const saved = await dataService.saveAiDelegateProfile(profile);
      setProfile({ ...defaultProfile, ...saved });
      setMessage(saved.enabled ? 'AI 托管已开启，正在为你寻找合适搭子。' : 'AI 托管资料已保存。');
      if (saved.enabled && saved.privacyConsent) {
        const [nextCandidates, history] = await Promise.all([
          dataService.getAiMatchCandidates(),
          dataService.getAiAutopilotHistory(),
        ]);
        setCandidates(nextCandidates);
        setAutopilotHistory(history);
      } else {
        setCandidates([]);
        setAutopilotHistory([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSimulate = async (candidate: AiMatchCandidate) => {
    setSimulatingId(candidate.userId);
    setError('');
    setSelectedSession(null);
    try {
      setSelectedSession(await dataService.simulateAiMatch(candidate.userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 试聊失败');
    } finally {
      setSimulatingId(null);
    }
  };

  const handleApprove = async () => {
    if (!selectedSession) return;
    setError('');
    try {
      const result = await dataService.approveAiMatchFriend(selectedSession.id);
      setMessage(result.message);
      setSelectedSession({ ...selectedSession, status: 'approved' });
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加好友失败');
    }
  };

  const handleRunAutopilot = async () => {
    setRunningAutopilot(true);
    setError('');
    setMessage('');
    try {
      const result = await dataService.runAiAutopilot();
      const [nextCandidates, history] = await Promise.all([
        dataService.getAiMatchCandidates(),
        dataService.getAiAutopilotHistory(),
      ]);
      setAutopilotResult(result);
      setCandidates(nextCandidates);
      setAutopilotHistory(history);
      setMessage(
        result.contacted.length
          ? `AI 已自动联系 ${result.contacted.length} 位候选搭子。`
          : result.skipped[0] || 'AI 暂时没有找到新的高匹配搭子。',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 自动托管运行失败');
    } finally {
      setRunningAutopilot(false);
    }
  };

  const emptyText = useMemo(() => {
    if (!canMatch) return '开启托管并同意资料用于匹配后，AI 才会开始寻找搭子。';
    return '暂时没有其他开启 AI 托管的用户。你可以先完善资料，等更多人加入。';
  }, [canMatch]);

  const todayAutopilotCount = useMemo(() => {
    const today = new Date().toDateString();
    return autopilotHistory.filter((item) => new Date(item.contactedAt).toDateString() === today).length;
  }, [autopilotHistory]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-[#f7f4f1] text-[#8b6a54]">
        AI 托管资料加载中...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f4f1] text-ink">
      {/* Page Header + Tab Navigation */}
      <div className="border-b border-[#e5ddd5] bg-white px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-lime text-white shadow-sm">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-black text-[#1a1208]">AI 搭子托管</h1>
              <p className="text-xs text-[#8b6a54]">让 AI 先替你筛选合拍的运动伙伴</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/ai-profile"
              className="rounded-lg border border-[#d7ccb8] px-3 py-1.5 text-xs font-bold text-[#76543e] transition hover:border-lime/40 hover:text-lime"
            >
              AI 生成画像
            </Link>
            <span className={`rounded-lg px-3 py-1.5 text-xs font-bold ${profile.enabled ? 'border border-lime/30 bg-lime/5 text-lime' : 'border border-[#e5ddd5] text-[#8b6a54]'}`}>
              {profile.enabled ? '托管运行中' : '托管已关闭'}
            </span>
          </div>
        </div>
        <div className="mx-auto mt-3 max-w-7xl">
          <div className="flex gap-1 rounded-xl bg-[#f3ede8] p-1" style={{ width: 'fit-content' }}>
            {([
              { key: 'profile' as const, label: '资料配置' },
              { key: 'candidates' as const, label: 'AI推荐搭子', badge: candidates.length > 0 ? candidates.length : undefined },
              { key: 'autopilot' as const, label: '自动托管', badge: todayAutopilotCount > 0 ? todayAutopilotCount : undefined },
            ]).map((tab) => (
              <button
                key={tab.key}
                className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold transition ${
                  activeTab === tab.key ? 'bg-white text-[#1a1208] shadow-sm' : 'text-[#76543e] hover:text-[#1a1208]'
                }`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
                {tab.badge !== undefined && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${activeTab === tab.key ? 'bg-lime text-white' : 'bg-lime/20 text-lime'}`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {(message || error) && (
          <div className={`mb-5 rounded-xl border px-4 py-3 text-sm font-bold ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-lime/30 bg-lime/5 text-[#3a6a1f]'}`}>
            {error || message}
          </div>
        )}

        {/* Tab 1: Profile Config */}
        {activeTab === 'profile' && (
          <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
            <div>
              <h2 className="mb-1 text-base font-black text-[#1a1208]">AI 代理资料</h2>
              <p className="mb-4 text-sm text-[#76543e]">填写后 AI 会用这些资料匹配运动伙伴，你可以随时修改。</p>
              <div className="rounded-2xl border border-[#e5ddd5] bg-white p-5 shadow-sm">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="AI 称呼">
                    <input
                      value={profile.preferredName}
                      onChange={(event) => updateField('preferredName', event.target.value)}
                      placeholder={user?.name ? `${user.name} 的 AI` : '我的 AI'}
                      className="field"
                    />
                  </Field>
                  <Field label="城市">
                    <input
                      value={profile.city}
                      onChange={(event) => updateField('city', event.target.value)}
                      placeholder="上海"
                      className="field"
                    />
                  </Field>
                </div>
                <div className="mt-4">
                  <div className="mb-2 text-xs font-black text-[#5a3d2b]">运动偏好</div>
                  <div className="flex flex-wrap gap-2">
                    {sportOptions.map((sport) => (
                      <button
                        key={sport}
                        type="button"
                        onClick={() => toggleSport(sport)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-black transition ${
                          profile.favoriteSports.includes(sport)
                            ? 'border-lime bg-lime text-white'
                            : 'border-[#e5ddd5] text-[#5a3d2b] hover:border-lime/50 hover:text-lime'
                        }`}
                      >
                        {sport}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-4 grid gap-4">
                  <Textarea label="兴趣与生活偏好" value={profile.interests} onChange={(value) => updateField('interests', value)} />
                  <Textarea label="工作经历与作息" value={profile.workExperience} onChange={(value) => updateField('workExperience', value)} />
                  <Textarea label="理想型 / 希望遇到的搭子" value={profile.idealPartner} onChange={(value) => updateField('idealPartner', value)} />
                  <Textarea label="训练目标" value={profile.trainingGoals} onChange={(value) => updateField('trainingGoals', value)} />
                  <Textarea label="边界与安全要求" value={profile.boundaries} onChange={(value) => updateField('boundaries', value)} />
                  <Field label="可约时间">
                    <input
                      value={profile.availability}
                      onChange={(event) => updateField('availability', event.target.value)}
                      placeholder="工作日晚 / 周末上午"
                      className="field"
                    />
                  </Field>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="mb-1 text-base font-black text-[#1a1208]">授权与隐私</h2>
              <p className="mb-4 text-sm text-[#76543e]">设置 AI 可以代理的行为范围。</p>
              <div className="rounded-2xl border border-[#e5ddd5] bg-white p-5 shadow-sm">
                <div className="space-y-4">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={profile.privacyConsent}
                      onChange={(event) => updateField('privacyConsent', event.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-[#FF6A00]"
                    />
                    <div>
                      <div className="text-sm font-bold text-[#1a1208]">同意资料用于匹配</div>
                      <div className="mt-0.5 text-xs text-[#76543e]">我同意将以上资料仅用于 AI 托管匹配和试聊，不用于公开展示。</div>
                    </div>
                  </label>
                  <div className="border-t border-[#f0e8e0]" />
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={profile.enabled}
                      onChange={(event) => updateField('enabled', event.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-[#FF6A00]"
                    />
                    <div>
                      <div className="text-sm font-bold text-[#1a1208]">开启 AI 托管</div>
                      <div className="mt-0.5 text-xs text-[#76543e]">让我的 AI 与其他开启托管的 AI 进行匹配试聊。</div>
                    </div>
                  </label>
                </div>
              </div>
              <div className="rounded-2xl border border-lime/20 bg-lime/5 p-5">
                <div className="mb-3 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-lime" />
                  <div className="text-sm font-black text-[#1a1208]">自动托管设置</div>
                </div>
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={profile.autoChatEnabled}
                    onChange={(event) => updateField('autoChatEnabled', event.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-[#FF6A00]"
                  />
                  <div>
                    <div className="text-sm font-bold text-[#1a1208]">允许 AI 自动关注和发起对话</div>
                    <div className="mt-0.5 text-xs text-[#76543e]">以"AI托管代发"身份发起站内对话，不会发送外部联系方式。</div>
                  </div>
                </label>
                <div className="mt-4">
                  <Field label="每日自动推进上限">
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={profile.dailyAutoChatLimit}
                      onChange={(event) => updateField('dailyAutoChatLimit', Number(event.target.value))}
                      className="field"
                    />
                  </Field>
                </div>
              </div>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="w-full rounded-xl bg-lime px-5 py-3.5 text-sm font-black text-white transition hover:bg-brand2 disabled:opacity-60"
              >
                {saving ? '保存中...' : '保存 AI 托管资料'}
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: AI Recommended Partners */}
        {activeTab === 'candidates' && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-black text-[#1a1208]">AI 推荐搭子</h2>
                  <p className="text-sm text-[#76543e]">AI 根据你的资料筛选出高匹配度的运动伙伴</p>
                </div>
                <button type="button" onClick={() => void load()} className="rounded-lg border border-[#e5ddd5] px-3 py-1.5 text-xs font-bold text-[#76543e] transition hover:border-lime/40 hover:text-lime">
                  刷新
                </button>
              </div>
              {!canMatch ? (
                <div className="rounded-2xl border border-[#e5ddd5] bg-white p-8 text-center shadow-sm">
                  <div className="mb-3 text-3xl">🤖</div>
                  <div className="text-sm font-bold text-[#1a1208]">尚未开启 AI 托管</div>
                  <p className="mt-2 text-sm text-[#76543e]">前往「资料配置」完善信息并开启托管后，AI 才会开始寻找搭子。</p>
                  <button className="mt-4 rounded-lg bg-lime px-4 py-2 text-sm font-black text-white" onClick={() => setActiveTab('profile')}>去完善资料</button>
                </div>
              ) : candidates.length === 0 ? (
                <div className="rounded-2xl border border-[#e5ddd5] bg-white p-8 text-center shadow-sm">
                  <div className="mb-3 text-3xl">🔍</div>
                  <div className="text-sm font-bold text-[#1a1208]">暂无推荐</div>
                  <p className="mt-2 text-sm text-[#76543e]">{emptyText}</p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {candidates.map((candidate) => (
                    <article key={candidate.userId} className="rounded-2xl border border-[#e5ddd5] bg-white p-5 shadow-sm">
                      <div className="flex items-start gap-3">
                        <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-sm font-black text-white" style={{ background: candidate.color }}>
                          {candidate.avatar}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="truncate text-base font-black text-[#1a1208]">{candidate.name}</h3>
                            <span className="flex-shrink-0 rounded-lg bg-lime/10 px-2 py-0.5 text-xs font-black text-lime">{candidate.score}</span>
                          </div>
                          <p className="mt-0.5 text-xs text-[#8b6a54]">{candidate.city || '城市待确认'} · {candidate.availability || '时间待确认'}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {candidate.favoriteSports.map((sport) => (
                          <span key={sport} className="rounded-md border border-lime/20 bg-lime/5 px-2 py-0.5 text-xs font-bold text-lime">{sport}</span>
                        ))}
                      </div>
                      <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-[#5a3d2b]">{candidate.trainingGoals || candidate.idealPartner || '对方 AI 还在完善资料。'}</p>
                      <ul className="mt-3 space-y-1">
                        {candidate.reasons.slice(0, 2).map((reason) => (
                          <li key={reason} className="flex items-start gap-1.5 text-xs text-[#76543e]">
                            <span className="mt-0.5 text-lime">✓</span>{reason}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {candidate.autopilotStatus === 'contacted' ? (
                          <>
                            <span className="rounded-md border border-lime/20 bg-lime/5 px-2 py-0.5 text-[11px] font-bold text-lime">已关注</span>
                            <span className="rounded-md border border-lime/20 bg-lime/5 px-2 py-0.5 text-[11px] font-bold text-lime">已发起对话</span>
                            {candidate.contactCardSent && <span className="rounded-md border border-lime/20 bg-lime/5 px-2 py-0.5 text-[11px] font-bold text-lime">已发送名片</span>}
                          </>
                        ) : (
                          <span className="rounded-md border border-[#e5ddd5] px-2 py-0.5 text-[11px] text-[#8b6a54]">{candidate.autoChatEnabled ? '可自动托管联系' : '仅可手动试聊'}</span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleSimulate(candidate)}
                        disabled={simulatingId === candidate.userId}
                        className="mt-4 w-full rounded-xl border border-lime/30 bg-lime/5 px-4 py-2.5 text-sm font-black text-lime transition hover:bg-lime hover:text-white disabled:opacity-60"
                      >
                        {simulatingId === candidate.userId ? 'AI 试聊中...' : '让 AI 先试聊'}
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </div>
            <aside className="lg:sticky lg:top-24 lg:self-start">
              <div className="rounded-2xl border border-[#e5ddd5] bg-white p-5 shadow-sm">
                <h2 className="mb-1 text-base font-black text-[#1a1208]">试聊结果</h2>
                {!selectedSession ? (
                  <div className="mt-3">
                    <p className="text-sm leading-relaxed text-[#76543e]">点击候选人卡片上的「让 AI 先试聊」，两个 AI 会围绕运动偏好、边界、时间进行模拟沟通。</p>
                    <div className="mt-4 rounded-xl border border-[#f0e8e0] bg-[#faf7f4] p-4 text-xs text-[#8b6a54]">
                      <div className="font-bold text-[#5a3d2b]">隐私保护</div>
                      <p className="mt-1 leading-relaxed">AI 不会替你直接建立关系。你确认后才会关注对方。</p>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 space-y-4">
                    <div className="rounded-xl border border-lime/20 bg-lime/5 p-4">
                      <div className="text-sm font-black text-lime">匹配分 {selectedSession.score}</div>
                      <p className="mt-1.5 text-sm leading-relaxed text-[#5a3d2b]">{selectedSession.summary}</p>
                    </div>
                    <div className="max-h-80 space-y-2.5 overflow-y-auto">
                      {selectedSession.transcript.map((line, index) => (
                        <div key={`${line.speaker}-${index}`} className="rounded-xl border border-[#ece4db] bg-[#faf7f4] p-3">
                          <div className="text-[11px] font-black text-[#8b6a54]">{line.speaker}</div>
                          <p className="mt-1 text-sm leading-relaxed text-[#1a1208]">{line.text}</p>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleApprove()}
                      disabled={!selectedSession.canApproveFriend || selectedSession.status === 'approved'}
                      className="w-full rounded-xl bg-lime px-4 py-3 text-sm font-black text-white transition hover:bg-brand2 disabled:cursor-not-allowed disabled:bg-[#e5ddd5] disabled:text-[#8b6a54]"
                    >
                      {selectedSession.status === 'approved' ? '✓ 已确认关注' : '确认添加为关注'}
                    </button>
                    <p className="text-xs text-[#8b6a54]">AI 不会替你直接建立关系。点击确认后，才会使用你的账号关注对方。</p>
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}

        {/* Tab 3: Autopilot */}
        {activeTab === 'autopilot' && (
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border border-[#e5ddd5] bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-black uppercase tracking-widest text-[#8b6a54]">托管状态</div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${profile.autoChatEnabled ? 'bg-lime' : 'bg-[#ccc]'}`} />
                    <span className="text-xl font-black text-[#1a1208]">{profile.autoChatEnabled ? '运行中' : '已关闭'}</span>
                  </div>
                </div>
                <span className={`rounded-xl px-3 py-1.5 text-xs font-bold ${profile.enabled ? 'bg-lime/10 text-lime' : 'bg-[#f0e8e0] text-[#8b6a54]'}`}>
                  {profile.enabled ? '已开启' : '未开启'}
                </span>
              </div>
              <div className="mt-4 rounded-xl border border-[#f0e8e0] bg-[#faf7f4] p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#76543e]">今日已推进</span>
                  <span className="font-black text-[#1a1208]">{autopilotResult?.usedToday ?? todayAutopilotCount} / {profile.dailyAutoChatLimit || 3}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e5ddd5]">
                  <div
                    className="h-full rounded-full bg-lime transition-all"
                    style={{ width: `${Math.min(((autopilotResult?.usedToday ?? todayAutopilotCount) / (profile.dailyAutoChatLimit || 3)) * 100, 100)}%` }}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleRunAutopilot()}
                disabled={!profile.autoChatEnabled || runningAutopilot}
                className="mt-4 w-full rounded-xl border border-lime/30 bg-lime/5 px-4 py-3 text-sm font-black text-lime transition hover:bg-lime hover:text-white disabled:cursor-not-allowed disabled:border-[#e5ddd5] disabled:bg-[#f5f0eb] disabled:text-[#a09080]"
              >
                {runningAutopilot ? 'AI 自动扫描中...' : '立即运行一次自动托管'}
              </button>
              {!profile.autoChatEnabled && (
                <p className="mt-2 text-center text-xs text-[#8b6a54]">
                  需在「资料配置」中开启自动托管
                  <button className="ml-1 text-lime underline" onClick={() => setActiveTab('profile')}>前往设置</button>
                </p>
              )}
            </div>
            <div className="rounded-2xl border border-[#e5ddd5] bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-black text-[#1a1208]">AI 已联系对象</h2>
                <span className="rounded-lg border border-[#e5ddd5] px-2 py-1 text-xs font-bold text-[#8b6a54]">{autopilotHistory.length} 条记录</span>
              </div>
              {autopilotHistory.length === 0 ? (
                <div className="rounded-xl border border-[#f0e8e0] bg-[#faf7f4] p-5 text-sm text-[#76543e]">
                  开启自动托管并运行后，AI 自动关注、发起对话和发送站内名片的记录会显示在这里。
                </div>
              ) : (
                <div className="space-y-3">
                  {autopilotHistory.slice(0, 6).map((item) => (
                    <div key={item.id} className="flex items-start gap-3 rounded-xl border border-[#ece4db] bg-[#faf7f4] p-3.5">
                      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-xs font-black text-white" style={{ background: item.targetColor }}>
                        {item.targetAvatar}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="truncate text-sm font-black text-[#1a1208]">{item.targetName}</div>
                          <span className="flex-shrink-0 text-[11px] text-[#8b6a54]">{new Date(item.contactedAt).toLocaleDateString()}</span>
                        </div>
                        <div className="mt-0.5 text-xs font-bold text-lime">已关注 · 已发起对话 · 已发送名片</div>
                        <p className="mt-1 text-xs leading-relaxed text-[#76543e]">{item.summary}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-black text-[#5a3d2b]">{label}</span>
      {children}
    </label>
  );
}

function Textarea({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <Field label={label}>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="field resize-none"
      />
    </Field>
  );
}
