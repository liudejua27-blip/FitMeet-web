import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import * as api from '../api/client';
import { useAuthStore } from '../stores';

type ActivityType =
  | 'running'
  | 'fitness'
  | 'dog_walking'
  | 'coffee_chat'
  | 'city_walk'
  | 'custom';

type ActivityStatus =
  | 'draft'
  | 'pending_confirm'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

type ProofPolicy = 'mutual_confirm' | 'mutual_or_proof' | 'mutual_and_proof';

type ProofType =
  | 'checkin'
  | 'mutual_confirm'
  | 'scene_photo'
  | 'selfie_optional'
  | 'qr_code'
  | 'merchant_confirm';

type ProofStatus = 'pending' | 'accepted' | 'rejected';

type PrivacyMode = 'hidden_face' | 'scene_only' | 'private';

interface IcebreakerTask {
  id: string;
  text: string;
  done?: boolean;
}

interface SocialActivity {
  id: number;
  creatorId: number;
  participantIds: number[];
  socialRequestId: number | null;
  matchedCandidateId: number | null;
  type: ActivityType;
  title: string;
  description: string;
  locationName: string;
  city: string;
  startTime: string | null;
  endTime: string | null;
  status: ActivityStatus;
  icebreakerTasks: IcebreakerTask[];
  safetyTips: string[];
  proofRequired: boolean;
  proofPolicy: ProofPolicy;
  safetyLevel: 'low' | 'medium' | 'high';
  checkinByUserId: Record<string, string>;
  confirmByUserId: Record<string, string>;
  recap?: string | null;
}

interface ActivityProof {
  id: number;
  activityId: number;
  userId: number;
  proofType: ProofType;
  photoUrl: string | null;
  note: string;
  locationApprox: string;
  status: ProofStatus;
  privacyMode: PrivacyMode;
  reviewedById: number | null;
  reviewedAt: string | null;
  reviewReason: string;
  createdAt: string;
}

interface ActivityResponse {
  activity: SocialActivity;
  proofs: ActivityProof[];
}

const TYPE_LABEL: Record<ActivityType, string> = {
  running: '跑步',
  fitness: '健身',
  dog_walking: '遛狗',
  coffee_chat: '咖啡轻聊',
  city_walk: '城市散步',
  custom: '自定义',
};

const STATUS_LABEL: Record<ActivityStatus, { text: string; tone: string }> = {
  draft: { text: '草稿', tone: 'text-[#8C8A6E] border-[#3a3a32]' },
  pending_confirm: {
    text: '等待确认',
    tone: 'text-amber-300 border-amber-500/40',
  },
  confirmed: {
    text: '已确认',
    tone: 'text-[#C8FF80] border-[#C8FF80]/40',
  },
  in_progress: {
    text: '进行中',
    tone: 'text-sky-300 border-sky-400/40',
  },
  completed: {
    text: '已完成',
    tone: 'text-[#C8FF80] border-[#C8FF80]/60',
  },
  cancelled: { text: '已取消', tone: 'text-red-400 border-red-500/40' },
};

const PROOF_LABEL: Record<ProofType, string> = {
  checkin: '签到',
  mutual_confirm: '双方确认',
  scene_photo: '场景照片',
  selfie_optional: '自拍（可选）',
  qr_code: '活动二维码',
  merchant_confirm: '场地确认',
};

const PRIVACY_LABEL: Record<PrivacyMode, string> = {
  hidden_face: '不露脸',
  scene_only: '仅场景',
  private: '私密',
};

function formatTime(iso: string | null): string {
  if (!iso) return '待定';
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return iso;
  }
}

export function ActivityPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const activityId = Number(id);

  const [data, setData] = useState<ActivityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [proofType, setProofType] = useState<ProofType>('scene_photo');
  const [photoUrl, setPhotoUrl] = useState('');
  const [note, setNote] = useState('');
  const [locationApprox, setLocationApprox] = useState('');
  const [privacyMode, setPrivacyMode] = useState<PrivacyMode>('scene_only');

  const load = useCallback(async () => {
    if (!Number.isFinite(activityId)) return;
    try {
      const res = await api.request<ActivityResponse>(
        `/activities/${activityId}`,
      );
      setData(res);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '加载失败');
    }
  }, [activityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const me = useAuthStore((s) => s.user?.id ?? null);

  const isParticipant = useMemo(() => {
    if (!data || me == null) return false;
    return data.activity.participantIds.includes(me);
  }, [data, me]);

  const myConfirmed = useMemo(() => {
    if (!data || me == null) return false;
    return Boolean(data.activity.confirmByUserId[String(me)]);
  }, [data, me]);

  const myCheckedIn = useMemo(() => {
    if (!data || me == null) return false;
    return Boolean(data.activity.checkinByUserId[String(me)]);
  }, [data, me]);

  const allConfirmed = useMemo(() => {
    if (!data) return false;
    const a = data.activity;
    return (
      a.participantIds.length >= 2 &&
      a.participantIds.every((uid) => Boolean(a.confirmByUserId[String(uid)]))
    );
  }, [data]);

  const act = useCallback(
    async (
      label: string,
      fn: () => Promise<unknown>,
      reload = true,
    ): Promise<void> => {
      setBusy(true);
      setError(null);
      try {
        await fn();
        if (reload) await load();
      } catch (e: unknown) {
        setError(`${label} 失败：${e instanceof Error ? e.message : '未知错误'}`);
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  if (!Number.isFinite(activityId)) {
    return (
      <div className="min-h-screen bg-[#0d0d0b] text-[#F4EFE6] p-8">
        无效的活动 ID
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[#0d0d0b] text-[#8C8A6E] p-8">
        {error ?? '加载中...'}
      </div>
    );
  }

  const a = data.activity;
  const status = STATUS_LABEL[a.status];

  return (
    <div className="min-h-screen bg-[#0d0d0b] text-[#F4EFE6]">
      <header className="border-b border-[#1f1f1a] px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="text-xs text-[#8C8A6E] hover:text-[#C8FF80]"
        >
          ← 返回
        </button>
        <div className="flex-1">
          <div className="text-xs text-[#8C8A6E] tracking-wide uppercase">
            {TYPE_LABEL[a.type]} · #{a.id}
          </div>
          <h1 className="text-xl font-light tracking-tight">{a.title}</h1>
        </div>
        <span
          className={`px-3 py-1 rounded-full border text-xs ${status.tone}`}
        >
          {status.text}
        </span>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        {error && (
          <div className="text-xs text-red-300 bg-red-900/20 border border-red-500/40 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        {/* Detail */}
        <section className="rounded-2xl bg-[#15150f] border border-[#26261d] p-5">
          <div className="text-sm text-[#C7C2B0] leading-6 whitespace-pre-line">
            {a.description || '（无描述）'}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-[#8C8A6E]">
            <div>
              <span className="block text-[10px] uppercase tracking-wider">
                开始时间
              </span>
              <span className="text-[#F4EFE6]">{formatTime(a.startTime)}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-wider">
                地点
              </span>
              <span className="text-[#F4EFE6]">
                {a.locationName || '待定'}
                {a.city ? ` · ${a.city}` : ''}
              </span>
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-wider">
                参与人数
              </span>
              <span className="text-[#F4EFE6]">
                {a.participantIds.length} 人
              </span>
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-wider">
                证明策略
              </span>
              <span className="text-[#F4EFE6]">
                {a.proofPolicy === 'mutual_confirm'
                  ? '仅双方确认'
                  : a.proofPolicy === 'mutual_or_proof'
                    ? '确认或证明任一'
                    : '确认 + 证明'}
              </span>
            </div>
          </div>
        </section>

        {/* Recap (post-completion summary) */}
        {a.status === 'completed' && a.recap && (
          <section className="rounded-2xl bg-[#15150f] border border-[#C8FF80]/30 p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-[#C8FF80]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#C8FF80]" /> 活动复盘
            </div>
            <p className="mt-3 text-sm text-[#E8E2CF] leading-6 whitespace-pre-wrap">
              {a.recap}
            </p>
          </section>
        )}

        {/* Safety tips */}
        {a.safetyTips.length > 0 && (
          <section className="rounded-2xl bg-[#1a1a13] border border-amber-500/30 p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-amber-300">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> 安全提醒
            </div>
            <ul className="mt-3 space-y-2 text-sm text-[#E8E2CF] leading-6">
              {a.safetyTips.map((tip, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-amber-300/70">·</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Icebreakers */}
        <section className="rounded-2xl bg-[#15150f] border border-[#26261d] p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm tracking-wider uppercase text-[#8C8A6E]">
              破冰任务卡
            </h2>
            <span className="text-[10px] text-[#5e5d4a]">
              共 {a.icebreakerTasks.length} 项
            </span>
          </div>
          <ol className="mt-3 space-y-2">
            {a.icebreakerTasks.map((t, i) => (
              <li
                key={t.id}
                className="rounded-md bg-[#0d0d0b] border border-[#26261d] px-3 py-2 text-sm text-[#E8E2CF] leading-6"
              >
                <span className="text-[#C8FF80] mr-2">{i + 1}.</span>
                {t.text}
              </li>
            ))}
          </ol>
        </section>

        {/* Action grid */}
        {isParticipant && a.status !== 'completed' && a.status !== 'cancelled' && (
          <section className="rounded-2xl bg-[#15150f] border border-[#26261d] p-5 space-y-4">
            <h2 className="text-sm tracking-wider uppercase text-[#8C8A6E]">
              进行中操作
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                disabled={busy || myConfirmed}
                onClick={() =>
                  act('双方确认', () =>
                    api.request(`/activities/${a.id}/confirm`, {
                      method: 'POST',
                    }),
                  )
                }
                className={`px-4 py-3 rounded-xl text-sm border transition ${
                  myConfirmed
                    ? 'border-[#C8FF80]/60 bg-[#C8FF80]/10 text-[#C8FF80]'
                    : 'border-[#26261d] hover:border-[#C8FF80]/50 hover:text-[#C8FF80]'
                }`}
              >
                {myConfirmed ? '✓ 已确认完成' : '双方确认完成'}
              </button>

              <button
                disabled={busy || myCheckedIn}
                onClick={() =>
                  act('签到', () =>
                    api.request(`/activities/${a.id}/checkin`, {
                      method: 'POST',
                      body: JSON.stringify({ locationApprox }),
                    }),
                  )
                }
                className={`px-4 py-3 rounded-xl text-sm border transition ${
                  myCheckedIn
                    ? 'border-sky-400/60 bg-sky-400/10 text-sky-300'
                    : 'border-[#26261d] hover:border-sky-400/50 hover:text-sky-300'
                }`}
              >
                {myCheckedIn ? '✓ 已签到' : '签到'}
              </button>

              <button
                disabled={busy || (!allConfirmed && a.proofPolicy === 'mutual_confirm')}
                onClick={() =>
                  act('完成活动', () =>
                    api.request(`/activities/${a.id}/complete`, {
                      method: 'POST',
                    }),
                  )
                }
                className="px-4 py-3 rounded-xl text-sm border border-[#26261d] hover:border-[#C8FF80]/50 hover:text-[#C8FF80] transition disabled:opacity-50"
              >
                标记完成
              </button>
            </div>

            {/* Proof submit */}
            <div className="rounded-xl border border-[#26261d] bg-[#0d0d0b] p-4 space-y-3">
              <div className="text-xs uppercase tracking-wider text-[#8C8A6E]">
                上传完成证明
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(
                  [
                    'scene_photo',
                    'qr_code',
                    'merchant_confirm',
                    'selfie_optional',
                  ] as ProofType[]
                ).map((pt) => (
                  <button
                    key={pt}
                    onClick={() => setProofType(pt)}
                    className={`px-3 py-2 rounded-md text-xs border ${
                      proofType === pt
                        ? 'border-[#C8FF80] text-[#C8FF80] bg-[#C8FF80]/10'
                        : 'border-[#26261d] text-[#C7C2B0] hover:border-[#6B7A5A]'
                    }`}
                  >
                    {PROOF_LABEL[pt]}
                  </button>
                ))}
              </div>
              <input
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                placeholder="照片 URL（可选，不强制露脸）"
                className="w-full bg-[#15150f] border border-[#26261d] rounded-md px-3 py-2 text-sm placeholder:text-[#5e5d4a]"
              />
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="备注"
                className="w-full bg-[#15150f] border border-[#26261d] rounded-md px-3 py-2 text-sm placeholder:text-[#5e5d4a]"
              />
              <input
                value={locationApprox}
                onChange={(e) => setLocationApprox(e.target.value)}
                placeholder="大致地点（如：朝阳公园西门附近）"
                className="w-full bg-[#15150f] border border-[#26261d] rounded-md px-3 py-2 text-sm placeholder:text-[#5e5d4a]"
              />
              <div className="flex items-center gap-3 text-xs text-[#8C8A6E]">
                <span>隐私模式：</span>
                {(['scene_only', 'hidden_face', 'private'] as PrivacyMode[]).map(
                  (pm) => (
                    <button
                      key={pm}
                      onClick={() => setPrivacyMode(pm)}
                      className={`px-2 py-1 rounded border ${
                        privacyMode === pm
                          ? 'border-[#C8FF80] text-[#C8FF80]'
                          : 'border-[#26261d]'
                      }`}
                    >
                      {PRIVACY_LABEL[pm]}
                    </button>
                  ),
                )}
              </div>
              <p className="text-[11px] text-[#5e5d4a] leading-5">
                上传的照片仅用于证明本次活动确实发生，FitMeet 不强制露脸；
                建议使用「场景照片」或「不露脸」模式保护隐私。
              </p>
              <button
                disabled={busy}
                onClick={() =>
                  act('上传证明', () =>
                    api.request(`/activities/${a.id}/proof`, {
                      method: 'POST',
                      body: JSON.stringify({
                        proofType,
                        photoUrl: photoUrl || undefined,
                        note,
                        locationApprox,
                        privacyMode,
                      }),
                    }),
                  )
                }
                className="w-full px-4 py-2 rounded-md bg-[#C8FF80] text-[#0d0d0b] text-sm font-medium hover:bg-[#b8ef70] disabled:opacity-50"
              >
                提交证明
              </button>
            </div>
          </section>
        )}

        {!isParticipant && a.status !== 'completed' && a.status !== 'cancelled' && (
          <button
            disabled={busy}
            onClick={() =>
              act('加入', () =>
                api.request(`/activities/${a.id}/join`, { method: 'POST' }),
              )
            }
            className="w-full px-4 py-3 rounded-xl border border-[#C8FF80]/40 text-[#C8FF80] hover:bg-[#C8FF80]/10"
          >
            加入活动
          </button>
        )}

        {/* Proof list */}
        {data.proofs.length > 0 && (
          <section className="rounded-2xl bg-[#15150f] border border-[#26261d] p-5">
            <h2 className="text-sm tracking-wider uppercase text-[#8C8A6E]">
              证明记录
            </h2>
            <ul className="mt-3 space-y-2">
              {data.proofs.map((p) => (
                <li
                  key={p.id}
                  className="rounded-md bg-[#0d0d0b] border border-[#26261d] px-3 py-2 text-xs text-[#C7C2B0] flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="text-[#F4EFE6]">
                        {PROOF_LABEL[p.proofType]}
                      </span>
                      <span className="ml-2 text-[#5e5d4a]">
                        · {PRIVACY_LABEL[p.privacyMode]}
                      </span>
                      {p.note && (
                        <span className="ml-2 text-[#8C8A6E]">「{p.note}」</span>
                      )}
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full border ${
                        p.status === 'accepted'
                          ? 'border-[#C8FF80]/40 text-[#C8FF80]'
                          : p.status === 'rejected'
                            ? 'border-red-500/40 text-red-300'
                            : 'border-amber-500/40 text-amber-300'
                      }`}
                    >
                      {p.status === 'pending'
                        ? '审核中'
                        : p.status === 'accepted'
                          ? '已通过'
                          : '已拒绝'}
                    </span>
                  </div>
                  {p.status === 'pending' &&
                    me != null &&
                    p.userId !== me &&
                    isParticipant && (
                      <div className="flex items-center gap-2">
                        <button
                          disabled={busy}
                          onClick={() =>
                            act('通过证明', () =>
                              api.request(
                                `/activities/${a.id}/proofs/${p.id}/respond`,
                                {
                                  method: 'POST',
                                  body: JSON.stringify({ accept: true }),
                                },
                              ),
                            )
                          }
                          className="px-3 py-1 rounded-md bg-[#C8FF80] text-[#0d0d0b] font-medium hover:bg-[#b8ef70] disabled:opacity-50"
                        >
                          通过
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => {
                            const reason =
                              window.prompt('拒绝理由（可选）') ?? '';
                            void act('拒绝证明', () =>
                              api.request(
                                `/activities/${a.id}/proofs/${p.id}/respond`,
                                {
                                  method: 'POST',
                                  body: JSON.stringify({
                                    accept: false,
                                    reason,
                                  }),
                                },
                              ),
                            );
                          }}
                          className="px-3 py-1 rounded-md border border-[#3a3a32] text-[#C7C2B0] hover:bg-[#15150f] disabled:opacity-50"
                        >
                          拒绝
                        </button>
                      </div>
                    )}
                  {p.status === 'rejected' && p.reviewReason && (
                    <p className="text-[11px] text-red-300/80">
                      理由：{p.reviewReason}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="text-center text-[11px] text-[#5e5d4a] pt-4">
          <Link to="/agent-control" className="hover:text-[#C8FF80]">
            打开 Agent 控制台 →
          </Link>
        </div>
      </main>
    </div>
  );
}

export default ActivityPage;
