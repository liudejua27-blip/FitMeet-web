import { contactChannels } from '../../components/website/content/website-content';
import { FinalCTA } from '../../components/website/sections/FinalCTA';
import { WebsiteHero } from '../../components/website/sections/WebsiteHero';
import { WebsiteSection } from '../../components/website/sections/WebsiteSection';

const principles = [
  ['需求先行', '用户先表达约练、交友或搭子需求，再进入匹配和发现。'],
  ['安全可信', '公共场所优先、站内先聊、确认后执行是默认原则。'],
  ['Agent 可控', 'AI 可以整理需求、完善画像和筛选候选，但不替用户越过关键边界。'],
];

const stageItems = [
  [
    '当前阶段',
    'FitMeet 正在打磨 Beta 版本，优先验证 Agent 资料补全、约练卡发布、Discover 可见、匹配推荐和消息承接。',
  ],
  [
    '产品方向',
    '围绕城市青年真实生活社交，把约练、交友和搭子需求做成 Social World 中可确认、可撤回、可追踪的闭环。',
  ],
  ['品牌使命', '让社交更简单：从随机刷人变成由具体需求驱动的真实连接。'],
];

const companySignals = [
  ['Product', '需求、发现、匹配、消息保持同一条路径。'],
  ['Safety', '公开、联系、资料保存都必须让用户确认。'],
  ['Beta', '优先打磨真实城市生活里的约练、交友和搭子场景。'],
] as const;

export function AboutWebsitePage() {
  return (
    <>
      <WebsiteHero name="about" />
      <WebsiteSection
        id="stage"
        label="Company"
        title="FitMeet 还在早期，但产品边界必须从第一天清楚。"
      >
        <figure className="fm-about-visual">
          <img
            src="/images/fitmeet/website/social-world-about-earth-v3.jpg"
            alt="FitMeet Social World 真实社交愿景黑金地球视觉"
            loading="lazy"
            decoding="async"
          />
        </figure>
        <div className="fm-about-brief">
          {stageItems.map(([title, body]) => (
            <article key={title}>
              <span>{title}</span>
              <p>{body}</p>
            </article>
          ))}
        </div>
        <div className="fm-company-signal-strip" aria-label="FitMeet 公司阶段信号">
          {companySignals.map(([title, body]) => (
            <article key={title}>
              <span>{title}</span>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </WebsiteSection>
      <WebsiteSection
        label="Principles"
        title="不追求更长停留，而是追求更清楚的开始。"
        tone="deep"
      >
        <div className="fm-about-principles">
          {principles.map(([title, body]) => (
            <article key={title}>
              <span>Value</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </WebsiteSection>
      <WebsiteSection id="contact" label="Contact" title="商务合作、媒体沟通与安全反馈。">
        <div className="fm-contact-grid">
          {[
            ['商务合作', contactChannels.business, '品牌合作、城市活动、线下场景合作。'],
            ['媒体沟通', contactChannels.media, '采访、报道、产品资料和品牌素材。'],
            ['安全反馈', contactChannels.safety, '漏洞、滥用、举报机制和安全建议。'],
          ].map(([title, email, body]) => (
            <article key={title} className="fm-contact-card">
              <span>{title}</span>
              <a href={`mailto:${email}`}>{email}</a>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </WebsiteSection>
      <section id="media" className="fm-media-note" aria-label="媒体资料">
        <span>Media Kit</span>
        <p>
          品牌素材、产品截图和媒体资料将随 Beta
          进度开放。当前如需采访或合作资料，请通过企业邮箱联系。
        </p>
      </section>
      <FinalCTA
        label="Social World"
        title="从一个真实需求开始认识人。"
        body="先体验 Agent 生成需求卡，或者进入发现页看看附近已经公开的约练、交友和搭子场景。"
        primary={{ label: '体验 Agent', to: '/agent' }}
        secondary={{ label: '进入发现', to: '/discover', siteLink: true }}
      />
    </>
  );
}
