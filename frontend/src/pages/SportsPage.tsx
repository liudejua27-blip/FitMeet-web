import { memo, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * SportsPage — 运动场景
 *
 * 全部运动品类的展示与过滤。
 * 数据为前端展示数据 (mock)，可后续接 /api/sports。
 */

type Sport = {
  id: string;
  name: string;
  emoji: string;
  category: '球类' | '跑步骑行' | '健身瑜伽' | '户外' | '水上' | '宠物';
  intensity: 1 | 2 | 3 | 4 | 5;
  meets: number;
  desc: string;
};

const SPORTS: Sport[] = [
  { id: 'run', name: '城市跑步', emoji: '🏃', category: '跑步骑行', intensity: 3, meets: 8923, desc: '夜跑、晨跑、配速搭子' },
  { id: 'gym', name: '健身房', emoji: '🏋️', category: '健身瑜伽', intensity: 4, meets: 6541, desc: '撸铁伙伴、私教互助' },
  { id: 'yoga', name: '瑜伽', emoji: '🧘', category: '健身瑜伽', intensity: 2, meets: 3210, desc: '室内、户外、亲子' },
  { id: 'badminton', name: '羽毛球', emoji: '🏸', category: '球类', intensity: 3, meets: 4087, desc: '约场地、找搭子、组双打' },
  { id: 'basketball', name: '篮球', emoji: '🏀', category: '球类', intensity: 4, meets: 3812, desc: '街头、场地、3v3' },
  { id: 'football', name: '足球', emoji: '⚽', category: '球类', intensity: 4, meets: 2987, desc: '11 人 / 5 人 / 7 人' },
  { id: 'tennis', name: '网球', emoji: '🎾', category: '球类', intensity: 3, meets: 1543, desc: '约场对练、技术互教' },
  { id: 'pingpong', name: '乒乓球', emoji: '🏓', category: '球类', intensity: 3, meets: 1287, desc: '社区、单位、俱乐部' },
  { id: 'pickleball', name: '匹克球', emoji: '🥎', category: '球类', intensity: 2, meets: 978, desc: '入门友好、社交属性' },
  { id: 'frisbee', name: '飞盘', emoji: '🥏', category: '户外', intensity: 3, meets: 1832, desc: '草地、城市、混合' },
  { id: 'cycle', name: '骑行', emoji: '🚴', category: '跑步骑行', intensity: 4, meets: 2341, desc: '城市、长距、山地' },
  { id: 'hike', name: '徒步', emoji: '🥾', category: '户外', intensity: 4, meets: 3102, desc: '近郊、周末、轻装' },
  { id: 'climb', name: '攀岩', emoji: '🧗', category: '户外', intensity: 5, meets: 612, desc: '室内抱石 · 户外线路' },
  { id: 'swim', name: '游泳', emoji: '🏊', category: '水上', intensity: 3, meets: 1421, desc: '泳池、公开水域' },
  { id: 'sup', name: '桨板', emoji: '🏄', category: '水上', intensity: 2, meets: 487, desc: '城市湖区、海边' },
  { id: 'ski', name: '滑雪', emoji: '⛷️', category: '户外', intensity: 4, meets: 821, desc: '雪场拼车、技术互教' },
  { id: 'walk', name: '散步遛狗', emoji: '🐕', category: '宠物', intensity: 1, meets: 5621, desc: '附近邻里、毛孩友好' },
  { id: 'dance', name: '舞蹈', emoji: '💃', category: '健身瑜伽', intensity: 3, meets: 1098, desc: '街舞、爵士、Kpop' },
  { id: 'boxing', name: '拳击', emoji: '🥊', category: '健身瑜伽', intensity: 4, meets: 743, desc: '泰拳、拳击、MMA' },
  { id: 'skate', name: '滑板/陆冲', emoji: '🛹', category: '户外', intensity: 3, meets: 692, desc: '滑板公园、街区' },
];

const CATEGORIES = ['全部', '球类', '跑步骑行', '健身瑜伽', '户外', '水上', '宠物'] as const;

export const SportsPage = memo(function SportsPage() {
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>('全部');

  useEffect(() => {
    document.title = '运动 · OurFitMeet — 30+ 运动品类，找到同频的人';
  }, []);

  const list = useMemo(() => {
    if (cat === '全部') return SPORTS;
    return SPORTS.filter((s) => s.category === cat);
  }, [cat]);

  const totalMeets = useMemo(() => SPORTS.reduce((sum, s) => sum + s.meets, 0), []);

  return (
    <div className="bg-[#0a0807] text-cream">
      {/* HERO */}
      <section className="relative isolate overflow-hidden px-4 pt-16 pb-12 sm:px-6 lg:px-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-50 blur-3xl"
          style={{
            background:
              'radial-gradient(700px 400px at 20% 30%, rgba(255,107,53,0.30), transparent 60%),' +
              'radial-gradient(700px 400px at 80% 70%, rgba(255,176,0,0.18), transparent 60%)',
          }}
        />
        <div className="mx-auto max-w-5xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-human/40 bg-human/10 px-3 py-1 text-xs font-bold text-humanBright">
            SPORTS · 运动场景
          </span>
          <h1 className="mt-4 font-display text-[clamp(36px,6vw,64px)] font-black leading-[1.05] text-white">
            <span className="bg-gradient-to-r from-human via-amber to-humanBright bg-clip-text text-transparent">
              {SPORTS.length}+ 运动品类
            </span>
            ，
            <br />
            每一种节奏都能找到同频的人。
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-textMuted">
            跑步、撸铁、瑜伽、羽毛球、徒步、遛狗 —— 不论你是想出汗、想放松，还是想顺便交朋友，
            都能在这里找到合适的伙伴。当前共 {totalMeets.toLocaleString()} 个进行中的约练。
          </p>
        </div>
      </section>

      {/* FILTER */}
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
                cat === c
                  ? 'bg-human-grad text-white shadow-humanGlow'
                  : 'border border-white/10 bg-white/[0.04] text-textMuted hover:border-human/40 hover:text-cream'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {list.map((s) => (
            <Link
              key={s.id}
              to="/meet"
              className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:-translate-y-1 hover:border-human/40 hover:bg-human/5"
            >
              <div className="flex items-start justify-between">
                <span className="text-3xl transition group-hover:scale-110">{s.emoji}</span>
                <IntensityBars value={s.intensity} />
              </div>
              <h3 className="mt-3 font-display text-lg font-black text-white">{s.name}</h3>
              <p className="mt-1 text-xs text-textMuted">{s.desc}</p>
              <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
                <span className="text-[10px] text-textSofter">{s.category}</span>
                <span className="text-xs font-bold text-human">{s.meets.toLocaleString()} 约练</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 pb-24 pt-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-gradient-to-br from-[#1a0e08] to-[#0a0807] p-10 text-center">
          <h2 className="font-display text-2xl font-black text-white sm:text-3xl">
            没有看到你的运动？
          </h2>
          <p className="mt-3 text-sm text-textMuted">
            创建自定义分类，让有同样爱好的人能找到你。我们不预设品味边界。
          </p>
          <Link
            to="/meet"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-human-grad px-6 py-3 text-sm font-black text-white shadow-humanGlow transition hover:-translate-y-0.5"
          >
            发起约练 →
          </Link>
        </div>
      </section>
    </div>
  );
});

const IntensityBars = ({ value }: { value: number }) => (
  <div className="flex items-end gap-0.5" aria-label={`强度 ${value}/5`}>
    {[1, 2, 3, 4, 5].map((n) => (
      <span
        key={n}
        className={`w-1 rounded-sm ${
          n <= value ? 'bg-human' : 'bg-white/10'
        }`}
        style={{ height: `${4 + n * 2}px` }}
      />
    ))}
  </div>
);
