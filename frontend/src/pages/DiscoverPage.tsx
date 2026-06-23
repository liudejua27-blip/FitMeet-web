import {
  type CSSProperties,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import clsx from 'clsx';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { SiteLink } from '../components/navigation/SiteLink';
import * as dataService from '../services/dataService';
import { socialAgentApi } from '../api/socialAgentApi';
import { getMeetDistanceMeters } from '../lib/distance';
import { getBrowserLocation } from '../lib/location';
import type { Coordinates } from '../lib/amap';
import { filterDisplayableMeets } from '../data/discoverContent';
import { getSportLabel, normalizeSportGroup } from '../data/taxonomy';
import { useAuthStore, useNotificationStore } from '../stores';
import type { Meet, PublicSocialIntent } from '../types';
import {
  detailHrefForDiscoverMeet,
  publicIntentToDiscoverMeet,
  type DiscoverMeet,
} from './discoverMeetPresenter';

type SportFilter = {
  id: string;
  label: string;
  icon: string;
};

type LiveItem = {
  id: string;
  avatar: string;
  color: string;
  title: string;
  body: string;
  time: string;
};

const sportFilters: SportFilter[] = [
  { id: 'all', label: '全部运动', icon: '⊕' },
  { id: 'gym', label: '健身', icon: '🏋️' },
  { id: 'run', label: '跑步', icon: '🏃' },
  { id: 'swimming', label: '游泳', icon: '🌊' },
  { id: 'yoga', label: '瑜伽', icon: '🧘' },
  { id: 'basketball', label: '篮球', icon: '🏀' },
  { id: 'badminton', label: '羽毛球', icon: '🏸' },
  { id: 'cycling', label: '骑行', icon: '🚴' },
];

export const DiscoverPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const searchParamKey = searchParams.toString();
  const focusScene = searchParams.get('focusScene')?.trim();
  const focusPublicIntentId = searchParams.get('publicIntentId')?.trim();
  const focusSocialRequestId = searchParams.get('socialRequestId')?.trim();
  const [activeSport, setActiveSport] = useState('all');
  const [activeTab, setActiveTab] = useState<'recommend' | 'nearby' | 'latest' | 'match'>(
    'recommend',
  );
  const [meets, setMeets] = useState<DiscoverMeet[]>([]);
  const [publicIntents, setPublicIntents] = useState<PublicSocialIntent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [joinedMeets, setJoinedMeets] = useState<number[]>([]);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const { isLoggedIn, openLogin } = useAuthStore();
  const { addNotification } = useNotificationStore();

  const loadDiscover = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [meetData, intentData] = await Promise.all([
        dataService.getMeets({ lat: userLocation?.lat, lng: userLocation?.lng }),
        loadPublicDiscoverIntents(),
      ]);
      setMeets(
        filterDisplayableMeets(meetData).map((meet) => ({
          ...meet,
          sourceKind: 'meet',
        })),
      );
      setPublicIntents(intentData.filter((intent) => intent.status !== 'cancelled'));
    } catch {
      setMeets([]);
      setPublicIntents([]);
      setError('发现内容加载失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  }, [userLocation]);

  useEffect(() => {
    document.title = '发现 - FitMeet';
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [searchParamKey]);

  useEffect(() => {
    if (location.pathname === '/discover') {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
  }, [location.key, location.pathname]);

  const displayMeets = useMemo(() => {
    const intentMeets = publicIntents.map(publicIntentToDiscoverMeet);
    let data = [...intentMeets, ...meets];
    if (activeSport !== 'all') {
      data = data.filter((meet) => normalizeSportGroup(meet.type || meet.sport) === activeSport);
    }
    if (activeTab === 'nearby') {
      data = [...data].sort((a, b) => distanceValue(a) - distanceValue(b));
    }
    if (activeTab === 'latest') {
      data = [...data].sort(
        (a, b) => (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0),
      );
    }
    if (activeTab === 'match') {
      data = [...data].sort((a, b) => matchScore(b) - matchScore(a));
    }
    if (focusPublicIntentId || focusSocialRequestId) {
      data = [...data].sort((a, b) => {
        const aFocused = isFocusedDiscoverMeet(a, focusPublicIntentId, focusSocialRequestId);
        const bFocused = isFocusedDiscoverMeet(b, focusPublicIntentId, focusSocialRequestId);
        return Number(bFocused) - Number(aFocused);
      });
    }
    return data;
  }, [activeSport, activeTab, focusPublicIntentId, focusSocialRequestId, meets, publicIntents]);

  useEffect(() => {
    if (focusPublicIntentId || focusSocialRequestId) {
      const targetMeet = displayMeets.find((meet) =>
        isFocusedDiscoverMeet(meet, focusPublicIntentId, focusSocialRequestId),
      );
      if (!targetMeet) return;
      const target = document.querySelector<HTMLElement>(
        `[data-public-intent-id="${cssEscapeValue(targetMeet.publicIntentId)}"], [data-social-request-id="${cssEscapeValue(String(targetMeet.linkedSocialRequestId ?? ''))}"]`,
      );
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (!focusScene) {
      return;
    }

    const lowered = focusScene.toLowerCase();
    const targetMeet = displayMeets.find(
      (meet) =>
        meet.title.toLowerCase() === lowered ||
        meet.title.toLowerCase().includes(lowered) ||
        (meet.loc || '').toLowerCase().includes(lowered),
    );

    if (!targetMeet) {
      return;
    }

    const target = document.querySelector<HTMLElement>(`[data-meet-anchor="${targetMeet.id}"]`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [displayMeets, focusPublicIntentId, focusScene, focusSocialRequestId]);

  useEffect(() => {
    void loadDiscover();
  }, [loadDiscover]);

  const liveItems = useMemo<LiveItem[]>(() => {
    const seen = new Set<string>();
    const uniqueMeets = displayMeets.filter((meet) => {
      const key = `${meet.title}-${meet.loc}-${meet.time || meet.startAt}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const meetItems = uniqueMeets.slice(0, 4).map((meet, index) => ({
      id: `meet-${meet.id}`,
      avatar: publicDisplayName(meet.username, index).slice(0, 1),
      color: meet.color,
      title: index === 0 ? '附近有新的生活场景' : meet.title,
      body: index === 0 ? `${getSportLabel(meet.sport)} · ${formatMeetTime(meet)}` : liveBody(meet),
      time: formatRelativePublishedTime(meet.createdAt, '刚刚更新'),
    }));
    return meetItems.slice(0, 6);
  }, [displayMeets]);

  const activePeople = useMemo(
    () =>
      displayMeets
        .filter((meet) => Number.isFinite(meet.userId) && Number(meet.userId) > 0)
        .slice(0, 4)
        .map((meet, index) => ({
          id: meet.id,
          userId: meet.userId,
          name: publicDisplayName(meet.username, index),
          sport: getSportLabel(meet.sport),
          distance: meet.dist || '附近',
          avatar: (meet.username || 'F').slice(0, 1),
          color: meet.color,
          href: `/user/${meet.userId}`,
          meet,
        })),
    [displayMeets],
  );

  const spotlightMeets = useMemo(() => displayMeets.slice(0, 3), [displayMeets]);

  const handleUseLocation = useCallback(() => {
    setIsLocating(true);
    getBrowserLocation()
      .then(setUserLocation)
      .catch((err) => setError(err instanceof Error ? err.message : '定位失败，请检查浏览器权限。'))
      .finally(() => setIsLocating(false));
  }, []);

  const handleJoin = useCallback(
    async (meet: Meet) => {
      if (!isLoggedIn) {
        openLogin();
        return;
      }
      if ((meet as DiscoverMeet).sourceKind === 'publicIntent') {
        navigate((meet as DiscoverMeet).detailHref || '/agent/chat');
        return;
      }
      if (joinedMeets.includes(meet.id)) return;
      try {
        if (meet.id > 0) await dataService.joinMeet(meet.id);
        setJoinedMeets((current) => [...current, meet.id]);
        addNotification({
          type: 'meet',
          username: meet.username || '约练',
          avatar: (meet.username || '约')[0],
          color: meet.color,
          text: `你已申请加入「${meet.title}」，等待发起人确认。`,
          time: '刚刚',
        });
        await loadDiscover();
      } catch {
        setError('加入失败，请稍后重试。');
      }
    },
    [addNotification, isLoggedIn, joinedMeets, loadDiscover, navigate, openLogin],
  );

  const recordDiscoverInterest = useCallback(
    (meet: DiscoverMeet) => {
      if (!isLoggedIn) return;
      const targetUserId =
        Number.isFinite(meet.userId) && Number(meet.userId) > 0 ? Number(meet.userId) : null;
      const day = new Date().toISOString().slice(0, 10);
      void socialAgentApi
        .recordInterestEvent({
          eventType: 'discover_click',
          targetUserId,
          socialRequestId: meet.linkedSocialRequestId ?? null,
          activityId:
            Number.isFinite(meet.activityId) && Number(meet.activityId) > 0
              ? Number(meet.activityId)
              : null,
          activityTags: [meet.sport, meet.type, getSportLabel(meet.sport)].filter(
            (item): item is string => Boolean(item),
          ),
          city: meet.city ?? null,
          locationText: meet.loc ?? null,
          timeWindow: meet.time || meet.startAt || null,
          source: 'discover_page',
          dedupeKey: `discover:${meet.sourceKind ?? 'meet'}:${String(meet.publicIntentId ?? meet.id)}:${day}`,
          metadata: {
            publicIntentId: meet.publicIntentId ?? null,
            detailHref: detailHrefForDiscoverMeet(meet),
          },
        })
        .catch(() => undefined);
    },
    [isLoggedIn],
  );

  const recordProfileInterest = useCallback(
    (person: { userId?: number; meet?: DiscoverMeet }) => {
      if (!isLoggedIn || !person.userId) return;
      const day = new Date().toISOString().slice(0, 10);
      void socialAgentApi
        .recordInterestEvent({
          eventType: 'view_profile',
          targetUserId: person.userId,
          activityTags: person.meet
            ? [person.meet.sport, person.meet.type, getSportLabel(person.meet.sport)].filter(
                (item): item is string => Boolean(item),
              )
            : null,
          city: person.meet?.city ?? null,
          locationText: person.meet?.loc ?? null,
          timeWindow: person.meet?.time || person.meet?.startAt || null,
          source: 'discover_people_list',
          dedupeKey: `discover:profile:${person.userId}:${day}`,
        })
        .catch(() => undefined);
    },
    [isLoggedIn],
  );

  return (
    <div className="fitmeet-website fm-site fm-enterprise-site discover-page">
      <DiscoverSiteNav />
      <main>
        <section className="discover-hero match-hall-hero">
          <div className="match-hall-hero__copy">
            <div className="match-hall-location">
              <span />
              青岛市 · 实时更新
              <button type="button" onClick={handleUseLocation} disabled={isLocating}>
                {isLocating ? '定位中' : '切换'}
              </button>
            </div>
            <h1>
              发现附近真实<span>生活场景</span>
            </h1>
            <p>从约练、散步、咖啡和同频动态开始，看见可以自然认识的人。</p>
            <div className="discover-hero__actions">
              <Link to="/agent" className="fm-button fm-button--primary">
                让 Agent 帮我找
              </Link>
              <Link to="/features" className="fm-button fm-button--ghost">
                了解产品
              </Link>
            </div>
            <div className="match-sport-filter" aria-label="运动筛选">
              {sportFilters.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={activeSport === item.id ? 'is-active' : undefined}
                  onClick={() => setActiveSport(item.id)}
                >
                  <span>{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="discover-hero__visual" aria-label="FitMeet 发现页预览">
            <div className="discover-phone">
              <div className="discover-phone__top">
                <span>Social World</span>
                <strong>附近正在发生</strong>
              </div>
              <div className="discover-phone__people">
                {activePeople.slice(0, 4).map((person) => (
                  <span key={person.id} style={{ background: person.color }}>
                    {person.avatar}
                  </span>
                ))}
              </div>
              {spotlightMeets.map((meet, index) => (
                <article
                  key={meet.id}
                  className={`discover-phone-card discover-phone-card--${index + 1}`}
                >
                  <span>{sportIcon(meet.sport)}</span>
                  <div>
                    <strong>{meet.title}</strong>
                    <p>
                      {formatMeetTime(meet)} · {meet.dist || '附近'}
                    </p>
                  </div>
                </article>
              ))}
            </div>
            <div className="discover-agent-orbit" aria-hidden="true">
              <img
                src="/images/fitmeet/generated/fitmeet-ant-agent-cutout-transparent.png"
                alt=""
                aria-hidden="true"
                width="420"
                height="420"
              />
            </div>
          </div>
        </section>

        {error ? (
          <div className="match-hall-error">
            <span>{error}</span>
            <button type="button" onClick={() => void loadDiscover()}>
              重试
            </button>
          </div>
        ) : null}

        <section className="match-live-strip" aria-label="发现动态">
          <div className="match-live-strip__label">
            <strong>发现动态</strong>
            <span>REALTIME</span>
          </div>
          <div className="match-live-strip__track">
            {liveItems.map((item) => (
              <article key={item.id}>
                <span style={{ background: item.color }}>{item.avatar}</span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.body}</p>
                  <small>{item.time}</small>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="match-hall-layout" aria-label="发现列表">
          <section className="match-hall-main">
            <div className="match-hall-toolbar">
              <div className="match-tabs" role="tablist" aria-label="发现排序">
                {[
                  ['recommend', '推荐'],
                  ['nearby', '附近'],
                  ['latest', '最新'],
                  ['match', '高匹配度'],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === id}
                    className={activeTab === id ? 'is-active' : undefined}
                    onClick={() => setActiveTab(id as typeof activeTab)}
                  >
                    {label}
                    {id === 'match' ? <span>AI</span> : null}
                  </button>
                ))}
              </div>
              <div className="match-view-toggle" aria-label="视图模式">
                <button type="button" className="is-active">
                  ☷ 场景视图
                </button>
                <button type="button">⌖ 地图视图</button>
              </div>
            </div>

            {loading ? (
              <div className="match-card-grid">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="match-card match-card--loading" />
                ))}
              </div>
            ) : displayMeets.length > 0 ? (
              <div className="match-card-grid">
                {displayMeets.slice(0, 8).map((meet, index) => (
                  <MeetupMatchCard
                    key={meet.id}
                    meet={meet}
                    index={index}
                    joined={joinedMeets.includes(meet.id)}
                    distance={getMeetDistanceMeters(meet, userLocation)}
                    detailHref={detailHrefForDiscoverMeet(meet)}
                    onJoin={() => void handleJoin(meet)}
                    onOpen={() => recordDiscoverInterest(meet)}
                  />
                ))}
              </div>
            ) : (
              <div className="match-empty-state" data-testid="discover-real-empty-state">
                <strong>暂时还没有公开场景</strong>
                <p>你可以让 Agent 根据你的城市、时间、活动兴趣和安全边界生成第一张约练卡。</p>
                <button type="button" onClick={() => navigate('/agent/chat')}>
                  让 Agent 帮我生成
                </button>
              </div>
            )}

            <div className="match-hall-end">
              <span />
              没有更多了，可以继续让 Agent 根据你的偏好筛选
              <Link to="/agent">打开 Agent</Link>
              <span />
            </div>
          </section>

          <aside className="match-side-rail">
            <section className="match-side-panel">
              <header>
                <h2>附近同频的人</h2>
                <button type="button">查看更多 ›</button>
              </header>
              <div className="match-people-list">
                {activePeople.length > 0 ? (
                  activePeople.map((person) => (
                    <button
                      key={person.id}
                      type="button"
                      onClick={() => {
                        recordProfileInterest(person);
                        navigate(person.href);
                      }}
                    >
                      <span className="match-person-avatar" style={{ background: person.color }}>
                        {person.avatar}
                      </span>
                      <span>
                        <strong>{person.name}</strong>
                        <small>
                          {person.sport} · {person.distance}
                        </small>
                      </span>
                      <em>详情</em>
                    </button>
                  ))
                ) : (
                  <p className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-6 text-[#9a9487]">
                    暂时没有公开资料完整的附近用户。你发布真实场景后，系统会优先展示可查看详情的人。
                  </p>
                )}
              </div>
            </section>

            <section className="match-side-panel">
              <header>
                <h2>安全提示</h2>
                <button type="button">更多 ›</button>
              </header>
              <ul className="match-safety-list">
                <li>首次见面建议选择公共场所</li>
                <li>开始前确认活动地点和时间</li>
                <li>遇到异常请举报，保护自己</li>
              </ul>
            </section>
          </aside>
        </section>
      </main>

      <DiscoverSiteFooter />
    </div>
  );
};

function DiscoverSiteNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const navItems = [
    { to: '/', label: '首页' },
    { to: '/discover', label: '发现' },
    { to: '/features', label: '产品功能' },
    { to: '/agent', label: 'Agent' },
    { to: '/safety', label: '安全' },
    { to: '/download', label: '下载 App' },
    { to: '/about', label: '关于我们' },
  ];

  return (
    <header className={clsx('fm-nav', menuOpen && 'is-menu-open')}>
      <Link to="/" className="fm-brand" aria-label="FitMeet 首页">
        <span>
          <img src="/favicon-192.png" alt="FitMeet" width="38" height="38" />
        </span>
        <strong>FitMeet</strong>
      </Link>
      <button
        type="button"
        className="fm-nav__menu"
        aria-expanded={menuOpen}
        aria-controls="fitmeet-discover-nav"
        onClick={() => setMenuOpen((open) => !open)}
      >
        {menuOpen ? '关闭菜单' : '打开菜单'}
      </button>
      <nav id="fitmeet-discover-nav" aria-label="FitMeet 官网导航">
        {navItems.map((item) => {
          const isDiscover = item.to === '/discover';
          return isDiscover ? (
            <SiteLink key={item.to} to={item.to} aria-current="page">
              {item.label}
            </SiteLink>
          ) : (
            <Link key={item.to} to={item.to}>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="fm-nav__actions">
        <Link to="/agent" className="fm-button fm-button--ghost">
          体验 Agent
        </Link>
        <Link to="/download" className="fm-button fm-button--primary">
          打开 App
        </Link>
      </div>
    </header>
  );
}

function DiscoverSiteFooter() {
  const icpText = import.meta.env.VITE_ICP_TEXT || '鲁ICP备2026015946号-2';
  const icpUrl = import.meta.env.VITE_ICP_URL || 'http://beian.miit.gov.cn/';

  return (
    <footer className="fm-footer">
      <strong>
        <img src="/favicon-192.png" alt="FitMeet" width="28" height="28" />
        FitMeet
      </strong>
      <p>发现附近真实生活场景，从兴趣出发，遇见真正聊得来的人。</p>
      <nav aria-label="FitMeet 页脚导航">
        <Link to="/features">产品功能</Link>
        <SiteLink to="/discover">发现</SiteLink>
        <Link to="/agent">Agent</Link>
        <Link to="/safety">安全</Link>
        <Link to="/download">下载 App</Link>
        <Link to="/about">关于我们</Link>
        <Link to="/privacy">隐私政策</Link>
        <Link to="/terms">用户协议</Link>
        <a href={icpUrl} target="_blank" rel="noreferrer">
          {icpText}
        </a>
      </nav>
    </footer>
  );
}

function MeetupMatchCard({
  distance,
  index,
  joined,
  meet,
  onJoin,
  onOpen,
  detailHref,
}: {
  distance: number | null | undefined;
  index: number;
  joined: boolean;
  meet: DiscoverMeet;
  onJoin: () => void;
  onOpen?: () => void;
  detailHref: string;
}) {
  const score = matchScore(meet);
  const tone = ['green', 'orange', 'blue', 'gold'][index % 4];
  const statusLabel =
    meet.sourceKind === 'publicIntent'
      ? '查看详情'
      : joined
        ? '已申请'
        : meet.status === 'matched'
          ? '匹配中'
          : '开放加入';
  const resolvedDistance =
    typeof distance === 'number' && Number.isFinite(distance)
      ? `${(distance / 1000).toFixed(1)}km`
      : meet.dist || '附近';

  const handleJoinClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      onJoin();
    },
    [onJoin],
  );

  return (
    <Link
      to={detailHref}
      className="match-card-link"
      data-meet-anchor={meet.id}
      data-public-intent-id={meet.publicIntentId ?? undefined}
      data-social-request-id={meet.linkedSocialRequestId ?? undefined}
      onClick={onOpen}
    >
      <article className={`match-card match-card--${tone}`}>
        <div className="match-card__head">
          <span className="match-card__sport">{sportIcon(meet.sport)}</span>
          <div>
            <h2>{meet.title}</h2>
            <p>
              {meet.city || '附近'} · {resolvedDistance}
            </p>
          </div>
          <span className="match-card__more" aria-hidden="true">
            ⋯
          </span>
        </div>
        <div className="match-card__meta">
          <span>⌄ {meet.loc || '地点待定'}</span>
          <span>{formatMeetTime(meet)}</span>
        </div>
        <div className="match-card__tags">
          <button
            type="button"
            className={joined ? 'is-muted' : 'is-open'}
            onClick={handleJoinClick}
          >
            {statusLabel}
          </button>
          <span>{getSportLabel(meet.sport)}</span>
          <span>{formatLevel(meet.level)}</span>
          {meet.sourceKind === 'publicIntent' ? <span>公开社交意图</span> : null}
        </div>
        <div className="match-card__bottom">
          <div className="match-avatars" aria-label="已加入用户">
            {Array.from({ length: Math.min(3, Math.max(1, meet.participants.length || 2)) }).map(
              (_, i) => (
                <span key={i} style={{ background: i === 0 ? meet.color : undefined }}>
                  {(meet.participants[i] || meet.username || 'F').slice(0, 1)}
                </span>
              ),
            )}
          </div>
          <strong>
            {meet.slots}/{meet.maxSlots} 人已加入
          </strong>
          <time>{formatRelativePublishedTime(meet.createdAt, '刚刚更新')}</time>
        </div>
        <div className="match-score" style={{ '--score': `${score}%` } as CSSProperties}>
          <strong>{score}%</strong>
          <span>匹配度</span>
        </div>
      </article>
    </Link>
  );
}

function isFocusedDiscoverMeet(
  meet: DiscoverMeet,
  publicIntentId?: string | null,
  socialRequestId?: string | null,
) {
  return (
    Boolean(publicIntentId && meet.publicIntentId === publicIntentId) ||
    Boolean(socialRequestId && String(meet.linkedSocialRequestId ?? '') === socialRequestId)
  );
}

function cssEscapeValue(value: string | null | undefined) {
  if (!value) return '';
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, '\\$&');
}

async function loadPublicDiscoverIntents() {
  const statuses: Array<PublicSocialIntent['status']> = ['active', 'searching', 'matched'];
  const batches = await Promise.all(
    statuses.map((status) =>
      dataService
        .getPublicSocialIntents({
          page: 1,
          limit: 24,
          status,
        })
        .catch(() => [] as PublicSocialIntent[]),
    ),
  );
  const byId = new Map<string, PublicSocialIntent>();
  for (const intent of batches.flat()) {
    if (intent.status !== 'cancelled' && intent.status !== 'closed') {
      byId.set(intent.id, intent);
    }
  }
  return Array.from(byId.values()).sort(
    (a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0),
  );
}

function matchScore(meet: Meet) {
  const base = meet.rating ? Math.round(meet.rating * 18) : 78;
  const slotBoost = meet.maxSlots > 0 ? Math.round((meet.slots / meet.maxSlots) * 8) : 4;
  return Math.max(72, Math.min(96, base + slotBoost));
}

function publicDisplayName(name: string | undefined, index: number) {
  const trimmed = (name || '').trim();
  if (
    !trimmed ||
    trimmed.length <= 1 ||
    /^(test|demo|seed|user)$/i.test(trimmed) ||
    /^用户\s*\d+$/i.test(trimmed) ||
    /^同频发起人$/i.test(trimmed) ||
    /^FitMeet\s*用户$/i.test(trimmed)
  ) {
    return `同频用户 ${index + 1}`;
  }
  const first = trimmed.slice(0, 1);
  return `${first}同学`;
}

function formatLevel(level: string | undefined) {
  if (!level || level === 'all') return '轻松';
  return level;
}

function formatMeetTime(meet: Meet) {
  const raw = meet.startAt || meet.time;
  if (!raw) return '时间待定';
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return raw;
  const date = new Date(parsed);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const prefix = sameDay
    ? '今天'
    : date.toDateString() === tomorrow.toDateString()
      ? '明天'
      : `${date.getMonth() + 1}月${date.getDate()}日`;
  const time = date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${prefix} ${time}`;
}

function distanceValue(meet: Meet) {
  const raw = meet.dist || '';
  const value = Number.parseFloat(raw.replace(/[^\d.]/g, ''));
  return Number.isFinite(value) ? value : 99;
}

function liveBody(meet: Meet) {
  if (meet.status === 'matched') return '正在匹配中';
  if (meet.slots > 0) return `有 ${meet.slots} 人加入`;
  return '有 1 人报名';
}

function formatRelativePublishedTime(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return fallback;
  const diffMs = Date.now() - timestamp;
  if (diffMs < 0) return '刚刚更新';
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diffMs < minute) return '刚刚更新';
  if (diffMs < hour) return `${Math.max(1, Math.floor(diffMs / minute))}分钟前`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}小时前`;
  return `${Math.floor(diffMs / day)}天前`;
}

function sportIcon(sport: string) {
  const normalized = normalizeSportGroup(sport);
  const found = sportFilters.find((item) => item.id === normalized);
  return found?.icon ?? '⚡';
}

export default DiscoverPage;
