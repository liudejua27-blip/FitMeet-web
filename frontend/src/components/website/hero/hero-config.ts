import { type EnterpriseHeroAction } from './EnterpriseHero';

export type EnterpriseHeroConfig = {
  actions: EnterpriseHeroAction[];
  description: string;
  eyebrow: string;
  layout?: 'split' | 'center';
  proofItems: string[];
  title: string;
  visual?: 'home' | 'features' | 'safety' | 'download';
};

export const websiteHeroConfig = {
  home: {
    eyebrow: 'Demand Flow Social',
    title: '说出需求，匹配合适的人',
    description:
      '从刷信息流，变成让 Agent 理解你想认识什么样的人，再把约练、交友和搭子需求变成可确认的真实连接。',
    actions: [
      { label: '让 Agent 帮我匹配', to: '/agent', variant: 'primary' },
      { label: '查看发现页', to: '/discover' },
    ],
    proofItems: ['需求先行', '兴趣匹配', '确认后发布'],
    visual: 'home',
  },
  features: {
    eyebrow: 'Product System',
    title: 'FitMeet 怎样把需求变成匹配。',
    description:
      '用户不需要先刷大量陌生人。先说目标，Agent 再把兴趣、爱好、时间、地点和安全边界整理成可发布、可匹配、可继续沟通的需求卡。',
    actions: [
      { label: '进入发现', to: '/discover', variant: 'primary' },
      { label: '体验 Agent', to: '/agent' },
    ],
    proofItems: ['需求卡片', '匹配理由', '可控动作'],
    visual: 'features',
  },
  safety: {
    eyebrow: 'Safety Center',
    title: '安全感出现在每个关键动作旁边。',
    description:
      '真实世界社交的安全，不是一个设置页，而是一整套默认机制：隐私、确认、审计、撤回、举报和数据删除。',
    actions: [
      { label: '体验免登录 Demo', to: '/demo', variant: 'primary' },
      { label: '预约 App Beta', to: '/download#waitlist' },
    ],
    proofItems: ['隐私默认隐藏', '动作必须确认', '记录可以回看'],
    visual: 'safety',
  },
  download: {
    eyebrow: 'FitMeet App',
    title: '下载 Social World App。',
    description:
      '移动端承载完整需求闭环：Agent 发起需求、确认发布、发现页匹配、消息推进、个人信息和安全边界管理。',
    actions: [
      { label: '预约 Beta', to: '#waitlist', variant: 'primary' },
      { label: '先体验 Agent', to: '/agent' },
    ],
    proofItems: ['iOS Beta', 'Android Beta', 'Web 发现页'],
    visual: 'download',
  },
  about: {
    eyebrow: 'About FitMeet',
    title: '我们在做一个更真实的 Social World。',
    description:
      'FitMeet 希望让社交从刷信息流回到真实生活：用户表达需求，Agent 帮助匹配，确认后再进入发现和消息。',
    actions: [
      { label: '联系合作', to: '#contact', variant: 'primary' },
      { label: '下载 App', to: '/download' },
    ],
    proofItems: ['需求先行', '安全可信', 'Agent 可控'],
    layout: 'center',
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
