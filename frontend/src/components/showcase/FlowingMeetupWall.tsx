import clsx from 'clsx';
import type { CSSProperties } from 'react';

export type FlowingMeetupCard = {
  id: string;
  title: string;
  owner: string;
  meta: string;
  tags: string[];
  accent?: string;
  status?: string;
  score?: string;
};

const fallbackCards: FlowingMeetupCard[] = [
  {
    id: 'fallback-run',
    title: '今晚 8 点海边慢跑',
    owner: 'FitMeet Agent',
    meta: '青岛 · 低压力 · 3km',
    tags: ['跑步', '站内先聊'],
    accent: '#19b58f',
    status: '开放加入',
    score: '92%',
  },
  {
    id: 'fallback-gym',
    title: '周末力量训练搭子',
    owner: '公开需求',
    meta: '健身房 · 初中级 · 2 人',
    tags: ['力量', '公共场所'],
    accent: '#d9792d',
    status: '匹配中',
    score: '87%',
  },
  {
    id: 'fallback-walk',
    title: '饭后散步聊天',
    owner: 'Life Graph 推荐',
    meta: '附近 1.2km · 今晚',
    tags: ['散步', '轻社交'],
    accent: '#5e8ce6',
    status: '待确认',
    score: '81%',
  },
];

export function FlowingMeetupWall({
  cards,
  className,
  compact = false,
  tone = 'dark',
}: {
  cards: FlowingMeetupCard[];
  className?: string;
  compact?: boolean;
  tone?: 'dark' | 'light';
}) {
  const source = cards.length > 0 ? cards : fallbackCards;
  const enoughCards = Array.from({ length: Math.max(10, source.length * 2) }, (_, index) => {
    const item = source[index % source.length];
    return { ...item, id: `${item.id}-${index}` };
  });
  const rows = [
    enoughCards,
    [...enoughCards.slice(3), ...enoughCards.slice(0, 3)],
    [...enoughCards.slice(6), ...enoughCards.slice(0, 6)],
  ];

  return (
    <section
      className={clsx(
        'flowing-meetup-wall',
        tone === 'light' && 'flowing-meetup-wall--light',
        compact && 'flowing-meetup-wall--compact',
        className,
      )}
      aria-label="实时流动的约练机会卡片"
    >
      <div className="flowing-meetup-wall__viewport">
        {rows.map((row, rowIndex) => (
          <div
            key={rowIndex}
            className={clsx('flowing-meetup-wall__row', rowIndex % 2 === 1 && 'is-reverse')}
            style={{ '--row-speed': `${compact ? 30 + rowIndex * 4 : 38 + rowIndex * 5}s` } as CSSProperties}
          >
            {[...row, ...row].map((card, index) => (
              <article key={`${card.id}-${index}`} className="flowing-meetup-card">
                <span
                  className="flowing-meetup-card__avatar"
                  style={{ background: card.accent ?? '#19b58f' }}
                  aria-hidden="true"
                >
                  {card.owner.slice(0, 1)}
                </span>
                <div className="flowing-meetup-card__main">
                  <div className="flowing-meetup-card__topline">
                    <strong>{card.title}</strong>
                    {card.score ? <em>{card.score}</em> : null}
                  </div>
                  <p>{card.meta}</p>
                  <div>
                    {(card.status ? [card.status, ...card.tags] : card.tags).slice(0, 3).map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
