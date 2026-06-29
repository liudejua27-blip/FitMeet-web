import clsx from 'clsx';

export type EnterpriseHeroVisualVariant = 'home' | 'features' | 'safety' | 'download' | 'about';

export function EnterpriseHeroVisual({ variant }: { variant: EnterpriseHeroVisualVariant }) {
  return (
    <figure
      className={clsx('fm-product-proof-visual', `fm-product-proof-visual--${variant}`)}
      aria-label={visualLabels[variant]}
    >
      <img src={visualImages[variant]} alt={visualLabels[variant]} loading="eager" decoding="async" />
      <figcaption className="fm-product-proof-visual__caption">
        <span>{visualKickers[variant]}</span>
        <strong>{visualTitles[variant]}</strong>
      </figcaption>
      <div className="fm-product-proof-visual__chips" aria-label="产品状态">
        {visualChips[variant].map((chip) => (
          <span key={chip}>{chip}</span>
        ))}
      </div>
    </figure>
  );
}

const visualLabels: Record<EnterpriseHeroVisualVariant, string> = {
  home: 'FitMeet Social World 黑金 App 需求流产品预览',
  features: 'FitMeet Agent、Discover、Matching、Messages 和 Safety 产品能力图',
  safety: 'FitMeet 安全确认、隐私保护和审计追踪能力图',
  download: 'FitMeet App 首页、发现、消息和个人中心黑金展示',
  about: 'FitMeet Social World 全球真实社交愿景黑金视觉',
};

const visualTitles: Record<EnterpriseHeroVisualVariant, string> = {
  home: 'Agent -> 约练卡 -> Discover',
  features: 'Social primitives',
  safety: 'Safety primitives',
  download: 'FitMeet AI Social App',
  about: 'Social World',
};

const visualKickers: Record<EnterpriseHeroVisualVariant, string> = {
  home: 'Social World',
  features: 'Product system',
  safety: 'Trust system',
  download: 'Beta preview',
  about: 'Company vision',
};

const visualImages: Record<EnterpriseHeroVisualVariant, string> = {
  home: '/images/fitmeet/website/social-world-hero-clean-v3.jpg',
  features: '/images/fitmeet/website/social-world-product-suite-v4.jpg',
  safety: '/images/fitmeet/website/social-world-product-suite-v4.jpg',
  download: '/images/fitmeet/website/social-world-hero-clean-v3.jpg',
  about: '/images/fitmeet/website/social-world-about-earth-v3.jpg',
};

const visualChips: Record<EnterpriseHeroVisualVariant, string[]> = {
  home: ['需求卡片', '确认发布', '消息承接'],
  features: ['Agent', 'Discover', 'Matching', 'Messages'],
  safety: ['隐私确认', '可撤回', '可审计'],
  download: ['iOS Beta', 'Android Beta', 'Web 体验'],
  about: ['需求先行', '真实生活', '可控 Agent'],
};
