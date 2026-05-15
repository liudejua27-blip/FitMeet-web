export const siteMeta = {
  name: 'FitMeet',
  legalName: 'FitMeet 运动社交平台',
  url: 'https://ourfitmeet.cn',
  logo: 'https://ourfitmeet.cn/favicon.svg',
  sameAs: [
    'https://ourfitmeet.cn/about',
    'https://ourfitmeet.cn/press',
  ],
  contactEmail: 'hello@ourfitmeet.cn',
  description:
    'FitMeet 是面向中国运动社交场景的运动搭子、约练和健身互助平台，帮助用户找到附近跑步、健身、羽毛球、徒步等运动伙伴。',
  shortDescription: '找运动搭子、发起约练、发现同城健身互助。',
  keywords: [
    '运动搭子 App',
    '约练 App',
    '健身社交平台',
    '附近跑步搭子',
    '全国运动搭子',
    '上海运动搭子',
    '北京运动搭子',
    '广州运动搭子',
    '深圳运动搭子',
    '杭州运动搭子',
    '成都运动搭子',
    '羽毛球约练',
    '徒步搭子',
    '健身房搭子',
    '运动互助',
  ],
} as const;

export type SiteMeta = typeof siteMeta;
