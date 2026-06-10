import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Link, useLocation } from 'react-router-dom';
import { waitlistApi, type WaitlistDeviceType } from '../../api/waitlistApi';
import { SocialWorldHeroVisual } from './SocialWorldHeroVisual';

const SITE_URL = 'https://ourfitmeet.cn';
const ICP_TEXT = import.meta.env.VITE_ICP_TEXT || '鲁ICP备2026015946号-2';
const ICP_URL = import.meta.env.VITE_ICP_URL || 'http://beian.miit.gov.cn/';
const CONTACT_EMAIL = '15253005312@163.com';

export type WebsitePage =
  | 'home'
  | 'features'
  | 'ecosystem'
  | 'download'
  | 'app'
  | 'developers'
  | 'safety'
  | 'about'
  | 'contact'
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
  ecosystem: {
    title: 'FitMeet | 从信息流到需求流社交',
    description:
      '了解 FitMeet 如何把同城社交、约练和找搭子的真实需求变成可解释、可确认、可执行的连接流程。',
    path: '/ecosystem',
  },
  features: {
    title: 'FitMeet 产品功能 | Social World 怎么帮助用户社交',
    description:
      '了解 FitMeet Social World 如何用兴趣场景、附近机会、站内聊天、Agent 推荐和确认机制帮助用户自然认识真正聊得来的人。',
    path: '/features',
  },
  app: {
    title: 'FitMeet App | Beta 预约',
    description:
      '预约 FitMeet App Beta，体验移动端 5 Tab、附近机会、Agent 发起需求、安全确认和活动闭环。',
    path: '/app',
  },
  download: {
    title: '下载 FitMeet App | Social World Beta',
    description:
      '下载或预约 FitMeet App Beta。iOS 与 Android 入口、二维码占位、Beta 预约和 Agent 体验入口。',
    path: '/download',
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
  contact: {
    title: '联系 FitMeet | 商务合作、媒体与安全反馈',
    description:
      '联系 FitMeet 团队，了解 Social World、商务合作、媒体采访、安全反馈和 App Beta 体验。',
    path: '/contact',
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

const homeSeo = {
  title: 'FitMeet | Social World 让社交更简单',
  description:
    'FitMeet 是面向真实生活连接的 Social World。用户从发现附近的人、活动和场景开始，在安全边界内自然认识彼此。',
};

const safetyItems = [
  ['隐私', '精确位置、身体信息、联系方式默认隐藏，只在用户本人界面可见。'],
  ['确认', '发邀请、加入活动、共享位置、写入 Life Graph 前都需要用户确认。'],
  ['审计', 'Agent 的关键判断、工具调用和权限变化保留可回看记录。'],
  ['撤回', '授权、画像信号、活动申请和推荐偏好都可以撤回或关闭。'],
  ['举报', '用户、活动、消息和推荐卡片都提供举报与拉黑入口。'],
  ['数据删除', '账号数据、画像记录、敏感字段和历史活动支持删除请求。'],
];

const enterpriseLoopCopy = [
  '先从跑步、健身、咖啡、Citywalk 这类真实场景进入。',
  '用附近、时间、兴趣和边界，把可认识的人组织清楚。',
  '推荐前展示理由，连接前保留确认，不让用户被动暴露。',
  '把发现、动态、消息和我的合在一个移动端闭环里。',
  '线下前保留安全提示，异常时可以撤回、举报或停止。',
];

const featurePillars = [
  ['兴趣场景', '从跑步、健身、咖啡、Citywalk 等场景进入，让认识一个人有自然理由。'],
  ['附近机会', '把附近的人、活动和地点按时间、距离、兴趣和边界组织，而不是堆列表。'],
  ['站内先聊', '第一次连接先保留在站内，用户可以低压力确认节奏、地点和目的。'],
  ['Agent 推荐', '一句话说出目标，Agent 帮你筛人、找场景、准备话题，但关键动作由你确认。'],
];

const agentCapabilities = [
  ['发现人', '结合兴趣、距离、时间和 Life Graph，给出更合适的人选。'],
  ['发现场景', '把“想出门走走”拆成散步、咖啡、Citywalk 或轻运动等可执行场景。'],
  ['发现话题', '根据对方公开资料和你的边界，生成轻松、不冒犯的开场方式。'],
];

const downloadOptions = [
  ['iOS TestFlight', '内测开放后提供邀请链接，适合第一批体验用户。'],
  ['Android Beta', '预留 Android 测试包入口，部署后接入真实下载地址。'],
  ['Web 发现页', '不安装 App 也可以先进入发现，查看 Social World 的核心体验。'],
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
        {page === 'features' || page === 'ecosystem' ? <FeaturesPage /> : null}
        {page === 'safety' ? <SafetyCenterPage /> : null}
        {page === 'download' || page === 'app' ? <DownloadPage /> : null}
        {page === 'about' || page === 'contact' ? <AboutContactPage /> : null}
        {page === 'demo' ? <PublicDemoPage /> : null}
        {page !== 'home' &&
        page !== 'features' &&
        page !== 'ecosystem' &&
        page !== 'safety' &&
        page !== 'download' &&
        page !== 'app' &&
        page !== 'about' &&
        page !== 'contact' &&
        page !== 'demo' ? (
          <InfoPageView page={page} />
        ) : null}
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

  return (
    <header className="fm-nav">
      <Link to="/" className="fm-brand" aria-label="FitMeet 首页">
        <span aria-hidden="true">
          <img src="/favicon-192.png" alt="" width="38" height="38" />
        </span>
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
        <Link to="/discover" className="fm-button fm-button--ghost">
          进入发现
        </Link>
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
      <section className="fm-hero fm-enterprise-hero">
        <div className="fm-hero__copy">
          <span className="fm-eyebrow">Social World</span>
          <h1>让社交更简单</h1>
          <p>从兴趣出发，遇见真正聊得来的人</p>
          <div className="fm-actions">
            <Link to="/discover" className="fm-button fm-button--primary">
              进入发现
            </Link>
            <Link to="/agent" className="fm-button fm-button--ghost">
              体验 Agent
            </Link>
            <Link to="/download" className="fm-button fm-button--ghost">
              打开 App
            </Link>
          </div>
          <div className="fm-hero__trust" aria-label="FitMeet 安全原则">
            <span>公共场所优先</span>
            <span>先站内聊</span>
            <span>确认后执行</span>
          </div>
        </div>
        <div className="fm-hero__visual" aria-label="FitMeet Social World App 互动主视觉">
          <SocialWorldHeroVisual />
        </div>
      </section>

      <Section
        label="Context"
        title="从兴趣场景出发，让认识一个人有自然理由。"
        body="FitMeet 不把人简单堆成列表，而是把健身、咖啡、散步、Citywalk 这类场景变成更轻、更真实的连接入口。"
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
            <span>Scene</span>
            <h3>先有兴趣，再有认识的理由。</h3>
            <p>用户可以从约练、喝咖啡、城市散步、轻社交活动进入，不需要尴尬地从陌生人列表开始。</p>
          </article>
          <article className="fm-context-panel fm-context-panel--strong">
            <span>App</span>
            <h3>发现页就是 Social World 的入口。</h3>
            <p>用户进入发现后直接看到附近动态、活动卡片和同频推荐，不需要再跳转到另一个页面。</p>
          </article>
        </div>
      </Section>

      <AgentConversionBand />

      <Section label="App Flow" title="移动端核心流程，只保留真正会发生的下一步。" tone="deep">
        <div className="fm-enterprise-loop">
          {['选择场景', '发现同频', '先聊清楚', '确认见面', '安全收束'].map((step, index) => (
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
        <h2>从发现开始，认识真正聊得来的人。</h2>
        <p>先进入发现页，看附近的兴趣场景和同频动态，再决定是否发起一次真实连接。</p>
        <div className="fm-actions">
          <Link to="/discover" className="fm-button fm-button--primary">
            进入发现
          </Link>
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
      <PageHero
        title="Social World 怎么帮你更自然地社交。"
        body="不是把人堆成列表，而是围绕兴趣、附近、站内聊和确认机制，把真实连接变成可理解的下一步。"
        actions={[
          { label: '进入发现', to: '/discover', variant: 'primary' },
          { label: '体验 Agent', to: '/agent' },
        ]}
        visual={
          <VisualFigure
            src="/images/fitmeet/generated/social-world-features-visual-1200.jpg"
            srcSet="/images/fitmeet/generated/social-world-features-visual-720.jpg 720w, /images/fitmeet/generated/social-world-features-visual-1200.jpg 1200w"
            alt="FitMeet Social World 产品功能抽象视觉"
            caption="兴趣、附近机会、推荐理由和站内聊天，被组织成一条轻量连接路径。"
          />
        }
      />
      <Section
        label="Product"
        title="从“我想认识谁”，变成“我可以怎么开始”。"
        body="FitMeet 的产品功能围绕真实 To C 场景组织：用户先有目标，再由产品和 Agent 帮他找到人、场景和话题。"
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
      <Section label="Agent" title="Agent 负责发现人、场景和话题，但不替用户越界。" tone="deep">
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
        <h2>先体验一次 Agent，再进入真实发现页。</h2>
        <p>你可以直接告诉小蚁：今晚想认识什么样的人、在哪里、希望多轻松。</p>
        <div className="fm-actions">
          <Link to="/agent" className="fm-button fm-button--primary">
            体验 Agent
          </Link>
          <Link to="/discover" className="fm-button fm-button--ghost">
            进入发现
          </Link>
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
        <h2>让小蚁先帮你发现合适的人、场景和话题。</h2>
        <p>说一句目标，Agent 会整理边界、推荐理由和下一步。确认之前，不会替你联系任何人。</p>
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
      <PageHero
        title="Safety Center"
        body="真实世界社交的安全，不是一个设置页，而是一整套默认机制：隐私、确认、审计、撤回、举报和数据删除。"
        actions={[
          { label: '体验免登录 Demo', to: '/demo', variant: 'primary' },
          { label: '预约 App Beta', to: '/app#waitlist' },
        ]}
        visual={<SafetySystemVisual />}
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

function DownloadPage() {
  return (
    <>
      <PageHero
        title="下载 Social World App。"
        body="移动端承载真实生活场景：附近机会、Agent 发起需求、消息确认、个人隐私与 Life Graph 管理。"
        actions={[
          { label: '预约 Beta', to: '#waitlist', variant: 'primary' },
          { label: '先体验 Agent', to: '/agent' },
        ]}
        visual={<DownloadSystemVisual />}
      />
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
      <Section label="核心截图" title="把复杂能力压缩成三个真实场景。">
        <AppScenesVisual />
      </Section>
      <WaitlistSection />
    </>
  );
}

function AboutContactPage() {
  return (
    <>
      <PageHero
        title="我们在做一个更真实的 Social World。"
        body="FitMeet 希望让社交从刷信息流回到真实生活：从兴趣出发，遇见真正聊得来的人。"
        actions={[
          { label: '联系合作', to: '#contact', variant: 'primary' },
          { label: '下载 App', to: '/download' },
        ]}
      />
      <Section label="Vision" title="不是让用户停留更久，而是让合适的人更自然见面。">
        <div className="fm-about-values">
          {[
            ['真实有趣', '兴趣和场景先于陌生人曝光，让连接从具体生活开始。'],
            ['安全可信', '公共场所优先、站内先聊、确认后执行是默认原则。'],
            ['Agent 可控', 'AI 可以帮用户发现和整理，但不替用户越过关键边界。'],
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
        <h2>准备好从真实场景开始认识人。</h2>
        <p>先体验 Agent，或者进入发现页看附近正在发生的兴趣场景。</p>
        <div className="fm-actions">
          <Link to="/agent" className="fm-button fm-button--primary">
            体验 Agent
          </Link>
          <Link to="/discover" className="fm-button fm-button--ghost">
            进入发现
          </Link>
        </div>
      </section>
    </>
  );
}

function SafetySystemVisual() {
  return (
    <VisualFigure
      className="fm-system-visual fm-system-visual--safety"
      src="/images/fitmeet/generated/social-world-safety-visual-v2-1200.jpg"
      srcSet="/images/fitmeet/generated/social-world-safety-visual-v2-720.jpg 720w, /images/fitmeet/generated/social-world-safety-visual-v2-1200.jpg 1200w"
      alt="FitMeet Safety Center 深色玻璃拟态安全控制台视觉"
      caption="隐私、确认、审计、撤回和举报，是 FitMeet 默认的产品边界。"
    />
  );
}

function DownloadSystemVisual() {
  return (
    <VisualFigure
      className="fm-system-visual fm-system-visual--download"
      src="/images/fitmeet/generated/social-world-download-visual-v2-1200.jpg"
      srcSet="/images/fitmeet/generated/social-world-download-visual-v2-720.jpg 720w, /images/fitmeet/generated/social-world-download-visual-v2-1200.jpg 1200w"
      alt="FitMeet App 深色手机与多端入口产品视觉"
      caption="下载入口围绕移动端五个真实场景组织，风格与首页主视觉保持一致。"
    />
  );
}

function AppScenesVisual() {
  return (
    <VisualFigure
      className="fm-app-scenes-visual"
      src="/images/fitmeet/generated/social-world-app-scenes-v2-1200.jpg"
      srcSet="/images/fitmeet/generated/social-world-app-scenes-v2-720.jpg 720w, /images/fitmeet/generated/social-world-app-scenes-v2-1200.jpg 1200w"
      alt="FitMeet App 三个核心场景：一句话发起需求、查看附近机会、确认后再连接"
      caption="一句话发起需求、查看附近机会、确认后再连接，三个核心场景被统一成同一套深色产品界面。"
    />
  );
}

function VisualFigure({
  alt,
  caption,
  className,
  src,
  srcSet,
}: {
  alt: string;
  caption: string;
  className?: string;
  src: string;
  srcSet: string;
}) {
  return (
    <figure className={clsx('fm-visual-figure', className)}>
      <picture>
        <source srcSet={srcSet} sizes="(max-width: 820px) 92vw, 1180px" />
        <img src={src} alt={alt} width="1200" height="760" loading="lazy" decoding="async" />
      </picture>
      <figcaption>{caption}</figcaption>
    </figure>
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

function PageHero({
  actions,
  body,
  title,
  visual,
}: {
  actions: Action[];
  body: string;
  title: string;
  visual?: ReactNode;
}) {
  return (
    <section className={clsx('fm-page-hero', visual && 'fm-page-hero--visual')}>
      <div className="fm-page-hero__copy">
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
      </div>
      {visual ? <div className="fm-page-hero__visual">{visual}</div> : null}
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
      <strong>
        <img src="/favicon-192.png" alt="" width="28" height="28" aria-hidden="true" />
        FitMeet
      </strong>
      <p>Social World，从兴趣出发，遇见真正聊得来的人。</p>
      <nav aria-label="FitMeet 页脚导航">
        <Link to="/features">产品功能</Link>
        <Link to="/discover">发现</Link>
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
