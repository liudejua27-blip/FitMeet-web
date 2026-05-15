import { Link } from 'react-router-dom';

/**
 * 统一的 `/social-request/ai` 入口组件。
 * 三个调用点（Hero、AI 任务列表页、手动发布页）共用同一文案与视觉，
 * 避免后续漂移。FitMeet 高端 glass / portal 风格：暗底 + 柠绿 accent。
 *
 * variant:
 *   - "hero"    用在首页 Hero 区域下方，居中、宽幅；
 *   - "banner"  用在内页顶部，左右排布、单行；
 *   - "inline"  用在普通发布页表单上方，紧凑横条。
 */
export type AiSocialRequestCtaVariant = 'hero' | 'banner' | 'inline';

const UNIFIED_LABEL = '✨ AI 帮我发布需求';
const UNIFIED_SUB = '一句话 → AI 整理成需求卡 → 自动匹配候选人';

export function AiSocialRequestCta({
  variant = 'banner',
  className = '',
}: {
  variant?: AiSocialRequestCtaVariant;
  className?: string;
}) {
  if (variant === 'hero') {
    return (
      <section
        className={`relative px-6 py-14 ${className}`}
        aria-label="AI 帮我发布需求"
      >
        <div className="max-w-3xl mx-auto rounded-3xl border border-[#C8FF80]/30 bg-gradient-to-br from-[#15150f]/95 to-[#0d0d0b]/95 backdrop-blur-xl shadow-[0_30px_80px_-40px_rgba(200,255,128,0.35)] p-8 sm:p-10 text-center space-y-5">
          <div className="text-[10px] uppercase tracking-[0.4em] text-[#C8FF80]">
            FitMeet Agent · One sentence to a real meetup
          </div>
          <h2 className="text-2xl sm:text-3xl font-light text-[#F4EFE6] leading-snug">
            一句话告诉 AI 你想认识谁，
            <br className="hidden sm:block" />
            它就能整理出结构化的社交需求卡。
          </h2>
          <p className="text-sm text-[#C7C2B0] max-w-xl mx-auto leading-7">
            {UNIFIED_SUB}。无需手动填表，画像自动加载、隐私自动提醒。
          </p>
          <div className="pt-2">
            <Link
              to="/social-request/ai"
              className="inline-flex items-center gap-2 px-7 py-3 rounded-full bg-[#C8FF80] text-[#0d0d0b] text-sm font-medium hover:bg-[#b8ef70] transition shadow-[0_10px_30px_-10px_rgba(200,255,128,0.6)]"
            >
              {UNIFIED_LABEL}
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (variant === 'inline') {
    return (
      <Link
        to="/social-request/ai"
        className={`group flex items-center justify-between gap-4 rounded-2xl border border-[#C8FF80]/30 bg-gradient-to-r from-[#15150f] to-[#0d0d0b] px-5 py-4 hover:border-[#C8FF80]/60 transition ${className}`}
      >
        <div className="space-y-1">
          <div className="text-sm font-medium text-[#F4EFE6]">
            {UNIFIED_LABEL}
          </div>
          <div className="text-[11px] text-[#8C8A6E]">{UNIFIED_SUB}</div>
        </div>
        <span
          className="text-[#C8FF80] text-sm group-hover:translate-x-0.5 transition"
          aria-hidden
        >
          →
        </span>
      </Link>
    );
  }

  // banner (default) — 用在浅色背景的内页顶部，做高对比 portal 卡
  return (
    <Link
      to="/social-request/ai"
      className={`group flex items-center justify-between gap-4 rounded-2xl border border-[#C8FF80]/40 bg-gradient-to-r from-[#15150f] to-[#0d0d0b] px-5 py-4 text-[#F4EFE6] hover:border-[#C8FF80] transition shadow-[0_18px_40px_-30px_rgba(200,255,128,0.55)] ${className}`}
    >
      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-[0.3em] text-[#C8FF80]">
          FitMeet Agent
        </div>
        <div className="text-sm font-medium">{UNIFIED_LABEL}</div>
        <div className="text-[11px] text-[#C7C2B0]">{UNIFIED_SUB}</div>
      </div>
      <span
        className="shrink-0 inline-flex items-center gap-1 px-4 py-2 rounded-full bg-[#C8FF80] text-[#0d0d0b] text-xs font-medium group-hover:bg-[#b8ef70] transition"
        aria-hidden
      >
        立即使用 →
      </span>
    </Link>
  );
}

export default AiSocialRequestCta;
