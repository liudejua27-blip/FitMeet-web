import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, request } from '../api/client';
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
import { useAuthStore } from '../stores';

/* -------------------------------------------------------------------------- */
/*  FitMeet · Investor Demo · 完整闭环                                         */
/*                                                                            */
/*  路由: /demo/investor                                                       */
/*  - 10 步：发布需求 → AI 匹配 → 邀约 → 聊天 → 创建活动 → 签到 → 证明 →     */
/*           评价 → 复盘 → 信任分。                                            */
/*  - 已登录时优先调用真实接口；接口缺失/失败则用明确标注的 demo fallback。  */
/* -------------------------------------------------------------------------- */

type StepKey =
  | 'request'
  | 'match'
  | 'invite'
  | 'chat'
  | 'activity'
  | 'checkin'
  | 'proof'
  | 'review'
  | 'recap'
  | 'trust';

type StepState = 'idle' | 'running' | 'real' | 'fallback' | 'error';

interface StepMeta {
  key: StepKey;
  title: string;
  caption: string;
  endpoint: string; // 接口提示
}

const STEPS: StepMeta[] = [
  { key: 'request', title: '发布社交 / 约练需求', caption: '一句自然语言 → 结构化 SocialRequest', endpoint: 'POST /api/social-requests' },
  { key: 'match',   title: 'AI 匹配候选人',        caption: '在用户池里挑出 Top-N，并给出可解释的命中理由', endpoint: 'POST /api/social-requests/:id/rematch' },
  { key: 'invite',  title: '发送邀约',              caption: 'Agent 拟稿，用户确认后才真实发出',           endpoint: 'POST /api/social-requests/:id/candidates/:cid/mark-messaged' },
  { key: 'chat',    title: '进入聊天',              caption: '双方在站内对话，沉淀破冰记录',               endpoint: 'WebSocket /messages · demo fallback' },
  { key: 'activity',title: '创建活动',              caption: '把社交需求落到线下 Activity（时间 / 地点 / 证明策略）', endpoint: 'POST /api/activities' },
  { key: 'checkin', title: '到场签到',              caption: '双方在现场完成 check-in',                    endpoint: 'POST /api/activities/:id/checkin' },
  { key: 'proof',   title: '上传证明',              caption: '场景照 / 互相确认 — 隐私可选',               endpoint: 'POST /api/activities/:id/proof' },
  { key: 'review',  title: '完成评价',              caption: '互评打分写入活动履约记录',                   endpoint: 'POST /api/activities/:id/complete + /review' },
  { key: 'recap',   title: '生成活动复盘',          caption: 'AI 用一段话总结这场社交的关键体验',           endpoint: 'AI recap · demo fallback' },
  { key: 'trust',   title: '信任积分变化',          caption: '完成线下后，对方信任分被抬升',               endpoint: 'GET /api/auth/profile · user.trustScore' },
];

type StepStatusMap = Record<StepKey, StepState>;
type StepDataMap = Partial<Record<StepKey, unknown>>;

interface MockProfile {
  id: number;
  name: string;
  trustScore: number;
}

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
    color: '#A855F7',
    score: 92,
    level: 'high',
    distanceKm: 1.4,
    commonTags: ['独立电影', '咖啡', '摄影', '城市散步'],
    reasons: [
      '资料里出现 4 部交集影片（侯麦 / 阿彼察邦 / 贾木许 / 滨口龙介）',
      '常驻三里屯，半径 1.4 km，时间偏好和你重合',
      '过去 30 天完成了 2 次线下咖啡见面，平均评价 4.8 / 5',
    ],
    scoreBreakdown: { interest: 38, distance: 22, schedule: 18, trust: 14 },
    risk: { level: 'low', warnings: [] },
    suggestedMessage:
      '你好，我看到你也喜欢侯麦的「四季故事」。周六下午我刚好在三里屯，要不要一起喝杯咖啡聊一小时？地点你选，我习惯安静一点的小店。',
  },
  {
    userId: 102,
    nickname: '苏念',
    avatar: '苏',
    color: '#22D3EE',
    score: 81,
    level: 'medium',
    distanceKm: 3.2,
    commonTags: ['独立电影', '城市散步'],
    reasons: ['关注独立电影标签 6 个月，最近收藏了「枯叶」', '工作日常在国贸—三里屯通勤'],
    scoreBreakdown: { interest: 30, distance: 18, schedule: 16, trust: 17 },
    risk: { level: 'low', warnings: [] },
    suggestedMessage: '嗨，我看到你最近收藏了「枯叶」。周六想在三里屯找人聊聊独立电影，要一起喝杯咖啡吗？',
  },
];

const MOCK_CHAT = [
  { from: 'you',  text: '你好，我看到你也喜欢侯麦的「四季故事」。周六下午要不要在三里屯喝咖啡？' },
  { from: 'them', text: '可以呀。三里屯的「Berry Beans」可以吗？我下午 3 点能到。' },
  { from: 'you',  text: '好的，那就约 3 点。我会带一本《电影手册》中文版。' },
  { from: 'them', text: '哈哈不用，我们直接聊。到了我穿驼色风衣。' },
];

const MOCK_ACTIVITY: SocialActivity = {
  id: 5501,
  creatorId: 1,
  participantIds: [1, 101],
  socialRequestId: 9001,
  matchedCandidateId: 101,
  type: 'coffee_chat',
  title: 'Coffee chat · 三里屯 · 聊独立电影',
  description: '约在三里屯 Berry Beans，聊一小时独立电影。',
  locationName: 'Berry Beans · 三里屯',
  city: '北京',
  startTime: new Date(Date.now() + 86400000).toISOString(),
  endTime: null,
  status: 'confirmed',
  icebreakerTasks: [
    { id: 'ice-1', text: '互相说一部最近看的、对方一定没看过的电影' },
    { id: 'ice-2', text: '同一款豆子点不同烘焙度，互相品评' },
  ],
  safetyTips: ['公共咖啡店见面，对方临时改地点请直接取消'],
  proofRequired: true,
  proofPolicy: 'mutual_or_proof',
  safetyLevel: 'low',
  checkinByUserId: {},
  confirmByUserId: {},
};

const MOCK_PROOF: ActivityProof = {
  id: 880,
  activityId: 5501,
  userId: 1,
  proofType: 'scene_photo',
  photoUrl: null,
  note: '一杯 V60，一本《电影手册》，下午光线刚好',
  locationApprox: '三里屯太古里',
  status: 'accepted',
  privacyMode: 'scene_only',
  reviewedById: 101,
  reviewedAt: new Date().toISOString(),
  reviewReason: '',
  createdAt: new Date().toISOString(),
};

const MOCK_RECAP =
  '一场 62 分钟的咖啡对话。共同聊到 7 部独立电影，发现你和对方都偏好「日常感 + 慢节奏」的叙事。' +
  '对方主动提议两周后一起去看「枯叶」的二次放映，社交关系自然延续到下一次。';

/* -------------------------------------------------------------------------- */
/*  小组件                                                                     */
/* -------------------------------------------------------------------------- */

function Badge({
  state,
}: {
  state: StepState;
}) {
  if (state === 'real') {
    return (
      <span className="rounded-full border border-petBright/40 bg-petBright/15 px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-petBright">
        REAL API
      </span>
    );
  }
  if (state === 'fallback') {
    return (
      <span className="rounded-full border border-amber/40 bg-amber/15 px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-amber">
        DEMO FALLBACK
      </span>
    );
  }
  if (state === 'running') {
    return (
      <span className="rounded-full border border-aiBright/40 bg-aiBright/15 px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-aiBright">
        RUNNING…
      </span>
    );
  }
  if (state === 'error') {
    return (
      <span className="rounded-full border border-coral/40 bg-coral/15 px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-coral">
        ERROR
      </span>
    );
  }
  return (
    <span className="rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-cream/50">
      IDLE
    </span>
  );
}

function StepCard({
  index,
  meta,
  state,
  active,
  children,
}: {
  index: number;
  meta: StepMeta;
  state: StepState;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <article
      className={`relative rounded-3xl border p-6 backdrop-blur-xl transition ${
        active
          ? 'border-aiBright/40 bg-white/[0.05] shadow-aiGlow'
          : state === 'real' || state === 'fallback'
            ? 'border-white/10 bg-white/[0.03]'
            : 'border-white/[0.08] bg-white/[0.02]'
      }`}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border font-mono text-sm font-black ${
              state === 'real' || state === 'fallback'
                ? 'border-petBright/30 bg-petBright/10 text-petBright'
                : state === 'running'
                  ? 'border-aiBright/30 bg-aiBright/10 text-aiBright'
                  : 'border-white/10 bg-white/[0.04] text-cream/50'
            }`}
          >
            {String(index + 1).padStart(2, '0')}
          </div>
          <div>
            <h3 className="font-display text-lg font-black leading-tight text-cream">
              {meta.title}
            </h3>
            <p className="mt-1 text-sm text-cream/60">{meta.caption}</p>
            <code className="mt-1 inline-block font-mono text-[10px] tracking-tight text-cream/35">
              {meta.endpoint}
            </code>
          </div>
        </div>
        <Badge state={state} />
      </div>

      <div className="rounded-2xl border border-white/[0.06] bg-base/40 p-4">
        {children}
      </div>
    </article>
  );
}

function KeyValue({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="w-24 shrink-0 font-mono text-[11px] uppercase tracking-wider text-cream/40">
        {k}
      </span>
      <span className="text-cream/85">{v}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  主组件                                                                     */
/* -------------------------------------------------------------------------- */

export function DemoInvestorPage() {
  const { isLoggedIn } = useAuthStore();

  const [status, setStatus] = useState<StepStatusMap>(
    () =>
      Object.fromEntries(STEPS.map((s) => [s.key, 'idle'])) as StepStatusMap,
  );
  const [data, setData] = useState<StepDataMap>({});
  const [active, setActive] = useState<StepKey>('request');
  const [running, setRunning] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<StepKey, string>>>({});

  const mark = useCallback(
    (key: StepKey, s: StepState, payload?: unknown, err?: string) => {
      setStatus((prev) => ({ ...prev, [key]: s }));
      if (payload !== undefined) setData((prev) => ({ ...prev, [key]: payload }));
      if (err) setErrors((prev) => ({ ...prev, [key]: err }));
    },
    [],
  );

  const reqRef = useRef<SocialRequestSummary | null>(null);
  const candidatesRef = useRef<CandidateView[]>([]);
  const activityRef = useRef<SocialActivity | null>(null);
  const trustBeforeRef = useRef<number | null>(null);

  /* -------- 工具：以真实接口为先，失败则 fallback 到 mock -------- */
  const runStep = useCallback(
    async <T,>(
      key: StepKey,
      realFn: () => Promise<T>,
      mockFn: () => T,
      onResult: (value: T, mode: 'real' | 'fallback') => void,
    ): Promise<void> => {
      mark(key, 'running');
      // 未登录直接走 fallback，避免 401 噪音
      if (!isLoggedIn) {
        const m = mockFn();
        onResult(m, 'fallback');
        mark(key, 'fallback', m);
        return;
      }
      try {
        const r = await realFn();
        onResult(r, 'real');
        mark(key, 'real', r);
      } catch (err) {
        const m = mockFn();
        onResult(m, 'fallback');
        const msg = err instanceof ApiError ? `${err.status} · ${err.message}` : (err as Error).message;
        mark(key, 'fallback', m, msg);
      }
    },
    [isLoggedIn, mark],
  );

  /* ------------------------------ 各步骤 ------------------------------ */

  const stepRequest = useCallback(async () => {
    setActive('request');
    await runStep<SocialRequestSummary>(
      'request',
      () =>
        socialRequestsApi.create({
          type: 'coffee_chat',
          rawText: MOCK_REQUEST.description,
          description: MOCK_REQUEST.description,
          city: MOCK_REQUEST.city,
          interestTags: MOCK_REQUEST.interestTags,
        }),
      () => MOCK_REQUEST,
      (r) => {
        reqRef.current = r;
      },
    );
  }, [runStep]);

  const stepMatch = useCallback(async () => {
    setActive('match');
    await runStep<CandidateView[]>(
      'match',
      async () => {
        if (!reqRef.current) throw new Error('no social request');
        const res = await socialRequestsApi.rematch(reqRef.current.id);
          return res.candidates.length
            ? res.candidates
            : import.meta.env.DEV
              ? MOCK_CANDIDATES
              : [];
        },
        () => (import.meta.env.DEV ? MOCK_CANDIDATES : []),
      (r) => {
        candidatesRef.current = r;
      },
    );
  }, [runStep]);

  const stepInvite = useCallback(async () => {
    setActive('invite');
    await runStep<{ candidate: CandidateView; markedStatus?: string }>(
      'invite',
      async () => {
        const reqId = reqRef.current?.id;
        const top = candidatesRef.current[0];
        if (!reqId || !top) throw new Error('no candidate');
        const recordId = top.candidateRecordId;
        if (!recordId) {
          return { candidate: top, markedStatus: 'no-record-id' };
        }
        const r = await socialRequestsApi.markCandidateMessaged(reqId, recordId);
        return { candidate: top, markedStatus: r.status };
      },
      () => ({ candidate: MOCK_CANDIDATES[0], markedStatus: 'demo' }),
      () => undefined,
    );
  }, [runStep]);

  const stepChat = useCallback(async () => {
    setActive('chat');
    // 聊天必须涉及真实另一方用户，演示场景统一走 mock，并明确标注。
    mark('chat', 'fallback', MOCK_CHAT);
  }, [mark]);

  const stepActivity = useCallback(async () => {
    setActive('activity');
    await runStep<SocialActivity>(
      'activity',
      async () => {
        const reqId = reqRef.current?.id;
        const top = candidatesRef.current[0];
        if (!reqId || !top) throw new Error('no candidate');
        return activitiesApi.create({
          type: 'coffee_chat',
          title: `Coffee chat · ${reqRef.current?.city ?? 'demo'}`,
          description: reqRef.current?.description,
          city: reqRef.current?.city,
          socialRequestId: reqId,
          invitedUserId: top.userId,
          proofPolicy: 'mutual_or_proof',
        });
      },
      () => MOCK_ACTIVITY,
      (r) => {
        activityRef.current = r;
      },
    );
  }, [runStep]);

  const stepCheckin = useCallback(async () => {
    setActive('checkin');
    await runStep<SocialActivity>(
      'checkin',
      async () => {
        const a = activityRef.current;
        if (!a) throw new Error('no activity');
        return activitiesApi.checkin(a.id, '三里屯太古里 · Berry Beans');
      },
      () => ({
        ...MOCK_ACTIVITY,
        checkinByUserId: { '1': new Date().toISOString() },
      }),
      (r) => {
        activityRef.current = r;
      },
    );
  }, [runStep]);

  const stepProof = useCallback(async () => {
    setActive('proof');
    await runStep<ActivityProof>(
      'proof',
      async () => {
        const a = activityRef.current;
        if (!a) throw new Error('no activity');
        return activitiesApi.submitProof(a.id, {
          proofType: 'scene_photo',
          note: MOCK_PROOF.note,
          locationApprox: MOCK_PROOF.locationApprox,
          privacyMode: 'scene_only',
        });
      },
      () => MOCK_PROOF,
      () => undefined,
    );
  }, [runStep]);

  const stepReview = useCallback(async () => {
    setActive('review');
    await runStep<{ rating: number; comment: string; completed: boolean }>(
      'review',
      async () => {
        const a = activityRef.current;
        if (!a) throw new Error('no activity');
        try {
          await activitiesApi.complete(a.id);
        } catch {
          /* 已 completed 时忽略 */
        }
        await request(`/activities/${a.id}/review`, {
          method: 'POST',
          body: JSON.stringify({ rating: 5, comment: '聊得很舒服，时间感都没了。' }),
        });
        return { rating: 5, comment: '聊得很舒服，时间感都没了。', completed: true };
      },
      () => ({ rating: 5, comment: '聊得很舒服，时间感都没了。', completed: true }),
      () => undefined,
    );
  }, [runStep]);

  const stepRecap = useCallback(async () => {
    setActive('recap');
    // 公开 recap 接口暂未开放，统一 demo fallback
    mark('recap', 'fallback', MOCK_RECAP);
  }, [mark]);

  const stepTrust = useCallback(async () => {
    setActive('trust');
    await runStep<{ before: number; after: number; delta: number; name: string }>(
      'trust',
      async () => {
        const p = await request<MockProfile>('/auth/profile');
        const before = trustBeforeRef.current ?? Math.max(0, (p.trustScore ?? 0) - 2);
        return {
          before,
          after: p.trustScore ?? before,
          delta: (p.trustScore ?? before) - before,
          name: p.name,
        };
      },
      () => ({ before: 14, after: 17, delta: 3, name: '林一' }),
      () => undefined,
    );
  }, [runStep]);

  /* --------------------- 一键播放 / 单步控制 --------------------- */

  const playAll = useCallback(async () => {
    if (running) return;
    setRunning(true);
    // 预取信任分基线
    if (isLoggedIn) {
      try {
        const p = await request<MockProfile>('/auth/profile');
        trustBeforeRef.current = p.trustScore ?? 0;
      } catch {
        trustBeforeRef.current = null;
      }
    }
    const seq: Array<() => Promise<void>> = [
      stepRequest, stepMatch, stepInvite, stepChat,
      stepActivity, stepCheckin, stepProof, stepReview,
      stepRecap, stepTrust,
    ];
    for (const fn of seq) {
      await fn();
      await new Promise((r) => setTimeout(r, 350));
    }
    setRunning(false);
  }, [
    isLoggedIn, running,
    stepRequest, stepMatch, stepInvite, stepChat,
    stepActivity, stepCheckin, stepProof, stepReview,
    stepRecap, stepTrust,
  ]);

  const reset = useCallback(() => {
    setStatus(
      Object.fromEntries(STEPS.map((s) => [s.key, 'idle'])) as StepStatusMap,
    );
    setData({});
    setErrors({});
    reqRef.current = null;
    candidatesRef.current = [];
    activityRef.current = null;
    trustBeforeRef.current = null;
    setActive('request');
  }, []);

  /* ----------------------------- 渲染 ----------------------------- */

  const completed = useMemo(
    () => STEPS.filter((s) => status[s.key] === 'real' || status[s.key] === 'fallback').length,
    [status],
  );

  useEffect(() => {
    document.title = 'FitMeet · 投资人 Demo · 完整闭环';
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-base text-cream">
      {/* 背景：portal / glass 风格 */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute inset-0 opacity-60 blur-3xl"
          style={{
            background:
              'radial-gradient(800px 600px at 15% 15%, rgba(168,85,247,0.35) 0%, transparent 60%),' +
              'radial-gradient(700px 600px at 85% 35%, rgba(34,211,238,0.20) 0%, transparent 60%),' +
              'radial-gradient(600px 500px at 60% 95%, rgba(255,107,53,0.25) 0%, transparent 60%)',
          }}
        />
      </div>

      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
        {/* ============== HEADER ============== */}
        <header className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-aiBright/40 bg-aiBright/10 px-3 py-1 font-mono text-[10px] font-black tracking-[0.3em] text-aiBright">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-aiBright" />
              INVESTOR DEMO · v1.0
            </span>
            <span
              className={`rounded-full border px-3 py-1 font-mono text-[10px] font-black tracking-wider ${
                isLoggedIn
                  ? 'border-petBright/40 bg-petBright/10 text-petBright'
                  : 'border-amber/40 bg-amber/10 text-amber'
              }`}
            >
              {isLoggedIn ? 'REAL API · LOGGED IN' : 'GUEST · 走 demo fallback'}
            </span>
          </div>
          <h1 className="mt-5 font-display text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl">
            一次完整的 FitMeet 闭环
            <br />
            <span className="bg-gradient-to-r from-aiBright via-aiCyan to-petBright bg-clip-text text-transparent">
              从一句话需求 → 到一次真实的线下相遇 → 到信任沉淀。
            </span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-cream/70">
            这是给投资人 / 评测者看的演示页。十个步骤、十个接口，全部按真实顺序串起来。
            登录后会优先调用真实后端；缺数据的步骤会清晰标注「DEMO FALLBACK」，不掩饰。
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={playAll}
              disabled={running}
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-aiBright to-aiCyan px-5 py-3 font-display text-sm font-black text-base shadow-aiGlow transition hover:scale-[1.02] disabled:opacity-40"
            >
              {running ? '演示中…' : '▶ 一键播放完整闭环'}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={running}
              className="rounded-2xl border border-white/15 bg-white/[0.04] px-4 py-3 font-mono text-xs font-black tracking-wider text-cream/70 transition hover:bg-white/[0.08] disabled:opacity-40"
            >
              RESET
            </button>
            <span className="ml-auto font-mono text-[11px] text-cream/40">
              进度 {completed} / {STEPS.length}
            </span>
          </div>
        </header>

        {/* ============== TIMELINE ============== */}
        <ol className="mt-8 space-y-4">
          {STEPS.map((meta, i) => (
            <li key={meta.key}>
              <StepCard
                index={i}
                meta={meta}
                state={status[meta.key]}
                active={active === meta.key}
              >
                <StepBody
                  stepKey={meta.key}
                  state={status[meta.key]}
                  data={data[meta.key]}
                  error={errors[meta.key]}
                />
              </StepCard>
            </li>
          ))}
        </ol>

        {/* ============== FOOTER ============== */}
        <footer className="mt-10 rounded-3xl border border-petBright/30 bg-petBright/[0.06] p-6 backdrop-blur-xl sm:p-8">
          <div className="text-[10px] font-black uppercase tracking-[0.4em] text-petBright">
            闭环 = 价值
          </div>
          <h2 className="mt-3 font-display text-2xl font-black leading-snug text-cream sm:text-3xl">
            一句话需求 → AI 匹配 → 人工确认 → 线下完成 → 信任沉淀
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-cream/70">
            没有滑卡。没有冷启动。没有失控的 Agent。每一次完成，都会让下一次的匹配更准、对方的信任分更高。
          </p>
          <div className="mt-5 flex flex-wrap gap-3 text-xs">
            <Link to="/social-request/new" className="rounded-full border border-aiBright/40 px-4 py-2 text-aiBright hover:bg-aiBright/10">
              立即真实发起一次 →
            </Link>
            <Link to="/demo/agent-social-loop" className="rounded-full border border-white/15 px-4 py-2 text-cream/70 hover:bg-white/[0.06]">
              另一版 7 步演示
            </Link>
            <Link to="/" className="rounded-full border border-white/15 px-4 py-2 text-cream/70 hover:bg-white/[0.06]">
              返回首页
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  各步骤的展示卡片                                                            */
/* -------------------------------------------------------------------------- */

function StepBody({
  stepKey,
  state,
  data,
  error,
}: {
  stepKey: StepKey;
  state: StepState;
  data: unknown;
  error?: string;
}) {
  if (state === 'idle') {
    return (
      <div className="py-2 text-sm text-cream/40">
        等待执行。点击上方「一键播放」即可。
      </div>
    );
  }
  if (state === 'running') {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-aiBright">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-aiBright" />
        正在调用接口…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {state === 'fallback' && error && (
        <div className="rounded-xl border border-amber/30 bg-amber/[0.08] px-3 py-2 text-[11px] text-amber/90">
          真实接口失败 → 已切换到 demo fallback：{error}
        </div>
      )}

      {stepKey === 'request' && <BodyRequest req={data as SocialRequestSummary | undefined} />}
      {stepKey === 'match' && <BodyMatch list={data as CandidateView[] | undefined} />}
      {stepKey === 'invite' && (
        <BodyInvite payload={data as { candidate: CandidateView; markedStatus?: string } | undefined} />
      )}
      {stepKey === 'chat' && <BodyChat lines={data as typeof MOCK_CHAT | undefined} />}
      {stepKey === 'activity' && <BodyActivity act={data as SocialActivity | undefined} />}
      {stepKey === 'checkin' && <BodyCheckin act={data as SocialActivity | undefined} />}
      {stepKey === 'proof' && <BodyProof proof={data as ActivityProof | undefined} />}
      {stepKey === 'review' && <BodyReview info={data as { rating: number; comment: string } | undefined} />}
      {stepKey === 'recap' && <BodyRecap text={data as string | undefined} />}
      {stepKey === 'trust' && (
        <BodyTrust info={data as { before: number; after: number; delta: number; name: string } | undefined} />
      )}
    </div>
  );
}

function BodyRequest({ req }: { req?: SocialRequestSummary }) {
  if (!req) return null;
  return (
    <div className="space-y-2">
      <KeyValue k="id" v={`#${req.id}`} />
      <KeyValue k="title" v={req.title} />
      <KeyValue k="city" v={`${req.city} · ${req.radiusKm} km`} />
      <KeyValue k="status" v={req.status} />
      <KeyValue
        k="tags"
        v={
          <span className="flex flex-wrap gap-1">
            {req.interestTags.map((t) => (
              <span key={t} className="rounded-full bg-aiBright/15 px-2 py-0.5 text-[10px] text-aiBright">
                {t}
              </span>
            ))}
          </span>
        }
      />
    </div>
  );
}

function BodyMatch({ list }: { list?: CandidateView[] }) {
  if (!list?.length) return null;
  return (
    <div className="space-y-3">
      {list.slice(0, 3).map((c) => (
        <div key={c.userId} className="rounded-xl border border-white/10 bg-base/40 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full font-display text-sm font-black text-base"
                style={{ background: c.color }}
              >
                {c.avatar}
              </span>
              <span className="text-sm font-bold text-cream">{c.nickname}</span>
              <span className="font-mono text-[10px] text-cream/40">{c.distanceKm ?? '?'} km</span>
            </div>
            <span className="font-mono text-sm font-black text-petBright">{c.score}</span>
          </div>
          <ul className="mt-2 space-y-1 text-xs text-cream/65">
            {c.reasons.slice(0, 2).map((r, idx) => (
              <li key={idx}>· {r}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function BodyInvite({ payload }: { payload?: { candidate: CandidateView; markedStatus?: string } }) {
  if (!payload) return null;
  const { candidate, markedStatus } = payload;
  return (
    <div className="space-y-2">
      <KeyValue k="to" v={`@${candidate.nickname} (#${candidate.userId})`} />
      <KeyValue k="mark.status" v={markedStatus ?? '—'} />
      <div className="rounded-xl border border-aiBright/20 bg-aiBright/[0.06] p-3 text-sm leading-6 text-cream/85">
        {candidate.suggestedMessage}
      </div>
    </div>
  );
}

function BodyChat({ lines }: { lines?: typeof MOCK_CHAT }) {
  const ls = lines ?? MOCK_CHAT;
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-cream/40">
        聊天涉及真实另一方用户，演示场景统一使用脚本（DEMO FALLBACK）。
      </p>
      {ls.map((m, i) => (
        <div
          key={i}
          className={`flex ${m.from === 'you' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-5 ${
              m.from === 'you'
                ? 'bg-aiBright/20 text-cream'
                : 'bg-white/[0.05] text-cream/85'
            }`}
          >
            {m.text}
          </div>
        </div>
      ))}
    </div>
  );
}

function BodyActivity({ act }: { act?: SocialActivity }) {
  if (!act) return null;
  return (
    <div className="space-y-2">
      <KeyValue k="id" v={`#${act.id}`} />
      <KeyValue k="title" v={act.title} />
      <KeyValue k="status" v={act.status} />
      <KeyValue k="policy" v={act.proofPolicy} />
      <KeyValue k="city" v={act.city} />
    </div>
  );
}

function BodyCheckin({ act }: { act?: SocialActivity }) {
  if (!act) return null;
  const entries = Object.entries(act.checkinByUserId ?? {});
  return (
    <div className="space-y-2">
      <KeyValue k="activity" v={`#${act.id}`} />
      <KeyValue k="checked-in" v={entries.length ? `${entries.length} 人 ✓` : '尚未签到'} />
      <KeyValue k="status" v={act.status} />
    </div>
  );
}

function BodyProof({ proof }: { proof?: ActivityProof }) {
  if (!proof) return null;
  return (
    <div className="space-y-2">
      <KeyValue k="proof.id" v={`#${proof.id}`} />
      <KeyValue k="type" v={proof.proofType} />
      <KeyValue k="status" v={proof.status} />
      <KeyValue k="privacy" v={proof.privacyMode} />
      {proof.note && <KeyValue k="note" v={proof.note} />}
    </div>
  );
}

function BodyReview({ info }: { info?: { rating: number; comment: string } }) {
  if (!info) return null;
  return (
    <div className="space-y-2">
      <KeyValue
        k="rating"
        v={
          <span className="text-amber">
            {'★'.repeat(info.rating)}
            <span className="text-cream/30">{'★'.repeat(5 - info.rating)}</span>
          </span>
        }
      />
      <KeyValue k="comment" v={info.comment} />
    </div>
  );
}

function BodyRecap({ text }: { text?: string }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-cream/40">
        当前公开 API 还未暴露 recap，演示展示 AI 生成的样例文本（DEMO FALLBACK）。
      </p>
      <p className="rounded-xl border border-aiBright/20 bg-aiBright/[0.06] p-3 text-sm leading-6 text-cream/85">
        {text ?? MOCK_RECAP}
      </p>
    </div>
  );
}

function BodyTrust({ info }: { info?: { before: number; after: number; delta: number; name: string } }) {
  if (!info) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-cream/40">BEFORE</div>
          <div className="font-display text-3xl font-black text-cream/60">{info.before}</div>
        </div>
        <div className="pb-1 font-display text-2xl font-black text-cream/30">→</div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-petBright">AFTER</div>
          <div className="font-display text-4xl font-black text-petBright">{info.after}</div>
        </div>
        <div className="ml-auto pb-1">
          <span className="rounded-full border border-petBright/40 bg-petBright/15 px-3 py-1 font-mono text-sm font-black text-petBright">
            +{info.delta} TRUST
          </span>
        </div>
      </div>
      <p className="text-xs text-cream/60">
        当前用户「{info.name}」的累计信任分。每完成一次被双方确认的线下活动，对方的 trustScore 都会被抬升，
        下一次匹配时排序权重也会相应提高。
      </p>
    </div>
  );
}

export default DemoInvestorPage;
