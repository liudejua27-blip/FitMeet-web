import { memo, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * CitiesPage — 城市与附近生活
 *
 * 展示我们覆盖的城市，强调"附近 3 公里"的本地化叙事。
 * 数据为前端展示数据 (mock)，后续可由后端 /api/cities 提供。
 */

type CityCard = {
  city: string;
  pinyin: string;
  emoji: string;
  meets: number;
  pets: number;
  agents: number;
  highlight: string;
  region: '华东' | '华北' | '华南' | '西南' | '西北' | '华中' | '东北';
};

const CITIES: CityCard[] = [
  { city: '上海', pinyin: 'Shanghai', emoji: '🏙️', meets: 3124, pets: 982, agents: 1480, region: '华东', highlight: '滨江夜跑 · 外滩骑行' },
  { city: '北京', pinyin: 'Beijing', emoji: '🏯', meets: 2987, pets: 871, agents: 1320, region: '华北', highlight: '奥森晨跑 · 后海散步' },
  { city: '深圳', pinyin: 'Shenzhen', emoji: '🌆', meets: 2456, pets: 754, agents: 1180, region: '华南', highlight: '湾区骑行 · 深圳湾遛狗' },
  { city: '杭州', pinyin: 'Hangzhou', emoji: '🌊', meets: 1832, pets: 612, agents: 870, region: '华东', highlight: '西湖徒步 · 钱江晨跑' },
  { city: '成都', pinyin: 'Chengdu', emoji: '🐼', meets: 1654, pets: 698, agents: 720, region: '西南', highlight: '锦江遛狗 · 露营圈' },
  { city: '广州', pinyin: 'Guangzhou', emoji: '🌺', meets: 1521, pets: 543, agents: 690, region: '华南', highlight: '珠江夜跑 · 茶山徒步' },
  { city: '武汉', pinyin: 'Wuhan', emoji: '🌉', meets: 1102, pets: 411, agents: 480, region: '华中', highlight: '东湖骑行 · 江滩散步' },
  { city: '西安', pinyin: "Xi'an", emoji: '🏛️', meets: 987, pets: 367, agents: 410, region: '西北', highlight: '城墙骑行 · 大雁塔' },
  { city: '南京', pinyin: 'Nanjing', emoji: '🌳', meets: 921, pets: 389, agents: 432, region: '华东', highlight: '玄武湖夜跑' },
  { city: '苏州', pinyin: 'Suzhou', emoji: '🪷', meets: 812, pets: 312, agents: 358, region: '华东', highlight: '金鸡湖骑行' },
  { city: '青岛', pinyin: 'Qingdao', emoji: '🌊', meets: 745, pets: 287, agents: 312, region: '华北', highlight: '海边晨跑' },
  { city: '重庆', pinyin: 'Chongqing', emoji: '🏔️', meets: 1043, pets: 421, agents: 489, region: '西南', highlight: '南山徒步 · 江滩遛狗' },
];

const REGIONS = ['全部', '华东', '华北', '华南', '华中', '西南', '西北', '东北'] as const;

export const CitiesPage = memo(function CitiesPage() {
  const [region, setRegion] = useState<(typeof REGIONS)[number]>('全部');
  const [keyword, setKeyword] = useState('');

  useEffect(() => {
    document.title = '城市 · OurFitMeet — 附近 3 公里，重新变成熟人社会';
  }, []);

  const list = useMemo(() => {
    return CITIES.filter((c) => {
      if (region !== '全部' && c.region !== region) return false;
      if (keyword && !c.city.includes(keyword) && !c.pinyin.toLowerCase().includes(keyword.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [region, keyword]);

  return (
    <div className="bg-[#0a0a08] text-cream">
      {/* HERO */}
      <section className="relative isolate overflow-hidden px-4 pt-16 pb-12 sm:px-6 lg:px-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-50 blur-3xl"
          style={{
            background:
              'radial-gradient(700px 400px at 30% 30%, rgba(255,107,53,0.25), transparent 60%),' +
              'radial-gradient(700px 400px at 80% 60%, rgba(82,183,136,0.20), transparent 60%)',
          }}
        />
        <div className="mx-auto max-w-5xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-xs font-bold text-textMuted">
            CITIES · 附近生活
          </span>
          <h1 className="mt-4 font-display text-[clamp(36px,6vw,64px)] font-black leading-[1.05] text-white">
            从你脚下的
            <span className="bg-gradient-to-r from-human via-amber to-petBright bg-clip-text text-transparent">
              {' '}3 公里{' '}
            </span>
            开始。
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-textMuted">
            我们不打算让你跨城市谈恋爱。本地化是我们的第一性原理 —— 先看附近，再看城市，最后才是兴趣圈层。
            目前覆盖 {CITIES.length}+ 座主要城市，每周仍在扩展。
          </p>
        </div>
      </section>

      {/* FILTER */}
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {REGIONS.map((r) => (
              <button
                key={r}
                onClick={() => setRegion(r)}
                className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
                  region === r
                    ? 'bg-lime text-white shadow-glow'
                    : 'border border-white/10 bg-white/[0.04] text-textMuted hover:border-lime/40 hover:text-cream'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <input
            type="search"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索城市 (中文 / 拼音)"
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-cream placeholder:text-textSofter focus:border-lime/50 focus:outline-none lg:w-72"
          />
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => (
            <article
              key={c.city}
              className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:-translate-y-1 hover:border-lime/40 hover:bg-white/[0.05]"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{c.emoji}</span>
                  <div>
                    <h3 className="font-display text-xl font-black text-white">{c.city}</h3>
                    <div className="text-xs text-textMuted">{c.pinyin} · {c.region}</div>
                  </div>
                </div>
                <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-bold text-textMuted">
                  ACTIVE
                </span>
              </div>
              <p className="mt-4 text-sm text-cream/80">{c.highlight}</p>
              <div className="mt-5 grid grid-cols-3 gap-2 border-t border-white/10 pt-4">
                <Stat value={c.meets} label="约练" accent="text-human" />
                <Stat value={c.pets} label="宠物" accent="text-petBright" />
                <Stat value={c.agents} label="AI" accent="text-aiBright" />
              </div>
              <Link
                to="/discover"
                className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-lime transition hover:gap-2"
              >
                查看 {c.city} 约练 →
              </Link>
            </article>
          ))}
        </div>

        {list.length === 0 && (
          <div className="mt-10 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] py-16 text-center text-sm text-textMuted">
            没有匹配的城市。试试别的关键词，或者{' '}
            <Link to="/about" className="text-lime hover:underline">
              告诉我们你希望覆盖哪里
            </Link>
            。
          </div>
        )}
      </section>

      {/* CTA */}
      <section className="px-4 pb-24 pt-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-gradient-to-br from-[#1a0e08] to-[#0a0a08] p-10 text-center">
          <h2 className="font-display text-2xl font-black text-white sm:text-3xl">
            没有看到你的城市？
          </h2>
          <p className="mt-3 text-sm text-textMuted">
            填写资料并提交几次约练后，我们会优先把工程资源投向需求集中的城市。
          </p>
          <Link
            to="/"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-lime px-6 py-3 text-sm font-black text-white shadow-glow transition hover:bg-brand2"
          >
            创建资料 →
          </Link>
        </div>
      </section>
    </div>
  );
});

const Stat = ({ value, label, accent }: { value: number; label: string; accent: string }) => (
  <div>
    <div className={`font-display text-lg font-black ${accent}`}>{value.toLocaleString()}</div>
    <div className="text-[11px] text-textSofter">{label}</div>
  </div>
);
