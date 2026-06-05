import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Link, useLocation } from 'react-router-dom';
import { waitlistApi, type WaitlistDeviceType } from '../../api/waitlistApi';

const EARTH_ASSET = '/images/fitmeet/concept-earth-asia.png';
const EARTH_WEBP_SRCSET =
  '/images/fitmeet/concept-earth-asia-960.webp 960w, /images/fitmeet/concept-earth-asia-1400.webp 1400w';
const SITE_URL = 'https://ourfitmeet.cn';
const ICP_TEXT = import.meta.env.VITE_ICP_TEXT || '鲁ICP备2026015946号-2';
const ICP_URL = import.meta.env.VITE_ICP_URL || 'http://beian.miit.gov.cn/';

export type WebsitePage =
  | 'home'
  | 'ecosystem'
  | 'app'
  | 'developers'
  | 'safety'
  | 'about'
  | 'lifeGraph'
  | 'demo';

type Action = {
  label: string;
  to: string;
  variant?: 'primary' | 'secondary';
};

type InfoPage = {
  title: string;
  body: string;
  actions: Action[];
  sections: {
    label: string;
    title: string;
    body: string;
  }[];
};

const navItems = [
  { to: '/', label: '首页' },
  { to: '/demo', label: '30 秒 Demo' },
  { to: '/app', label: 'App' },
  { to: '/safety', label: 'Safety Center' },
  { to: '/agent', label: 'Agent' },
];

const seo: Record<WebsitePage, { title: string; description: string; path: string }> = {
  home: {
    title: 'FitMeet | 用 Agent 完成真实生活里的连接',
    description:
      'FitMeet 是面向真实生活的 Agent 社交产品。用户说出场景，Agent 理解需求、推荐合适的人或活动，并在关键动作前等待用户确认。',
    path: '/',
  },
  ecosystem: {
    title: 'FitMeet | 从信息流到需求流社交',
    description:
      '了解 FitMeet 如何把同城社交、约练和找搭子的真实需求变成可解释、可确认、可执行的连接流程。',
    path: '/ecosystem',
  },
  app: {
    title: 'FitMeet App | Beta 预约',
    description:
      '预约 FitMeet App Beta，体验移动端 5 Tab、附近机会、Agent 发起需求、安全确认和活动闭环。',
    path: '/app',
  },
  developers: {
    title: 'FitMeet Developers | Agent 接入预告',
    description: 'FitMeet 开发者能力将围绕权限、确认、审计和真实生活社交工具开放。',
    path: '/developers',
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
  lifeGraph: {
    title: 'FitMeet Life Graph | 用户可控画像',
    description:
      'Life Graph 在用户授权下帮助 Agent 理解节奏、偏好和边界，并保持可编辑、可撤回、可审计。',
    path: '/life-graph',
  },
  demo: {
    title: 'FitMeet 30 秒 Demo | 免登录理解产品',
    description: '不用登录，30 秒看懂 FitMeet：用户场景、Agent 完成、用户确认和安全边界。',
    path: '/demo',
  },
};

const scenes = [
  {
    scene: '今晚想慢跑，但不想尬聊',
    agent: 'Agent 询问距离、强度和社交边界，推荐 2 位低压力跑步搭子。',
    safe: '只展示模糊区域；发送邀请前必须确认。',
  },
  {
    scene: '周末想找自然一点的活动',
    agent: 'Agent 按时间、地点和社交偏好筛选可加入活动。',
    safe: '活动详情包含地点风险、报名状态和举报入口。',
  },
  {
    scene: '最近想认识更同频的人',
    agent: 'Agent 解释匹配理由：运动类型、生活节奏、聊天方式和边界。',
    safe: '身体信息、精确位置和联系方式默认隐藏。',
  },
];

const safetyItems = [
  ['隐私', '精确位置、身体信息、联系方式默认隐藏，只在用户本人界面可见。'],
  ['确认', '发邀请、加入活动、共享位置、写入 Life Graph 前都需要用户确认。'],
  ['审计', 'Agent 的关键判断、工具调用和权限变化保留可回看记录。'],
  ['撤回', '授权、画像信号、活动申请和推荐偏好都可以撤回或关闭。'],
  ['举报', '用户、活动、消息和推荐卡片都提供举报与拉黑入口。'],
  ['数据删除', '账号数据、画像记录、敏感字段和历史活动支持删除请求。'],
];

const appTabs = [
  ['首页', '今天适合发起什么需求'],
  ['附近', '人、活动和地点按场景组织'],
  ['Agent', '一句话发起需求和确认动作'],
  ['消息', '低压力开场、邀请、活动确认'],
  ['我的', 'Life Graph、隐私开关和安全记录'],
];

const infoPages: Partial<Record<WebsitePage, InfoPage>> = {
  ecosystem: {
    title: '从刷信息流，变成说出真实需求。',
    body: 'FitMeet 的核心不是展示更多模块，而是把用户的真实场景变成 Agent 可以完成的社交任务。',
    actions: [
      { label: '看 30 秒 Demo', to: '/demo', variant: 'primary' },
      { label: '进入 Agent', to: '/agent' },
    ],
    sections: [
      {
        label: '用户场景',
        title: '用户不想研究功能，只想完成一件事。',
        body: '想跑步、想参加活动、想认识附近同频的人，这些才是产品入口。',
      },
      {
        label: 'Agent 完成',
        title: 'Agent 负责理解、筛选、解释和准备下一步。',
        body: 'FitMeet 把时间、地点、运动类型、社交偏好和安全边界整理成可执行动作。',
      },
      {
        label: '为什么安全',
        title: '关键动作不自动执行。',
        body: 'Agent 可以建议，但发邀请、加入活动、共享敏感信息都必须由用户确认。',
      },
    ],
  },
  about: {
    title: 'FitMeet 让社交回到真实生活。',
    body: '我们不想做一个让人停留更久的信息流，而是做一个让合适的人更自然见面的 Social World。',
    actions: [
      { label: '了解 Safety Center', to: '/safety', variant: 'primary' },
      { label: '预约 App Beta', to: '/app#waitlist' },
    ],
    sections: [
      {
        label: '方向',
        title: '需求流社交',
        body: '用户先说出真实需求，系统围绕需求组织人、活动和地点。',
      },
      {
        label: '边界',
        title: 'Agent 不是替你社交',
        body: 'Agent 只帮助你更好地做决定，最终动作仍由你确认。',
      },
      {
        label: '长期',
        title: 'Social World',
        body: '让真实世界里的关系、活动和城市生活被更好地连接。',
      },
    ],
  },
  lifeGraph: {
    title: 'Life Graph 是用户可控的后台画像。',
    body: '它帮助 Agent 理解你的节奏、偏好和边界，但不把敏感数据直接暴露给别人。',
    actions: [
      { label: '查看安全原则', to: '/safety', variant: 'primary' },
      { label: '进入 Agent', to: '/agent' },
    ],
    sections: [
      {
        label: '可编辑',
        title: '画像不是黑箱。',
        body: '兴趣、节奏、区域偏好和社交边界都应该可查看、可调整。',
      },
      {
        label: '需确认',
        title: '写入重要画像前先确认。',
        body: '当 Agent 需要更新用户画像，应该弹出确认，不应静默写入数据库。',
      },
      {
        label: '可撤回',
        title: '用户可以关闭或删除画像信号。',
        body: 'FitMeet 的画像价值来自信任，而不是不可控的数据积累。',
      },
    ],
  },
  developers: {
    title: '开发者能力会围绕安全边界开放。',
    body: '未来外部 Agent 或工具接入 FitMeet 时，必须遵守权限、确认、审计和撤回机制。',
    actions: [
      { label: '查看开发者页', to: '/developers/social-skills', variant: 'primary' },
      { label: '看 Safety Center', to: '/safety' },
    ],
    sections: [
      {
        label: '权限',
        title: '工具能力按范围开放。',
        body: '读取候选、生成建议、发送邀请和创建活动需要不同授权级别。',
      },
      {
        label: '审计',
        title: '每次关键调用都有记录。',
        body: '开发者工具不能成为越权执行的捷径。',
      },
      {
        label: '撤回',
        title: '授权必须可撤回。',
        body: '用户和平台都需要能中止不合适的工具访问。',
      },
    ],
  },
};

export function WebsitePlatform({ page }: { page: WebsitePage }) {
  const location = useLocation();

  useEffect(() => {
    const pageSeo = seo[page];
    const canonicalUrl = `${SITE_URL}${pageSeo.path}`;
    document.title = pageSeo.title;
    setMetaTag('description', pageSeo.description);
    setMetaProperty('og:title', pageSeo.title);
    setMetaProperty('og:description', pageSeo.description);
    setMetaProperty('og:url', canonicalUrl);
    setCanonical(canonicalUrl);
  }, [page]);

  useEffect(() => {
    if (!location.hash) return;
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
  }, [location.hash, location.pathname]);

  return (
    <div className="fitmeet-website fm-site">
      <WebsiteNavbar />
      <main>
        {page === 'home' ? <HomePage /> : null}
        {page === 'safety' ? <SafetyCenterPage /> : null}
        {page === 'app' ? <AppPreviewPage /> : null}
        {page === 'demo' ? <PublicDemoPage /> : null}
        {page !== 'home' && page !== 'safety' && page !== 'app' && page !== 'demo' ? (
          <InfoPageView page={page} />
        ) : null}
      </main>
      <WebsiteFooter />
    </div>
  );
}

export function WebsiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="fitmeet-website fm-site">
      <WebsiteNavbar />
      <main>{children}</main>
      <WebsiteFooter />
    </div>
  );
}

function WebsiteNavbar() {
  const location = useLocation();

  return (
    <header className="fm-nav">
      <Link to="/" className="fm-brand" aria-label="FitMeet 首页">
        <span>F</span>
        <strong>FitMeet</strong>
      </Link>
      <nav aria-label="FitMeet 官网导航">
        {navItems.map((item) => {
          const active =
            item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
          return (
            <Link key={item.to} to={item.to} aria-current={active ? 'page' : undefined}>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="fm-nav__actions">
        <Link to="/app#waitlist" className="fm-button fm-button--ghost">
          Beta 预约
        </Link>
        <Link to="/demo" className="fm-button fm-button--primary">
          30 秒 Demo
        </Link>
      </div>
    </header>
  );
}

function HomePage() {
  return (
    <>
      <section className="fm-hero">
        <div className="fm-hero__media" aria-hidden="true">
          <picture>
            <source
              type="image/webp"
              srcSet={EARTH_WEBP_SRCSET}
              sizes="(max-width: 900px) 100vw, 70vw"
            />
            <img src={EARTH_ASSET} alt="" decoding="async" />
          </picture>
        </div>
        <div className="fm-hero__copy">
          <h1>说出你想完成的连接。</h1>
          <p>
            FitMeet 不是让你研究一堆功能。你只需要说出真实生活里的场景，Agent
            会帮你理解需求、筛选合适的人或活动，并在关键动作前等待你确认。
          </p>
          <div className="fm-actions">
            <Link to="/demo" className="fm-button fm-button--primary">
              30 秒看懂 FitMeet
            </Link>
            <Link to="/safety" className="fm-button fm-button--ghost">
              为什么安全
            </Link>
          </div>
        </div>
      </section>

      <Section
        label="新的信息架构"
        title="用户场景 -> Agent 怎么完成 -> 为什么安全"
        body="官网只讲一件事：用户在真实生活里想完成什么，FitMeet Agent 如何帮他走到下一步，以及平台为什么不会越过用户边界。"
      >
        <div className="fm-flow-grid">
          {scenes.map((item) => (
            <article key={item.scene} className="fm-card fm-flow-card">
              <span>用户场景</span>
              <h3>{item.scene}</h3>
              <p>{item.agent}</p>
              <small>{item.safe}</small>
            </article>
          ))}
        </div>
      </Section>

      <Section label="Agent 工作闭环" title="Agent 不替你社交，只把下一步准备好。" tone="deep">
        <div className="fm-step-line">
          {['说出场景', '补全边界', '推荐候选', '解释理由', '用户确认', '开始连接'].map(
            (step, index) => (
              <article key={step}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{step}</strong>
              </article>
            ),
          )}
        </div>
      </Section>

      <SafetySummary />
      <AppPreviewCompact />
      <DemoStrip />
    </>
  );
}

function SafetyCenterPage() {
  return (
    <>
      <PageHero
        title="Safety Center"
        body="真实世界社交的安全，不是一个设置页，而是一整套默认机制：隐私、确认、审计、撤回、举报和数据删除。"
        actions={[
          { label: '体验免登录 Demo', to: '/demo', variant: 'primary' },
          { label: '预约 App Beta', to: '/app#waitlist' },
        ]}
      />
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
          {['身体信息', '精确位置', '联系方式', '活动轨迹', 'Life Graph 信号'].map((item) => (
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

function AppPreviewPage() {
  return (
    <>
      <PageHero
        title="FitMeet App Beta"
        body="移动端承载真实生活场景：5 Tab、附近机会、Agent 发起需求、消息确认、个人隐私与 Life Graph 管理。"
        actions={[
          { label: '预约 Beta', to: '#waitlist', variant: 'primary' },
          { label: '先看 Demo', to: '/demo' },
        ]}
      />
      <Section label="移动端 5 Tab" title="用户每天只需要看懂这五个入口。">
        <PhonePreview />
      </Section>
      <Section label="核心截图" title="把复杂能力压缩成三个真实场景。" tone="deep">
        <div className="fm-screenshot-grid">
          {['一句话发起需求', '查看附近机会', '确认后再连接'].map((title) => (
            <article key={title} className="fm-app-shot">
              <span>{title}</span>
              <div />
            </article>
          ))}
        </div>
      </Section>
      <WaitlistSection />
    </>
  );
}

function PublicDemoPage() {
  const [step, setStep] = useState(0);
  const demoSteps = useMemo(
    () => [
      {
        title: '用户说出场景',
        body: '今晚想找一个人慢跑，不想太社交，最好离我 3km 内。',
      },
      {
        title: 'Agent 补全边界',
        body: '我会优先公共场所、低强度、站内先聊；精确位置不会展示。',
      },
      {
        title: '推荐候选',
        body: '匹配理由：同区域、今晚有空、都偏好轻松运动、聊天压力低。',
      },
      {
        title: '用户确认',
        body: '发送邀请前需要确认；你也可以改成加入附近活动。',
      },
    ],
    [],
  );

  return (
    <>
      <PageHero
        title="30 秒理解 FitMeet"
        body="不用登录。走完一次用户场景、Agent 完成和安全确认，就能理解 FitMeet 的产品核心。"
        actions={[
          { label: '开始 Demo', to: '#demo-flow', variant: 'primary' },
          { label: '进入 Agent', to: '/agent' },
        ]}
      />
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

function InfoPageView({ page }: { page: WebsitePage }) {
  const content = infoPages[page] ?? infoPages.ecosystem!;

  return (
    <>
      <PageHero title={content.title} body={content.body} actions={content.actions} />
      <Section label="FitMeet" title="从真实场景开始，而不是从功能列表开始。">
        <div className="fm-flow-grid">
          {content.sections.map((section) => (
            <article key={section.title} className="fm-card">
              <span>{section.label}</span>
              <h3>{section.title}</h3>
              <p>{section.body}</p>
            </article>
          ))}
        </div>
      </Section>
    </>
  );
}

function SafetySummary() {
  return (
    <Section label="为什么安全" title="所有真实世界动作，都先解释再确认。">
      <div className="fm-safety-grid">
        {safetyItems.slice(0, 4).map(([title, body]) => (
          <article key={title} className="fm-card">
            <span className="fm-status">Protected</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </div>
      <div className="fm-section__after">
        <Link to="/safety" className="fm-button fm-button--ghost">
          查看 Safety Center
        </Link>
      </div>
    </Section>
  );
}

function AppPreviewCompact() {
  return (
    <Section label="App 预告" title="移动端会把复杂能力压进 5 个清晰入口。" tone="deep">
      <PhonePreview />
      <div className="fm-section__after">
        <Link to="/app" className="fm-button fm-button--primary">
          查看 App 预告页
        </Link>
      </div>
    </Section>
  );
}

function DemoStrip() {
  return (
    <section className="fm-demo-strip">
      <h2>让新用户 30 秒理解 FitMeet。</h2>
      <p>不注册、不填资料，先看一次完整闭环：说出需求、Agent 推荐、解释理由、确认后行动。</p>
      <Link to="/demo" className="fm-button fm-button--primary">
        打开免登录 Demo
      </Link>
    </section>
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
        <div className="fm-phone__prompt">今晚想找个人慢跑，不尬聊，轻松一点</div>
        <div className="fm-phone__cards">
          <article>
            <strong>低压力跑步搭子</strong>
            <p>同区域 · 今晚有空 · 强度匹配</p>
          </article>
          <article>
            <strong>附近轻松活动</strong>
            <p>公共场所 · 需确认后加入</p>
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

function PageHero({ actions, body, title }: { actions: Action[]; body: string; title: string }) {
  return (
    <section className="fm-page-hero">
      <h1>{title}</h1>
      <p>{body}</p>
      <div className="fm-actions">
        {actions.map((action) => (
          <Link
            key={action.label}
            to={action.to}
            className={clsx(
              'fm-button',
              action.variant === 'primary' ? 'fm-button--primary' : 'fm-button--ghost',
            )}
          >
            {action.label}
          </Link>
        ))}
      </div>
    </section>
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
      <strong>FitMeet</strong>
      <p>用 Agent 完成真实生活里的连接。关键动作先解释，再确认。</p>
      <nav aria-label="FitMeet 页脚导航">
        <Link to="/demo">30 秒 Demo</Link>
        <Link to="/app">App Beta</Link>
        <Link to="/safety">Safety Center</Link>
        <Link to="/about">关于</Link>
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
