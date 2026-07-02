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
      '从一句当前需求开始。FitMeet Agent 把想认识谁、何时方便、怎样开始整理成可确认卡片，再接入发现、匹配和消息。',
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
      'FitMeet 不把社交做成更热闹的信息流，而是把需求、卡片、发现、匹配和消息做成一条稳定路径。',
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
      '每一次公开、联系和资料更新都需要清楚边界。FitMeet 把隐私、确认、撤回和审计放在关键动作旁边。',
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
      '在 App 里继续完整闭环：Agent 发起需求，发现页匹配合适的人，消息页承接后续，个人中心管理边界。',
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
      'FitMeet 希望把社交从随机刷人带回真实生活。先有明确需求，再有确认、发现、匹配和后续沟通。',
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
      '不用登录，走完一次需求输入、Agent 生成卡片、用户确认、发现匹配和安全边界。',
    actions: [
      { label: '开始 Demo', to: '#demo-flow', variant: 'primary' },
      { label: '进入 Agent', to: '/agent' },
    ],
    proofItems: ['需求输入', '卡片确认', '发现可见'],
    layout: 'center',
  },
} satisfies Record<string, EnterpriseHeroConfig>;
