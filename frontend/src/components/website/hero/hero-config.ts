import { type EnterpriseHeroAction } from './EnterpriseHero';

export type EnterpriseHeroConfig = {
  actions: EnterpriseHeroAction[];
  description: string;
  eyebrow: string;
  layout?: 'split' | 'center';
  proofItems: string[];
  subtitle?: string;
  title: string;
  visual?: 'home' | 'features' | 'safety' | 'download' | 'about';
};

export const websiteHeroConfig = {
  home: {
    eyebrow: '',
    title: 'Social World',
    subtitle: '让社交更简单',
    description:
      '只需说出需求，FitMeet Agent 为你生成约练卡片，确认后进入发现页，匹配合适的人，再用消息把真实连接继续推进。',
    actions: [
      { label: '让 Agent 帮我匹配', to: '/agent', variant: 'primary' },
      { label: '查看发现页', to: '/discover' },
    ],
    proofItems: ['说出需求', '生成卡片', '确认发布', '发现连接'],
    visual: 'home',
  },
  features: {
    eyebrow: 'Social World Primitives',
    title: '产品能力。',
    description:
      '让社交更简单，不是把聊天做得更热闹，而是把需求、卡片、发现、匹配和消息做成一条可执行路径。',
    actions: [
      { label: '进入发现', to: '/discover', variant: 'primary' },
      { label: '体验 Agent', to: '/agent' },
    ],
    proofItems: ['卡片生成', '候选解释', '独立确认'],
    visual: 'features',
  },
  safety: {
    eyebrow: 'Social World Safety',
    title: '安全边界。',
    description:
      'Social World 需要可信的默认机制：隐私、确认、审计、撤回、举报和数据删除，先保护人，再推进连接。',
    actions: [
      { label: '体验免登录 Demo', to: '/demo', variant: 'primary' },
      { label: '预约 App Beta', to: '/download#waitlist' },
    ],
    proofItems: ['隐私默认隐藏', '关键动作确认', '可撤回可追踪'],
    visual: 'safety',
  },
  download: {
    eyebrow: 'FitMeet App',
    title: '把 Social World 带在身边。',
    description:
      '让社交更简单的完整闭环在 App 里继续：Agent 发起需求、确认发布、发现页匹配、消息推进、个人信息和安全边界管理。',
    actions: [
      { label: '预约 Beta', to: '#waitlist', variant: 'primary' },
      { label: '先体验 Agent', to: '/agent' },
    ],
    proofItems: ['iOS Beta', 'Android Beta', 'Web 体验'],
    visual: 'download',
  },
  about: {
    eyebrow: 'About FitMeet',
    title: 'Social World，回到真实生活。',
    description:
      'FitMeet 的理念是 Social World：让社交更简单，让用户从刷信息流回到真实生活中的需求、确认、发现和消息。',
    actions: [
      { label: '联系合作', to: '#contact', variant: 'primary' },
      { label: '下载 App', to: '/download' },
    ],
    proofItems: ['需求先行', '安全可信', 'Agent 可控'],
    visual: 'about',
  },
  demo: {
    eyebrow: '30 秒 Demo',
    title: '30 秒理解 FitMeet。',
    description:
      '不用登录。走完一次需求输入、Agent 生成卡片、用户确认、发现页匹配和安全边界，就能理解 FitMeet 的产品核心。',
    actions: [
      { label: '开始 Demo', to: '#demo-flow', variant: 'primary' },
      { label: '进入 Agent', to: '/agent' },
    ],
    proofItems: ['需求输入', '卡片确认', '发现可见'],
    layout: 'center',
  },
} satisfies Record<string, EnterpriseHeroConfig>;
