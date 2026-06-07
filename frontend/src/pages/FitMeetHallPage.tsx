import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as dataService from '../services/dataService';
import { filterDisplayablePosts, meetToFeedPost } from '../data/mockContent';
import { cleanDisplayArray, cleanDisplayText, isDisplayableRecordText } from '../lib/displayText';
import { isPublicHallIntent } from '../lib/hallPublicIntent';
import { useAuthStore } from '../stores';
import type { Meet, Post, PublicSocialIntent } from '../types';

type HallItem = {
  id: string;
  agent: string;
  owner: string;
  title: string;
  body: string;
  city: string;
  scene: string;
  status: string;
  intent: string;
  tags: string[];
  signal: number | null;
  signalLabel: string;
  signalReasons: string[];
  accent: string;
  createdAt: string;
  userId?: number | null;
  publicIntentId?: string | null;
};

const sceneLabel: Record<string, string> = {
  meet: '同城约练',
  log: '动态分享',
  help: '需求协作',
  travel: '旅行搭子',
  pet: '遛狗搭子',
  bar: '同店聊天',
  fitness_partner: '同城约练',
  offline_friend: '线下交友',
  dog_walking: '遛狗搭子',
  bar_friend: '同店聊天',
  travel_partner: '旅行搭子',
  photo_partner: '拍照搭子',
};

function clampSignal(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatTime(value?: string | Date | null) {
  if (!value) return '刚刚';
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function postSignal(post: Post) {
  const tagSignal = Math.min((post.tags?.length ?? 0) * 7, 28);
  const citySignal = post.city ? 8 : 0;
  const contentSignal = post.text?.length > 40 ? 10 : 4;
  return clampSignal(36 + tagSignal + citySignal + contentSignal);
}

function postToHallItem(post: Post): HallItem {
  const type = sceneLabel[post.type] ?? '社交意图';
  const signal = postSignal(post);
  return {
    id: `post-${post.id}`,
    agent: post.mock ? 'FitMeet 内置 Agent' : '用户 / Agent',
    owner: cleanDisplayText(post.username, 'FitMeet 用户'),
    title: cleanDisplayText(post.title, `${type}需求`),
    body: cleanDisplayText(post.text, '这条内容包含异常字符，已隐藏正文。'),
    city: cleanDisplayText(post.city, '全局'),
    scene: type,
    status: post.type === 'meet' ? '开放加入' : '正在流转',
    intent: post.type === 'meet' ? 'meet.joinable' : 'feed.intent',
    tags: cleanDisplayArray(post.tags).slice(0, 4),
    signal,
    signalLabel: `内容信号 ${signal}%`,
    signalReasons: ['来自公开内容', post.city ? '城市明确' : '城市待补充'],
    accent: post.color || '#ff6a00',
    userId: post.userId ?? null,
    createdAt: formatTime(post.createdAt),
  };
}

function publicIntentToHallItem(intent: PublicSocialIntent): HallItem {
  const rawInterests = Array.isArray(intent.interestTags)
    ? intent.interestTags
    : Array.isArray(intent.filters?.interests)
      ? (intent.filters.interests as string[])
      : Array.isArray(intent.filters?.interestTags)
        ? (intent.filters.interestTags as string[])
        : [];
  const interests = cleanDisplayArray(rawInterests);
  const locationPreference = intent.locationPreference || intent.loc;
  const score =
    typeof intent.matchSignal?.score === 'number' ? clampSignal(intent.matchSignal.score) : null;
  const confidence = intent.matchSignal?.confidence;
  return {
    id: intent.id,
    publicIntentId: intent.id,
    agent: intent.source?.includes('public') ? 'OpenClaw / Public' : 'Agent',
    owner: '公开 Agent 发布',
    title: cleanDisplayText(intent.title, '公开社交意图'),
    body: cleanDisplayText(intent.description, '这条内容包含异常字符，已隐藏正文。'),
    city: cleanDisplayText(intent.city, '全局'),
    scene: sceneLabel[intent.requestType] ?? '公开社交意图',
    status: intent.status === 'matched' ? `候选 ${intent.matchedCount} 人` : '匹配中',
    intent: `public.${intent.requestType}`,
    tags: [
      intent.riskLevel === 'high' ? '高风险确认' : '站内确认',
      ...(locationPreference ? [cleanDisplayText(locationPreference, '站内确认')] : []),
      ...interests,
    ]
      .filter(Boolean)
      .slice(0, 4),
    signal: score,
    signalLabel:
      score == null
        ? 'AI 评分待生成'
        : `AI 动态评分 ${score}%${confidence ? ` · ${confidence}` : ''}`,
    signalReasons: cleanDisplayArray(intent.matchSignal?.reasons),
    accent: '#22d3ee',
    userId: intent.userId ?? null,
    createdAt: formatTime(intent.createdAt),
  };
}

export const FitMeetHallPage = memo(function FitMeetHallPage() {
  const navigate = useNavigate();
  const { user, openLogin } = useAuthStore();
  const [items, setItems] = useState<HallItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [contactingId, setContactingId] = useState<string | null>(null);
  const [contactNotice, setContactNotice] = useState('');

  useEffect(() => {
    document.title = '附近机会 - FitMeet Agent Platform';
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadHall() {
      setLoading(true);
      try {
        const [posts, meets, publicIntents] = await Promise.all([
          dataService.getFeed({ page: 1, pageSize: 18 }).catch(() => [] as Post[]),
          dataService.getMeets().catch(() => [] as Meet[]),
          dataService
            .getPublicSocialIntents({ page: 1, limit: 30, status: 'active' })
            .catch(() => [] as PublicSocialIntent[]),
        ]);
        if (cancelled) return;
        const meetPosts = meets.slice(0, 8).map(meetToFeedPost);
        const merged = filterDisplayablePosts([...meetPosts, ...posts], 12)
          .map(postToHallItem)
          .filter(
            (item, index, array) =>
              array.findIndex((candidate) => candidate.id === item.id) === index,
          );
        const publicItems = publicIntents
          .filter(
            (intent) =>
              isPublicHallIntent(intent) &&
              isDisplayableRecordText([
                intent.title,
                intent.description,
                intent.city,
                intent.source,
              ]),
          )
          .map(publicIntentToHallItem);
        const displayableItems = [...publicItems, ...merged].filter((item) =>
          isDisplayableRecordText([
            item.owner,
            item.title,
            item.body,
            item.city,
            item.scene,
            ...item.tags,
          ]),
        );
        setItems(displayableItems);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadHall();
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(
    () => [
      { label: '实时意图', value: items.length.toString() },
      { label: 'Agent 通道', value: 'OpenClaw / QClaw' },
      { label: '安全策略', value: '站内同意制' },
    ],
    [items.length],
  );

  const handleOpenConversation = useCallback(
    async (item: HallItem) => {
      if (contactingId) return;
      setContactNotice('');
      if (!user) {
        openLogin();
        return;
      }
      if (!item.userId) {
        setContactNotice('这条大厅内容暂时没有绑定可直接联系的站内用户。');
        return;
      }
      if (item.userId === user.id) {
        setContactNotice('这是你自己发布的内容，不能给自己发消息。');
        return;
      }

      setContactingId(item.id);
      try {
        const opener = `你好，我在 FitMeet 大厅看到你发布的「${item.title}」，想先在站内聊聊。`;
        const result = item.publicIntentId
          ? await dataService.startPublicIntentConversation(item.publicIntentId, opener)
          : await dataService.startConversation(item.userId);
        if (!result.conversationId) {
          setContactNotice('会话创建失败，未自动打开消息页。');
          return;
        }
        if (!item.publicIntentId) {
          await dataService.sendMessage(result.conversationId, opener);
        }
        navigate(`/messages?conversationId=${encodeURIComponent(result.conversationId)}&from=hall`);
      } catch (err) {
        setContactNotice(err instanceof Error ? err.message : '发起聊天失败，请稍后重试。');
      } finally {
        setContactingId(null);
      }
    },
    [contactingId, navigate, openLogin, user],
  );

  return (
    <div className="fitmeet-hall-page min-h-screen overflow-x-hidden bg-[#0b0c0d] text-[#f6efe5]">
      <style>
        {`
          @keyframes hallRail {
            from { transform: translateX(0); }
            to { transform: translateX(-50%); }
          }
        `}
      </style>

      <section className="border-b border-white/10 bg-[#111315]">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#ff6a00]/30 bg-[#ff6a00]/10 px-3 py-1 text-xs font-black text-[#ffb36e]">
              <span className="h-2 w-2 rounded-full bg-[#18b98f]" />
              Nearby Opportunities
            </div>
            <h1 className="max-w-4xl text-3xl font-black leading-tight text-white sm:text-5xl">
              附近机会
              <span className="block text-[#ff8a1f]">让 Agent 帮你筛选真实生活里的机会</span>
            </h1>
            <p className="mt-5 max-w-3xl text-sm leading-8 text-[#c9b9a7] sm:text-base">
              这里不再是传统信息流，而是附近约练、活动、用户、教练、商家和公开需求的机会大厅。
              顶部先告诉 Agent 你想找什么，再由 Agent 根据画像、时间、地点和安全边界筛选。
            </p>
            <div className="mt-7 flex max-w-3xl flex-col gap-3 rounded-lg border border-white/10 bg-black/20 p-3 sm:flex-row">
              <input
                className="min-h-12 flex-1 rounded-md border border-white/10 bg-[#0b0c0d] px-4 text-sm font-bold text-white outline-none placeholder:text-[#756c63] focus:border-[#18b98f]/60"
                placeholder="告诉 Agent：我想找周末下午健身搭子、拍照搭子、麻将局..."
              />
              <button
                className="rounded-lg bg-[#ff6a00] px-5 py-3 text-sm font-black text-white transition hover:bg-[#ff8128]"
                onClick={() => navigate('/social-agent')}
              >
                让 Agent 筛选
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="rounded-lg border border-white/15 px-4 py-2 text-sm font-black text-[#f6efe5] transition hover:border-[#18b98f]/50 hover:text-[#8ff0d1]"
                onClick={() => navigate('/social-request/new')}
              >
                发布公开需求
              </button>
              <button
                className="rounded-lg border border-white/15 px-4 py-2 text-sm font-black text-[#f6efe5] transition hover:border-[#c8ff80]/50 hover:text-[#dfff9f]"
                onClick={() => navigate('/agent-control')}
              >
                检查 Agent 权限
              </button>
            </div>
          </div>

          <div className="grid gap-3 self-end">
            {stats.map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-white/10 bg-white/[0.04] p-4"
              >
                <div className="text-xs font-bold text-[#9c8f82]">{item.label}</div>
                <div className="mt-1 text-xl font-black text-white">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden border-b border-white/10 bg-[#0f1113] py-4">
        <div className="flex w-max gap-3" style={{ animation: 'hallRail 34s linear infinite' }}>
          {[...items, ...items].map((item, index) => (
            <div
              key={`${item.id}-${index}`}
              className="flex min-w-[280px] items-center gap-3 rounded-lg border border-white/10 bg-white/[0.05] px-4 py-3"
            >
              <span
                className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-black text-white"
                style={{ background: item.accent }}
              >
                {item.agent[0]}
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-black text-white">{item.title}</div>
                <div className="truncate text-xs text-[#a99b8d]">
                  {item.agent} · {item.city} · {item.status}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:px-8">
        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-3">
            {[
              '全部机会',
              '附近约练',
              '附近活动',
              '附近用户',
              '附近教练',
              '附近商家',
              '公开需求',
            ].map((label, index) => (
              <button
                key={label}
                className={`w-full rounded-lg border px-4 py-3 text-left text-sm font-black transition ${
                  index === 0
                    ? 'border-[#ff6a00]/60 bg-[#ff6a00] text-white'
                    : 'border-white/10 bg-white/[0.04] text-[#c9b9a7] hover:border-[#ff6a00]/40 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </aside>

        <section>
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black text-white">实时机会流</h2>
              <p className="mt-1 text-sm text-[#a99b8d]">
                来自用户、OpenClaw、企业 Agent 和 FitMeet 内置 Agent 的公开需求与附近机会。
              </p>
            </div>
            {loading && <span className="text-xs font-bold text-[#ffb36e]">同步中...</span>}
          </div>

          {contactNotice && (
            <div className="mb-4 rounded-lg border border-[#ffb36e]/30 bg-[#ff6a00]/10 px-4 py-3 text-sm font-bold text-[#ffcf9d]">
              {contactNotice}
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-2">
            {items.map((item) => {
              const isOwnItem = Boolean(user?.id && item.userId === user.id);
              return (
                <article
                  key={item.id}
                  className={`group rounded-lg border border-white/10 bg-[#151719] p-5 transition ${
                    isOwnItem
                      ? 'cursor-default'
                      : 'cursor-pointer hover:-translate-y-0.5 hover:border-[#ff6a00]/45'
                  }`}
                  onClick={() => {
                    if (!isOwnItem) void handleOpenConversation(item);
                  }}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-lg font-black text-white"
                      style={{ background: item.accent }}
                    >
                      {item.agent[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-black">
                        <span className="rounded-md bg-white/10 px-2 py-1 text-[#f6efe5]">
                          {item.agent}
                        </span>
                        <span className="rounded-md border border-[#18b98f]/30 px-2 py-1 text-[#8ff0d1]">
                          {item.intent}
                        </span>
                        <span className="text-[#8d8175]">{item.createdAt}</span>
                      </div>
                      <h3 className="mt-3 text-xl font-black leading-snug text-white">
                        {item.title}
                      </h3>
                      <p className="mt-3 line-clamp-3 text-sm leading-7 text-[#c9b9a7]">
                        {item.body}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-md bg-[#ff6a00]/12 px-2 py-1 text-xs font-black text-[#ffb36e]">
                      {item.scene}
                    </span>
                    <span className="rounded-md bg-white/[0.08] px-2 py-1 text-xs font-bold text-[#c9b9a7]">
                      {item.city}
                    </span>
                    {item.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md bg-white/[0.08] px-2 py-1 text-xs font-bold text-[#c9b9a7]"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>

                  <div className="mt-5 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div>
                      <div className="flex items-center justify-between gap-3 text-xs font-bold text-[#8d8175]">
                        <span>{item.owner}</span>
                        <span>{item.signalLabel}</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${item.signal ?? 18}%`,
                            background: item.signal == null ? '#6b7280' : item.accent,
                          }}
                        />
                      </div>
                      {item.signalReasons.length > 0 && (
                        <div className="mt-2 line-clamp-1 text-[11px] font-bold text-[#a99b8d]">
                          {item.signalReasons.slice(0, 3).join(' · ')}
                        </div>
                      )}
                    </div>
                    {isOwnItem ? (
                      <span className="rounded-lg border border-white/10 px-4 py-2 text-sm font-black text-[#8d8175]">
                        自己的发布
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="rounded-lg border border-white/12 px-4 py-2 text-sm font-black text-white transition hover:border-[#18b98f]/50 hover:text-[#8ff0d1] disabled:cursor-wait disabled:opacity-60"
                        disabled={contactingId === item.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleOpenConversation(item);
                        }}
                      >
                        {contactingId === item.id
                          ? '打开中...'
                          : item.userId
                            ? '发消息'
                            : '查看连接'}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
});
