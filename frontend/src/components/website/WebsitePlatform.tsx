import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import clsx from 'clsx';
import { Link, useLocation } from 'react-router-dom';
import { waitlistApi, type WaitlistDeviceType } from '../../api/waitlistApi';

const EARTH_ASSET = '/images/fitmeet/concept-earth-asia.png';
const EARTH_WEBP_SRCSET =
  '/images/fitmeet/concept-earth-asia-960.webp 960w, /images/fitmeet/concept-earth-asia-1400.webp 1400w';
const ICP_TEXT = import.meta.env.VITE_ICP_TEXT || '鲁ICP备2026015946号-2';
const ICP_URL = import.meta.env.VITE_ICP_URL || 'http://beian.miit.gov.cn/';
const SITE_URL = 'https://ourfitmeet.cn';

export type WebsitePage =
  | 'home'
  | 'ecosystem'
  | 'app'
  | 'developers'
  | 'safety'
  | 'about'
  | 'lifeGraph';

type PageAction = {
  label: string;
  to: string;
  variant?: 'primary' | 'secondary';
};

type PagePanel = {
  label: string;
  title: string;
  body: string;
};

type MarketingPageContent = {
  label: string;
  title: string;
  body: string;
  actions: PageAction[];
  panels: PagePanel[];
  closing: {
    label: string;
    title: string;
    body: string;
    items: string[];
  };
};

const navItems = [
  { to: '/', label: '首页' },
  { to: '/ecosystem', label: '需求流' },
  { to: '/agent', label: 'Agent' },
  { to: '/app', label: 'App 内测' },
  { to: '/safety', label: '安全' },
  { to: '/about', label: '关于' },
];

const pageTitles: Record<WebsitePage, string> = {
  home: 'FitMeet | Social World',
  ecosystem: 'FitMeet | 需求流社交',
  app: 'FitMeet App 内测',
  developers: 'FitMeet | 开发者预览',
  safety: 'FitMeet | 安全与信任',
  about: '关于 FitMeet',
  lifeGraph: 'FitMeet | Life Graph',
};

const pageSeo: Record<
  WebsitePage,
  {
    title: string;
    description: string;
    keywords: string;
    path: string;
  }
> = {
  home: {
    title: 'FitMeet | Social World 需求流社交与 AI 社交平台',
    description:
      'FitMeet 是面向真实世界连接的 AI 社交平台，从信息流走向需求流，帮助用户完成同城社交、约练、找搭子、找朋友和相亲恋爱。',
    keywords: 'FitMeet,Social World,需求流社交,AI社交平台,同城社交,约练,找搭子,找朋友,相亲恋爱,Agent生活助手',
    path: '/',
  },
  ecosystem: {
    title: '需求流社交 | FitMeet',
    description:
      '了解 FitMeet 如何让用户直接提出需求，由 Agent 理解上下文、匹配候选人、解释推荐理由，并由用户确认关键动作。',
    keywords: '需求流社交,意图流社交,同城社交,找搭子,约练,AI匹配,FitMeet Agent',
    path: '/ecosystem',
  },
  app: {
    title: 'FitMeet App 内测 | 同城社交、约练、找搭子',
    description:
      '预约 FitMeet App 内测，在手机上发起同城社交、约练、找搭子、找朋友和相亲恋爱需求，体验 AI Agent 辅助真实连接。',
    keywords: 'FitMeet App,App内测,同城社交App,约练App,找搭子App,运动搭子,AI社交平台',
    path: '/app',
  },
  developers: {
    title: '开发者预览 | FitMeet Agent API',
    description:
      'FitMeet 开发者预览展示未来外部 Agent 如何在用户授权、安全审计和权限边界内接入真实生活社交网络。',
    keywords: 'Agent API,开发者预览,AI Agent,权限边界,安全审计,FitMeet',
    path: '/developers',
  },
  safety: {
    title: '安全与信任 | FitMeet',
    description:
      'FitMeet 安全体系强调用户确认、隐私边界、可解释推荐和审计记录，确保 Agent 不越权替用户行动。',
    keywords: '社交安全,用户确认,隐私边界,可解释推荐,安全审计,AI社交平台',
    path: '/safety',
  },
  about: {
    title: '关于 FitMeet | 从信息流社交走向需求流社交',
    description:
      'FitMeet 的愿景是让社交服务真实生活，从信息流社交走向需求流社交，成为由用户、Agent 和真实关系构成的 Social World。',
    keywords: '关于FitMeet,Social World,需求流社交,AI社交平台,同城社交,真实连接',
    path: '/about',
  },
  lifeGraph: {
    title: 'Life Graph | FitMeet 后台智能画像',
    description:
      'Life Graph 是 FitMeet 的后台智能画像系统，在用户授权下理解兴趣、时间、位置、偏好和边界，让 Agent 匹配更准确。',
    keywords: 'Life Graph,智能画像,动态人物画像,AI匹配,用户授权,FitMeet Agent',
    path: '/life-graph',
  },
};

const pageContent: Record<Exclude<WebsitePage, 'home'>, MarketingPageContent> = {
  ecosystem: {
    label: '需求流社交',
    title: '从刷信息流，到直接提出需求。',
    body:
      'FitMeet 第一阶段聚焦用户最真实的线下社交：同城社交、约练、找搭子、找朋友、相亲恋爱。用户不再靠刷动态碰运气，而是把需求交给 Agent 去理解、匹配、解释，并在关键动作前等待确认。',
    actions: [
      { label: '进入 Agent', to: '/agent', variant: 'primary' },
      { label: '预约 App 内测', to: '/app#waitlist' },
    ],
    panels: [
      {
        label: '说出需求',
        title: '把“我想找人做什么”说清楚',
        body: '今晚想跑步、周末想拍照、想认识附近朋友、想认真相亲，需求越真实，匹配越有方向。',
      },
      {
        label: '理解上下文',
        title: 'Agent 补全时间、地点、偏好和边界',
        body: '同一个“找搭子”背后可能是运动、拍照、吃饭或户外，不同场景需要不同的匹配方式。',
      },
      {
        label: '推荐候选',
        title: '不是泛推荐，而是有理由的候选人',
        body: 'FitMeet 会解释为什么推荐：共同兴趣、距离、时间、生活节奏或社交边界是否匹配。',
      },
      {
        label: '用户确认',
        title: '关键动作始终由用户决定',
        body: '发起联系、交换信息、线下见面和共享位置，都需要用户确认后再继续。',
      },
      {
        label: '真实连接',
        title: '让社交回到现实生活',
        body: '平台的目标不是让用户停留更久，而是让合适的人更快从线上走到真实场景。',
      },
    ],
    closing: {
      label: '第一阶段重点',
      title: '先把用户需求做好，再扩展生态能力。',
      body: '商家、开发者和外部 Agent 是未来能力。当前官网最重要的任务，是让用户明白：我提出需求，Agent 帮我完成真实连接。',
      items: ['同城社交', '约练运动', '找搭子', '找朋友', '相亲恋爱'],
    },
  },
  app: {
    label: 'App 内测',
    title: '把需求流社交带到每天会发生连接的地方。',
    body:
      'FitMeet App 会承载发起需求、附近机会、聊天确认、活动提醒和个人边界管理。Web 让用户理解 FitMeet，App 让用户在真实生活里随时发起连接。',
    actions: [
      { label: '预约 App 内测', to: '#waitlist', variant: 'primary' },
      { label: '先进入 Agent', to: '/agent' },
    ],
    panels: [
      {
        label: '随时发起',
        title: '一句话发起真实社交需求',
        body: '在路上、训练前、周末出门前，都可以直接告诉 Agent 你想找谁、做什么、何时开始。',
      },
      {
        label: '附近机会',
        title: '把人、活动和地点放进同一条动线',
        body: '附近的人、可加入的活动、适合见面的地点，会围绕需求组织，而不是散落在不同页面。',
      },
      {
        label: '聊天确认',
        title: '从推荐到开场，再到是否连接',
        body: 'Agent 可以生成低压力开场白，但是否联系、是否见面、是否共享信息，始终由用户确认。',
      },
      {
        label: '移动场景',
        title: '适合即时、附近、线下的真实社交',
        body: '找跑步搭子、拍照搭子、同城朋友和相亲对象，都需要 App 在用户真实移动场景中出现。',
      },
    ],
    closing: {
      label: '为什么预约',
      title: '第一批内测会优先验证真实场景。',
      body: '我们会优先打磨同城社交、约练、找搭子、找朋友和相亲恋爱五个场景，让 App 成为现实连接的入口。',
      items: ['附近匹配', '一句话发起需求', '聊天确认', '活动提醒', '安全边界'],
    },
  },
  developers: {
    label: '开发者预览',
    title: '未来让外部 Agent 接入真实生活社交网络。',
    body:
      '开发者能力不是第一阶段主线，但会成为 FitMeet 后续生态扩展的基础。外部 Agent 必须在用户授权和平台审计边界内接入。',
    actions: [
      { label: '查看开发者文档', to: '/developers/social-skills', variant: 'primary' },
      { label: '进入 Agent', to: '/agent' },
    ],
    panels: [
      {
        label: 'social-skills',
        title: '把社交动作变成可授权协议',
        body: '需求创建、候选读取、消息建议和活动发起，都必须在用户授权范围内执行。',
      },
      {
        label: 'Tool Registry',
        title: '每个工具都有清晰边界',
        body: '能力范围、用户授权、生产审核和风险等级需要在接入前明确。',
      },
      {
        label: 'Agent Token',
        title: '授权不是永久通行证',
        body: '令牌应当可范围化、可撤回、可审计，并与用户意图绑定。',
      },
      {
        label: 'Webhook',
        title: '关键状态可回传、可复盘',
        body: '候选、审批、消息和活动状态通过事件回传，避免黑箱执行。',
      },
    ],
    closing: {
      label: '接入原则',
      title: 'Agent 可以提高效率，但不能越过用户边界。',
      body: '真实世界连接需要比普通软件集成更严格的权限、风控和审计模型。',
      items: ['Agent API', 'Tool Registry', 'Webhook', 'Agent Token', 'Sandbox'],
    },
  },
  safety: {
    label: '安全与信任',
    title: '真实世界社交，必须先建立信任。',
    body:
      'FitMeet 的安全设计围绕一个原则：Agent 可以理解、推荐和辅助，但不能越权替用户行动。联系、见面、位置、隐私和敏感信息相关动作，都需要用户确认。',
    actions: [
      { label: '了解 Life Graph', to: '/life-graph', variant: 'primary' },
      { label: '进入 Agent', to: '/agent' },
    ],
    panels: [
      {
        label: '用户确认',
        title: '关键社交动作必须由用户决定',
        body: '发消息、交换联系方式、线下见面、共享位置等动作，都应该先解释，再确认。',
      },
      {
        label: '隐私边界',
        title: '敏感数据默认不自动共享',
        body: '精确位置、健康数据、联系方式、支付和身份信息默认关闭或单独授权。',
      },
      {
        label: '可解释推荐',
        title: '每个推荐都要说清楚原因',
        body: '用户需要知道为什么推荐这个人、匹配了哪些条件、还有哪些风险边界。',
      },
      {
        label: '审计记录',
        title: '关键动作可复盘、可撤回、可治理',
        body: '平台会记录 Agent 的关键决策节点，为用户安全和长期信任负责。',
      },
    ],
    closing: {
      label: '安全底线',
      title: 'Agent 不替你社交，只帮助你更好地做决定。',
      body: '这条边界决定了 FitMeet 能不能成为长期可信的真实世界社交平台。',
      items: ['位置默认关闭', '联系不自动交换', '见面需要确认', '推荐可解释', '画像可编辑', '授权可撤回'],
    },
  },
  about: {
    label: '关于 FitMeet',
    title: '从信息流社交，走向需求流社交。',
    body:
      'FitMeet 不是为了让用户花更多时间刷屏，而是帮助用户用更少时间建立更真实、更安全、更合适的现实连接。我们从同城社交、约练、找搭子、找朋友和相亲恋爱开始。',
    actions: [
      { label: '了解需求流社交', to: '/ecosystem', variant: 'primary' },
      { label: '进入 Agent', to: '/agent' },
    ],
    panels: [
      {
        label: '问题',
        title: '信息流让人不断浏览，却很难行动',
        body: '用户需要反复筛选、等待回复、重复解释自己，真实见面的履约成本越来越高。',
      },
      {
        label: '答案',
        title: 'Agent 成为真实连接的入口',
        body: '用户说出需求，Agent 理解意图、结合画像、推荐合适的人，并等待用户确认。',
      },
      {
        label: '愿景',
        title: '社交应该服务现实生活',
        body: 'FitMeet 的长期目标，是成为全球用户进行真实连接的 Social World。',
      },
    ],
    closing: {
      label: '品牌锚点',
      title: 'Social World，改变世界的社交方式。',
      body: '从一个真实需求开始，逐步形成由用户、Agent 和真实关系共同构成的新社交世界。',
      items: ['需求流社交', 'Agent 匹配', 'Life Graph', '用户确认', '真实连接'],
    },
  },
  lifeGraph: {
    label: 'Life Graph',
    title: '后台动态人物画像，不增加用户负担。',
    body:
      'Life Graph 不是让用户填写更多资料，也不是前台炫技功能。它是 FitMeet 的后台智能系统，在用户授权下理解兴趣、时间、位置、社交偏好、生活节奏、边界和反馈。',
    actions: [
      { label: '进入 Agent', to: '/agent', variant: 'primary' },
      { label: '了解安全体系', to: '/safety' },
    ],
    panels: [
      {
        label: '后台理解',
        title: '用户不用反复解释自己',
        body: '每一次需求、确认和反馈，都会帮助 Agent 更好地理解你的真实生活场景。',
      },
      {
        label: '授权使用',
        title: '画像只在边界内被使用',
        body: 'Agent 可以用画像帮助匹配，但不会把隐私直接暴露给其他用户。',
      },
      {
        label: '持续校准',
        title: '匹配会随着反馈变得更准确',
        body: '选择、拒绝、收藏和确认都会让系统逐步理解什么才适合你。',
      },
      {
        label: '用户控制',
        title: '可编辑、可关闭、可撤回',
        body: 'Life Graph 属于用户。平台需要让画像透明、可控、可复盘。',
      },
    ],
    closing: {
      label: '画像原则',
      title: 'Life Graph 是智能基础设施，不是用户的新负担。',
      body: '它的价值不是展示复杂图谱，而是让每一次匹配更贴近真实生活。',
      items: ['兴趣', '节奏', '位置', '边界', '反馈', '记忆', '隐私', '预测'],
    },
  },
};

const proofScenarios = [
  {
    title: '同城社交',
    example: '想认识附近同频的新朋友',
    body: '从位置、兴趣和生活节奏出发，找到更自然的真实连接。',
    image: '/images/fitmeet/proof-city-social.png',
    webpSrcSet: '/images/fitmeet/proof-city-social-360.webp 360w, /images/fitmeet/proof-city-social-640.webp 640w',
  },
  {
    title: '约练运动',
    example: '今晚想找一个同城跑步搭子',
    body: '找到时间、地点、水平都合适的训练伙伴。',
    image: '/images/fitmeet/proof-workout.png',
    webpSrcSet: '/images/fitmeet/proof-workout-360.webp 360w, /images/fitmeet/proof-workout-640.webp 640w',
  },
  {
    title: '找搭子',
    example: '周末想找人一起拍照探店',
    body: '吃饭、拍照、探店、户外，都能直接发起需求。',
    image: '/images/fitmeet/proof-companion.png',
    webpSrcSet: '/images/fitmeet/proof-companion-360.webp 360w, /images/fitmeet/proof-companion-528.webp 528w',
  },
  {
    title: '找朋友',
    example: '想找一个能长期聊天和线下见面的朋友',
    body: '从兴趣和生活方式出发，建立更自然的关系。',
    image: '/images/fitmeet/proof-friends.png',
    webpSrcSet: '/images/fitmeet/proof-friends-360.webp 360w, /images/fitmeet/proof-friends-528.webp 528w',
  },
  {
    title: '相亲恋爱',
    example: '帮我找一个认真相亲对象',
    body: '让认真匹配发生在滑卡和尬聊之前。',
    image: '/images/fitmeet/proof-dating.png',
    webpSrcSet: '/images/fitmeet/proof-dating-360.webp 360w, /images/fitmeet/proof-dating-528.webp 528w',
  },
];

export function WebsitePlatform({ page }: { page: WebsitePage }) {
  const location = useLocation();

  useEffect(() => {
    const seo = pageSeo[page];
    const canonicalPath = location.pathname === '/legacy-home' ? '/' : seo.path;
    const canonicalUrl = `${SITE_URL}${canonicalPath}`;
    document.title = seo.title || pageTitles[page];
    setMetaTag('description', seo.description);
    setMetaTag('keywords', seo.keywords);
    setMetaTag('robots', 'index,follow');
    setMetaProperty('og:title', seo.title);
    setMetaProperty('og:description', seo.description);
    setMetaProperty('og:url', canonicalUrl);
    setMetaProperty('og:type', 'website');
    setMetaProperty('og:site_name', 'FitMeet');
    setMetaProperty('og:locale', 'zh_CN');
    setMetaTag('twitter:card', 'summary_large_image');
    setMetaTag('twitter:title', seo.title);
    setMetaTag('twitter:description', seo.description);
    setCanonical(canonicalUrl);
  }, [location.pathname, page]);

  useEffect(() => {
    if (!location.hash) return;
    const target = document.getElementById(location.hash.slice(1));
    target?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [location.hash, location.pathname]);

  return (
    <WebsiteLayout>
      {page === 'home' ? <ConceptHomePage /> : <MarketingPage page={page} />}
    </WebsiteLayout>
  );
}

export function WebsiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="fitmeet-website fitmeet-website--earth">
      <WebsiteNavbar />
      <main>{children}</main>
      <WebsiteFooter />
    </div>
  );
}

export function WebsiteNavbar() {
  const location = useLocation();

  return (
    <header className="website-nav concept-nav">
      <Link to="/" className="website-nav__brand" aria-label="FitMeet 首页">
        <span>F</span>
        <strong>FitMeet</strong>
      </Link>
      <nav aria-label="FitMeet 官网导航">
        {navItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={clsx(
              (item.to === '/'
                ? location.pathname === '/' || location.pathname === '/legacy-home'
                : location.pathname === item.to) && 'is-active',
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="website-nav__actions">
        <Link to="/app#waitlist">预约 App</Link>
        <Link to="/agent">进入 Agent</Link>
      </div>
    </header>
  );
}

function ConceptHomePage() {
  return (
    <>
      <section className="concept-home-hero" aria-label="FitMeet 首页">
        <div className="concept-home-hero__earth" aria-hidden="true">
          <picture>
            <source type="image/webp" srcSet={EARTH_WEBP_SRCSET} sizes="(max-width: 900px) 100vw, 76vw" />
            <img src={EARTH_ASSET} alt="" decoding="async" />
          </picture>
        </div>
        <div className="concept-home-hero__copy">
          <h1>Social World</h1>
          <p className="concept-hero-subcopy">改变世界的社交方式。</p>
          <p className="concept-hero-body">
            FitMeet 将社交从信息流带入需求流。你说出真实生活中的需求，Agent 理解意图、结合动态画像、推荐合适的人，并在关键动作前等待你确认。
          </p>
          <div className="concept-rule" aria-hidden="true" />
          <div className="concept-demand-rail" aria-label="首发社交场景">
            {['找搭子', '约练运动', '同城交友', '相亲恋爱'].map((item) => (
              <Link key={item} to="/agent">
                {item}
              </Link>
            ))}
          </div>
          <div className="concept-cta-row">
            <Link to="/agent" className="concept-button concept-button--primary">
              进入 Agent
              <ArrowIcon />
            </Link>
            <Link to="/app#waitlist" className="concept-button">
              预约 App 内测
            </Link>
          </div>
        </div>
      </section>
      <HomeDemandFlowSection />
      <HomeProofSection />
      <HomeAgentLoopSection />
      <HomeLifeGraphSection />
      <HomeSafetySection />
      <AppWaitlistSection />
      <DeveloperAccessSection />
    </>
  );
}

function HomeDemandFlowSection() {
  return (
    <WebsiteBand
      label="需求流社交"
      title="别再刷信息流，直接说出你想连接谁。"
      body="用户不是来消耗内容，而是来完成现实需求：找搭子、约练、认识朋友、认真相亲。FitMeet 让 Agent 把需求变成可解释、可确认、可执行的社交任务。"
      tone="deep"
    >
      <div className="demand-comparison">
        <article>
          <span>传统信息流</span>
          <strong>刷动态、看资料、等回复</strong>
          <p>用户花时间筛选和试探，却很难把当下需求变成真实见面。</p>
        </article>
        <article>
          <span>FitMeet 需求流</span>
          <strong>说需求、得推荐、再确认</strong>
          <p>Agent 理解场景、时间、地点、边界和偏好，直接推荐更合适的人。</p>
        </article>
      </div>
    </WebsiteBand>
  );
}

function HomeProofSection() {
  return (
    <WebsiteBand
      label="首发场景"
      title="五个高频场景，让用户第一眼知道怎么用。"
      body="每个场景都从一句真实需求开始。用户不需要理解复杂系统，只需要知道自己想找谁、做什么、何时开始。"
    >
      <div className="proof-scenario-grid">
        {proofScenarios.map((scenario) => (
          <article key={scenario.title} className="proof-scenario-card">
            <picture>
              <source type="image/webp" srcSet={scenario.webpSrcSet} sizes="(max-width: 980px) 50vw, 20vw" />
              <img
                src={scenario.image}
                alt={`${scenario.title}场景示意：${scenario.example}`}
                loading="lazy"
                decoding="async"
              />
            </picture>
            <div>
              <span>{scenario.title}</span>
              <strong className="proof-example">{scenario.example}</strong>
              <p>{scenario.body}</p>
              <Link to="/agent" className="proof-scenario-card__cta">
                用这个需求试试
              </Link>
            </div>
          </article>
        ))}
      </div>
    </WebsiteBand>
  );
}

function HomeAgentLoopSection() {
  const steps = [
    ['提出需求', '今晚想找一个同城跑步搭子。'],
    ['理解意图', 'Agent 补全时间、地点、强度和社交边界。'],
    ['读取画像', 'Life Graph 提供兴趣、节奏和偏好的授权信号。'],
    ['匹配候选', '推荐更合适的人，并解释推荐理由。'],
    ['用户确认', '是否联系、是否见面、是否交换信息，都由用户决定。'],
  ];

  return (
    <WebsiteBand
      label="Agent 工作流"
      title="Agent 负责匹配，决定权始终在用户手里。"
      body="FitMeet 的核心闭环是：提出需求、理解意图、读取画像、匹配候选、用户确认、开始连接。"
      tone="deep"
    >
      <div className="concept-loop-line">
        {steps.map(([title, body], index) => (
          <article key={title}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{title}</strong>
            <p>{body}</p>
          </article>
        ))}
      </div>
    </WebsiteBand>
  );
}

function HomeLifeGraphSection() {
  const layers = ['兴趣', '时间', '位置', '生活节奏', '社交偏好', '安全边界', '反馈记忆', '匹配预测'];

  return (
    <WebsiteBand
      label="Life Graph"
      title="后台画像不打扰用户，只让匹配更准确。"
      body="Life Graph 是后台智能系统，不是新的填写负担。它在用户授权下理解兴趣、节奏、偏好和边界，让 Agent 不是随机推荐，而是有依据地匹配。"
    >
      <div className="lifegraph-backing">
        <div>
          <strong>用户控制画像，Agent 只在授权范围内使用。</strong>
          <p>
            Life Graph 属于用户。用户可以编辑、关闭、撤回或重置关键画像信号，Agent 可以使用它帮助匹配，但不会直接暴露隐私。
          </p>
        </div>
        <div className="concept-module-grid">
          {layers.map((layer) => (
            <span key={layer}>{layer}</span>
          ))}
        </div>
      </div>
    </WebsiteBand>
  );
}

function HomeSafetySection() {
  const rules = ['联系不自动交换', '见面需要确认', '位置默认关闭', '推荐理由可解释', '画像可编辑', '授权可撤回'];

  return (
    <WebsiteBand
      label="安全与确认"
      title="真实世界社交，必须先解释、再确认。"
      body="Agent 可以理解、推荐和辅助，但不能越权替用户行动。联系、见面、位置和敏感信息相关动作都需要用户确认。"
      tone="deep"
    >
      <div className="safety-principles">
        {rules.map((rule) => (
          <span key={rule}>{rule}</span>
        ))}
      </div>
    </WebsiteBand>
  );
}

function MarketingPage({ page }: { page: Exclude<WebsitePage, 'home'> }) {
  const content = pageContent[page];

  return (
    <>
      <PlatformPageHero label={content.label} title={content.title} body={content.body} actions={content.actions} />
      <WebsiteBand label={content.label} title={content.title} tone="deep">
        <div className="concept-panel-grid concept-panel-grid--wide">
          {content.panels.map((panel) => (
            <article key={panel.title} className="concept-panel">
              <span>{panel.label}</span>
              <h3>{panel.title}</h3>
              <p>{panel.body}</p>
            </article>
          ))}
        </div>
      </WebsiteBand>
      <PageClosingSection closing={content.closing} />
      {page === 'app' ? <AppWaitlistSection /> : null}
      {page === 'lifeGraph' ? <LifeGraphModelSection /> : null}
      {page === 'developers' ? <DeveloperAccessSection /> : null}
      {page === 'safety' ? <SafetyAuditSection /> : null}
    </>
  );
}

function PageClosingSection({ closing }: { closing: MarketingPageContent['closing'] }) {
  return (
    <WebsiteBand label={closing.label} title={closing.title} body={closing.body}>
      <div className="concept-module-grid">
        {closing.items.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </WebsiteBand>
  );
}

export function PlatformPageHero({
  label,
  title,
  body,
  actions,
}: {
  label: string;
  title: string;
  body: string;
  actions: PageAction[];
}) {
  return (
    <section className="website-page-hero concept-page-hero">
      <div>
        <span className="platform-label">{label}</span>
        <h1>{title}</h1>
      </div>
      <div>
        <p>{body}</p>
        <div className="website-page-hero__actions">
          {actions.map((action) => (
            <Link key={action.label} to={action.to} className={clsx(action.variant === 'primary' && 'is-primary')}>
              {action.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function WebsiteBand({
  label,
  title,
  body,
  tone = 'default',
  children,
}: {
  label: string;
  title: string;
  body?: string;
  tone?: 'default' | 'deep';
  children: ReactNode;
}) {
  return (
    <section className={clsx('website-band', tone === 'deep' && 'website-band--deep')}>
      <div className="website-band__header">
        <span className="platform-label">{label}</span>
        <h2>{title}</h2>
        {body ? <p>{body}</p> : null}
      </div>
      {children}
    </section>
  );
}

function AppWaitlistSection() {
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
        source: 'concept_website_app',
      });
      setStatus('success');
      setEmail('');
    } catch {
      setStatus('error');
    }
  };

  return (
    <WebsiteBand
      label="App 内测"
      title="预约 FitMeet App，第一批体验需求流社交。"
      body="在手机上发起需求、查看附近机会、确认匹配、管理聊天和活动提醒。"
    >
      <div className="concept-split">
        <div className="concept-check-list">
          {['一句话发起需求', '附近机会推荐', '候选人推荐理由', '聊天与活动提醒', '安全边界确认'].map((item) => (
            <p key={item}>{item}</p>
          ))}
        </div>
        <form id="waitlist" className="waitlist-form concept-waitlist" onSubmit={handleSubmit}>
          <label>
            邮箱
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@fitmeet.world"
              autoComplete="email"
              required
            />
          </label>
          <label>
            设备
            <select value={deviceType} onChange={(event) => setDeviceType(event.target.value as WaitlistDeviceType)}>
              <option value="ios">iOS</option>
              <option value="android">Android</option>
              <option value="both">都可以</option>
            </select>
          </label>
          <button type="submit" disabled={status === 'loading'}>
            {status === 'loading' ? '提交中' : '预约 App 内测'}
          </button>
          <div aria-live="polite">
            {status === 'success' ? <p>已预约，我们会在内测开放时联系你。</p> : null}
            {status === 'error' ? <p>暂时提交失败，请稍后再试。</p> : null}
          </div>
        </form>
      </div>
    </WebsiteBand>
  );
}

function LifeGraphModelSection() {
  const nodes = ['兴趣', '位置', '时间', '运动习惯', '社交偏好', '安全边界', '互动记忆', '匹配预测'];

  return (
    <WebsiteBand label="画像结构" title="每一层都必须可解释、可授权、可撤回。">
      <div className="concept-module-grid">
        {nodes.map((node) => (
          <span key={node}>{node}</span>
        ))}
      </div>
    </WebsiteBand>
  );
}

function DeveloperAccessSection() {
  const modules = ['Agent API', 'Tool Registry', 'Webhook', 'Agent Token', 'social-skills', 'Sandbox'];

  return (
    <WebsiteBand label="开发者预览" title="未来让外部 Agent 接入真实生活社交网络。">
      <div className="concept-terminal">
        <span>开发者接入模块</span>
        {modules.map((module) => (
          <code key={module}>{module}</code>
        ))}
        <Link to="/developers/social-skills">查看开发者文档</Link>
      </div>
    </WebsiteBand>
  );
}

function SafetyAuditSection() {
  const rows = ['捕获意图', '确认授权边界', '评估场景风险', '等待用户确认'];

  return (
    <WebsiteBand label="审计序列" title="真实世界行动之前，先建立信任。">
      <ol className="concept-audit-list">
        {rows.map((row, index) => (
          <li key={row}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{row}</strong>
          </li>
        ))}
      </ol>
    </WebsiteBand>
  );
}

function WebsiteFooter() {
  return (
    <footer className="website-footer concept-footer">
      <strong>FitMeet</strong>
      <span>需求流社交平台，让用户提出真实需求，由 Agent 帮助完成现实世界连接。</span>
      <nav aria-label="FitMeet 页脚导航">
        <Link to="/ecosystem">需求流社交</Link>
        <Link to="/life-graph">Life Graph</Link>
        <Link to="/agent">Agent 入口</Link>
        <Link to="/app#waitlist">预约 App</Link>
        <Link to="/safety">安全体系</Link>
        <Link to="/developers">开发者预览</Link>
        <Link to="/privacy">隐私政策</Link>
        <Link to="/terms">用户协议</Link>
        <a href={ICP_URL} target="_blank" rel="noreferrer">
          {ICP_TEXT}
        </a>
      </nav>
    </footer>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path
        d="M5 10h9M10.5 5.5 15 10l-4.5 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
