import {
  Activity,
  CalendarClock,
  CheckCircle2,
  Download,
  LockKeyhole,
  MapPin,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import clsx from 'clsx';

export type EnterpriseHeroVisualVariant = 'home' | 'features' | 'safety' | 'download';

export function EnterpriseHeroVisual({ variant }: { variant: EnterpriseHeroVisualVariant }) {
  return (
    <figure
      className={clsx('fm-product-proof-visual', `fm-product-proof-visual--${variant}`)}
      aria-label={visualLabels[variant]}
    >
      <div className="fm-product-proof-visual__top">
        <span>FitMeet</span>
        <strong>{visualTitles[variant]}</strong>
      </div>
      {variant === 'home' ? <HomeProofVisual /> : null}
      {variant === 'features' ? <FeaturesProofVisual /> : null}
      {variant === 'safety' ? <SafetyProofVisual /> : null}
      {variant === 'download' ? <DownloadProofVisual /> : null}
      <div className="fm-product-proof-visual__chips" aria-label="产品状态">
        {visualChips[variant].map((chip) => (
          <span key={chip}>{chip}</span>
        ))}
      </div>
    </figure>
  );
}

const visualLabels: Record<EnterpriseHeroVisualVariant, string> = {
  home: 'FitMeet Agent 生成约练卡并发布到发现页的产品流程',
  features: 'FitMeet 需求卡、匹配候选和消息推进的产品流程',
  safety: 'FitMeet 确认、审计和撤回安全流程',
  download: 'FitMeet App 下载和 Beta 状态',
};

const visualTitles: Record<EnterpriseHeroVisualVariant, string> = {
  home: 'Agent -> 约练卡 -> Discover',
  features: '需求流产品台',
  safety: '安全确认台',
  download: '移动端 Beta',
};

const visualChips: Record<EnterpriseHeroVisualVariant, string[]> = {
  home: ['确认后公开', 'Discover 可读回'],
  features: ['解释推荐理由', '候选进入消息'],
  safety: ['不自动越界', '可撤回可审计'],
  download: ['iOS / Android', 'Web 可先体验'],
};

function HomeProofVisual() {
  return (
    <div className="fm-proof-flow fm-proof-flow--home">
      <div className="fm-proof-chat">
        <span>用户需求</span>
        <p>帮我发布一张约练卡，今晚 6 点青岛中山公园散步，按默认安全设置处理。</p>
      </div>
      <div className="fm-proof-card fm-proof-card--slot">
        <header>
          <Sparkles size={18} aria-hidden="true" />
          <strong>约练卡片预览</strong>
        </header>
        <h2>中山公园轻松散步</h2>
        <div>
          <span>
            <MapPin size={15} aria-hidden="true" />
            青岛中山公园
          </span>
          <span>
            <CalendarClock size={15} aria-hidden="true" />
            今晚 18:00
          </span>
        </div>
        <p>公共场所 · 站内先聊 · 不交换联系方式</p>
      </div>
      <div className="fm-proof-card fm-proof-card--discover">
        <header>
          <CheckCircle2 size={18} aria-hidden="true" />
          <strong>Discover 已同步</strong>
        </header>
        <p>公开卡片、详情页和候选搜索使用同一条可读回记录。</p>
      </div>
    </div>
  );
}

function FeaturesProofVisual() {
  const stages = [
    {
      body: '城市、活动、时间、地点和安全边界先结构化。',
      icon: Activity,
      title: '需求卡',
    },
    {
      body: '共同兴趣、时间地点和互动节奏进入推荐理由。',
      icon: UsersRound,
      title: '候选池',
    },
    {
      body: '邀请、私信、加好友进入同一个 conversation。',
      icon: MessageCircle,
      title: '消息推进',
    },
  ];

  return (
    <div className="fm-proof-stage-grid">
      {stages.map(({ body, icon: Icon, title }, index) => (
        <article key={title}>
          <span>{String(index + 1).padStart(2, '0')}</span>
          <Icon size={20} aria-hidden="true" />
          <strong>{title}</strong>
          <p>{body}</p>
        </article>
      ))}
    </div>
  );
}

function SafetyProofVisual() {
  return (
    <div className="fm-proof-safety-console">
      <div>
        <ShieldCheck size={20} aria-hidden="true" />
        <strong>发布约练卡</strong>
        <span>等待用户确认</span>
      </div>
      <div>
        <LockKeyhole size={20} aria-hidden="true" />
        <strong>联系方式</strong>
        <span>默认不公开</span>
      </div>
      <div>
        <CheckCircle2 size={20} aria-hidden="true" />
        <strong>撤回公开卡</strong>
        <span>同步取消匹配</span>
      </div>
      <ol>
        <li>生成预览，不直接保存敏感字段</li>
        <li>用户确认后才发布到发现页</li>
        <li>撤回后详情页和匹配任务同步失效</li>
      </ol>
    </div>
  );
}

function DownloadProofVisual() {
  return (
    <div className="fm-proof-download">
      <div className="fm-proof-phone">
        <header>
          <span>FitMeet</span>
          <small>Beta</small>
        </header>
        <article>
          <strong>今晚附近散步搭子</strong>
          <p>已生成约练卡 · 等待确认发布</p>
        </article>
        <article>
          <strong>2 个候选状态</strong>
          <p>同城 · 时间匹配 · 站内先聊</p>
        </article>
      </div>
      <div className="fm-proof-download__meta">
        <Download size={22} aria-hidden="true" />
        <strong>Beta 下载入口</strong>
        <p>iOS、Android 和 Web 发现页统一承接。</p>
      </div>
    </div>
  );
}
