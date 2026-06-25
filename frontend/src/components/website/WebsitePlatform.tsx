import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Link, useLocation } from 'react-router-dom';
import { waitlistApi, type WaitlistDeviceType } from '../../api/waitlistApi';
import { SiteLink } from '../navigation/SiteLink';
import { EnterpriseHero } from './hero/EnterpriseHero';
import { EnterpriseHeroVisual } from './hero/EnterpriseHeroVisual';
import { websiteHeroConfig } from './hero/hero-config';

const SITE_URL = 'https://ourfitmeet.cn';
const ICP_TEXT = import.meta.env.VITE_ICP_TEXT || '鲁ICP备2026015946号-2';
const ICP_URL = import.meta.env.VITE_ICP_URL || 'http://beian.miit.gov.cn/';
const CONTACT_EMAIL = '15253005312@163.com';

export type WebsitePage =
  | 'home'
  | 'features'
  | 'download'
  | 'safety'
  | 'about'
  | 'demo';

const navItems = [
  { to: '/', label: '首页' },
  { to: '/discover', label: '发现' },
  { to: '/features', label: '产品功能' },
  { to: '/agent', label: 'Agent' },
  { to: '/safety', label: '安全' },
  { to: '/download', label: '下载 App' },
  { to: '/about', label: '关于我们' },
];

const seo: Record<WebsitePage, { title: string; description: string; path: string }> = {
  home: {
    title: 'FitMeet | 用 Agent 完成真实生活里的连接',
    description:
      'FitMeet 是面向真实生活的 Agent 社交产品。用户说出场景，Agent 理解需求、推荐合适的人或活动，并在关键动作前等待用户确认。',
    path: '/',
  },
  features: {
    title: 'FitMeet 产品功能 | Social World 怎么帮助用户社交',
    description:
      '了解 FitMeet Social World 如何用兴趣场景、附近机会、站内聊天、Agent 推荐和确认机制帮助用户自然认识真正聊得来的人。',
    path: '/features',
  },
  download: {
    title: '下载 FitMeet App | Social World Beta',
    description:
      '下载或预约 FitMeet App Beta。iOS 与 Android 入口、二维码占位、Beta 预约和 Agent 体验入口。',
    path: '/download',
  },
  safety: {
    title: 'FitMeet Safety Center | 隐私、确认、审计与撤回',
    description:
      'FitMeet Safety Center 说明隐私、用户确认、审计、撤回、举报、数据删除和敏感数据保护机制。',
    path: '/safety',
  },
  about: {
    title: '关于 FitMeet | Social World',
    description: 'FitMeet 希望让社交回到真实生活，从刷信息流转向由用户需求驱动的真实连接。',
    path: '/about',
  },
  demo: {
    title: 'FitMeet 30 秒 Demo | 免登录理解产品',
    description: '不用登录，30 秒看懂 FitMeet：用户场景、Agent 完成、用户确认和安全边界。',
    path: '/demo',
  },
};

const homeSeo = {
  title: 'FitMeet | 需求流社交，让 Agent 帮你匹配合适的人',
  description:
    'FitMeet 把社交从刷信息流变成需求流。用户说出想认识什么样的人，Agent 基于目标、兴趣、时间、地点和安全边界匹配，并在确认后发布到发现页。',
};

const safetyItems = [
  ['隐私', '精确位置、身体信息、联系方式默认隐藏，只在用户本人界面可见。'],
  ['确认', '发邀请、加入活动、共享位置、更新敏感个人信息前都需要用户确认。'],
  ['审计', 'Agent 的关键判断、工具调用和权限变化保留可回看记录。'],
  ['撤回', '授权、画像信号、活动申请和推荐偏好都可以撤回或关闭。'],
  ['举报', '用户、活动、消息和推荐卡片都提供举报与拉黑入口。'],
  ['数据删除', '账号数据、画像记录、敏感字段和历史活动支持删除请求。'],
];

const enterpriseLoopCopy = [
  '用户先说清楚想找谁、做什么、什么时候方便。',
  'Agent 把需求整理成可发布的约练、交友或搭子卡片。',
  '用兴趣、爱好、地点、时间和安全边界筛选同频用户。',
  '用户确认后再发布到发现页，或发起邀请、私信、加好友。',
  '后续回复、邀请和安全提醒统一回到消息和 Agent 闭环。',
];

const featurePillars = [
  ['需求卡片', '把“想找一个跑步搭子”“想认识同城朋友”“想找旅游搭子”整理成可匹配的公开需求。'],
  ['匹配理由', '每次推荐都说明为什么合适：共同兴趣、时间地点接近、互动节奏和安全边界相容。'],
  ['发现同步', '用户确认发布后，需求会进入发现页，其他同频用户可以看到真实的新卡片和详情页。'],
  ['可控动作', '发布、邀请、加好友、私信和公开位置都先确认；查看、收藏、生成开场白保持轻量。'],
];

const agentCapabilities = [
  ['理解需求', '从自然语言里识别当前目标、互动形式、时间地点、活动偏好和必要边界。'],
  ['生成卡片', '找约练时先生成约练卡，再推荐候选；交友和搭子需求也先沉淀成可确认卡片。'],
  ['筛选候选', '结合个人资料、兴趣爱好、公开需求、距离、时间和安全边界，给出可解释推荐。'],
];

const downloadOptions = [
  ['iOS TestFlight', '内测开放后提供邀请链接，适合第一批体验用户。'],
  ['Android Beta', '预留 Android 测试包入口，部署后接入真实下载地址。'],
  ['Web 发现页', '不安装 App 也可以先进入发现，查看 Social World 的核心体验。'],
];

const appTabs = [
  ['首页', '看到需求进展和下一步'],
  ['发现', '公开需求卡和附近同频用户'],
  ['Agent', '发起需求、补齐画像、确认发布'],
  ['消息', '邀请、私信、好友和对方回复'],
  ['我的', '个人信息、兴趣爱好和安全边界'],
];

export function WebsitePlatform({ page }: { page: WebsitePage }) {
  const location = useLocation();

  useEffect(() => {
    const pageSeo = page === 'home' ? { ...seo.home, ...homeSeo } : seo[page];
    const canonicalUrl = `${SITE_URL}${pageSeo.path}`;
    document.title = pageSeo.title;
    setMetaTag('description', pageSeo.description);
    setMetaProperty('og:title', pageSeo.title);
    setMetaProperty('og:description', pageSeo.description);
    setMetaProperty('og:url', canonicalUrl);
    setMetaTag('twitter:title', pageSeo.title);
    setMetaTag('twitter:description', pageSeo.description);
    setCanonical(canonicalUrl);
  }, [page]);

  useEffect(() => {
    if (!location.hash) return;
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
  }, [location.hash, location.pathname]);

  return (
    <div className="fitmeet-website fm-site fm-enterprise-site">
      <WebsiteNavbar />
      <main>
        {page === 'home' ? <HomePage /> : null}
        {page === 'features' ? <FeaturesPage /> : null}
        {page === 'safety' ? <SafetyCenterPage /> : null}
        {page === 'download' ? <DownloadPage /> : null}
        {page === 'about' ? <AboutContactPage /> : null}
        {page === 'demo' ? <PublicDemoPage /> : null}
      </main>
      <WebsiteFooter />
    </div>
  );
}

export function WebsiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="fitmeet-website fm-site fm-enterprise-site">
      <WebsiteNavbar />
      <main>{children}</main>
      <WebsiteFooter />
    </div>
  );
}

function WebsiteNavbar() {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

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
        aria-controls="fitmeet-website-nav"
        onClick={() => setMenuOpen((open) => !open)}
      >
        {menuOpen ? '关闭菜单' : '打开菜单'}
      </button>
      <nav id="fitmeet-website-nav" aria-label="FitMeet 官网导航">
        {navItems.map((item) => {
          const active =
            item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
          return (
            <SiteLink
              key={item.to}
              to={item.to}
              aria-current={active ? 'page' : undefined}
              onClick={() => setMenuOpen(false)}
            >
              {item.label}
            </SiteLink>
          );
        })}
      </nav>
      <div className="fm-nav__actions">
        <SiteLink to="/discover" className="fm-button fm-button--ghost">
          进入发现
        </SiteLink>
        <Link to="/download" className="fm-button fm-button--primary">
          打开 App
        </Link>
      </div>
    </header>
  );
}

function HomePage() {
  return (
    <>
      <WebsiteHero name="home" />

      <Section
        label="Context"
        title="从问题流、信息流，升级为需求流社交。"
        body="传统社交让用户不停刷人和内容；FitMeet 让用户先表达当前需求，再由 Agent 把需求转换成可匹配、可发布、可确认的社交场景。"
      >
        <figure className="fm-world-story">
          <picture>
            <source
              srcSet="/images/fitmeet/generated/social-world-abstract-720.jpg 720w, /images/fitmeet/generated/social-world-abstract-1200.jpg 1200w"
              sizes="(max-width: 820px) 92vw, 1180px"
            />
            <img
              src="/images/fitmeet/generated/social-world-abstract-1200.jpg"
              alt="FitMeet Social World 抽象连接网络"
              width="1200"
              height="675"
              loading="lazy"
              decoding="async"
            />
          </picture>
          <figcaption>
            每一次连接都从一个具体场景开始：一起做什么、在哪里见、是否先聊清楚。
          </figcaption>
        </figure>
        <div className="fm-context-grid">
          <article className="fm-context-panel">
            <span>Demand</span>
            <h3>先有需求，再有认识的理由。</h3>
            <p>用户可以说“周末想找低强度跑步搭子”“想认识同城羽毛球朋友”“想找旅行搭子”，不需要从陌生人列表硬聊。</p>
          </article>
          <article className="fm-context-panel fm-context-panel--strong">
            <span>Discover</span>
            <h3>发现页展示确认后的真实需求。</h3>
            <p>约练、交友、旅游搭子等需求由 Agent 整理成卡片，用户确认后才公开到发现页，并可以打开详情继续匹配。</p>
          </article>
        </div>
      </Section>

      <AgentConversionBand />

      <Section label="Matching Loop" title="核心不是刷更多人，而是把需求推进到下一步。" tone="deep">
        <div className="fm-enterprise-loop">
          {['说出需求', '生成卡片', '匹配候选', '确认发布', '消息推进'].map((step, index) => (
            <article key={step}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{step}</strong>
              <p>{enterpriseLoopCopy[index]}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section label="Proof" title="安全感不靠长说明，而是出现在每个关键动作旁边。">
        <div className="fm-proof-strip">
          {safetyItems.slice(0, 4).map(([title, body]) => (
            <article key={title}>
              <span>{title}</span>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </Section>

      <section className="fm-final-cta">
        <span>FitMeet App</span>
        <h2>从一个明确需求开始，认识真正聊得来的人。</h2>
        <p>先让 Agent 生成需求卡，确认后进入发现页，再围绕同频用户开始邀请、私信或加好友。</p>
        <div className="fm-actions">
          <SiteLink to="/discover" className="fm-button fm-button--primary">
            进入发现
          </SiteLink>
          <Link to="/download" className="fm-button fm-button--ghost">
            打开 App
          </Link>
        </div>
      </section>
    </>
  );
}

function FeaturesPage() {
  return (
    <>
      <WebsiteHero name="features" />
      <Section
        label="Product"
        title="围绕约练、交友和搭子，把一次社交拆成可执行步骤。"
        body="参考成熟社交产品的推荐流和本地活动组织方式，但 FitMeet 的入口不是无限滑动，而是当前需求：我想认识什么样的人、为什么现在可以开始。"
      >
        <div className="fm-feature-pillars">
          {featurePillars.map(([title, body]) => (
            <article key={title} className="fm-card">
              <span>Feature</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </Section>
      <Section label="Agent" title="Agent 负责理解、生成和筛选，但不替用户越界。" tone="deep">
        <div className="fm-agent-capabilities">
          {agentCapabilities.map(([title, body]) => (
            <article key={title} className="fm-card">
              <span>FitMeet Agent</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </Section>
      <section className="fm-final-cta">
        <span>Try FitMeet</span>
        <h2>先体验一次需求匹配，再进入真实发现页。</h2>
        <p>你可以直接告诉 Agent：想约练、交友还是找搭子，在哪里，什么时间，喜欢什么节奏。</p>
        <div className="fm-actions">
          <Link to="/agent" className="fm-button fm-button--primary">
            体验 Agent
          </Link>
          <SiteLink to="/discover" className="fm-button fm-button--ghost">
            进入发现
          </SiteLink>
        </div>
      </section>
    </>
  );
}

function AgentConversionBand() {
  return (
    <section className="fm-agent-band" aria-label="FitMeet Agent 转化入口">
      <div>
        <span>FitMeet Agent</span>
        <h2>让 Agent 先把需求变成可匹配的卡片。</h2>
        <p>说一句目标，Agent 会整理当前需求、匹配理由和下一步。确认之前，不会发布到发现，也不会替你联系任何人。</p>
      </div>
      <div className="fm-agent-band__actions">
        <Link to="/agent" className="fm-button fm-button--primary">
          体验 Agent
        </Link>
        <Link to="/features" className="fm-button fm-button--ghost">
          看产品功能
        </Link>
      </div>
    </section>
  );
}

function SafetyCenterPage() {
  return (
    <>
      <WebsiteHero name="safety" />
      <Section label="安全机制" title="每个关键动作都要可解释、可确认、可追溯。">
        <div className="fm-safety-grid">
          {safetyItems.map(([title, body]) => (
            <article key={title} className="fm-card">
              <span className="fm-status">Safety</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </Section>
      <Section label="敏感数据" title="默认隐藏，只在本人界面可见。" tone="deep">
        <div className="fm-policy-panel">
          {['身体信息', '精确位置', '联系方式', '活动轨迹', '个人偏好信号'].map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </Section>
      <Section label="治理闭环" title="出现问题时，用户知道该去哪里。">
        <div className="fm-governance">
          {['查看审计记录', '撤回授权', '举报用户或活动', '删除数据请求'].map((item) => (
            <article key={item} className="fm-card">
              <h3>{item}</h3>
              <p>在真实社交产品里，安全入口必须清楚、短路径、可操作，而不是藏在长文档里。</p>
            </article>
          ))}
        </div>
      </Section>
    </>
  );
}

function DownloadPage() {
  return (
    <>
      <WebsiteHero name="download" />
      <Section label="Download" title="iOS、Android 和 Web 发现页先放在同一个下载入口。">
        <div className="fm-download-options">
          {downloadOptions.map(([title, body]) => (
            <article key={title} className="fm-store-card">
              <span>Coming Soon</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </Section>
      <Section label="App Flow" title="用户每天只需要看懂这五个入口。" tone="deep">
        <PhonePreview />
      </Section>
      <Section label="核心截图" title="把复杂匹配能力压缩成三个真实场景。">
        <div className="fm-section-product-visual">
          <EnterpriseHeroVisual variant="features" />
        </div>
      </Section>
      <WaitlistSection />
    </>
  );
}

function AboutContactPage() {
  return (
    <>
      <WebsiteHero name="about" />
      <Section label="Vision" title="不是让用户停留更久，而是让合适的人更自然见面。">
        <div className="fm-about-values">
          {[
            ['需求先行', '用户先表达约练、交友或搭子需求，再进入匹配和发现。'],
            ['安全可信', '公共场所优先、站内先聊、确认后执行是默认原则。'],
            ['Agent 可控', 'AI 可以帮用户整理需求、完善画像和筛选候选，但不替用户越过关键边界。'],
          ].map(([title, body]) => (
            <article key={title} className="fm-card">
              <span>Value</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </Section>
      <Section id="contact" label="Contact" title="商务合作、媒体沟通和安全反馈。">
        <div className="fm-contact-grid">
          {[
            ['商务合作', CONTACT_EMAIL, '品牌合作、城市活动、线下场景合作。'],
            ['媒体沟通', CONTACT_EMAIL, '采访、报道、产品资料和品牌素材。'],
            ['安全反馈', CONTACT_EMAIL, '漏洞、滥用、举报机制和安全建议。'],
          ].map(([title, email, body]) => (
            <article key={title} className="fm-contact-card">
              <span>{title}</span>
              <a href={`mailto:${email}`}>{email}</a>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </Section>
      <section className="fm-final-cta">
        <span>Social World</span>
        <h2>准备好从一个真实需求开始认识人。</h2>
        <p>先体验 Agent 生成需求卡，或者进入发现页看附近已经公开的约练、交友和搭子场景。</p>
        <div className="fm-actions">
          <Link to="/agent" className="fm-button fm-button--primary">
            体验 Agent
          </Link>
          <SiteLink to="/discover" className="fm-button fm-button--ghost">
            进入发现
          </SiteLink>
        </div>
      </section>
    </>
  );
}

function PublicDemoPage() {
  const [step, setStep] = useState(0);
  const demoSteps = useMemo(
    () => [
      {
        title: '用户说出需求',
        body: '今晚想找一个低压力慢跑搭子，不尬聊，最好离我 3km 内。',
      },
      {
        title: 'Agent 生成卡片',
        body: '先整理成约练卡：时间、地点范围、跑步强度、人数、公开范围和安全边界。',
      },
      {
        title: '匹配候选',
        body: '推荐理由：同区域、今晚有空、都偏好轻松运动，适合先站内聊清楚。',
      },
      {
        title: '确认发布',
        body: '用户确认后才会发布到发现页；发送邀请、加好友或私信仍会再次确认。',
      },
    ],
    [],
  );

  return (
    <>
      <WebsiteHero name="demo" />
      <section id="demo-flow" className="fm-demo">
        <div className="fm-demo__rail">
          {demoSteps.map((item, index) => (
            <button
              key={item.title}
              className={clsx(index === step && 'is-active')}
              onClick={() => setStep(index)}
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              {item.title}
            </button>
          ))}
        </div>
        <div className="fm-demo__screen">
          <span>FitMeet Agent</span>
          <h2>{demoSteps[step].title}</h2>
          <p>{demoSteps[step].body}</p>
          <div className="fm-demo__controls">
            <button onClick={() => setStep((value) => Math.max(0, value - 1))}>上一步</button>
            <button onClick={() => setStep((value) => Math.min(demoSteps.length - 1, value + 1))}>
              下一步
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

function PhonePreview() {
  return (
    <div className="fm-phone-wrap">
      <div className="fm-phone" aria-label="FitMeet App 5 Tab 预览">
        <div className="fm-phone__top">
          <span>FitMeet</span>
          <small>Beta</small>
        </div>
        <div className="fm-phone__prompt">今晚想找低压力慢跑搭子，不尬聊，轻松一点</div>
        <div className="fm-phone__cards">
          <article>
            <strong>需求卡已生成</strong>
            <p>同区域 · 今晚有空 · 强度匹配</p>
          </article>
          <article>
            <strong>确认后发布到发现</strong>
            <p>公共场所 · 站内先聊 · 可撤回</p>
          </article>
        </div>
        <div className="fm-phone__tabs">
          {appTabs.map(([tab, body]) => (
            <span key={tab} title={body}>
              {tab}
            </span>
          ))}
        </div>
      </div>
      <div className="fm-app-tabs">
        {appTabs.map(([tab, body]) => (
          <article key={tab} className="fm-card">
            <h3>{tab}</h3>
            <p>{body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function WaitlistSection() {
  const [email, setEmail] = useState('');
  const [deviceType, setDeviceType] = useState<WaitlistDeviceType>('ios');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim()) return;
    setStatus('loading');
    try {
      await waitlistApi.submitApp({
        email,
        country: 'China',
        city: 'Shanghai',
        preferredLanguage: 'zh-CN',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        deviceType,
        scenarios: ['agent_social'],
        interests: ['fitmeet_app_beta'],
        userRole: 'fitness_user',
        interviewWilling: true,
        source: 'public_app_preview',
      });
      setEmail('');
      setStatus('success');
    } catch {
      setStatus('error');
    }
  };

  return (
    <Section label="Beta 预约" title="加入第一批移动端体验。" id="waitlist">
      <form className="fm-form" onSubmit={handleSubmit}>
        <label>
          邮箱
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </label>
        <label>
          设备
          <select
            value={deviceType}
            onChange={(event) => setDeviceType(event.target.value as WaitlistDeviceType)}
          >
            <option value="ios">iOS</option>
            <option value="android">Android</option>
            <option value="both">都可以</option>
          </select>
        </label>
        <button
          className="fm-button fm-button--primary"
          type="submit"
          disabled={status === 'loading'}
        >
          {status === 'loading' ? '提交中' : '预约 Beta'}
        </button>
        <p aria-live="polite">
          {status === 'success' ? '已预约，我们会在 Beta 开放时联系你。' : null}
          {status === 'error' ? '暂时提交失败，请稍后再试。' : null}
        </p>
      </form>
    </Section>
  );
}

function WebsiteHero({ name }: { name: keyof typeof websiteHeroConfig }) {
  const config = websiteHeroConfig[name];
  const layout = 'layout' in config ? config.layout : undefined;
  const visual = 'visual' in config ? config.visual : undefined;

  return (
    <EnterpriseHero
      actions={config.actions}
      description={config.description}
      eyebrow={config.eyebrow}
      layout={layout}
      proofItems={config.proofItems}
      title={config.title}
      visual={visual ? <EnterpriseHeroVisual variant={visual} /> : undefined}
    />
  );
}

function Section({
  body,
  children,
  id,
  label,
  title,
  tone,
}: {
  body?: string;
  children: ReactNode;
  id?: string;
  label: string;
  title: string;
  tone?: 'deep';
}) {
  return (
    <section id={id} className={clsx('fm-section', tone === 'deep' && 'fm-section--deep')}>
      <div className="fm-section__header">
        <span>{label}</span>
        <h2>{title}</h2>
        {body ? <p>{body}</p> : null}
      </div>
      {children}
    </section>
  );
}

function WebsiteFooter() {
  return (
    <footer className="fm-footer">
      <strong>
        <img src="/favicon-192.png" alt="FitMeet" width="28" height="28" />
        FitMeet
      </strong>
      <p>需求流社交，从一个明确需求开始，遇见真正合适的人。</p>
      <nav aria-label="FitMeet 页脚导航">
        <Link to="/features">产品功能</Link>
        <SiteLink to="/discover">发现</SiteLink>
        <Link to="/agent">Agent</Link>
        <Link to="/safety">安全</Link>
        <Link to="/download">下载 App</Link>
        <Link to="/about">关于我们</Link>
        <Link to="/privacy">隐私政策</Link>
        <Link to="/terms">用户协议</Link>
        <a href={ICP_URL} target="_blank" rel="noreferrer">
          {ICP_TEXT}
        </a>
      </nav>
    </footer>
  );
}

function setMetaTag(name: string, content: string) {
  let tag = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.name = name;
    document.head.appendChild(tag);
  }
  tag.content = content;
}

function setMetaProperty(property: string, content: string) {
  let tag = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute('property', property);
    document.head.appendChild(tag);
  }
  tag.content = content;
}

function setCanonical(href: string) {
  let tag = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!tag) {
    tag = document.createElement('link');
    tag.rel = 'canonical';
    document.head.appendChild(tag);
  }
  tag.href = href;
}
