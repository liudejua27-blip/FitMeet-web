import { memo, useEffect } from 'react';
import { Link } from 'react-router-dom';

/**
 * SafetyPage — 安全与信任
 *
 * 不展示装饰性安全话术，展示真实的"我们做了什么"。
 * 用户能从这一页看出：哪些是流程，哪些是技术，哪些是承诺。
 */

const layers = [
  {
    no: '01',
    title: '准入层 · 资料验证',
    items: [
      '手机号 + 邮箱基础认证',
      '人脸活体检测（高敏感场景，如教练入驻、宠物领养）',
      '宠物档案：照片 + 品种 + 疫苗记录可选认证',
      '教练资质：证书扫描件人工审核',
    ],
  },
  {
    no: '02',
    title: '过程层 · 行为风控',
    items: [
      'AI 风险词识别（诱导转账、违规交易、情感操控）',
      '异常行为监测（高频私信、大量举报、跨账户冲突）',
      'IP / 设备指纹 / 行为画像组合反欺诈',
      '黑名单云端同步，已封禁账号无法换设备复活',
    ],
  },
  {
    no: '03',
    title: '应急层 · 举报与人工',
    items: [
      '一键举报，24 小时内人工响应',
      '紧急联系人功能：第一次见面前自动通知',
      '保留完整处理记录，被处理用户可申诉',
      '与城市本地反诈中心建立通报渠道',
    ],
  },
];

const firstMeet = [
  { icon: '📍', title: '公共场所约见', desc: '永远在咖啡馆、运动场、公园等公共场所第一次见面。' },
  { icon: '👥', title: '告知朋友', desc: '把见面时间、地点、对方资料截图发给朋友。' },
  { icon: '⏰', title: '设置时间限制', desc: '第一次见面控制在 1 小时内，给彼此留余地。' },
  { icon: '🚫', title: '不饮用陌生饮料', desc: '不喝离开过视线的饮料、不接受非密封食品。' },
  { icon: '💸', title: '不涉及金钱', desc: '任何转账、借款、投资邀请都立即终止并举报。' },
  { icon: '🆘', title: 'App 内紧急按钮', desc: '右下角紧急按钮一键拨打 110，并广播位置。' },
];

const privacy = [
  { title: '位置精度', value: '城市级，非街道级', accent: 'text-mint' },
  { title: '联系方式', value: '默认不可见，仅互相同意后开放', accent: 'text-mint' },
  { title: '行程信息', value: '约练前 24 小时才会暴露具体地点', accent: 'text-mint' },
  { title: '聊天记录', value: '端到端加密，平台不可读取', accent: 'text-mint' },
  { title: '数据导出', value: '一键打包导出，符合个保法', accent: 'text-mint' },
  { title: '账号注销', value: '7 天内完成全量数据删除', accent: 'text-mint' },
];

export const SafetyPage = memo(function SafetyPage() {
  useEffect(() => {
    document.title = '安全 · OurFitMeet — 可信关系，从平台规则开始';
  }, []);

  return (
    <div className="bg-[#080a08] text-cream">
      {/* HERO */}
      <section className="relative isolate overflow-hidden px-4 pt-16 pb-12 sm:px-6 lg:px-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-50 blur-3xl"
          style={{
            background:
              'radial-gradient(700px 400px at 30% 30%, rgba(22,199,132,0.20), transparent 60%),' +
              'radial-gradient(700px 400px at 80% 60%, rgba(82,183,136,0.15), transparent 60%)',
          }}
        />
        <div className="mx-auto max-w-5xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-mint/40 bg-mint/10 px-3 py-1 text-xs font-bold text-mint">
            SAFETY · 安全与信任
          </span>
          <h1 className="mt-4 font-display text-[clamp(36px,6vw,64px)] font-black leading-[1.05] text-white">
            社交平台的底线
            <br />
            不是流量，
            <span className="bg-gradient-to-r from-mint to-petBright bg-clip-text text-transparent">
              {' '}是用户安全{' '}
            </span>
            。
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-textMuted">
            我们花在风控、审核、隐私和应急上的工程资源，多于花在算法和增长上的。
            因为如果用户在这里受到伤害，再优秀的匹配也没有意义。
          </p>
        </div>
      </section>

      {/* 3 LAYERS */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHeader eyebrow="THREE LAYERS" title="三层防护体系" />
        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {layers.map((l) => (
            <div
              key={l.no}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-7 transition hover:border-mint/40"
            >
              <div className="font-mono text-xs font-bold text-mint">LAYER · {l.no}</div>
              <h3 className="mt-3 font-display text-xl font-black text-white">{l.title}</h3>
              <ul className="mt-4 space-y-2.5">
                {l.items.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-cream/85">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-mint" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* PRIVACY GRID */}
      <section className="relative px-4 py-16 sm:px-6 lg:px-8">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 opacity-30"
          style={{
            background:
              'radial-gradient(600px 400px at 50% 50%, rgba(22,199,132,0.10), transparent 60%)',
          }}
        />
        <div className="mx-auto max-w-7xl">
          <SectionHeader eyebrow="PRIVACY" title="你的数据，由你说了算" />
          <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {privacy.map((p) => (
              <div
                key={p.title}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-5"
              >
                <div>
                  <div className="text-xs uppercase text-textSofter">{p.title}</div>
                  <div className={`mt-1 font-display text-base font-black ${p.accent}`}>
                    {p.value}
                  </div>
                </div>
                <span className="text-mint">✓</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FIRST MEET */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow="FIRST MEET · 第一次见面建议"
          title="规则之外，是常识"
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {firstMeet.map((m) => (
            <div
              key={m.title}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-mint/40 hover:bg-mint/5"
            >
              <div className="text-3xl">{m.icon}</div>
              <h3 className="mt-3 font-display text-base font-black text-white">{m.title}</h3>
              <p className="mt-2 text-sm leading-6 text-textMuted">{m.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* AI BOUNDARY */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-8 rounded-3xl border border-aiBright/30 bg-gradient-to-br from-aiDeep/30 via-[#0e0a1c] to-[#0a0a14] p-10 lg:grid-cols-[1fr_1.2fr] lg:p-14">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-aiBright/40 bg-aiBright/10 px-3 py-1 text-xs font-bold text-aiBright">
              SOCIAL AGENT · 边界
            </span>
            <h2 className="mt-4 font-display text-3xl font-black leading-tight text-white">
              Social Agent 也有边界
            </h2>
            <p className="mt-4 text-sm leading-7 text-textMuted">
              AI 不是黑箱。它能做什么、不能做什么，我们都写明白。
              你可以随时暂停、随时纠正、随时销毁。
            </p>
            <Link
              to="/social-agent"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-ai-grad px-6 py-3 text-sm font-black text-white shadow-aiGlow transition hover:-translate-y-0.5"
            >
              去 Social Agent 查看 →
            </Link>
          </div>
          <ul className="space-y-3">
            {[
              'AI 必须在对话开头声明自己是 AI',
              'AI 不会代替你做金钱、关系、医疗决定',
              'AI 不会主动暴露你的位置或联系方式',
              'AI 不会读取你的私信，仅在你授权时进入摘要',
              'AI 一键暂停后立即停止所有后台操作',
              '账号注销时，AI 数据 7 天内全量删除',
            ].map((b) => (
              <li
                key={b}
                className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm text-cream"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-aiBright/20 text-aiBright">
                  ✓
                </span>
                {b}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* CONTACT */}
      <section className="px-4 pb-24 pt-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-white/[0.03] p-10 text-center">
          <h2 className="font-display text-2xl font-black text-white sm:text-3xl">
            遇到了问题？
          </h2>
          <p className="mt-3 text-sm text-textMuted">
            App 内一键举报 · 邮箱 15253005312@163.com · 紧急情况请直接拨打 110
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              to="/community"
              className="inline-flex items-center gap-2 rounded-xl border border-mint/40 bg-mint/10 px-6 py-3 text-sm font-black text-mint transition hover:bg-mint/20"
            >
              社区规范
            </Link>
            <Link
              to="/privacy"
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-6 py-3 text-sm font-black text-cream transition hover:border-mint/40"
            >
              隐私政策
            </Link>
            <Link
              to="/terms"
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-6 py-3 text-sm font-black text-cream transition hover:border-mint/40"
            >
              用户协议
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
});

const SectionHeader = ({ eyebrow, title }: { eyebrow: string; title: string }) => (
  <div className="mx-auto max-w-3xl text-center">
    <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-xs font-bold tracking-wide text-textMuted">
      {eyebrow}
    </span>
    <h2 className="mt-4 font-display text-3xl font-black leading-tight text-white sm:text-4xl">
      {title}
    </h2>
  </div>
);
