import { Link, useNavigate } from 'react-router-dom';
import type { CSSProperties } from 'react';
import { SiteLink } from '../navigation/SiteLink';
import { navigateToDiscoverWithScrollReset } from '../../lib/scrollNavigation';

const activityCards = [
  {
    title: '今晚慢跑搭子',
    meta: '2.4km · 20:30 · 低压力',
    tag: 'Agent 推荐',
    score: '94',
    detailHref: '/discover',
  },
  {
    title: '周末力量训练',
    meta: '健身房 · 初中级 · 2 人',
    tag: '站内确认',
    score: '88',
    detailHref: '/discover',
  },
  {
    title: '饭后散步聊天',
    meta: '附近公园 · 先线上聊',
    tag: '安全优先',
    score: '81',
    detailHref: '/discover',
  },
];

const signalRows = [
  ['理解需求', '结合 Life Graph', '筛选候选人', '生成开场白'],
  ['公开场所', '站内先聊', '确认后执行', '行程可见'],
];

export function ProductMotionShowcase() {
  const navigate = useNavigate();

  const jumpToDiscover = () => {
    navigateToDiscoverWithScrollReset(navigate, {
      behavior: 'auto',
    });
  };

  return (
    <section className="product-motion-showcase" aria-label="FitMeet 产品动态展示">
      <div className="product-motion-showcase__copy">
        <h2>不是信息流，是一个会帮你推进真实见面的社交系统。</h2>
        <p>
          官网需要让用户第一眼看懂 FitMeet 的核心体验：告诉 Agent
          你想认识谁，它结合时间、地点、画像和安全边界，把附近机会变成可确认的下一步。
        </p>
        <div>
          <Link to="/agent">体验 Agent</Link>
          <button type="button" onClick={jumpToDiscover}>进入发现</button>
        </div>
      </div>

      <div className="product-motion-showcase__screen" aria-hidden="true">
        <div className="product-motion-map">
          <span className="product-motion-map__ring product-motion-map__ring--one" />
          <span className="product-motion-map__ring product-motion-map__ring--two" />
          <span className="product-motion-map__pin product-motion-map__pin--one" />
          <span className="product-motion-map__pin product-motion-map__pin--two" />
          <span className="product-motion-map__pin product-motion-map__pin--three" />
        </div>
        <div className="product-motion-phone">
          <header>
            <span />
            <strong>FitMeet</strong>
            <em>Live</em>
          </header>
          <main>
            {activityCards.map((card) => (
              <SiteLink
                key={card.title}
                to={card.detailHref}
                className="product-motion-showcase__scene-card"
                aria-label={`查看${card.title}详情`}
              >
                <article>
                  <div>
                    <strong>{card.title}</strong>
                    <p>{card.meta}</p>
                  </div>
                  <span>{card.score}</span>
                  </article>
              </SiteLink>
            ))}
          </main>
        </div>
        <div className="product-motion-agent">
          <strong>Agent 正在筛选</strong>
          {signalRows.map((row, index) => (
            <div key={index}>
              {row.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          ))}
        </div>
        <div className="product-motion-lanes">
          {activityCards.map((card, index) => (
            <SiteLink
              key={card.title}
              to={card.detailHref}
              className="product-motion-lane-link"
              style={{ '--lane-delay': `${index * -3}s` } as CSSProperties}
            >
              {card.tag} · {card.title}
            </SiteLink>
          ))}
        </div>
      </div>
    </section>
  );
}
