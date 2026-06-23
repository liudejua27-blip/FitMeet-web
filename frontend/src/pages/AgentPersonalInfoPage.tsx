import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  LockKeyhole,
  MapPin,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Target,
  UserRound,
} from 'lucide-react';
import { lifeGraphApi, type LifeGraphResponse } from '../api/lifeGraphApi';
import {
  socialProfileApi,
  type SocialProfilePrivacyState,
  type UserSocialProfile,
} from '../api/socialProfileApi';
import { useAuthStore } from '../stores';

const missingFieldLabels: Record<string, string> = {
  nickname: '昵称',
  city: '城市',
  nearbyArea: '常去区域',
  interestTags: '兴趣爱好',
  fitnessGoals: '运动偏好',
  availableTimes: '可约时间',
  wantToMeet: '想认识的人',
  privacyBoundary: '安全边界',
  socialScenes: '偏好的互动形式',
  currentSocialGoal: '当前目标',
};

export function AgentPersonalInfoPage() {
  const user = useAuthStore((state) => state.user);
  const [socialProfile, setSocialProfile] = useState<UserSocialProfile | null>(null);
  const [privacy, setPrivacy] = useState<SocialProfilePrivacyState | null>(null);
  const [lifeGraph, setLifeGraph] = useState<LifeGraphResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPersonalInfo() {
      setLoading(true);
      setError(null);
      const [profileResult, privacyResult, lifeGraphResult] = await Promise.allSettled([
        socialProfileApi.get(),
        socialProfileApi.privacy(),
        lifeGraphApi.getMe(),
      ]);

      if (cancelled) return;

      if (profileResult.status === 'fulfilled') setSocialProfile(profileResult.value);
      if (privacyResult.status === 'fulfilled') setPrivacy(privacyResult.value);
      if (lifeGraphResult.status === 'fulfilled') setLifeGraph(lifeGraphResult.value);

      if (
        profileResult.status === 'rejected' &&
        privacyResult.status === 'rejected' &&
        lifeGraphResult.status === 'rejected'
      ) {
        setError('暂时无法读取个人信息，请稍后重试。');
      }

      setLoading(false);
    }

    void loadPersonalInfo();
    return () => {
      cancelled = true;
    };
  }, []);

  const completionPercent = useMemo(() => {
    const value =
      privacy?.completion?.percent ??
      lifeGraph?.completeness?.completenessScore ??
      estimateCompletion(socialProfile, user);
    return Math.max(0, Math.min(100, Math.round(value || 0)));
  }, [lifeGraph, privacy, socialProfile, user]);

  const basicInfo = useMemo(
    () => [
      {
        label: '昵称',
        value: socialProfile?.nickname || user?.name || '未填写',
      },
      {
        label: '城市 / 区域',
        value: compactText(
          [
            socialProfile?.city || user?.city || lifeGraph?.profile?.city,
            socialProfile?.nearbyArea || lifeGraph?.profile?.region,
          ],
          '未填写',
        ),
      },
      {
        label: '年龄段',
        value: socialProfile?.ageRange || (user?.age ? `${user.age} 岁` : '未填写'),
      },
      {
        label: '一句话介绍',
        value: user?.bio || socialProfile?.aiSummary || '未填写',
      },
    ],
    [lifeGraph?.profile?.city, lifeGraph?.profile?.region, socialProfile, user],
  );

  const interestTags = useMemo(
    () =>
      uniqueList([
        ...(socialProfile?.interestTags ?? []),
        ...(socialProfile?.lifestyleTags ?? []),
        ...(user?.interestTags ?? []),
      ]),
    [socialProfile, user?.interestTags],
  );

  const sportTags = useMemo(
    () =>
      uniqueList([...(socialProfile?.fitnessGoals ?? []), ...(socialProfile?.socialScenes ?? [])]),
    [socialProfile?.fitnessGoals, socialProfile?.socialScenes],
  );

  const timeTags = useMemo(
    () =>
      uniqueList([
        ...(socialProfile?.availableTimes ?? []),
        socialProfile?.weekdayAvailability,
        socialProfile?.weekendAvailability,
      ]),
    [
      socialProfile?.availableTimes,
      socialProfile?.weekdayAvailability,
      socialProfile?.weekendAvailability,
    ],
  );

  const safetyItems = useMemo(
    () => [
      {
        label: '公开范围',
        value: privacy?.profileDiscoverable ? '允许在发现页展示必要资料' : '默认不公开资料',
      },
      {
        label: '推荐权限',
        value: privacy?.agentCanRecommendMe ? '允许 Agent 基于资料推荐' : '需要你确认后再进入匹配',
      },
      {
        label: '联系方式',
        value: socialProfile?.privacyBoundary || '默认不展示手机号等联系方式',
      },
      {
        label: '不接受的互动',
        value: socialProfile?.rejectRules || '未设置',
      },
    ],
    [privacy?.agentCanRecommendMe, privacy?.profileDiscoverable, socialProfile],
  );

  const missingItems = useMemo(() => {
    const missing =
      privacy?.completion?.missingFields ?? lifeGraph?.completeness?.missingFields ?? [];
    return missing
      .map((item) => (typeof item === 'string' ? item : item.fieldKey))
      .filter(Boolean)
      .map((key) => missingFieldLabels[key] ?? key)
      .slice(0, 4);
  }, [lifeGraph?.completeness?.missingFields, privacy?.completion?.missingFields]);

  return (
    <div className="min-h-screen bg-[#080705] text-[#f7f1e7]">
      <header className="border-b border-white/10 bg-[#0b0a08]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link
            to="/agent"
            className="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-semibold text-[#e8dfcf] transition hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            返回 Agent
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to="/messages"
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-[#e8dfcf] transition hover:border-[#13b99a]/60"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              消息
            </Link>
            <Link
              to="/agent/chat?intent=profile"
              className="inline-flex items-center gap-2 rounded-lg bg-[#f97316] px-3 py-2 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(249,115,22,0.24)] transition hover:bg-[#fb7f22]"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />让 Agent 补充
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-5 px-5 py-8 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-lg border border-white/10 bg-white/[0.045] p-6 shadow-[0_22px_80px_rgba(0,0,0,0.24)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-[#f5b25b]">个人信息</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-white">我的资料</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[#a7a19a]">
                这些信息会帮助 Agent 判断城市、兴趣、可约时间和安全边界。Agent
                写入资料前会先给你看预览，确认后才保存。
              </p>
            </div>
            <div className="rounded-lg border border-[#f97316]/25 bg-[#f97316]/10 px-4 py-3 text-right">
              <span className="text-xs font-semibold text-[#f9c784]">资料状态</span>
              <strong className="mt-1 block text-3xl font-black text-[#ff8a2a]">
                {completionPercent > 0 ? `${completionPercent}%` : '待完善'}
              </strong>
            </div>
          </div>

          <div className="mt-6 h-2 rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#f97316] to-[#facc15]"
              style={{ width: `${completionPercent}%` }}
            />
          </div>

          {error ? (
            <div className="mt-5 rounded-lg border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-24 animate-pulse rounded-lg bg-white/[0.06]" />
              ))}
            </div>
          ) : (
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {basicInfo.map((item) => (
                <InfoTile key={item.label} label={item.label} value={item.value} />
              ))}
            </div>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <QuickAsk
              icon={<Target className="h-4 w-4" aria-hidden="true" />}
              title="你这次想找什么"
              body="当前目标、人数、互动方式"
            />
            <QuickAsk
              icon={<UserRound className="h-4 w-4" aria-hidden="true" />}
              title="你希望认识谁"
              body="兴趣、性格、生活方式"
            />
            <QuickAsk
              icon={<MapPin className="h-4 w-4" aria-hidden="true" />}
              title="你方便在哪里见面"
              body="城市、区域、公共场所"
            />
          </div>
        </section>

        <aside className="grid gap-5">
          <section className="rounded-lg border border-white/10 bg-white/[0.045] p-5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#facc15]" aria-hidden="true" />
              <h2 className="text-lg font-black text-white">AI 当前理解</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-[#a7a19a]">
              {missingItems.length > 0
                ? '根据你已填写的信息，当前还建议补充以下内容：'
                : '基础信息已足够用于轻量推荐，可以继续完善可约时间和安全边界。'}
            </p>
            <div className="mt-4 grid gap-2">
              {(missingItems.length > 0 ? missingItems : ['城市区域', '兴趣爱好', '可约时间']).map(
                (item) => (
                  <div
                    key={item}
                    className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                  >
                    <span className="text-[#ded6c9]">{item}</span>
                    <span className="rounded-full bg-white/10 px-2 py-1 text-xs text-[#b8afa2]">
                      {missingItems.length > 0 ? '待补充' : '可优化'}
                    </span>
                  </div>
                ),
              )}
            </div>
            <Link
              to="/agent/chat?intent=profile"
              className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#f5b25b] transition hover:text-[#ffd48a]"
            >
              让 Agent 问我几个问题
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </section>

          <section className="rounded-lg border border-white/10 bg-white/[0.045] p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[#34d399]" aria-hidden="true" />
              <h2 className="text-lg font-black text-white">安全与隐私</h2>
            </div>
            <div className="mt-4 grid gap-2">
              {safetyItems.map((item) => (
                <InfoRow key={item.label} label={item.label} value={item.value} />
              ))}
            </div>
            <Link
              to="/safety"
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-[#e8dfcf] transition hover:border-[#34d399]/60"
            >
              <LockKeyhole className="h-4 w-4" aria-hidden="true" />
              查看安全设置
            </Link>
          </section>
        </aside>

        <section className="rounded-lg border border-white/10 bg-white/[0.045] p-5 lg:col-span-2">
          <div className="grid gap-5 lg:grid-cols-3">
            <ProfileSection
              title="爱好与兴趣"
              items={interestTags}
              emptyText="还没有填写兴趣爱好"
            />
            <ProfileSection
              title="运动偏好"
              items={sportTags}
              emptyText="还没有填写运动或活动偏好"
            />
            <ProfileSection title="时间习惯" items={timeTags} emptyText="还没有填写常用时间" />
          </div>
        </section>

        <section className="rounded-lg border border-[#f97316]/20 bg-[#f97316]/10 p-5 lg:col-span-2">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f9c784]">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                更新规则
              </div>
              <p className="mt-2 text-sm leading-6 text-[#e8dfcf]">
                Agent
                可以根据对话整理资料，但新增或修改内容必须先展示预览，并由你确认保存。你也可以选择“本次使用，不保存”。
              </p>
            </div>
            <Link
              to="/agent/chat?intent=profile"
              className="inline-flex shrink-0 items-center justify-center rounded-lg bg-[#f97316] px-4 py-3 text-sm font-black text-white transition hover:bg-[#fb7f22]"
            >
              开始补充资料
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 px-4 py-3">
      <span className="text-xs font-semibold text-[#89837b]">{label}</span>
      <strong className="mt-1 block break-words text-base text-[#f7f1e7]">{value}</strong>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
      <span className="text-sm text-[#a7a19a]">{label}</span>
      <strong className="max-w-[62%] text-right text-sm font-semibold text-[#f7f1e7]">
        {value}
      </strong>
    </div>
  );
}

function QuickAsk({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <Link
      to="/agent/chat?intent=profile"
      className="rounded-lg border border-white/10 bg-black/20 p-4 transition hover:border-[#f97316]/45 hover:bg-[#f97316]/10"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f97316]/15 text-[#f9c784]">
        {icon}
      </span>
      <strong className="mt-3 block text-sm text-white">{title}</strong>
      <span className="mt-1 block text-xs leading-5 text-[#a7a19a]">{body}</span>
    </Link>
  );
}

function ProfileSection({
  emptyText,
  items,
  title,
}: {
  emptyText: string;
  items: string[];
  title: string;
}) {
  return (
    <div>
      <h2 className="text-lg font-black text-white">{title}</h2>
      {items.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {items.map((item) => (
            <span
              key={item}
              className="rounded-full bg-[#13b99a]/15 px-3 py-1.5 text-sm font-semibold text-[#88f4df]"
            >
              {item}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#a7a19a]">
          {emptyText}
        </p>
      )}
    </div>
  );
}

function compactText(values: Array<string | null | undefined>, fallback: string) {
  const text = values.map((value) => value?.trim()).filter(Boolean);
  return text.length > 0 ? text.join(' · ') : fallback;
}

function uniqueList(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)),
    ),
  ).slice(0, 12);
}

function estimateCompletion(
  profile: UserSocialProfile | null,
  user: ReturnType<typeof useAuthStore.getState>['user'],
) {
  const fields = [
    profile?.nickname || user?.name,
    profile?.city || user?.city,
    profile?.nearbyArea,
    profile?.interestTags?.length,
    profile?.fitnessGoals?.length,
    profile?.availableTimes?.length,
    profile?.privacyBoundary,
  ];
  const completed = fields.filter(Boolean).length;
  return Math.round((completed / fields.length) * 100);
}
