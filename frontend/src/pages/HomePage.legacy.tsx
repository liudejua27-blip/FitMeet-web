import { memo, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { SiteLink } from '../components/navigation/SiteLink';
import {
  SPORT_TAXONOMY,
  getSportFilterLabel,
  type SportTaxonomyNode,
} from '../data/taxonomy';
import { useAuthStore } from '../stores';
import * as dataService from '../services/dataService';
import type { Meet, Post } from '../types';
import {
  filterDisplayableMeets,
  filterDisplayablePosts,
} from '../data/mockContent';
import { UniversePortal } from '../components/portal/UniversePortal';

const featuredOutdoor = SPORT_TAXONOMY.find((item) => item.id === 'outdoor')!;
const quickSports = SPORT_TAXONOMY.slice(0, 10);

const communityModes = [
  {
    id: 'meet',
    title: '约练',
    english: 'Meetups',
    desc: '发现或发起线下运动局，按时间、地点、人数和安全信息快速判断。',
    image: '/images/fitmeet/generated/match-run-ai.webp',
    tags: ['公开活动', '群组约练', '线下见面'],
    href: '/discover',
  },
  {
    id: 'log',
    title: '动态',
    english: 'Posts',
    desc: '分享训练日常、路线记录和阶段变化，让关系从内容里自然升温。',
    image: '/images/fitmeet/generated/match-yoga-ai.webp',
    tags: ['关注', '推荐', '同城'],
    href: '/discover',
  },
  {
    id: 'help',
    title: '其他求助',
    english: 'Find Help',
    desc: '找临时伙伴、装备建议、路线协助或小众兴趣同伴，不再塞进普通动态。',
    image: '/images/fitmeet/generated/match-ball-ai.webp',
    tags: ['技能互助', '装备分享', '生活协助'],
    href: '/discover',
  },
] as const;

const customExamples = [
  { title: '飞盘高尔夫', meta: '1,286 位同好', image: '/images/fitmeet/generated/match-ball-ai.webp' },
  { title: '城市探索', meta: '2,341 位同好', image: '/images/fitmeet/generated/match-run-ai.webp' },
  { title: '匹克球', meta: '978 位同好', image: '/images/fitmeet/generated/match-gym-ai.webp' },
  { title: '徒步摄影', meta: '1,543 位同好', image: '/images/fitmeet/generated/match-yoga-ai.webp' },
] as const;

const trustSignals = [
  { title: '真实身份认证', desc: '头像、资料、互评和认证状态帮助你先判断再开聊。' },
  { title: '内容审核机制', desc: '求助、动态和约练内容统一经过安全规则检查。' },
  { title: '举报与反馈通道', desc: '异常邀请可以举报、拉黑，并保留安全处理记录。' },
  { title: '隐私保护', desc: '私信、位置和行程信息按场景逐步披露。' },
] as const;

export const HomePage = memo(function HomePage() {
  const { isLoggedIn, openLogin } = useAuthStore();
  const [latestPosts, setLatestPosts] = useState<Post[]>(() => filterDisplayablePosts([]));
  const [latestMeets, setLatestMeets] = useState<Meet[]>(() => filterDisplayableMeets([]));

  useEffect(() => {
    let active = true;
    Promise.all([
      dataService.getFeed({ page: 1, pageSize: 4 }).catch(() => [] as Post[]),
      dataService.getMeets().catch(() => [] as Meet[]),
    ]).then(([posts, meets]) => {
      if (!active) return;
      setLatestPosts(filterDisplayablePosts(posts, 4));
      setLatestMeets(filterDisplayableMeets(meets, 4));
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="overflow-hidden bg-[#080807] text-cream">
      <UniversePortal />
      <HeroSection isLoggedIn={isLoggedIn} latestMeets={latestMeets} latestPosts={latestPosts} onLogin={openLogin} />
      <TaxonomyBrowser featured={featuredOutdoor} />
      <CommunityModes />
      <CustomCategorySection />
      <TrustAndCta isLoggedIn={isLoggedIn} onLogin={openLogin} />
    </div>
  );
});

const HeroSection = memo(function HeroSection({
  isLoggedIn,
  latestMeets,
  latestPosts,
  onLogin,
}: {
  isLoggedIn: boolean;
  latestMeets: Meet[];
  latestPosts: Post[];
  onLogin: () => void;
}) {
  return (
    <section className="relative min-h-[720px] px-4 pb-14 pt-8 sm:px-6 lg:px-8">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_14%_18%,rgba(255,106,0,0.18),transparent_22%),radial-gradient(circle_at_78%_28%,rgba(22,199,132,0.12),transparent_18%),linear-gradient(180deg,#0f0e0b_0%,#080807_100%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:76px_76px] [mask-image:linear-gradient(180deg,rgba(0,0,0,0.95),transparent_88%)]"
      />

      <div className="relative mx-auto grid max-w-7xl gap-8 pt-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
        <div className="max-w-2xl">
          <h1 className="font-display text-[clamp(38px,10.4vw,92px)] font-black leading-[0.98] text-white">
            让运动
            <span className="block">从一个人的坚持</span>
            <span className="block text-[#ff6a00]">变成一群人的势能</span>
          </h1>
          <p className="mt-5 inline-flex rounded-xl border border-[#ffcf9f]/35 bg-[#ff6a00]/12 px-4 py-2 text-sm font-black text-[#ffd8b7]">
            全国城市运动约练入口
          </p>
          <p className="mt-6 max-w-xl text-base font-semibold leading-8 text-[#e5d2bd]">
            找到附近的运动搭子，发现开放的约练活动，创建你的专属分类，或者在「其他求助」发布需求，总有人愿意和你一起出发。
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <SiteLink to="/discover"
              className="inline-flex items-center justify-center rounded-xl bg-[#ff6a00] px-7 py-4 text-sm font-black text-white shadow-[0_18px_45px_rgba(255,106,0,0.32)] transition hover:bg-[#ff8126]"
            >
              开始探索
            </SiteLink>
            <button
              className="inline-flex items-center justify-center rounded-xl border border-[#ffcf9f]/55 bg-black/20 px-7 py-4 text-sm font-black text-[#ffe3cc] transition hover:border-[#ff6a00] hover:text-white"
              onClick={onLogin}
              type="button"
            >
              {isLoggedIn ? '发布我的需求' : '加入 FitMeet'}
            </button>
          </div>

          <div className="mt-8 flex items-center gap-3">
            <div className="flex -space-x-2">
              {['/images/fitmeet/generated/avatar-run-ai.webp', '/images/fitmeet/generated/avatar-yoga-ai.webp', '/images/fitmeet/generated/avatar-gym-ai.webp', '/images/fitmeet/generated/avatar-ball-ai.webp'].map((image) => (
                <img key={image} alt="" className="h-10 w-10 rounded-full border-2 border-[#080807] object-cover" src={image} />
              ))}
            </div>
            <p className="text-xs font-bold leading-5 text-[#b9a895]">多地运动爱好者正在这里连接</p>
          </div>
        </div>

        <HeroCollage latestMeets={latestMeets} latestPosts={latestPosts} />
      </div>
    </section>
  );
});

const HeroCollage = memo(function HeroCollage({
  latestMeets,
  latestPosts,
}: {
  latestMeets: Meet[];
  latestPosts: Post[];
}) {
  const activePeople = latestPosts.slice(0, 3);
  const featuredMeet = latestMeets[0];
  const featuredHelp = latestPosts.find((post) => post.type === 'help') ?? latestPosts[0];

  return (
    <div className="grid gap-5 lg:grid-cols-[0.92fr_1.08fr]">
      <div className="space-y-5 lg:pt-6">
        <HeroPanel title="附近的搭子" action="查看全部">
          <div className="space-y-3">
            {activePeople.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.05] p-3">
                <img alt="" className="h-12 w-12 rounded-xl object-cover" src={item.images?.[0]?.url || '/images/fitmeet/generated/avatar-run-ai.webp'} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-black text-white">{item.username}</div>
                  <div className="truncate text-xs font-bold text-[#b8a692]">{item.dist || '附近'} | {item.city || item.loc || '同城'}</div>
                </div>
                <span className="h-2 w-2 rounded-full bg-mint" />
              </div>
            ))}
          </div>
        </HeroPanel>

        <HeroPanel title="快速分类" action="全部分类">
          <div className="grid grid-cols-3 gap-2">
            {quickSports.slice(0, 6).map((sport) => (
              <SiteLink
                key={sport.id}
                to={`/discover?category=${sport.id}`}
                className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-black text-[#e8d5bf] transition hover:border-[#ff6a00]/60 hover:text-white"
              >
                <span className="mr-1">{sport.icon}</span>
                {sport.label}
              </SiteLink>
            ))}
          </div>
        </HeroPanel>
      </div>

      <div className="space-y-5">
        <HeroPanel title="开放约练" action="更多活动">
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#16120f]">
            <img alt="" className="h-52 w-full object-cover opacity-[0.88]" src="/images/fitmeet/generated/match-run-ai.webp" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_22%,rgba(0,0,0,0.78)_100%)]" />
            <div className="absolute bottom-4 left-4 right-4">
              <div className="font-display text-xl font-black text-white">{featuredMeet?.title || '开放约练'}</div>
              <div className="mt-2 text-xs font-bold text-[#dfc7ae]">
                {featuredMeet?.time || '时间待定'} · {featuredMeet ? `${featuredMeet.slots}/${featuredMeet.maxSlots} 人` : '名额待定'} · {featuredMeet?.level || '全部'}
              </div>
            </div>
          </div>
        </HeroPanel>

        <div className="rounded-[26px] border border-[#ff6a00]/75 bg-[radial-gradient(circle_at_100%_0%,rgba(255,106,0,0.25),transparent_35%),rgba(255,106,0,0.08)] p-5 shadow-[0_0_46px_rgba(255,106,0,0.24)]">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-black text-white">其他求助</h2>
            <SiteLink to="/discover" className="text-xs font-black text-[#ffd2aa]">更多求助</SiteLink>
          </div>
          <div className="mt-4 rounded-2xl border border-white/10 bg-[#11100d]/88 p-4">
            <div className="flex items-center gap-3">
              <img alt="" className="h-11 w-11 rounded-xl object-cover" src="/images/fitmeet/generated/avatar-ball-ai.webp" />
              <div>
                <div className="text-sm font-black text-white">{featuredHelp?.username || '小鱼同学'}</div>
                <div className="text-xs font-bold text-[#b8a692]">{featuredHelp?.dist || '附近'} · {featuredHelp?.city || '同城'}</div>
              </div>
              <span className="ml-auto rounded-lg bg-[#ff8a1f]/20 px-3 py-1 text-xs font-black text-[#ffb36e]">帮忙</span>
            </div>
            <h3 className="mt-4 text-lg font-black leading-snug text-white">{featuredHelp?.title || '求一位会看器械线的伙伴'}</h3>
            <p className="mt-2 text-sm font-semibold leading-7 text-[#cbb7a1]">
              {featuredHelp?.text || '想去陌生商场健身房，但不太熟悉器械线规划，希望找一位有经验的伙伴一起研究下行程。'}
            </p>
          </div>
        </div>

        <SiteLink to="/discover"
          className="block rounded-[22px] border border-mint/30 bg-mint/[0.1] p-5 text-sm font-black text-mint transition hover:border-mint/60 hover:bg-mint/[0.14]"
        >
          自定义品类入口 · 让小众兴趣也能被看见
        </SiteLink>
      </div>
    </div>
  );
});

const TaxonomyBrowser = memo(function TaxonomyBrowser({ featured }: { featured: SportTaxonomyNode }) {
  const selected = featured.subcategories[0];

  return (
    <section className="border-y border-white/10 bg-[#0a0a08] px-4 py-14 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-7 max-w-3xl">
          <h2 className="font-display text-[clamp(34px,5vw,62px)] font-black leading-tight text-white">
            分类系统 · <span className="text-[#f5d5b5]">探索更完整的运动世界</span>
          </h2>
          <p className="mt-4 text-sm font-semibold leading-7 text-[#b9a895]">
            从大类到场景、装备、强度和安全要求，帮你更快找到同频的人和合适的活动。
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[180px_minmax(0,1fr)_420px]">
          <nav className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
            {SPORT_TAXONOMY.map((sport) => (
              <SiteLink
                key={sport.id}
                to={`/discover?category=${sport.id}`}
                className={`flex items-center justify-between border-b border-white/10 px-4 py-3 text-sm font-black transition last:border-b-0 ${
                  sport.id === featured.id ? 'bg-[#ff6a00] text-white' : 'text-[#d8c5af] hover:bg-white/[0.06]'
                }`}
              >
                <span><span className="mr-2">{sport.icon}</span>{sport.label}</span>
                <span>›</span>
              </SiteLink>
            ))}
          </nav>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <div className="flex items-baseline gap-3">
              <h3 className="font-display text-3xl font-black text-white">{featured.label}</h3>
              <span className="text-sm font-bold text-[#b9a895]">{featured.englishLabel}</span>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {featured.subcategories.map((sub) => (
                <article
                  key={sub.id}
                  className={`min-h-32 rounded-2xl border bg-[#11100d] p-4 ${
                    sub.id === selected.id ? 'border-[#ff6a00] shadow-[0_0_28px_rgba(255,106,0,0.22)]' : 'border-white/10'
                  }`}
                >
                  <div className="text-lg font-black text-white">{sub.label}</div>
                  <div className="mt-1 text-xs font-bold text-[#b9a895]">{sub.englishLabel}</div>
                  <p className="mt-4 text-xs font-semibold leading-5 text-[#d0bea8]">{sub.scenarioTags.join(' · ')}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <div className="font-display text-2xl font-black text-white">{selected.label}</div>
            <div className="mt-5 space-y-3">
              <InfoRow label="场景" value={selected.scenarioTags.join(' / ')} />
              <InfoRow label="强度等级" value={selected.riskLevel === 'low' ? '低风险' : selected.riskLevel === 'medium' ? '中风险' : '高风险'} />
              <InfoRow label="所需装备" value={selected.equipmentTags.join(' / ')} />
              <InfoRow label="是否需要场馆" value={selected.needsVenue ? '需要' : '不需要'} />
              <InfoRow label="是否需要教练" value={selected.needsCoach ? '建议' : '不需要'} />
            </div>
            <SiteLink to={`/discover?category=${featured.id}`}
              className="mt-5 flex items-center justify-center rounded-xl bg-[#ff6a00] px-5 py-3 text-sm font-black text-white transition hover:bg-[#ff8126]"
            >
              查看{selected.label}的相关约练
            </SiteLink>
          </div>
        </div>
      </div>
    </section>
  );
});

const CommunityModes = memo(function CommunityModes() {
  return (
    <section className="bg-[#0d0b08] px-4 py-14 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <h2 className="font-display text-[clamp(34px,5vw,62px)] font-black text-white">三种社区模式 · 连接不同需求</h2>
        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {communityModes.map((mode) => (
            <SiteLink
              key={mode.id}
              to={mode.href}
              className="group rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.035))] p-5 transition hover:-translate-y-1 hover:border-[#ff6a00]/55"
            >
              <div className="flex items-baseline gap-2">
                <h3 className="font-display text-3xl font-black text-white">{mode.title}</h3>
                <span className="text-sm font-bold text-[#ffb36e]">{mode.english}</span>
              </div>
              <p className="mt-3 text-sm font-semibold leading-7 text-[#c7b49f]">{mode.desc}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {mode.tags.map((tag) => (
                  <span key={tag} className="rounded-lg bg-[#ff6a00]/12 px-3 py-1.5 text-xs font-black text-[#ffb36e]">
                    {tag}
                  </span>
                ))}
              </div>
              <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
                <img alt="" className="h-48 w-full object-cover transition duration-500 group-hover:scale-[1.04]" src={mode.image} />
              </div>
            </SiteLink>
          ))}
        </div>
      </div>
    </section>
  );
});

const CustomCategorySection = memo(function CustomCategorySection() {
  return (
    <section className="bg-[#080807] px-4 py-14 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-6 rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,106,0,0.09),rgba(255,255,255,0.035))] p-5 md:p-7 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div>
          <h2 className="font-display text-[clamp(30px,4vw,48px)] font-black leading-tight text-white">
            自定义分类
            <span className="block text-[#ffb36e]">让小众兴趣被看见</span>
          </h2>
          <p className="mt-4 text-sm font-semibold leading-7 text-[#c7b49f]">
            创建你专属的运动兴趣分类，吸引同好、组织活动，建立属于你的小圈子。
          </p>
          <SiteLink to="/discover"
            className="mt-6 inline-flex rounded-xl bg-[#ff6a00] px-6 py-3 text-sm font-black text-white transition hover:bg-[#ff8126]"
          >
            创建我的分类
          </SiteLink>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {customExamples.map((item) => (
            <article key={item.title} className="overflow-hidden rounded-2xl border border-white/10 bg-[#11100d]">
              <img alt="" className="h-36 w-full object-cover" src={item.image} />
              <div className="p-4">
                <h3 className="font-black text-white">{item.title}</h3>
                <p className="mt-1 text-xs font-bold text-[#b9a895]">{item.meta}</p>
                <div className="mt-3 text-xs font-black text-[#ffb36e]">{getSportFilterLabel('other')}</div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
});

const TrustAndCta = memo(function TrustAndCta({
  isLoggedIn,
  onLogin,
}: {
  isLoggedIn: boolean;
  onLogin: () => void;
}) {
  return (
    <section className="bg-[#080807] px-4 pb-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-[30px] border border-white/10 bg-[#120d09]">
        <div className="grid gap-6 p-6 lg:grid-cols-[1fr_360px] lg:p-8">
          <div>
            <div className="flex flex-wrap gap-3">
              {trustSignals.map((item) => (
                <article key={item.title} className="min-w-[220px] flex-1 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <h3 className="font-black text-white">{item.title}</h3>
                  <p className="mt-2 text-xs font-semibold leading-6 text-[#b9a895]">{item.desc}</p>
                </article>
              ))}
            </div>

            <div className="mt-8 flex flex-col gap-5 border-t border-white/10 pt-8 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="font-display text-[clamp(30px,4vw,52px)] font-black leading-tight text-white">
                  准备好找到你的运动搭子了吗？
                </h2>
                <p className="mt-3 text-sm font-semibold text-[#c7b49f]">
                  加入 FitMeet，让每一次出发，都有人同行。
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  className="rounded-xl bg-[#ff6a00] px-7 py-3.5 text-sm font-black text-white transition hover:bg-[#ff8126]"
                  onClick={onLogin}
                  type="button"
                >
                  {isLoggedIn ? '立即探索' : '立即加入'}
                </button>
                <SiteLink to="/discover"
                  className="rounded-xl border border-white/15 bg-white/[0.05] px-7 py-3.5 text-sm font-black text-white transition hover:border-white/30"
                >
                  浏览约练
                </SiteLink>
              </div>
            </div>
          </div>

          <div className="relative min-h-64 overflow-hidden rounded-2xl border border-white/10">
            <img alt="" className="absolute inset-0 h-full w-full object-cover" src="/images/fitmeet/generated/login-stage-city-sunlight.webp" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.06),rgba(0,0,0,0.72))]" />
            <div className="absolute bottom-5 left-5 right-5">
              <div className="text-4xl font-display font-black text-mint">多场景</div>
              <div className="mt-1 text-xs font-bold text-[#e7d5bf]">运动搭子、约练和互助入口</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});

const HeroPanel = memo(function HeroPanel({
  action,
  children,
  title,
}: {
  action: string;
  children: ReactNode;
  title: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.055] p-5 shadow-[0_28px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="font-display text-lg font-black text-white">{title}</h2>
        <span className="text-xs font-bold text-[#b8a692]">{action}</span>
      </div>
      {children}
    </div>
  );
});

const InfoRow = memo(function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[86px_minmax(0,1fr)] gap-3 rounded-xl border border-white/10 bg-[#11100d] px-4 py-3 text-sm">
      <span className="font-black text-[#ffb36e]">{label}</span>
      <span className="font-semibold text-[#ddcbb5]">{value}</span>
    </div>
  );
});
