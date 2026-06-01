export const siteMeta = {
  name: 'FitMeet',
  legalName: 'FitMeet 需求流社交与 Agent 平台',
  url: 'https://ourfitmeet.cn',
  logo: 'https://ourfitmeet.cn/favicon.svg',
  sameAs: ['https://ourfitmeet.cn/about', 'https://ourfitmeet.cn/press'],
  contactEmail: 'hello@ourfitmeet.cn',
  description:
    'FitMeet 是面向真实世界连接的 AI 社交平台，从信息流走向需求流，围绕同城社交、约练、找搭子、找朋友和相亲恋爱，由 Agent 帮助用户把需求变成可解释、可确认、可达成的现实连接。',
  shortDescription: '用 Agent 启动真实社交，用 Life Graph 管理可授权的生活上下文。',
  keywords: [
    'FitMeet',
    'Social World',
    '需求流社交',
    'AI 社交平台',
    'Agent 社交',
    'Life Graph',
    '同城社交',
    '约练',
    '找搭子',
    '找朋友',
    '相亲恋爱',
    '运动搭子 App',
    '约练 App',
    '附近跑步搭子',
    '健身房搭子',
    '拍照搭子',
    '周末搭子',
    'Agent 生活助手',
  ],
} as const;

export type SiteMeta = typeof siteMeta;
