import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AiSocialRequestCta } from '../components/social-request/AiSocialRequestCta';
import * as dataService from '../services/dataService';
import type { SocialCandidate, SocialRequest } from '../types';

const requestTypes = [
  { value: 'fitness_partner', label: '附近同城约练' },
  { value: 'offline_friend', label: '线下交友' },
  { value: 'dog_walking', label: '附近遛狗搭子' },
  { value: 'bar_friend', label: '同场酒搭子' },
  { value: 'travel_partner', label: '旅游出行搭子' },
  { value: 'photo_partner', label: '拍照搭子' },
];

const exampleByType: Record<string, string> = {
  fitness_partner: '我想找附近 5 公里内今晚能一起健身的人，最好节奏稳定、边界感清楚。',
  offline_friend: '我想认识一个同城线下朋友，周末可以一起散步、聊天或喝咖啡。',
  dog_walking: '我今晚想找附近能一起遛狗的人，希望对方也喜欢宠物，先站内沟通。',
  bar_friend: '我在附近酒吧，想找一个酒搭子，优先公共场所和实名认证用户。',
  travel_partner: '我一个人旅游，想找今天下午可以一起逛景点或互相拍照的搭子。',
  photo_partner: '我想找附近会拍照或愿意互拍的人，今天下午有空。',
};

const riskLabel: Record<SocialRequest['riskLevel'], string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
};

export const AiSocialRequestPage = memo(function AiSocialRequestPage() {
  const navigate = useNavigate();
  const [requestType, setRequestType] = useState(requestTypes[0].value);
  const [description, setDescription] = useState(exampleByType[requestTypes[0].value]);
  const [city, setCity] = useState('');
  const [radiusKm, setRadiusKm] = useState(5);
  const [timePreference, setTimePreference] = useState('今天或本周');
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [requests, setRequests] = useState<SocialRequest[]>([]);
  const [activeRequest, setActiveRequest] = useState<SocialRequest | null>(null);
  const [candidates, setCandidates] = useState<SocialCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [openingConversationId, setOpeningConversationId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const selectedType = useMemo(
    () => requestTypes.find((item) => item.value === requestType) ?? requestTypes[0],
    [requestType],
  );

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await dataService.getSocialRequests();
      setRequests(data);
      setActiveRequest((current) => current ?? data[0] ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 社交任务加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const handleTypeChange = (value: string) => {
    setRequestType(value);
    setDescription(exampleByType[value] ?? '');
  };

  const handleSubmit = async () => {
    if (!description.trim()) {
      setError('请先告诉 AI 你现在想找什么样的人。');
      return;
    }

    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const result = await dataService.createSocialRequest({
        requestType,
        description,
        city,
        radiusKm,
        timePreference,
        verifiedOnly,
        limit: 8,
      });
      setActiveRequest(result.request);
      setCandidates(result.candidates);
      setRequests((current) => [result.request, ...current.filter((item) => item.id !== result.request.id)]);
      setMessage(
        result.candidates.length
          ? `AI 已找到 ${result.candidates.length} 位候选对象，请先确认再联系。`
          : '任务卡已创建，暂时没有找到候选对象。',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建 AI 社交任务失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenConversation = async (candidate: SocialCandidate) => {
    setOpeningConversationId(candidate.profile.id);
    setError('');
    try {
      const result = await dataService.startConversation(candidate.profile.id);
      const opening =
        candidate.suggestedMessage ||
        '你好，我看到我们这次需求比较匹配，想先在 FitMeet 上聊聊。';
      await dataService.sendMessage(result.conversationId, opening);
      navigate(`/messages?conversationId=${encodeURIComponent(result.conversationId)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '开启会话失败');
    } finally {
      setOpeningConversationId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-[#f7f4f1] text-[#8b6a54]">
        AI 社交任务加载中...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f4f1] text-[#1a1208]">
      <div className="border-b border-[#e5ddd5] bg-white px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4">
          <div className="space-y-1">
            <h1 className="text-xl font-black">AI 需求任务卡</h1>
            <p className="text-sm text-[#76543e]">
              把一句自然语言需求变成 FitMeet 社交任务，让 AI 先搜索候选人，再由你确认下一步。
            </p>
          </div>
          <AiSocialRequestCta variant="banner" />
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:px-8">
        <section className="space-y-5">
          {(error || message) && (
            <div className={`rounded-xl border px-4 py-3 text-sm font-bold ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-lime/30 bg-lime/5 text-[#3a6a1f]'}`}>
              {error || message}
            </div>
          )}

          <div className="rounded-2xl border border-[#e5ddd5] bg-white p-5 shadow-sm">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-xs font-black text-[#5a3d2b]">社交场景</span>
                <select
                  value={requestType}
                  onChange={(event) => handleTypeChange(event.target.value)}
                  className="field"
                >
                  {requestTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-black text-[#5a3d2b]">城市</span>
                <input
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  placeholder="不填则使用个人资料城市"
                  className="field"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-black text-[#5a3d2b]">半径范围</span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={radiusKm}
                  onChange={(event) => setRadiusKm(Number(event.target.value))}
                  className="field"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-black text-[#5a3d2b]">时间偏好</span>
                <input
                  value={timePreference}
                  onChange={(event) => setTimePreference(event.target.value)}
                  className="field"
                />
              </label>
            </div>

            <label className="mt-4 block">
              <span className="mb-2 block text-xs font-black text-[#5a3d2b]">告诉 AI 你的需求</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={5}
                className="field resize-none"
              />
            </label>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex items-center gap-2 text-sm font-bold text-[#5a3d2b]">
                <input
                  type="checkbox"
                  checked={verifiedOnly}
                  onChange={(event) => setVerifiedOnly(event.target.checked)}
                  className="h-4 w-4 accent-[#FF6A00]"
                />
                优先实名认证用户
              </label>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="rounded-xl bg-lime px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-brand2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'AI 搜索中...' : '生成任务卡并搜索'}
              </button>
            </div>
          </div>

          {activeRequest && (
            <div className="rounded-2xl border border-[#e5ddd5] bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-xs font-black uppercase tracking-wide text-[#8b6a54]">
                    {selectedType.label}
                  </div>
                  <h2 className="mt-1 text-lg font-black">{activeRequest.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-[#5a3d2b]">{activeRequest.description}</p>
                </div>
                <span className="w-fit rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-800">
                  {riskLabel[activeRequest.riskLevel]}
                </span>
              </div>
              <div className="mt-4 grid gap-2 text-xs font-bold text-[#76543e] sm:grid-cols-3">
                <span>城市：{activeRequest.city || '未指定'}</span>
                <span>半径：{activeRequest.radiusKm} km</span>
                <span>状态：{activeRequest.status}</span>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-black">AI 候选推荐</h2>
              <span className="text-xs font-bold text-[#8b6a54]">所有联系动作需要你确认</span>
            </div>
            {candidates.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#d8cabe] bg-white/70 p-8 text-center text-sm font-bold text-[#8b6a54]">
                创建任务卡后，这里会显示 AI 找到的候选人。
              </div>
            ) : (
              <div className="grid gap-3">
                {candidates.map((candidate) => (
                  <article key={candidate.profile.id} className="rounded-2xl border border-[#e5ddd5] bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                      <div
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-black text-white"
                        style={{ background: candidate.profile.color || '#FF6A00' }}
                      >
                        {candidate.profile.avatar || candidate.profile.name[0] || 'U'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-black">{candidate.profile.name}</h3>
                          {candidate.profile.verified && (
                            <span className="rounded-md bg-lime/10 px-2 py-0.5 text-[11px] font-black text-lime">已认证</span>
                          )}
                          <span className="rounded-md bg-[#f3ede8] px-2 py-0.5 text-[11px] font-black text-[#76543e]">
                            匹配度 {candidate.score}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-[#5a3d2b]">{candidate.reasonText}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {candidate.profile.interestTags.slice(0, 5).map((tag) => (
                            <span key={tag} className="rounded-md bg-[#f7f4f1] px-2 py-1 text-[11px] font-bold text-[#76543e]">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2 sm:flex-col">
                        <button
                          onClick={() => navigate(`/user/${candidate.profile.id}`)}
                          className="rounded-lg border border-[#e5ddd5] px-4 py-2 text-xs font-black text-[#5a3d2b] transition hover:border-lime/40 hover:text-lime"
                        >
                          查看资料
                        </button>
                        <button
                          onClick={() => handleOpenConversation(candidate)}
                          disabled={openingConversationId === candidate.profile.id}
                          className="rounded-lg bg-[#1a1208] px-4 py-2 text-xs font-black text-white transition hover:bg-[#3a2a1f] disabled:opacity-60"
                        >
                          {openingConversationId === candidate.profile.id ? '开启中' : '确认后私信'}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-[#e5ddd5] bg-white p-5 shadow-sm">
            <h2 className="text-base font-black">最近任务</h2>
            <div className="mt-4 space-y-2">
              {requests.length === 0 ? (
                <p className="text-sm text-[#8b6a54]">还没有 AI 社交任务。</p>
              ) : (
                requests.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveRequest(item)}
                    className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                      activeRequest?.id === item.id
                        ? 'border-lime bg-lime/5'
                        : 'border-[#e5ddd5] hover:border-lime/40'
                    }`}
                  >
                    <div className="text-sm font-black">{item.title}</div>
                    <div className="mt-1 flex items-center justify-between text-xs font-bold text-[#8b6a54]">
                      <span>{item.matchedCount} 位候选</span>
                      <span>{riskLabel[item.riskLevel]}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-lime/20 bg-lime/5 p-5">
            <h2 className="text-base font-black">闭环状态</h2>
            <div className="mt-3 space-y-2 text-sm font-bold text-[#5a3d2b]">
              <div>1. 需求已结构化为任务卡</div>
              <div>2. AI 只返回安全资料</div>
              <div>3. 私信和线下动作由你确认</div>
              <div>4. 高风险场景会提高认证要求</div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
});
