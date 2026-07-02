export type WebsitePage = 'home' | 'features' | 'download' | 'safety' | 'about' | 'demo';

export type WebsiteSeo = {
  title: string;
  description: string;
  path: string;
};

export const SITE_URL = 'https://www.ourfitmeet.cn';
export const ICP_TEXT = import.meta.env.VITE_ICP_TEXT || '鲁ICP备2026015946号-2';
export const ICP_URL = import.meta.env.VITE_ICP_URL || 'http://beian.miit.gov.cn/';

export const contactChannels = {
  business: '152530005312@163.com',
  media: '152530005312@163.com',
  safety: '152530005312@163.com',
} as const;

export const footerContactEmail = '152530005312@163.com';

export const navItems = [
  { to: '/', label: '首页' },
  { to: '/discover', label: '发现' },
  { to: '/features', label: '产品功能' },
  { to: '/agent', label: 'Agent' },
  { to: '/safety', label: '安全' },
  { to: '/download', label: '下载 App' },
  { to: '/about', label: '关于我们' },
];

export const seo: Record<WebsitePage, WebsiteSeo> = {
  home: {
    title: 'FitMeet | Social World 让社交更简单',
    description:
      'FitMeet 是面向真实生活连接的 Social World。用户先说出需求，再由 Agent 生成可确认卡片，并接入发现、匹配、消息和安全边界。',
    path: '/',
  },
  features: {
    title: 'FitMeet 产品功能 | Social World 怎么帮助用户社交',
    description:
      '了解 FitMeet 如何把需求、卡片、发现、匹配和消息做成一条稳定路径，让真实生活连接更容易开始。',
    path: '/features',
  },
  download: {
    title: '下载 FitMeet App | Social World Beta',
    description:
      '预约 FitMeet App Beta，在移动端继续 Agent、发现、消息、个人中心和安全边界的完整闭环。',
    path: '/download',
  },
  safety: {
    title: 'FitMeet Safety Center | 隐私、确认、审计与撤回',
    description:
      'FitMeet Safety Center 说明公开、联系、资料更新和数据处理中的隐私、确认、撤回、审计与举报机制。',
    path: '/safety',
  },
  about: {
    title: '关于 FitMeet | Social World',
    description: 'FitMeet 希望把社交从随机刷人带回真实生活，从明确需求开始，走向可确认、可继续的真实连接。',
    path: '/about',
  },
  demo: {
    title: 'FitMeet 30 秒 Demo | 免登录理解产品',
    description: '不用登录，30 秒看懂 FitMeet：需求输入、卡片生成、用户确认、发现匹配和安全边界。',
    path: '/demo',
  },
};

export const safetyItems = [
  ['隐私', '精确位置、联系方式和敏感资料默认隐藏，只在用户确认后进入下一步。'],
  ['确认', '发布、邀请、私信、加好友和资料更新都保持独立确认。'],
  ['审计', '关键动作保留状态记录，让发布、匹配和会话都能追踪。'],
  ['撤回', '需求卡、匹配授权、画像信号和公开可见性都可以撤回或关闭。'],
  ['举报', '用户、活动、消息和推荐卡片都提供举报与拉黑入口。'],
  ['数据删除', '账号数据、画像记录、敏感字段和历史活动支持删除请求。'],
] as const;

export const enterpriseLoopCopy = [
  ['表达需求', '先说明想找谁、做什么、何时方便，而不是先刷一堆陌生人。'],
  ['生成卡片', 'Agent 把自然语言整理成用户能检查的约练、交友或搭子卡片。'],
  ['进入发现', '确认后同步到发现页，详情、候选搜索和消息读取同一条记录。'],
  ['匹配推进', '兴趣、地点、时间、互动风格和安全边界共同影响推荐。'],
  ['回到消息', '邀请、私信、加好友和后续确认回到同一个会话。'],
] as const;

export const socialWorldPrimitives = [
  ['Intent', '把一句需求变成起点', '约练、交友、找搭子不再混在闲聊里，先明确想认识什么样的人。'],
  ['Card', 'Agent 生成可确认卡片', '时间、地点、兴趣、边界和公开状态一次看清，用户确认后才推进。'],
  ['Discover', '真实需求进入发现', '公开列表、详情页和候选搜索读取同一条记录，避免“发布了但看不见”。'],
  ['Match', '匹配给出可读理由', '不只给名单，也解释为什么适合、哪里需要谨慎、下一步该怎么聊。'],
  ['Inbox', '消息承接真实关系', '邀请、私信、好友和约练确认回到同一个会话，让连接继续发生。'],
] as const;

export const featurePillars = [
  ['Agent 卡片化', '把一句“想找人”整理成含目标、时间、地点、兴趣和边界的社交卡片。'],
  ['Discover 可读回', '公开卡片、详情页和候选搜索指向同一条记录，让需求真的可见。'],
  ['Matching 有解释', '候选推荐带上距离、时间、兴趣和互动风格理由，不只看头像。'],
  ['Messages 承接', '邀请、私信、加好友和后续确认进入消息页，从匹配走向沟通。'],
] as const;

export const agentCapabilities = [
  ['理解自然语言', '识别用户想约练、交友、找搭子还是继续上次任务。'],
  ['生成可确认卡片', '任何公开发布、私信和加好友都先变成用户能确认的产品动作。'],
  ['维护上下文', '最近会话、资料缺口、待发布草稿和匹配状态共同进入下一轮判断。'],
] as const;

export const downloadOptions = [
  ['iOS Beta', '面向第一批真实社交场景用户开放，优先验证需求卡和消息承接。'],
  ['Android Beta', '保留同一套 Social World 体验：Agent、发现、消息和个人资料。'],
  ['Web 体验', '不安装 App 也可以先进入发现和 Agent，体验完整的需求流社交。'],
] as const;

export const safetyPrimitives = [
  ['默认隐藏', '联系方式、精确位置和敏感画像默认不进入公开卡片。'],
  ['确认执行', '发布、匹配授权、私信和好友动作保持独立确认，AI 不替用户越界。'],
  ['可撤回', '需求卡、公开状态、画像信号和匹配授权都能撤回，用户始终可控。'],
  ['可审计', '关键状态变更留下记录，便于复盘、恢复和处理异常。'],
] as const;

export const appTabs = [
  ['首页', '看到需求进展和下一步'],
  ['发现', '公开需求卡和附近同频用户'],
  ['Agent', '发起需求、补齐画像、确认发布'],
  ['消息', '邀请、私信、好友和对方回复'],
  ['我的', '个人信息、兴趣爱好和安全边界'],
] as const;

export const productSurfaces = [
  {
    title: 'Agent 生成 Social Card',
    label: 'Agent',
    body: '把约练、交友、搭子需求转成结构化卡片，让社交更简单。',
    image: '/images/fitmeet/website/social-world-direction-one-product.jpg',
    alt: 'FitMeet Agent 产品流程示意',
  },
  {
    title: 'Discover 真实可见',
    label: 'Discover',
    body: '确认后公开，详情页和候选搜索可读回，不让需求停在聊天里。',
    image: '/images/fitmeet/website/social-world-discover-product-v1.jpg',
    alt: 'FitMeet Discover 产品流程示意',
  },
  {
    title: 'Messages 承接后续',
    label: 'Messages',
    body: '邀请、私信、加好友进入同一个 conversation，从匹配走向真实沟通。',
    image: '/images/fitmeet/website/social-world-features-system-v1.jpg',
    alt: 'FitMeet 消息承接产品流程示意',
  },
] as const;

export const footerColumns = [
  {
    title: '产品',
    links: [
      { label: 'FitMeet Agent', to: '/agent' },
      { label: '发现', to: '/discover' },
      { label: '产品功能', to: '/features' },
      { label: '下载 App', to: '/download' },
    ],
  },
  {
    title: '公司',
    links: [
      { label: '关于我们', to: '/about' },
      { label: '联系合作', to: '/about#contact' },
      { label: '媒体资料', to: '/about#media' },
      { label: '当前阶段', to: '/about#stage' },
    ],
  },
  {
    title: '安全与法律',
    links: [
      { label: 'Safety Center', to: '/safety' },
      { label: '隐私政策', to: '/privacy' },
      { label: '用户协议', to: '/terms' },
      { label: '举报与数据删除', to: '/safety#governance' },
    ],
  },
] as const;
