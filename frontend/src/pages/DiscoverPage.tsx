import { type CSSProperties, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CreateMeetModal, type MeetFormData } from '../components/meet';
import * as dataService from '../services/dataService';
import { getMeetDistanceMeters } from '../lib/distance';
import { getBrowserLocation } from '../lib/location';
import type { Coordinates } from '../lib/amap';
import { filterDisplayableMeets, filterDisplayablePosts } from '../data/mockContent';
import { getSportLabel, normalizeSportGroup } from '../data/taxonomy';
import { useAuthStore, useNotificationStore } from '../stores';
import type { Meet, Post } from '../types';

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

const fallbackMeets: Meet[] = [
  {
    id: -1,
    title: '今晚 8 点海边慢跑',
    type: 'run',
    sport: 'run',
    username: '林一舟',
    color: '#22c55e',
    colorBg: '#102116',
    time: '今晚 20:00',
    loc: '五四广场 · 海边步道',
    city: '青岛',
    dist: '3.0km',
    price: '免费',
    slots: 3,
    maxSlots: 6,
    level: '轻松',
    desc: '低压力慢跑，先站内聊，公共路线集合。',
    status: 'active',
    participants: ['林', '舟', '跑'],
    cert: true,
    rating: 4.6,
    meetCount: 12,
    mock: true,
  },
  {
    id: -2,
    title: '周末力量训练搭子',
    type: 'gym',
    sport: 'gym',
    username: 'Running Jason',
    color: '#f97316',
    colorBg: '#24170f',
    time: '周六 10:30',
    loc: '力美健身中心（万象城店）',
    city: '青岛',
    dist: '1.2km',
    price: 'AA',
    slots: 2,
    maxSlots: 4,
    level: '中等',
    desc: '一起练深蹲和卧推，强度可商量。',
    status: 'matched',
    participants: ['R', 'J'],
    cert: true,
    rating: 4.35,
    meetCount: 8,
    mock: true,
  },
  {
    id: -3,
    title: '饭后散步聊天',
    type: 'walk',
    sport: 'run',
    username: '瑜伽小鹿',
    color: '#7c9cff',
    colorBg: '#11172a',
    time: '今晚 19:30',
    loc: '奥帆中心 · 情人坝',
    city: '青岛',
    dist: '1.8km',
    price: '免费',
    slots: 1,
    maxSlots: 3,
    level: '轻松',
    desc: '不赶路，适合低压力认识新朋友。',
    status: 'pending',
    participants: ['鹿'],
    cert: true,
    rating: 4.05,
    meetCount: 5,
    mock: true,
  },
  {
    id: -4,
    title: '今晚上瑜伽课',
    type: 'yoga',
    sport: 'yoga',
    username: '力量女孩',
    color: '#22c55e',
    colorBg: '#0f2418',
    time: '今晚 21:00',
    loc: '珑瑜伽馆（市南店）',
    city: '青岛',
    dist: '2.5km',
    price: '团课',
    slots: 2,
    maxSlots: 5,
    level: '入门',
    desc: '室内瑜伽课，女生友好，结束后可一起喝水聊天。',
    status: 'active',
    participants: ['力', '量'],
    cert: true,
    rating: 4.5,
    meetCount: 9,
    mock: true,
  },
];

export const DiscoverPage = () => {
  const navigate = useNavigate();
  const [activeSport, setActiveSport] = useState('all');
  const [activeTab, setActiveTab] = useState<'recommend' | 'nearby' | 'latest' | 'match'>(
    'recommend',
  );
  const [meets, setMeets] = useState<Meet[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [joinedMeets, setJoinedMeets] = useState<number[]>([]);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const { isLoggedIn, openLogin } = useAuthStore();
  const { addNotification } = useNotificationStore();

  const loadDiscover = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [meetData, feedData] = await Promise.all([
        dataService.getMeets({ lat: userLocation?.lat, lng: userLocation?.lng }),
        dataService.getFeed({
          page: 1,
          pageSize: 12,
          lat: userLocation?.lat,
          lng: userLocation?.lng,
        }),
      ]);
      setMeets(filterDisplayableMeets(meetData));
      setPosts(filterDisplayablePosts(feedData));
    } catch {
      setMeets([]);
      setPosts([]);
      setError('发现内容加载失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  }, [userLocation]);

  useEffect(() => {
    document.title = '发现 - FitMeet';
  }, []);

  useEffect(() => {
    void loadDiscover();
  }, [loadDiscover]);

  const displayMeets = useMemo(() => {
    const source = meets.length > 0 ? meets : fallbackMeets;
    let data = source;
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
    return data;
  }, [activeSport, activeTab, meets]);

  const liveItems = useMemo<LiveItem[]>(() => {
    const meetItems = displayMeets.slice(0, 5).map((meet, index) => ({
      id: `meet-${meet.id}`,
      avatar: meet.username.slice(0, 1),
      color: meet.color,
      title: index === 0 ? meet.username : meet.title,
      body: index === 0 ? `发布了 ${getSportLabel(meet.sport)} 约练` : liveBody(meet),
      time: `${(index + 1) * 2}分钟前`,
    }));
    const postItems = posts.slice(0, 3).map((post, index) => ({
      id: `post-${post.id}`,
      avatar: post.username.slice(0, 1),
      color: post.color,
      title: post.title || post.username,
      body: post.type === 'meet' ? '发布了场景邀请' : '更新了训练动态',
      time: `${(index + 4) * 2}分钟前`,
    }));
    return [...meetItems, ...postItems].slice(0, 6);
  }, [displayMeets, posts]);

  const activePeople = useMemo(
    () =>
      displayMeets.slice(0, 4).map((meet, index) => ({
        id: meet.id,
        name: meet.username,
        sport: getSportLabel(meet.sport),
        age: 24 + index + (meet.id > 0 ? meet.id % 4 : 0),
        distance: meet.dist || `${(0.8 + index * 0.4).toFixed(1)}km`,
        avatar: meet.username.slice(0, 1),
        color: meet.color,
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
      if (joinedMeets.includes(meet.id)) return;
      try {
        if (!meet.mock && meet.id > 0) await dataService.joinMeet(meet.id);
        setJoinedMeets((current) => [...current, meet.id]);
        addNotification({
          type: 'meet',
          username: meet.username || '约练',
          avatar: (meet.username || '约')[0],
          color: meet.color,
          text: `你已申请加入「${meet.title}」，等待发起人确认。`,
          time: '刚刚',
        });
        if (!meet.mock) await loadDiscover();
      } catch {
        setError('加入失败，请稍后重试。');
      }
    },
    [addNotification, isLoggedIn, joinedMeets, loadDiscover, openLogin],
  );

  const handleCreateSubmit = useCallback(
    async (data: MeetFormData) => {
      if (!isLoggedIn) {
        openLogin();
        return;
      }
      try {
        const created = await dataService.createMeet({
          title: data.title,
          type: data.type,
          sport: data.sport,
          time: data.time,
          loc: data.location,
          address: data.address,
          poiId: data.poiId,
          lat: data.lat,
          lng: data.lng,
          maxSlots: data.maxSlots,
          level: data.level,
          price: data.price,
          feeType: data.feeType,
          groupType: data.groupType,
          creatorType: data.creatorType,
          clubId: data.clubId,
          city: data.city,
          startAt: data.startAt || data.time,
          desc: data.desc,
        } as Partial<Meet>);
        setMeets((current) => filterDisplayableMeets([created, ...current]));
        setShowCreateModal(false);
      } catch {
        setError('发布场景失败，请稍后重试。');
      }
    },
    [isLoggedIn, openLogin],
  );

  const openCreate = () => {
    if (!isLoggedIn) {
      openLogin();
      return;
    }
    setShowCreateModal(true);
  };

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
              <button type="button" className="fm-button fm-button--primary" onClick={openCreate}>
                发布一个场景
              </button>
              <Link to="/agent" className="fm-button fm-button--ghost">
                让 Agent 帮我找
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
                      {meet.time || '时间待定'} · {meet.dist || '附近'}
                    </p>
                  </div>
                </article>
              ))}
            </div>
            <div className="discover-agent-orbit" aria-hidden="true">
              <img
                src="/images/fitmeet/generated/fitmeet-ant-agent-cutout-transparent.png"
                alt=""
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
            {[...liveItems, ...liveItems].map((item, index) => (
              <article key={`${item.id}-${index}`}>
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
            ) : (
              <div className="match-card-grid">
                {displayMeets.slice(0, 8).map((meet, index) => (
                  <MeetupMatchCard
                    key={meet.id}
                    meet={meet}
                    index={index}
                    joined={joinedMeets.includes(meet.id)}
                    distance={getMeetDistanceMeters(meet, userLocation)}
                    onJoin={() => void handleJoin(meet)}
                  />
                ))}
              </div>
            )}

            <div className="match-hall-end">
              <span />
              没有更多了，去
              <button type="button" onClick={openCreate}>
                发布一个场景
              </button>
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
                {activePeople.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => navigate(`/search?q=${encodeURIComponent(person.name)}`)}
                  >
                    <span className="match-person-avatar" style={{ background: person.color }}>
                      {person.avatar}
                    </span>
                    <span>
                      <strong>{person.name}</strong>
                      <small>
                        {person.sport} · {person.age} 岁
                      </small>
                    </span>
                    <em>{person.distance}</em>
                  </button>
                ))}
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

            <section className="match-publish-panel">
              <h2>把想做的事发出来</h2>
              <p>说清楚时间、地点和边界，让认识从一个真实场景开始。</p>
              <button type="button" onClick={openCreate}>
                发布场景 <span>→</span>
              </button>
              <div>
                <span>128 人本周已发布真实生活场景</span>
              </div>
            </section>
          </aside>
        </section>
      </main>

      <DiscoverSiteFooter />

      <CreateMeetModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateSubmit}
      />
    </div>
  );
};

function DiscoverSiteNav() {
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
    <header className="fm-nav">
      <Link to="/" className="fm-brand" aria-label="FitMeet 首页">
        <span aria-hidden="true">
          <img src="/favicon-192.png" alt="" width="38" height="38" />
        </span>
        <strong>FitMeet</strong>
      </Link>
      <nav aria-label="FitMeet 官网导航">
        {navItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            aria-current={item.to === '/discover' ? 'page' : undefined}
          >
            {item.label}
          </Link>
        ))}
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
        <img src="/favicon-192.png" alt="" width="28" height="28" aria-hidden="true" />
        FitMeet
      </strong>
      <p>发现附近真实生活场景，从兴趣出发，遇见真正聊得来的人。</p>
      <nav aria-label="FitMeet 页脚导航">
        <Link to="/features">产品功能</Link>
        <Link to="/discover">发现</Link>
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
}: {
  distance: number | null | undefined;
  index: number;
  joined: boolean;
  meet: Meet;
  onJoin: () => void;
}) {
  const score = matchScore(meet);
  const tone = ['green', 'orange', 'blue', 'gold'][index % 4];
  const statusLabel = joined ? '已申请' : meet.status === 'matched' ? '匹配中' : '开放加入';
  const resolvedDistance =
    typeof distance === 'number' && Number.isFinite(distance)
      ? `${(distance / 1000).toFixed(1)}km`
      : meet.dist || '附近';

  return (
    <article className={`match-card match-card--${tone}`}>
      <div className="match-card__head">
        <span className="match-card__sport">{sportIcon(meet.sport)}</span>
        <div>
          <h2>{meet.title}</h2>
          <p>青岛 · {resolvedDistance}</p>
        </div>
        <button type="button" aria-label="更多操作">
          ⋯
        </button>
      </div>
      <div className="match-card__meta">
        <span>⌄ {meet.loc || '地点待定'}</span>
        <span>{meet.time || '时间待定'}</span>
      </div>
      <div className="match-card__tags">
        <button type="button" className={joined ? 'is-muted' : 'is-open'} onClick={onJoin}>
          {statusLabel}
        </button>
        <span>{getSportLabel(meet.sport)}</span>
        <span>{meet.level || '轻松'}</span>
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
        <time>{index < 2 ? `${(index + 1) * 10} 分钟前` : `${(index + 1) * 15} 分钟前`}</time>
      </div>
      <div className="match-score" style={{ '--score': `${score}%` } as CSSProperties}>
        <strong>{score}%</strong>
        <span>匹配度</span>
      </div>
    </article>
  );
}

function matchScore(meet: Meet) {
  const base = meet.rating ? Math.round(meet.rating * 18) : 78;
  const slotBoost = meet.maxSlots > 0 ? Math.round((meet.slots / meet.maxSlots) * 8) : 4;
  return Math.max(72, Math.min(96, base + slotBoost));
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

function sportIcon(sport: string) {
  const normalized = normalizeSportGroup(sport);
  const found = sportFilters.find((item) => item.id === normalized);
  return found?.icon ?? '⚡';
}

export default DiscoverPage;
