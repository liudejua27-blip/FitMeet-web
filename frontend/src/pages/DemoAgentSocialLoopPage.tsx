import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  SocialRequestCard,
} from '../components/agent-loop/SocialRequestCard';
import { CandidateMatchCard } from '../components/agent-loop/CandidateMatchCard';
import { AgentApprovalCard } from '../components/agent-loop/AgentApprovalCard';
import { ActivityIcebreakerCard } from '../components/agent-loop/ActivityIcebreakerCard';
import { ActivityProofUploader } from '../components/agent-loop/ActivityProofUploader';
import {
  socialRequestsApi,
  type SocialRequestSummary,
  type CandidateView,
} from '../api/socialRequestsApi';
import {
  activitiesApi,
  type SocialActivity,
  type ActivityProof,
} from '../api/activitiesApi';
import type { ApprovalRequest } from '../api/agentApprovalsApi';
import { ApiError } from '../api/client';

const STEPS = [
  { id: 1, title: '说出需求', caption: '告诉 FitMeet 你想认识什么人。' },
  { id: 2, title: '生成任务卡', caption: 'FitMeet 正在为你生成社交任务卡。' },
  { id: 3, title: '匹配候选人', caption: '看 AI 是怎么挑出 3 个最契合你的人。' },
  { id: 4, title: '生成破冰', caption: 'AI 给每个候选人写了一段邀约。' },
  { id: 5, title: '一键确认', caption: '你点确认 → Agent 才真正发出。' },
  { id: 6, title: '线下完成', caption: '到现场后用破冰任务卡和 TA 见面。' },
  { id: 7, title: '回到信任分', caption: '完成证明回到 FitMeet 抬高信任分。' },
];

const MOCK_REQUEST: SocialRequestSummary = {
  id: 9001,
  type: 'coffee_chat',
  title: '想找一个聊独立电影的人，三里屯附近',
  description:
    '周六下午 3 点，三里屯一家安静的咖啡店，喜欢侯麦、阿彼察邦、贾木许这一挂的，聊一小时。',
  city: '北京',
  radiusKm: 5,
  timeStart: new Date(Date.now() + 86400000).toISOString(),
  timeEnd: null,
  interestTags: ['独立电影', '咖啡', '安静'],
  status: 'matched',
  source: 'manual',
  agentName: 'FitMeet Concierge',
  createdAt: new Date().toISOString(),
};

const MOCK_CANDIDATES: CandidateView[] = [
  {
    userId: 101,
    nickname: '林一',
    avatar: '林',
    color: '#C8FF80',
    score: 92,
    level: 'high',
    distanceKm: 1.4,
    commonTags: ['独立电影', '咖啡', '摄影', '城市散步'],
    reasons: [
      '同样关注侯麦、阿彼察邦，资料里出现 4 部交集的影片',
      '常驻三里屯，半径 1.4 km，时间偏好和你重合',
      '过去 30 天和 2 位陌生人完成了线下咖啡见面，平均评价 4.8 / 5',
    ],
    scoreBreakdown: { interest: 38, distance: 22, schedule: 18, trust: 14 },
    risk: { level: 'low', warnings: [] },
    suggestedMessage:
      '你好，我看到你也喜欢侯麦的「四季故事」。我周六下午刚好在三里屯，要不要一起喝杯咖啡聊一小时？地点你选，我习惯安静一点的小店。',
  },
  {
    userId: 102,
    nickname: '苏念',
    avatar: '苏',
    color: '#9DCFFF',
    score: 81,
    level: 'medium',
    distanceKm: 3.2,
    commonTags: ['独立电影', '城市散步'],
    reasons: [
      '关注独立电影标签 6 个月，最近收藏了「枯叶」',
      '工作日常在国贸—三里屯通勤，时间窗口可对齐',
    ],
    scoreBreakdown: { interest: 30, distance: 18, schedule: 16, trust: 17 },
    risk: { level: 'low', warnings: [] },
    suggestedMessage:
      '嗨，我看到你最近收藏了「枯叶」。我周六想在三里屯找人聊聊独立电影，要不要一起喝杯咖啡？',
  },
  {
    userId: 103,
    nickname: 'Aki',
    avatar: 'A',
    color: '#FFB78A',
    score: 74,
    level: 'medium',
    distanceKm: 2.1,
    commonTags: ['咖啡', '独立电影'],
    reasons: [
      '注册较新，但兴趣标签和你 3 个重合',
      '资料标注偏好「咖啡聊天」「安静场景」，与本次任务匹配',
    ],
    scoreBreakdown: { interest: 26, distance: 20, schedule: 14, trust: 14 },
    risk: { level: 'medium', warnings: ['账号注册不足 30 天，建议公开场景见面'] },
    suggestedMessage:
      '你好，我也是独立电影的爱好者。这周六在三里屯的小咖啡店见个面聊一小时怎么样？地点你来选。',
  },
];

const MOCK_APPROVAL: ApprovalRequest = {
  id: 7777,
  userId: 1,
  agentConnectionId: null,
  type: 'send_message',
  skillName: '代发邀约',
  payload: {
    toUserId: 101,
    toNickname: '林一',
    message: MOCK_CANDIDATES[0].suggestedMessage,
  },
  summary: 'Agent 想代你给「林一」发送一条邀约消息',
  riskLevel: 'medium',
  rationale:
    '该消息会写入站内对话，对方会收到推送。FitMeet 在所有「主动联系陌生人」前都会先让你确认。',
  status: 'pending',
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
};

const MOCK_ICEBREAKERS = [
  { id: 'ice-1', text: '到现场先互相说一部最近看的电影，不能是奥斯卡得主。' },
  { id: 'ice-2', text: '一起在咖啡店点同一款豆子的 V60，但选不同烘焙度，互相评。' },
  { id: 'ice-3', text: '聊到第 30 分钟时，互相推荐一本对方一定没看过的小说。' },
];

const SAFETY_TIPS = [
  '建议在公共咖啡店见面，避免私人住所。',
  '如对方临时改变地点到非公共区域，请直接终止并在 App 内举报。',
  '完成后用「场景照片」证明即可，不强制露脸。',
];

type Mode = 'demo' | 'real';

export function DemoAgentSocialLoopPage() {
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<Mode>('demo');

  const next = () => setStep((s) => Math.min(STEPS.length, s + 1));
  const prev = () => setStep((s) => Math.max(1, s - 1));

  // -------------------- Real-API state --------------------
  const [realInput, setRealInput] = useState(
    '我周六下午想在三里屯找一个聊独立电影的人喝杯咖啡。',
  );
  const [realRequest, setRealRequest] = useState<SocialRequestSummary | null>(
    null,
  );
  const [realCandidates, setRealCandidates] = useState<CandidateView[]>([]);
  const [chosenCandidate, setChosenCandidate] = useState<CandidateView | null>(
    null,
  );
  const [realActivity, setRealActivity] = useState<SocialActivity | null>(null);
  const [realProof, setRealProof] = useState<ActivityProof | null>(null);
  const [realLoading, setRealLoading] = useState(false);
  const [realError, setRealError] = useState<string | null>(null);

  const handleError = (err: unknown, fallback: string) => {
    if (err instanceof ApiError) {
      setRealError(
        `${err.status} · ${err.message || fallback}` +
          (err.status === 401 ? '（请先登录后再试）' : ''),
      );
    } else if (err instanceof Error) {
      setRealError(`${fallback}：${err.message}`);
    } else {
      setRealError(fallback);
    }
  };

  const resetRealError = () => setRealError(null);

  // Step 2: 创建 social request
  const realCreateRequest = async () => {
    resetRealError();
    setRealLoading(true);
    try {
      const created = await socialRequestsApi.create({
        type: 'coffee_chat',
        rawText: realInput,
        description: realInput,
        interestTags: ['Real API Demo'],
      });
      setRealRequest(created);
      // Also pull candidates if matching ran during create
      try {
        const { candidates } = await socialRequestsApi.candidates(created.id);
        setRealCandidates(candidates);
      } catch {
        // candidates can be empty silently
      }
      next();
    } catch (err) {
      handleError(err, '创建 social request 失败');
    } finally {
      setRealLoading(false);
    }
  };

  // Step 3: 生成/刷新 candidates
  const realLoadCandidates = async () => {
    if (!realRequest) return;
    resetRealError();
    setRealLoading(true);
    try {
      const res = await socialRequestsApi.rematch(realRequest.id);
      setRealCandidates(res.candidates);
      next();
    } catch (err) {
      handleError(err, '生成候选人失败');
    } finally {
      setRealLoading(false);
    }
  };

  // Step 4: 选定候选人 → 进入确认
  const realPickCandidate = (c: CandidateView) => {
    setChosenCandidate(c);
    next();
  };

  // Step 5: 主人点确认 → 创建 activity
  const realApproveAndCreateActivity = async () => {
    if (!realRequest || !chosenCandidate) return;
    resetRealError();
    setRealLoading(true);
    try {
      const activity = await activitiesApi.create({
        type: 'coffee_chat',
        title: `Coffee chat: ${realRequest.title}`,
        description: realRequest.description,
        city: realRequest.city,
        socialRequestId: realRequest.id,
        invitedUserId: chosenCandidate.userId,
        proofPolicy: 'mutual_or_proof',
      });
      setRealActivity(activity);
      next();
    } catch (err) {
      handleError(err, '创建 Activity 失败');
    } finally {
      setRealLoading(false);
    }
  };

  // Step 6: 上传 proof
  const realSubmitProof = async () => {
    if (!realActivity) return;
    resetRealError();
    setRealLoading(true);
    try {
      const proof = await activitiesApi.submitProof(realActivity.id, {
        proofType: 'scene_photo',
        note: '场景照已上传（Real API Demo）',
        privacyMode: 'scene_only',
      });
      setRealProof(proof);
      next();
    } catch (err) {
      handleError(err, '上传证明失败');
    } finally {
      setRealLoading(false);
    }
  };

  // Step 7: complete
  const realComplete = async () => {
    if (!realActivity) return;
    resetRealError();
    setRealLoading(true);
    try {
      const updated = await activitiesApi.complete(realActivity.id);
      setRealActivity(updated);
    } catch (err) {
      handleError(err, '完成 Activity 失败');
    } finally {
      setRealLoading(false);
    }
  };
  // ---------------------------------------------------------

  const sortedCandidates = useMemo(
    () => [...MOCK_CANDIDATES].sort((a, b) => b.score - a.score),
    [],
  );

  const meta = STEPS[step - 1];

  return (
    <div className="min-h-screen bg-[#0d0d0b] text-[#F4EFE6]">
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-[#8C8A6E]">
              FitMeet × AI Agent · 闭环 Demo
            </div>
            <h1 className="text-2xl font-light mt-1">
              AI Agent 帮你完成线下社交闭环
            </h1>
            <p className="text-sm text-[#C7C2B0] mt-2 max-w-xl leading-6">
              这是一个 7 步的演示。你会看到一个用户从「我想认识喜欢独立电影的人」到「在三里屯完成一次咖啡见面，并把信任分提高」的全流程。
            </p>
          </div>
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-[#8C8A6E]">演示数据</span>
            <button
              onClick={() => setMode('demo')}
              className={`px-2 py-1 rounded ${mode === 'demo' ? 'bg-[#C8FF80] text-[#0d0d0b]' : 'border border-[#26261d] text-[#C7C2B0]'}`}
            >
              Demo
            </button>
            <button
              onClick={() => setMode('real')}
              className={`px-2 py-1 rounded ${mode === 'real' ? 'bg-[#C8FF80] text-[#0d0d0b]' : 'border border-[#26261d] text-[#C7C2B0]'}`}
            >
              Real API
            </button>
          </div>
        </header>

        {/* Stepper */}
        <ol className="grid grid-cols-7 gap-1">
          {STEPS.map((s) => (
            <li
              key={s.id}
              onClick={() => setStep(s.id)}
              className={`cursor-pointer text-[10px] text-center pt-2 pb-2 rounded-md border ${
                s.id === step
                  ? 'border-[#C8FF80] bg-[#C8FF80]/10 text-[#C8FF80]'
                  : s.id < step
                    ? 'border-[#6B7A5A]/40 text-[#6B7A5A]'
                    : 'border-[#26261d] text-[#5e5d4a]'
              }`}
            >
              <div className="font-medium">{s.id}</div>
              <div className="leading-tight px-1">{s.title}</div>
            </li>
          ))}
        </ol>

        {/* Caption */}
        <div className="rounded-2xl bg-[#15150f] border border-[#26261d] px-5 py-3 text-sm text-[#E8E2CF]">
          <span className="text-[#8C8A6E] mr-2">第 {step} 步：</span>
          {meta.caption}
        </div>

        {/* Real-mode banner */}
        {mode === 'real' && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-200 leading-5">
            Real API 模式：每一步都会真实调用后端 API（统一走 user_social_requests）。请先登录账号。
            {realError && (
              <div className="mt-2 text-rose-300">⚠ {realError}</div>
            )}
          </div>
        )}

        {/* ===== Demo bodies ===== */}
        {mode === 'demo' && step === 1 && (
          <div className="rounded-2xl bg-[#15150f] border border-[#26261d] p-6 space-y-3">
            <div className="text-xs text-[#8C8A6E]">用户输入</div>
            <p className="text-base text-[#F4EFE6] leading-7">
              「我周六下午想在三里屯找一个聊独立电影的人喝杯咖啡。」
            </p>
            <div className="text-[11px] text-[#5e5d4a]">
              用户只用一句话。FitMeet Agent 接下来会做剩下的事。
            </div>
          </div>
        )}

        {mode === 'demo' && step === 2 && <SocialRequestCard request={MOCK_REQUEST} />}

        {mode === 'demo' && step === 3 && (
          <div className="grid grid-cols-1 gap-4">
            {sortedCandidates.map((c) => (
              <CandidateMatchCard
                key={c.userId}
                candidate={c}
                onSendInvite={() => next()}
                onSkip={() => undefined}
              />
            ))}
          </div>
        )}

        {mode === 'demo' && step === 4 && (
          <CandidateMatchCard
            candidate={sortedCandidates[0]}
            onSendInvite={() => next()}
            onSkip={() => undefined}
          />
        )}

        {mode === 'demo' && step === 5 && (
          <AgentApprovalCard
            request={MOCK_APPROVAL}
            onApprove={() => next()}
            onReject={() => undefined}
          />
        )}

        {mode === 'demo' && step === 6 && (
          <div className="space-y-4">
            <ActivityIcebreakerCard
              tasks={MOCK_ICEBREAKERS}
              safetyTips={SAFETY_TIPS}
              proofPolicy="mutual_or_proof"
            />
            <ActivityProofUploader
              myConfirmed={false}
              myCheckedIn={false}
              onMutualConfirm={() => next()}
              onCheckin={() => undefined}
              onSubmit={() => next()}
            />
          </div>
        )}

        {mode === 'demo' && step === 7 && (
          <div className="rounded-2xl bg-[#15150f] border border-[#26261d] p-6 space-y-4">
            <div className="text-[10px] uppercase tracking-[0.3em] text-[#8C8A6E]">
              闭环完成
            </div>
            <h3 className="text-xl font-light text-[#C8FF80]">
              这一次社交，FitMeet 帮你抬高了 +6 信任分
            </h3>
            <ul className="text-sm text-[#E8E2CF] space-y-2 leading-6">
              <li>· 一次成功的线下咖啡见面（双方互相确认 + 场景照）</li>
              <li>· 共同标签命中 4 项，对方公开打了 5/5 的体验分</li>
              <li>· 你下一次发起任务时，候选人质量会更高</li>
            </ul>
            <div className="rounded-xl border border-[#C8FF80]/30 bg-[#C8FF80]/5 p-4 text-xs text-[#C8FF80]/90 leading-5">
              这就是 FitMeet 的核心价值：<br />
              一句话需求 → AI 匹配 → 人工确认 → 线下完成 → 信任沉淀。<br />
              全程没有滑卡、没有冷启动、没有失控。
            </div>
          </div>
        )}

        {/* ===== Real-API bodies ===== */}
        {mode === 'real' && step === 1 && (
          <div className="rounded-2xl bg-[#15150f] border border-[#26261d] p-6 space-y-3">
            <div className="text-xs text-[#8C8A6E]">用户输入（自然语言）</div>
            <textarea
              value={realInput}
              onChange={(e) => setRealInput(e.target.value)}
              rows={4}
              className="w-full rounded-lg bg-[#0d0d0b] border border-[#26261d] p-3 text-sm text-[#F4EFE6] outline-none focus:border-[#C8FF80]/60"
            />
            <button
              onClick={realCreateRequest}
              disabled={realLoading || !realInput.trim()}
              className="px-4 py-2 rounded-md bg-[#C8FF80] text-[#0d0d0b] text-xs font-medium disabled:opacity-30"
            >
              {realLoading ? '提交中…' : '提交需求 → 创建 Social Request'}
            </button>
          </div>
        )}

        {mode === 'real' && step === 2 && realRequest && (
          <div className="space-y-3">
            <SocialRequestCard request={realRequest} />
            <button
              onClick={realLoadCandidates}
              disabled={realLoading}
              className="px-4 py-2 rounded-md bg-[#C8FF80] text-[#0d0d0b] text-xs font-medium disabled:opacity-30"
            >
              {realLoading ? '匹配中…' : '生成候选人'}
            </button>
          </div>
        )}

        {mode === 'real' && step === 3 && (
          <div className="grid grid-cols-1 gap-4">
            {realCandidates.length === 0 && (
              <div className="text-xs text-[#8C8A6E]">
                暂未匹配到候选人。可以稍后再回到本步骤。
              </div>
            )}
            {realCandidates.map((c) => (
              <CandidateMatchCard
                key={c.userId}
                candidate={c}
                onSendInvite={() => realPickCandidate(c)}
                onSkip={() => undefined}
              />
            ))}
          </div>
        )}

        {mode === 'real' && step === 4 && chosenCandidate && (
          <CandidateMatchCard
            candidate={chosenCandidate}
            onSendInvite={() => next()}
            onSkip={() => undefined}
          />
        )}

        {mode === 'real' && step === 5 && chosenCandidate && (
          <AgentApprovalCard
            request={{
              id: 0,
              userId: 0,
              agentConnectionId: null,
              type: 'send_message',
              skillName: '代发邀约',
              payload: {
                toUserId: chosenCandidate.userId,
                toNickname: chosenCandidate.nickname,
                message: chosenCandidate.suggestedMessage,
              },
              summary: `Agent 想代你给「${chosenCandidate.nickname}」发送邀约并创建一次咖啡见面`,
              riskLevel: chosenCandidate.risk.level,
              rationale:
                '点击确认后将真实调用 POST /api/activities 创建 Activity，绑定到本次 social request。',
              status: 'pending',
              createdAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
            } as ApprovalRequest}
            onApprove={() => realApproveAndCreateActivity()}
            onReject={() => undefined}
          />
        )}

        {mode === 'real' && step === 6 && realActivity && (
          <div className="space-y-4">
            <ActivityIcebreakerCard
              tasks={
                realActivity.icebreakerTasks?.length
                  ? realActivity.icebreakerTasks
                  : MOCK_ICEBREAKERS
              }
              safetyTips={
                realActivity.safetyTips?.length
                  ? realActivity.safetyTips
                  : SAFETY_TIPS
              }
              proofPolicy={realActivity.proofPolicy ?? 'mutual_or_proof'}
            />
            <ActivityProofUploader
              myConfirmed={false}
              myCheckedIn={false}
              onMutualConfirm={() => realSubmitProof()}
              onCheckin={() => undefined}
              onSubmit={() => realSubmitProof()}
            />
            {realProof && (
              <div className="text-[11px] text-[#6B7A5A]">
                ✓ Proof 已上传 · id={realProof.id} · status={realProof.status}
              </div>
            )}
          </div>
        )}

        {mode === 'real' && step === 7 && (
          <div className="rounded-2xl bg-[#15150f] border border-[#26261d] p-6 space-y-4">
            <div className="text-[10px] uppercase tracking-[0.3em] text-[#8C8A6E]">
              闭环完成
            </div>
            <h3 className="text-xl font-light text-[#C8FF80]">
              Real API 链路已贯通
            </h3>
            <ul className="text-sm text-[#E8E2CF] space-y-1 leading-6">
              <li>· SocialRequest #{realRequest?.id ?? '?'}（user_social_requests）</li>
              <li>
                · Candidates: {realCandidates.length} 个（social_request_candidates）
              </li>
              <li>
                · Activity #{realActivity?.id ?? '?'} status=
                {realActivity?.status ?? '?'}
              </li>
              <li>· Proof #{realProof?.id ?? '?'}</li>
            </ul>
            <button
              onClick={realComplete}
              disabled={realLoading || !realActivity}
              className="px-4 py-2 rounded-md bg-[#C8FF80] text-[#0d0d0b] text-xs font-medium disabled:opacity-30"
            >
              {realLoading ? '完成中…' : '标记 Activity 完成'}
            </button>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-4">
          <button
            onClick={prev}
            disabled={step === 1}
            className="px-4 py-2 rounded-md border border-[#26261d] text-xs text-[#C7C2B0] disabled:opacity-30"
          >
            ← 上一步
          </button>
          <span className="text-[11px] text-[#8C8A6E]">
            {step} / {STEPS.length}
          </span>
          <button
            onClick={next}
            disabled={step === STEPS.length}
            className="px-4 py-2 rounded-md bg-[#C8FF80] text-[#0d0d0b] text-xs font-medium disabled:opacity-30"
          >
            下一步 →
          </button>
        </div>

        <div className="text-center text-[11px] text-[#5e5d4a] pt-4 space-x-3">
          <Link to="/social-request/new" className="hover:text-[#C8FF80]">
            真实创建一次任务
          </Link>
          <span>·</span>
          <Link to="/agent/approvals" className="hover:text-[#C8FF80]">
            Agent 待确认
          </Link>
          <span>·</span>
          <Link to="/" className="hover:text-[#C8FF80]">
            返回首页
          </Link>
        </div>
      </div>
    </div>
  );
}

export default DemoAgentSocialLoopPage;
