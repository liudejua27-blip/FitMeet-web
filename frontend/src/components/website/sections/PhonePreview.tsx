import { appTabs } from '../content/website-content';

const phoneScreens = [
  {
    title: 'Agent 对话',
    src: '/images/fitmeet/website/social-world-phone-agent-v3.jpg',
    alt: 'FitMeet Agent 生成约练卡片页面',
  },
  {
    title: '发现页',
    src: '/images/fitmeet/website/social-world-phone-discover-v3.jpg',
    alt: 'FitMeet Discover 推荐匹配页面',
  },
  {
    title: '消息页',
    src: '/images/fitmeet/website/social-world-phone-messages-v3.jpg',
    alt: 'FitMeet 消息和约练邀请页面',
  },
  {
    title: '个人中心',
    src: '/images/fitmeet/website/social-world-phone-profile-v3.jpg',
    alt: 'FitMeet 个人中心和隐私设置页面',
  },
] as const;

export function PhonePreview() {
  return (
    <div className="fm-phone-wrap">
      <div className="fm-app-showcase" aria-label="FitMeet App 首页、发现、消息和我的页面预览">
        {phoneScreens.map((screen) => (
          <figure key={screen.title} className="fm-app-showcase__screen">
            <img src={screen.src} alt={screen.alt} loading="lazy" decoding="async" />
            <figcaption>{screen.title}</figcaption>
          </figure>
        ))}
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
