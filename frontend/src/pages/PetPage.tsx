import { memo, useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * PetPage — 宠物界 / Pet Realm
 *
 * 目标：让宠物拥有自己的社交主场。
 * 三大模块：
 *  1. 遛弯局 (Walk Meets) - 类似人类约练，但语义为遛弯/陪伴
 *  2. 宠物档案 (Pet Profiles) - 每只毛孩都有自己的主页
 *  3. 救助与领养 (Rescue & Adoption) - 让"流浪"也能社交
 */

const speciesFilter = [
  { id: 'all', label: '全部', emoji: '🐾' },
  { id: 'dog', label: '狗狗', emoji: '🐶' },
  { id: 'cat', label: '猫猫', emoji: '🐱' },
  { id: 'rabbit', label: '兔兔', emoji: '🐰' },
  { id: 'bird', label: '鸟类', emoji: '🐦' },
  { id: 'reptile', label: '爬行', emoji: '🦎' },
  { id: 'other', label: '其他', emoji: '🐢' },
];

const featuredPets = [
  {
    name: '布丁',
    breed: '金毛巡回犬',
    age: '2 岁',
    city: '上海 · 徐汇',
    bio: '喜欢清晨的滨江路,讨厌下雨。寻找愿意一起跑 5km 的人类朋友。',
    avatar: '🐕',
    grad: 'from-amber to-petWarm',
    tags: ['每日 5km', '友善', '已绝育'],
  },
  {
    name: '芝士',
    breed: '英国短毛猫',
    age: '3 岁',
    city: '北京 · 朝阳',
    bio: '主子在找一个智商在线的「室友」共度无聊午后。鱼干自带。',
    avatar: '🐈',
    grad: 'from-petBright to-pet',
    tags: ['室内', '高冷', '免疫齐全'],
  },
  {
    name: '麻薯',
    breed: '荷兰垂耳兔',
    age: '1 岁',
    city: '成都 · 锦江',
    bio: '草地恐惧症患者,需要勇敢的兔友带我走出舒适区。',
    avatar: '🐇',
    grad: 'from-petWarm to-amber',
    tags: ['新手', '社恐', '爱吃胡萝卜'],
  },
  {
    name: '元宝',
    breed: '柴犬',
    age: '4 岁',
    city: '杭州 · 西湖',
    bio: '自带表情包的柴柴。每周三、五傍晚雷打不动绕湖一圈,欢迎组队。',
    avatar: '🐕‍🦺',
    grad: 'from-pet to-petBright',
    tags: ['西湖打卡', '互动多', '会握手'],
  },
];

const walkSpots = [
  { city: '上海', spot: '徐汇滨江', count: 142, time: '今晚 19:00' },
  { city: '北京', spot: '朝阳公园北门', count: 98, time: '明早 07:30' },
  { city: '深圳', spot: '深圳湾人才公园', count: 211, time: '今晚 20:00' },
  { city: '成都', spot: '兴隆湖', count: 76, time: '周末 09:00' },
];

export const PetPage = memo(function PetPage() {
  const [activeSpecies, setActiveSpecies] = useState('all');

  return (
    <div className="relative isolate overflow-hidden bg-[#06120D] text-cream">
      {/* === Pet Realm cosmic backdrop (forest mist) === */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute inset-0 opacity-50 blur-3xl"
          style={{
            background:
              'radial-gradient(800px 600px at 20% 20%, #2D6A4F 0%, transparent 60%),' +
              'radial-gradient(700px 600px at 80% 70%, #52B788 0%, transparent 60%),' +
              'radial-gradient(500px 400px at 50% 100%, #F4A261 0%, transparent 60%)',
          }}
        />
        <PawPrintField />
      </div>

      {/* ============== HERO ============== */}
      <section className="relative mx-auto max-w-7xl px-4 pb-16 pt-20 sm:px-6 lg:px-8 lg:pt-28">
        <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-petBright/40 bg-petBright/10 px-4 py-1.5 font-mono text-xs font-bold tracking-widest text-petBright backdrop-blur">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-petBright" />
              PET REALM · v1.0
            </span>
            <h1 className="mt-6 font-display text-5xl font-black leading-[1.05] tracking-tight text-cream sm:text-6xl lg:text-7xl">
              它们也值得
              <br />
              <span className="bg-gradient-to-r from-petBright via-petWarm to-amber bg-clip-text text-transparent [background-size:200%_auto] animate-gradient-x">
                一个朋友
              </span>
              。
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-cream/75">
              在这里,毛孩子拥有自己的主页、自己的朋友、自己的社交日历。
              你不再是「带狗的人」,你是「布丁的家人」。
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="#walks"
                className="group inline-flex items-center gap-2 rounded-2xl bg-pet-grad px-6 py-3.5 font-display text-base font-black text-white shadow-petGlow transition hover:gap-3 hover:scale-[1.02]"
              >
                找一场遛弯局
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
              <Link
                to="#profiles"
                className="inline-flex items-center gap-2 rounded-2xl border border-petBright/40 bg-white/5 px-6 py-3.5 font-display text-base font-black text-cream backdrop-blur transition hover:bg-petBright/15"
              >
                创建宠物主页
              </Link>
            </div>

            <div className="mt-10 grid grid-cols-3 gap-4 max-w-md">
              {[
                { n: '8,912', l: '活跃毛孩' },
                { n: '37', l: '支持物种' },
                { n: '2,108', l: '本周遛弯' },
              ].map((s) => (
                <div key={s.l} className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 backdrop-blur">
                  <div className="font-display text-2xl font-black text-petBright">{s.n}</div>
                  <div className="mt-1 text-[11px] font-semibold text-cream/60">{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Hero visual: floating pet cards stack */}
          <div className="relative hidden lg:block h-[520px]">
            <FloatingPetStack />
          </div>
        </div>
      </section>

      {/* ============== SPECIES FILTER ============== */}
      <section className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-2 rounded-3xl border border-white/10 bg-black/30 p-2 backdrop-blur">
          {speciesFilter.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSpecies(s.id)}
              className={[
                'flex items-center gap-2 rounded-2xl px-4 py-2.5 font-display text-sm font-bold transition',
                activeSpecies === s.id
                  ? 'bg-pet-grad text-white shadow-petGlow'
                  : 'text-cream/70 hover:bg-white/[0.06] hover:text-cream',
              ].join(' ')}
            >
              <span className="text-base">{s.emoji}</span>
              {s.label}
            </button>
          ))}
        </div>
      </section>

      {/* ============== FEATURED PROFILES ============== */}
      <section id="profiles" className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHead
          eyebrow="PET PROFILES"
          title="今日推荐毛孩子"
          desc="每只都有完整的主页:性格、训练记录、疫苗档案、最爱的玩具。"
        />
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {featuredPets.map((p) => (
            <article
              key={p.name}
              className="group relative flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-md transition hover:-translate-y-1 hover:border-petBright/40 hover:shadow-petGlow"
            >
              <div className={`relative flex h-44 items-center justify-center rounded-2xl bg-gradient-to-br ${p.grad}`}>
                <span className="text-7xl drop-shadow-2xl transition-transform duration-500 group-hover:scale-110">
                  {p.avatar}
                </span>
                <span className="absolute right-3 top-3 rounded-full border border-white/30 bg-black/30 px-2.5 py-1 font-mono text-[10px] font-black tracking-wider text-white backdrop-blur">
                  {p.age}
                </span>
              </div>
              <div className="mt-4">
                <h3 className="font-display text-xl font-black text-cream">{p.name}</h3>
                <p className="mt-0.5 text-xs font-semibold text-cream/60">
                  {p.breed} · {p.city}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-cream/75">{p.bio}</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {p.tags.map((t) => (
                  <span key={t} className="rounded-full bg-petBright/10 px-2.5 py-1 text-[11px] font-bold text-petBright">
                    {t}
                  </span>
                ))}
              </div>
              <button className="mt-5 rounded-xl border border-petBright/30 bg-petBright/10 py-2.5 font-display text-sm font-black text-petBright transition group-hover:bg-petBright group-hover:text-white">
                打个招呼 →
              </button>
            </article>
          ))}
        </div>
      </section>

      {/* ============== WALK MEETS ============== */}
      <section id="walks" className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHead eyebrow="WALK MEETS" title="今天去哪遛弯?" desc="基于你的位置和时间表,智能推荐附近的遛弯局。" />
        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {walkSpots.map((w) => (
            <div
              key={w.spot}
              className="group relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-pet/30 via-pet/5 to-transparent p-6 backdrop-blur transition hover:border-petBright/50 hover:shadow-petGlow"
            >
              <div className="flex items-start justify-between">
                <span className="font-mono text-[11px] font-black tracking-widest text-petBright">{w.city.toUpperCase()}</span>
                <span className="rounded-full bg-petWarm/20 px-2.5 py-1 text-[10px] font-black text-petWarm">
                  {w.count} 只参与
                </span>
              </div>
              <h3 className="mt-4 font-display text-2xl font-black text-cream">{w.spot}</h3>
              <p className="mt-2 text-sm font-semibold text-cream/60">📅 {w.time}</p>
              <button className="mt-6 inline-flex items-center gap-2 font-display text-sm font-black text-petBright transition group-hover:gap-3">
                查看详情
                <span>→</span>
              </button>
              <div className="pointer-events-none absolute -right-8 -bottom-8 text-[120px] opacity-10">🐾</div>
            </div>
          ))}
        </div>
      </section>

      {/* ============== RESCUE & ADOPTION ============== */}
      <section className="relative mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-petWarm/30 bg-gradient-to-br from-petWarm/15 via-pet/10 to-transparent p-10 backdrop-blur lg:p-14">
          <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-petWarm/40 bg-petWarm/10 px-3 py-1 font-mono text-[11px] font-black tracking-widest text-petWarm">
                RESCUE & ADOPTION
              </span>
              <h2 className="mt-4 font-display text-4xl font-black tracking-tight text-cream lg:text-5xl">
                让流浪也能 <span className="text-petWarm">被看见</span>
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-cream/75">
                我们与本地救助站合作,为每只待领养的毛孩子建立完整档案。 你的每一次浏览、每一次分享,都可能改变一个小生命的轨迹。
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button className="rounded-2xl bg-petWarm px-6 py-3 font-display text-sm font-black text-pet shadow-lg transition hover:scale-[1.03]">
                  浏览待领养
                </button>
                <button className="rounded-2xl border border-petWarm/40 bg-white/5 px-6 py-3 font-display text-sm font-black text-cream backdrop-blur transition hover:bg-petWarm/15">
                  申请救助合作
                </button>
              </div>
            </div>
            <div className="relative hidden lg:flex h-48 w-48 items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-petWarm/30 blur-2xl animate-pulse-soft" />
              <span className="relative text-[140px]">🏡</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
});

// ----------------------------------------------------------------------------
function SectionHead({ eyebrow, title, desc }: { eyebrow: string; title: string; desc: string }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="font-mono text-xs font-black tracking-[0.25em] text-petBright">{eyebrow}</span>
      <h2 className="font-display text-3xl font-black tracking-tight text-cream sm:text-4xl">{title}</h2>
      <p className="max-w-2xl text-sm leading-relaxed text-cream/65">{desc}</p>
    </div>
  );
}

function FloatingPetStack() {
  const stack = [
    { e: '🐶', t: '布丁 · 金毛', c: 'from-amber to-petWarm', x: 0, y: 0, r: -6 },
    { e: '🐈', t: '芝士 · 英短', c: 'from-petBright to-pet', x: 60, y: 100, r: 4 },
    { e: '🐇', t: '麻薯 · 垂耳兔', c: 'from-petWarm to-amber', x: -40, y: 220, r: -4 },
    { e: '🦜', t: 'Echo · 鹦鹉', c: 'from-petBright to-aiCyan', x: 100, y: 320, r: 6 },
  ];
  return (
    <div className="relative h-full w-full">
      {stack.map((s, i) => (
        <div
          key={s.t}
          className={`absolute left-1/2 top-0 w-72 -translate-x-1/2 rounded-3xl border border-white/15 bg-gradient-to-br ${s.c} p-6 shadow-petGlow backdrop-blur animate-float-slow`}
          style={{
            transform: `translate(calc(-50% + ${s.x}px), ${s.y}px) rotate(${s.r}deg)`,
            animationDelay: `${i * 0.6}s`,
            zIndex: stack.length - i,
          }}
        >
          <span className="text-5xl drop-shadow-lg">{s.e}</span>
          <div className="mt-3 font-display text-lg font-black text-white">{s.t}</div>
          <div className="mt-1 text-xs font-semibold text-white/80">📍 此刻在线</div>
        </div>
      ))}
    </div>
  );
}

function PawPrintField() {
  const paws = Array.from({ length: 14 }).map((_, i) => ({
    left: (i * 73) % 95,
    top: (i * 47) % 95,
    rot: ((i * 37) % 60) - 30,
    scale: 0.5 + ((i * 13) % 5) * 0.15,
    delay: (i * 0.4) % 5,
  }));
  return (
    <div className="absolute inset-0 opacity-[0.07]">
      {paws.map((p, i) => (
        <span
          key={i}
          className="absolute animate-pulse-soft"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            transform: `rotate(${p.rot}deg) scale(${p.scale})`,
            animationDelay: `${p.delay}s`,
            fontSize: '64px',
          }}
        >
          🐾
        </span>
      ))}
    </div>
  );
}

export default PetPage;
