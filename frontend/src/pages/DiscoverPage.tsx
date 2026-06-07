import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import * as dataService from '../services/dataService';
import { FilterBar, MasonryFeed } from '../components/discover';
import { CreatePostModal } from '../components/common';
import { useAuthStore, useNotificationStore, useSocialStore } from '../stores';
import { EmptyState, FeedCardSkeleton, SportVisual } from '../components/ui';
import type { Meet, Post } from '../types';
import { getSportLabel, isContentType, normalizeSportGroup } from '../data/taxonomy';
import { CATEGORIES, DISTANCE_FILTERS, GENDER_FILTERS, LEVEL_FILTERS } from '../data/options';
import type { Coordinates } from '../lib/amap';
import { getBrowserLocation } from '../lib/location';
import {
  filterDisplayablePosts,
  meetToFeedPost,
  uniquePostsByUser,
} from '../data/mockContent';

const PAGE_SIZE = 6;

export const DiscoverPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');
  const [gender, setGender] = useState('all');
  const [distance, setDistance] = useState('all');
  const [level, setLevel] = useState('all');
  const [feedData, setFeedData] = useState<Post[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { isLoggedIn, openLogin } = useAuthStore();
  const { toggleFollow, toggleLike, toggleSave } = useSocialStore();
  const { addNotification } = useNotificationStore();

  const loadPage = useCallback(
    async (nextPage: number, replace = false) => {
      setLoading(true);
      setError(null);
      try {
        const backendCategory = isContentType(filter) ? filter : 'all';
        const data = await dataService.getFeed({
          category: backendCategory,
          page: nextPage,
          pageSize: PAGE_SIZE,
          lat: userLocation?.lat,
          lng: userLocation?.lng,
        });
        setFeedData((prev) => {
          const merged = replace ? data : [...prev, ...data];
          const dedup = new Map<number, Post>();
          merged.forEach((item) => dedup.set(item.id, item));
          return filterDisplayablePosts(Array.from(dedup.values()));
        });
        setHasMore(data.length === PAGE_SIZE);
        setPage(nextPage);
      } catch {
        setFeedData([]);
        setHasMore(false);
        setError(null);
      } finally {
        setLoading(false);
        setInitialLoading(false);
      }
    },
    [filter, userLocation],
  );

  useEffect(() => {
    void loadPage(1, true);
  }, [loadPage]);

  useEffect(() => {
    if (location.state && (location.state as { openCreatePost?: boolean }).openCreatePost) {
      setShowCreatePost(true);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  useEffect(() => {
    const category = new URLSearchParams(location.search).get('category');
    if (category) setFilter(category);
  }, [location.search]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading && hasMore) void loadPage(page + 1);
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadPage, loading, page]);

  const filteredData = useMemo(() => {
    let data = feedData;
    if (filter !== 'all') {
      data = isContentType(filter)
        ? data.filter((item) => item.type === filter)
        : data.filter((item) => normalizeSportGroup(item.sport) === filter);
    }
    if (gender !== 'all') {
      data = data.filter((item) => (gender === 'male' ? item.gender === '♂' : item.gender === '♀'));
    }
    if (distance !== 'all') {
      const maxDist = parseFloat(distance.replace(/[^\d.]/g, ''));
      data = data.filter((item) => {
        const d = parseFloat(item.dist.replace(/[^\d.]/g, ''));
        return !Number.isNaN(d) && d <= maxDist;
      });
    }
    if (level !== 'all') data = data.filter((item) => item.level === level);
    return data;
  }, [distance, feedData, filter, gender, level]);

  const handleAddFriend = useCallback(
    (id: number) => {
      if (!isLoggedIn) {
        openLogin();
        return;
      }
      const post = feedData.find((p) => p.id === id);
      if (!post?.userId) return;
      toggleFollow(post.userId);
      addNotification({
        type: 'follow',
        username: post.username,
        avatar: post.username[0],
        color: post.color,
        text: `你关注了 ${post.username}`,
        time: '刚刚',
      });
    },
    [addNotification, feedData, isLoggedIn, openLogin, toggleFollow],
  );

  const handleMeetRequest = useCallback(
    (id: number) => {
      if (!isLoggedIn) {
        openLogin();
        return;
      }
      const post = feedData.find((p) => p.id === id);
      if (!post) return;
      addNotification({
        type: 'meet',
        username: post.username,
        avatar: post.username[0],
        color: post.color,
        text: `你向 ${post.username} 发送了约练邀请`,
        time: '刚刚',
      });
    },
    [addNotification, feedData, isLoggedIn, openLogin],
  );

  const handleMessage = useCallback(
    async (id: number) => {
      if (!isLoggedIn) {
        openLogin();
        return;
      }
      const post = feedData.find((p) => p.id === id);
      if (!post?.userId) return;
      try {
        const conversation = await dataService.startConversation(post.userId);
        navigate(`/messages?conversationId=${encodeURIComponent(conversation.conversationId)}`);
      } catch (error) {
        setError(error instanceof Error ? error.message : '发起聊天失败，请稍后重试。');
      }
    },
    [feedData, isLoggedIn, navigate, openLogin],
  );

  const handleUseMyLocation = useCallback(() => {
    setIsLocating(true);
    getBrowserLocation()
      .then(setUserLocation)
      .catch((e) => {
        setError(e instanceof Error ? e.message : '定位失败，请检查浏览器权限。');
      })
      .finally(() => setIsLocating(false));
  }, []);

  const handleCreated = useCallback((item: Post | Meet, createdType: 'meet' | 'log' | 'help') => {
    const createdPost = createdType === 'meet' ? meetToFeedPost(item as Meet) : (item as Post);
    setFeedData((prev) =>
      filterDisplayablePosts([createdPost, ...prev.filter((post) => post.id !== createdPost.id)]),
    );
    setShowCreatePost(false);
  }, []);

  const resetFilters = () => {
    setFilter('all');
    setGender('all');
    setDistance('all');
    setLevel('all');
  };

  return (
    <div className="app-social-page app-social-page--discover min-h-screen bg-[#f7f4f1] text-ink">
      <PageHeader
        count={filteredData.length}
        isLocating={isLocating}
        located={Boolean(userLocation)}
        onCreate={() => {
          if (!isLoggedIn) openLogin();
          else setShowCreatePost(true);
        }}
        onUseLocation={handleUseMyLocation}
      />

      <div className="lg:hidden">
        <FilterBar
          active={filter}
          distance={distance}
          gender={gender}
          level={level}
          onChange={setFilter}
          onDistanceChange={setDistance}
          onGenderChange={setGender}
          onLevelChange={setLevel}
        />
      </div>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)_268px] lg:px-8 lg:py-6">
        <aside className="hidden lg:block">
          <FilterSidebar
            distance={distance}
            filter={filter}
            gender={gender}
            level={level}
            located={Boolean(userLocation)}
            onDistanceChange={setDistance}
            onFilterChange={setFilter}
            onGenderChange={setGender}
            onLevelChange={setLevel}
            onReset={resetFilters}
          />
        </aside>

        <main className="min-h-[520px]">
          <div className="mb-4 flex items-center justify-between rounded-xl border border-[#e5ddd5] bg-white px-4 py-3 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-[#76543e]">
                共 <span className="text-base font-black text-lime">{filteredData.length}</span> 条
              </span>
              {filter !== 'all' && (
                <span className="rounded-md bg-lime/10 px-2 py-0.5 text-xs font-bold text-lime">
                  {CATEGORIES.find((c) => c.id === filter)?.label}
                </span>
              )}
            </div>
            <div className="hidden items-center gap-1.5 text-xs font-bold text-[#9a7459] sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-mint" />
              实时更新 · 安全认证
            </div>
          </div>

          {initialLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <FeedCardSkeleton key={i} />
              ))}
            </div>
          ) : error ? (
            <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <span>{error}</span>
              <button
                className="font-black underline"
                onClick={() => void loadPage(page, page === 1)}
              >
                重试
              </button>
            </div>
          ) : filteredData.length > 0 ? (
            <>
              <MasonryFeed
                posts={filteredData}
                loadMore={() => hasMore && !loading && loadPage(page + 1)}
                loading={loading}
                onAddFriend={handleAddFriend}
                onLike={(id) => (isLoggedIn ? toggleLike(id) : openLogin())}
                onMeetRequest={handleMeetRequest}
                onMessage={handleMessage}
                onSave={(id) => (isLoggedIn ? toggleSave(id) : openLogin())}
              />
              <div ref={sentinelRef} className="h-12" />
              {!hasMore && (
                <div className="py-8 text-center text-sm font-bold text-[#9a7459]">
                  已加载全部内容
                </div>
              )}
            </>
          ) : (
            <EmptyState
              icon="⌁"
              title="暂无相关内容"
              description="换个筛选条件试试，或者发布一条新的动态。"
              action={
                <button
                  className="rounded-lg bg-lime px-5 py-2 text-sm font-black text-white"
                  onClick={resetFilters}
                >
                  重置筛选
                </button>
              }
            />
          )}
        </main>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <SidePanel title="附近活跃的人">
            {uniquePostsByUser(feedData, 5).map((post) => (
              <button
                key={post.id}
                className="flex w-full items-center gap-3 rounded-xl border border-[#ece4db] bg-[#faf7f4] p-3 text-left transition hover:border-lime/40 hover:bg-white"
                onClick={() => navigate(`/user/${post.userId || post.id}`)}
              >
                <span className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg">
                  <SportVisual
                    compact
                    gender={post.gender}
                    label={post.username}
                    variant={post.sport}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black">{post.username}</span>
                  <span className="mt-0.5 block text-xs font-bold text-[#8b6a54]">
                    {post.dist} · {getSportLabel(post.sport)}
                  </span>
                </span>
                <span className="h-2 w-2 flex-shrink-0 rounded-full bg-mint" />
              </button>
            ))}
          </SidePanel>

          <SidePanel title="安全提示">
            <div className="space-y-3">
              <p className="text-xs leading-relaxed text-[#76543e]">
                首次见面建议选择公共场所，开始前确认活动地点和时间。
              </p>
              <p className="text-xs leading-relaxed text-[#76543e]">
                遇到异常邀请，可使用举报、拉黑和行程分享保护自己。
              </p>
            </div>
          </SidePanel>

          <SidePanel title="快捷发布">
            <div className="space-y-2">
              {[
                { label: '发布约练邀请', type: 'meet', color: 'bg-lime' },
                { label: '分享训练日记', type: 'log', color: 'bg-[#24130a]' },
                { label: '发起求助', type: 'help', color: 'bg-[#ff8a1f]' },
              ].map((item) => (
                <button
                  key={item.type}
                  className="flex w-full items-center gap-3 rounded-xl border border-[#ece4db] bg-[#faf7f4] px-3 py-2.5 text-left transition hover:border-lime/40 hover:bg-white"
                  onClick={() => {
                    if (!isLoggedIn) {
                      openLogin();
                      return;
                    }
                    setShowCreatePost(true);
                  }}
                >
                  <span className={`h-2 w-2 rounded-full ${item.color}`} />
                  <span className="text-sm font-bold text-[#5a3d2b]">{item.label}</span>
                </button>
              ))}
            </div>
          </SidePanel>
        </aside>
      </div>

      <CreatePostModal
        open={showCreatePost}
        onClose={() => setShowCreatePost(false)}
        onCreated={handleCreated}
      />
    </div>
  );
};

const PageHeader = ({
  count,
  isLocating,
  located,
  onCreate,
  onUseLocation,
}: {
  count: number;
  isLocating: boolean;
  located: boolean;
  onCreate: () => void;
  onUseLocation: () => void;
}) => (
  <div className="border-b border-[#e5ddd5] bg-white px-4 py-4 sm:px-6 lg:px-8">
    <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-lime text-white shadow-sm">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
            <path
              fillRule="evenodd"
              d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div>
          <h1 className="text-lg font-black text-[#1a1208]">发现</h1>
          <p className="text-xs text-[#8b6a54]">
            附近训练 · 约练邀请 · 真实运动生活 · {count} 条机会
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {located && (
          <span className="hidden items-center gap-1.5 rounded-lg border border-lime/30 bg-lime/5 px-3 py-1.5 text-xs font-bold text-lime sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-lime" />
            已定位
          </span>
        )}
        <button
          className="flex items-center gap-1.5 rounded-lg border border-[#e5ddd5] bg-white px-3 py-2 text-xs font-bold text-[#76543e] transition hover:border-lime/40 hover:text-lime disabled:opacity-60"
          onClick={onUseLocation}
          disabled={isLocating}
        >
          {isLocating ? '定位中' : '附近'}
        </button>
        <button
          className="flex items-center gap-1 rounded-lg bg-lime px-4 py-2 text-xs font-black text-white shadow-sm transition hover:bg-brand2"
          onClick={onCreate}
        >
          <span className="text-sm leading-none">+</span>
          发布
        </button>
      </div>
    </div>
  </div>
);

const FilterSidebar = ({
  distance,
  filter,
  gender,
  level,
  located,
  onDistanceChange,
  onFilterChange,
  onGenderChange,
  onLevelChange,
  onReset,
}: {
  distance: string;
  filter: string;
  gender: string;
  level: string;
  located: boolean;
  onDistanceChange: (value: string) => void;
  onFilterChange: (value: string) => void;
  onGenderChange: (value: string) => void;
  onLevelChange: (value: string) => void;
  onReset: () => void;
}) => (
  <div className="sticky top-24 max-h-[calc(100vh-110px)] overflow-y-auto rounded-2xl border border-[#e5ddd5] bg-white shadow-sm">
    <div className="border-b border-[#f0e8e0] px-4 py-3">
      <h2 className="text-sm font-black text-[#1a1208]">筛选条件</h2>
    </div>
    <div className="divide-y divide-[#f0e8e0]">
      <FilterList title="内容类型" items={CATEGORIES} value={filter} onChange={onFilterChange} />
      <FilterPills title="性别" items={GENDER_FILTERS} value={gender} onChange={onGenderChange} />
      <FilterList
        title="距离范围"
        items={DISTANCE_FILTERS}
        value={distance}
        onChange={onDistanceChange}
      />
      <FilterList title="水平要求" items={LEVEL_FILTERS} value={level} onChange={onLevelChange} />
      {(filter !== 'all' || gender !== 'all' || distance !== 'all' || level !== 'all') && (
        <div className="px-4 py-3">
          <button
            className="w-full rounded-lg border border-[#e5ddd5] py-2 text-xs font-bold text-[#8b6a54] transition hover:border-lime/40 hover:text-lime"
            onClick={onReset}
          >
            重置全部筛选
          </button>
        </div>
      )}
      {located && (
        <div className="px-4 py-3">
          <div className="flex items-center gap-2 rounded-xl border border-lime/20 bg-lime/5 px-3 py-2.5">
            <span className="h-2 w-2 flex-shrink-0 rounded-full bg-lime" />
            <span className="text-xs font-bold text-[#5a7a3a]">已定位 · 附近优先排序</span>
          </div>
        </div>
      )}
    </div>
  </div>
);

const FilterList = ({
  items,
  onChange,
  title,
  value,
}: {
  items: readonly { id: string; label: string }[];
  onChange: (value: string) => void;
  title: string;
  value: string;
}) => (
  <div className="px-4 py-3">
    <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-[#a08070]">
      {title}
    </div>
    <div className="space-y-0.5">
      {items.map((item) => (
        <button
          key={item.id}
          className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-bold transition ${
            value === item.id
              ? 'bg-lime/10 text-lime'
              : 'text-[#5a3d2b] hover:bg-[#fff4ec] hover:text-lime'
          }`}
          onClick={() => onChange(item.id)}
        >
          <span className="flex-1">{item.label}</span>
          {value === item.id && <span className="h-1.5 w-1.5 rounded-full bg-lime" />}
        </button>
      ))}
    </div>
  </div>
);

const FilterPills = ({
  items,
  onChange,
  title,
  value,
}: {
  items: readonly { id: string; label: string }[];
  onChange: (value: string) => void;
  title: string;
  value: string;
}) => (
  <div className="px-4 py-3">
    <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-[#a08070]">
      {title}
    </div>
    <div className="flex gap-1.5">
      {items.map((item) => (
        <button
          key={item.id}
          className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition ${
            value === item.id
              ? 'bg-lime text-white shadow-sm'
              : 'border border-[#e5ddd5] text-[#76543e] hover:border-lime/40 hover:text-lime'
          }`}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  </div>
);

const SidePanel = ({ children, title }: { children: React.ReactNode; title: string }) => (
  <section className="rounded-2xl border border-[#e5ddd5] bg-white p-4 shadow-sm">
    <h2 className="mb-3 text-sm font-black text-[#1a1208]">{title}</h2>
    <div className="space-y-2">{children}</div>
  </section>
);
