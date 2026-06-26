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
  business: 'contact@ourfitmeet.cn',
  media: 'contact@ourfitmeet.cn',
  safety: 'security@ourfitmeet.cn',
} as const;

export const footerContactEmail = '15253005312@163.com';

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
    title: 'FitMeet | 需求流社交，让 Agent 帮你匹配合适的人',
    description:
      'FitMeet 把社交从刷信息流变成需求流。用户说出想认识什么样的人，Agent 基于目标、兴趣、时间、地点和安全边界匹配，并在确认后发布到发现页。',
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

export const safetyItems = [
  ['隐私', '精确位置、身体信息、联系方式默认隐藏，只在用户本人界面可见。'],
  ['确认', '发邀请、加入活动、共享位置、更新敏感个人信息前都需要用户确认。'],
  ['审计', 'Agent 的关键判断、工具调用和权限变化保留可回看记录。'],
  ['撤回', '授权、画像信号、活动申请和推荐偏好都可以撤回或关闭。'],
  ['举报', '用户、活动、消息和推荐卡片都提供举报与拉黑入口。'],
  ['数据删除', '账号数据、画像记录、敏感字段和历史活动支持删除请求。'],
] as const;

export const enterpriseLoopCopy = [
  ['说出需求', '用户先说清楚想找谁、做什么、什么时候方便。'],
  ['生成卡片', 'Agent 把需求整理成可发布的约练、交友或搭子卡片。'],
  ['匹配候选', '用兴趣、爱好、地点、时间和安全边界筛选同频用户。'],
  ['确认发布', '用户确认后再发布到发现页，或继续发起邀请、私信、加好友。'],
  ['消息推进', '后续回复、邀请和安全提醒统一回到消息和 Agent 闭环。'],
] as const;

export const featurePillars = [
  ['需求卡片', '把“想找一个跑步搭子”“想认识同城朋友”“想找旅游搭子”整理成可匹配的公开需求。'],
  ['匹配理由', '每次推荐说明为什么合适：共同兴趣、时间地点接近、互动节奏和安全边界相容。'],
  ['发现同步', '用户确认发布后，需求进入发现页，其他同频用户可以看到真实的新卡片和详情页。'],
  ['可控动作', '发布、邀请、加好友、私信和公开位置都先确认；查看、收藏、生成开场白保持轻量。'],
] as const;

export const agentCapabilities = [
  ['理解需求', '从自然语言里识别当前目标、互动形式、时间地点、活动偏好和必要边界。'],
  ['生成卡片', '找约练时先生成约练卡，再推荐候选；交友和搭子需求也先沉淀成可确认卡片。'],
  ['筛选候选', '结合个人资料、兴趣爱好、公开需求、距离、时间和安全边界，给出可解释推荐。'],
] as const;

export const downloadOptions = [
  ['iOS TestFlight', '内测开放后提供邀请链接，适合第一批体验用户。'],
  ['Android Beta', '预留 Android 测试包入口，部署后接入真实下载地址。'],
  ['Web 发现页', '不安装 App 也可以先进入发现，查看 Social World 的核心体验。'],
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
    title: 'Agent 生成需求卡',
    label: 'Agent',
    body: '从一句自然语言开始，补齐时间、地点、活动偏好和安全边界。',
    image: '/images/fitmeet/generated/social-world-features-visual-1200.jpg',
    alt: 'FitMeet Agent 产品流程示意',
  },
  {
    title: 'Discover 公开可见',
    label: 'Discover',
    body: '用户确认后进入发现页，公开卡片和详情页保持一致。',
    image: '/images/fitmeet/generated/social-world-app-scenes-v2-1200.jpg',
    alt: 'FitMeet Discover 产品流程示意',
  },
  {
    title: '消息页承接后续',
    label: 'Messages',
    body: '私信、邀请、加好友和后续确认都回到同一个会话。',
    image: '/images/fitmeet/generated/social-world-download-visual-v2-1200.jpg',
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
