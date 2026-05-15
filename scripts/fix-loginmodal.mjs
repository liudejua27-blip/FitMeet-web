/**
 * Rewrites LoginModal.tsx with a premium aurora animated design.
 * Uses Node.js to avoid PowerShell UTF-8 encoding issues with Chinese characters.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ─── 1. Write new LoginModal.tsx ────────────────────────────────────────────

const LOGINMODAL_PATH = join(ROOT, 'frontend/src/components/auth/LoginModal.tsx');

const LOGINMODAL_CONTENT = `import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../stores';
import { STORAGE_KEYS, migrateSessionStorageKey } from '../../lib/storageKeys';

migrateSessionStorageKey(STORAGE_KEYS.legacyLoginIntroSeen, STORAGE_KEYS.loginIntroSeen);

const TAGLINES = ['找到运动搭子', '发现附近约练', '遇见同频好友', '加入约练圈子'];

const SPORT_PARTICLES = [
  { icon: '🏃', top: '10%', left: '7%',  delay: '0s',    dur: '18s' },
  { icon: '🏋️', top: '26%', left: '4%',  delay: '1.3s',  dur: '22s' },
  { icon: '🧘', top: '54%', left: '9%',  delay: '2.8s',  dur: '20s' },
  { icon: '🎾', top: '76%', left: '6%',  delay: '0.7s',  dur: '25s' },
  { icon: '🚴', top: '16%', left: '87%', delay: '1.9s',  dur: '19s' },
  { icon: '⛹️', top: '42%', left: '92%', delay: '3.3s',  dur: '21s' },
  { icon: '🤸', top: '64%', left: '84%', delay: '0.5s',  dur: '23s' },
  { icon: '🏊', top: '86%', left: '77%', delay: '2.1s',  dur: '17s' },
  { icon: '⚽', top: '34%', left: '61%', delay: '4.2s',  dur: '26s' },
  { icon: '🏸', top: '7%',  left: '54%', delay: '1.5s',  dur: '20s' },
];

const ACTIVITY_FEED = [
  { avatar: '🧑', name: '小明', action: '发起了 5km 晨跑', time: '2分钟前' },
  { avatar: '👩', name: '小红', action: '加入了瑜伽约练',  time: '5分钟前' },
  { avatar: '🧔', name: '大壮', action: '完成了深蹲打卡',  time: '8分钟前' },
  { avatar: '👧', name: '青青', action: '邀请你一起骑行',  time: '12分钟前' },
];

export const LoginModal = memo(function LoginModal() {
  const { showLoginModal, closeLogin, login, register, loading, error, isLoggedIn } =
    useAuthStore();

  const [agreed, setAgreed] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isRegister, setIsRegister] = useState(false);

  const [taglineIdx, setTaglineIdx] = useState(0);
  const [taglineVisible, setTaglineVisible] = useState(true);

  const visible = !isLoggedIn && showLoginModal;

  // Cycle tagline every 3.2s with a 400ms fade-out between
  useEffect(() => {
    if (!visible) return;
    let swapTimer: ReturnType<typeof setTimeout>;
    const t = setInterval(() => {
      setTaglineVisible(false);
      swapTimer = setTimeout(() => {
        setTaglineIdx((i) => (i + 1) % TAGLINES.length);
        setTaglineVisible(true);
      }, 400);
    }, 3200);
    return () => {
      clearInterval(t);
      clearTimeout(swapTimer);
    };
  }, [visible]);

  const closeAll = useCallback(() => {
    closeLogin();
  }, [closeLogin]);

  const handleSubmit = useCallback(async () => {
    if (!email || !password || !agreed) return;
    if (isRegister && !name) return;
    try {
      if (isRegister) {
        await register({ email, password, name });
      } else {
        await login({ email, password });
      }
      closeAll();
    } catch {
      // error state is managed by the auth store
    }
  }, [agreed, closeAll, email, isRegister, login, name, password, register]);

  const canSubmit = useMemo(
    () => Boolean(email && password && agreed && (!isRegister || name)),
    [agreed, email, isRegister, name, password],
  );

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden">
      {/* ── Aurora animated background ── */}
      <div className="aurora-bg" aria-hidden="true">
        <div className="aurora-blob aurora-blob--1" />
        <div className="aurora-blob aurora-blob--2" />
        <div className="aurora-blob aurora-blob--3" />
        <div className="aurora-blob aurora-blob--4" />
        <div className="aurora-overlay" />
      </div>

      {/* ── Floating sport particles ── */}
      <div
        className="pointer-events-none absolute inset-0 z-[1] overflow-hidden"
        aria-hidden="true"
      >
        {SPORT_PARTICLES.map((p, i) => (
          <span
            key={i}
            className="login-particle absolute select-none text-xl"
            style={{
              top: p.top,
              left: p.left,
              animationDelay: p.delay,
              animationDuration: p.dur,
            }}
          >
            {p.icon}
          </span>
        ))}
      </div>

      {/* ── Backdrop close ── */}
      <button
        aria-label="关闭登录背景"
        className="absolute inset-0 z-[2] h-full w-full cursor-default"
        onClick={closeAll}
        type="button"
      />

      {/* ── Close button ── */}
      <button
        aria-label="关闭登录"
        className="absolute right-4 top-4 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.18] bg-white/[0.06] text-xl text-white/60 backdrop-blur-xl transition hover:border-white/40 hover:bg-white/[0.12] hover:text-white md:right-6 md:top-6"
        onClick={closeAll}
        type="button"
      >
        ×
      </button>

      {/* ── Main dialog layout ── */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="FitMeet 登录"
        className="relative z-10 flex min-h-screen flex-col items-center justify-end lg:flex-row lg:items-stretch lg:justify-center"
      >
        {/* Left: Hero panel — desktop only */}
        <HeroPanel tagline={TAGLINES[taglineIdx]} taglineVisible={taglineVisible} />

        {/* Right / bottom: Login card */}
        <LoginCard
          agreed={agreed}
          canSubmit={canSubmit}
          email={email}
          error={error}
          isRegister={isRegister}
          loading={loading}
          name={name}
          password={password}
          setAgreed={setAgreed}
          setEmail={setEmail}
          setIsRegister={setIsRegister}
          setName={setName}
          setPassword={setPassword}
          onSubmit={handleSubmit}
          closeAll={closeAll}
        />
      </div>
    </div>
  );
});

// ──────────────────────────────────────────────────────────────
// Hero Panel  (desktop left side)
// ──────────────────────────────────────────────────────────────

const HeroPanel = memo(function HeroPanel({
  tagline,
  taglineVisible,
}: {
  tagline: string;
  taglineVisible: boolean;
}) {
  return (
    <section className="login-hero-panel pointer-events-none relative z-10 hidden w-full max-w-2xl flex-col items-start justify-center px-16 py-16 lg:flex">
      {/* Logo */}
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-13 w-13 items-center justify-center rounded-2xl bg-gradient-to-br from-lime to-[#ff9800] shadow-[0_8px_32px_rgba(255,106,0,0.5)]">
          <span className="text-2xl">⚡</span>
        </div>
        <div>
          <div className="font-display text-3xl font-black text-white">
            Fit<span className="text-lime">Meet</span>
          </div>
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/40">
            运动社交平台
          </div>
        </div>
      </div>

      {/* Animated tagline */}
      <div className="mb-4 overflow-hidden" style={{ minHeight: '6rem' }}>
        <h1
          className="font-display text-6xl font-black leading-tight text-white xl:text-7xl"
          style={{
            opacity: taglineVisible ? 1 : 0,
            transform: taglineVisible ? 'translateY(0)' : 'translateY(18px)',
            transition: 'opacity 0.35s ease, transform 0.35s cubic-bezier(0.2,0.8,0.2,1)',
            textShadow: '0 0 60px rgba(255,106,0,0.38)',
          }}
        >
          {tagline}
        </h1>
      </div>

      <p className="mb-10 max-w-md text-lg font-semibold leading-relaxed text-white/55">
        真实资料、公开约练、附近同频。
        <br />
        和志同道合的人一起动起来。
      </p>

      {/* Feature badges */}
      <div className="mb-10 flex flex-wrap gap-3">
        {[
          { icon: '📍', label: '附近约练' },
          { icon: '🤝', label: '真实搭子' },
          { icon: '🔥', label: '每日活动' },
          { icon: '🏆', label: '成就系统' },
        ].map((b) => (
          <div
            key={b.label}
            className="flex items-center gap-2 rounded-full border border-white/[0.13] bg-white/[0.07] px-4 py-2 backdrop-blur-sm"
          >
            <span className="text-base">{b.icon}</span>
            <span className="text-sm font-bold text-white/75">{b.label}</span>
          </div>
        ))}
      </div>

      {/* Community stats */}
      <div className="mb-10 flex items-center gap-6">
        <div>
          <div className="text-3xl font-black text-lime">12,847</div>
          <div className="text-xs font-bold text-white/35">活跃搭子</div>
        </div>
        <div className="h-10 w-px bg-white/[0.1]" />
        <div>
          <div className="text-3xl font-black text-mint">3,291</div>
          <div className="text-xs font-bold text-white/35">本周约练</div>
        </div>
        <div className="h-10 w-px bg-white/[0.1]" />
        <div>
          <div className="text-3xl font-black text-white">98+</div>
          <div className="text-xs font-bold text-white/35">覆盖城市</div>
        </div>
      </div>

      {/* Live activity feed */}
      <div>
        <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-white/25">
          实时动态
        </div>
        <div className="space-y-2">
          {ACTIVITY_FEED.map((item, i) => (
            <div
              key={i}
              className="login-activity-item flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.05] px-4 py-2.5 backdrop-blur-sm"
              style={{ animationDelay: \`\${0.9 + i * 0.14}s\` }}
            >
              <span className="text-xl">{item.avatar}</span>
              <div className="min-w-0 flex-1">
                <span className="text-sm font-bold text-white/85">{item.name}</span>
                <span className="text-sm text-white/45"> {item.action}</span>
              </div>
              <span className="shrink-0 text-xs text-white/25">{item.time}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
});

// ──────────────────────────────────────────────────────────────
// Login Card
// ──────────────────────────────────────────────────────────────

interface LoginCardProps {
  agreed: boolean;
  canSubmit: boolean;
  closeAll: () => void;
  email: string;
  error: string | null;
  isRegister: boolean;
  loading: boolean;
  name: string;
  password: string;
  setAgreed: (v: boolean) => void;
  setEmail: (v: string) => void;
  setIsRegister: (v: boolean) => void;
  setName: (v: string) => void;
  setPassword: (v: string) => void;
  onSubmit: () => void;
}

const LoginCard = memo(function LoginCard({
  agreed,
  canSubmit,
  closeAll,
  email,
  error,
  isRegister,
  loading,
  name,
  password,
  setAgreed,
  setEmail,
  setIsRegister,
  setName,
  setPassword,
  onSubmit,
}: LoginCardProps) {
  return (
    <section className="login-card-new-enter pointer-events-auto relative z-20 w-full shrink-0 rounded-t-[28px] border border-white/[0.11] bg-gradient-to-b from-[#1c0f0b]/96 to-[#0e0605]/98 px-6 py-8 shadow-2xl backdrop-blur-2xl sm:mx-auto sm:max-w-sm sm:rounded-3xl sm:p-8 lg:my-16 lg:mr-16 lg:max-w-[400px] lg:self-center lg:rounded-3xl">
      {/* Mobile-only logo */}
      <div className="mb-5 flex items-center justify-between lg:hidden">
        <div className="font-display text-2xl font-black text-white">
          Fit<span className="text-lime">Meet</span>
        </div>
        <div className="rounded-full border border-white/[0.1] px-3 py-1 text-[11px] font-bold text-white/30">
          运动社交
        </div>
      </div>

      <h2 className="mb-1 font-display text-2xl font-black text-white">
        {isRegister ? '创建账号' : '欢迎回来 👋'}
      </h2>
      <p className="mb-6 text-sm font-semibold text-white/40">
        {isRegister ? '加入 12,847 位运动搭子' : '继续查看附近搭子和约练'}
      </p>

      {/* Tab switcher */}
      <div className="mb-6 grid grid-cols-2 rounded-xl border border-white/[0.08] bg-white/[0.04] p-1">
        <button
          className={clsx(
            'rounded-lg py-2.5 text-sm font-black transition',
            !isRegister
              ? 'bg-lime text-white shadow-[0_4px_16px_rgba(255,106,0,0.4)]'
              : 'text-white/35 hover:text-white/60',
          )}
          onClick={() => setIsRegister(false)}
          type="button"
        >
          登录
        </button>
        <button
          className={clsx(
            'rounded-lg py-2.5 text-sm font-black transition',
            isRegister
              ? 'bg-lime text-white shadow-[0_4px_16px_rgba(255,106,0,0.4)]'
              : 'text-white/35 hover:text-white/60',
          )}
          onClick={() => setIsRegister(true)}
          type="button"
        >
          注册
        </button>
      </div>

      {/* Form fields */}
      <div className="space-y-4">
        {isRegister && (
          <GlassField label="昵称" prefix="✦">
            <input
              className="login-glass-input"
              placeholder="输入你想展示的昵称"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </GlassField>
        )}
        <GlassField label="邮箱" prefix="@">
          <input
            className="login-glass-input"
            placeholder="请输入常用邮箱"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </GlassField>
        <GlassField label="密码" prefix="••">
          <input
            className="login-glass-input"
            placeholder="请输入密码"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </GlassField>
      </div>

      {/* Agree checkbox */}
      <label className="mt-4 flex cursor-pointer items-start gap-2 text-xs font-semibold leading-5 text-white/35">
        <input
          checked={agreed}
          className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-white/20 bg-transparent accent-lime"
          onChange={(e) => setAgreed(e.target.checked)}
          type="checkbox"
        />
        <span>
          我已阅读并同意{' '}
          <Link className="text-lime hover:underline" to="/terms" onClick={closeAll}>
            用户协议
          </Link>{' '}
          和{' '}
          <Link className="text-lime hover:underline" to="/privacy" onClick={closeAll}>
            隐私政策
          </Link>
        </span>
      </label>

      {/* Error message */}
      {error && (
        <div className="mt-4 rounded-xl border border-red-500/[0.2] bg-red-500/[0.1] px-4 py-3 text-sm font-bold text-red-300">
          {error}
        </div>
      )}

      {/* Submit button */}
      <button
        className="login-submit-btn mt-5 w-full"
        disabled={!canSubmit || loading}
        onClick={onSubmit}
        type="button"
      >
        <span className="login-submit-shimmer" />
        <span className="relative z-10">
          {loading ? '提交中...' : isRegister ? '注册并进入 →' : '登录 FitMeet →'}
        </span>
      </button>

      {/* Social login */}
      <div className="mt-6">
        <div className="mb-3 flex items-center gap-3">
          <span className="h-px flex-1 bg-white/[0.07]" />
          <span className="text-[11px] font-bold text-white/20">其他登录方式</span>
          <span className="h-px flex-1 bg-white/[0.07]" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: '微信', icon: '💬' },
            { label: 'Apple', icon: '' },
            { label: '手机', icon: '📱' },
          ].map((item) => (
            <button
              key={item.label}
              className="rounded-xl border border-white/[0.08] bg-white/[0.04] py-2.5 text-[11px] font-black text-white/35 transition hover:border-white/[0.18] hover:bg-white/[0.08] hover:text-white/65"
              type="button"
            >
              {item.icon && <span className="mr-1">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
});

// ──────────────────────────────────────────────────────────────
// Glass Field
// ──────────────────────────────────────────────────────────────

const GlassField = memo(function GlassField({
  label,
  prefix,
  children,
}: {
  label: string;
  prefix: string;
  children: ReactNode;
}) {
  return (
    <label className="group block">
      <span className="mb-1.5 block text-xs font-black text-white/40">{label}</span>
      <span className="flex items-center gap-3 rounded-xl border border-white/[0.09] bg-white/[0.05] px-4 transition-all focus-within:border-lime/50 focus-within:bg-white/[0.09] group-hover:border-white/[0.14]">
        <span className="shrink-0 text-sm font-black text-lime">{prefix}</span>
        {children}
      </span>
    </label>
  );
});
`;

writeFileSync(LOGINMODAL_PATH, LOGINMODAL_CONTENT, { encoding: 'utf8' });
console.log(`✅ LoginModal.tsx written (${LOGINMODAL_CONTENT.split('\n').length} lines)`);

// ─── 2. Append new CSS to global.css ────────────────────────────────────────

const CSS_PATH = join(ROOT, 'frontend/src/global.css');

const NEW_CSS = `

/* ═══════════════════════════════════════════════════════════════
   AURORA LOGIN REDESIGN
   Premium animated login with glassmorphism + aurora background
═══════════════════════════════════════════════════════════════ */

/* ── Aurora background layer ── */
.aurora-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: #070210;
  overflow: hidden;
}

.aurora-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  background:
    radial-gradient(ellipse at 22% 82%, rgba(255, 106, 0, 0.14), transparent 52%),
    linear-gradient(
      180deg,
      rgba(4, 1, 10, 0.55) 0%,
      transparent 28%,
      transparent 68%,
      rgba(4, 1, 10, 0.62) 100%
    );
  pointer-events: none;
}

.aurora-blob {
  position: absolute;
  border-radius: 999px;
  filter: blur(80px);
  mix-blend-mode: screen;
  will-change: transform;
  pointer-events: none;
}

.aurora-blob--1 {
  width: min(62vw, 820px);
  height: min(62vw, 820px);
  bottom: -26%;
  left: -16%;
  background: radial-gradient(
    circle,
    rgba(255, 80, 0, 0.88) 0%,
    rgba(220, 38, 0, 0.52) 36%,
    transparent 68%
  );
  animation: auroraOrbit1 22s ease-in-out infinite;
}

.aurora-blob--2 {
  width: min(52vw, 720px);
  height: min(52vw, 720px);
  top: -22%;
  right: -14%;
  background: radial-gradient(
    circle,
    rgba(22, 199, 132, 0.62) 0%,
    rgba(0, 140, 90, 0.36) 36%,
    transparent 68%
  );
  animation: auroraOrbit2 28s ease-in-out infinite;
}

.aurora-blob--3 {
  width: min(42vw, 620px);
  height: min(42vw, 620px);
  top: 24%;
  left: 26%;
  background: radial-gradient(
    circle,
    rgba(160, 60, 255, 0.42) 0%,
    rgba(100, 30, 200, 0.22) 38%,
    transparent 68%
  );
  animation: auroraOrbit3 34s ease-in-out infinite;
}

.aurora-blob--4 {
  width: min(38vw, 540px);
  height: min(38vw, 540px);
  bottom: 6%;
  right: 17%;
  background: radial-gradient(
    circle,
    rgba(255, 200, 0, 0.48) 0%,
    rgba(255, 130, 0, 0.26) 36%,
    transparent 66%
  );
  animation: auroraOrbit4 24s ease-in-out infinite;
}

@keyframes auroraOrbit1 {
  0%, 100% { transform: translate(0%, 0%) scale(1); }
  25%       { transform: translate(5%, -9%) scale(1.1); }
  50%       { transform: translate(12%, 7%) scale(0.93); }
  75%       { transform: translate(-4%, 11%) scale(1.07); }
}

@keyframes auroraOrbit2 {
  0%, 100% { transform: translate(0%, 0%) scale(1); }
  30%       { transform: translate(-10%, 15%) scale(1.1); }
  65%       { transform: translate(8%, -7%) scale(0.9); }
}

@keyframes auroraOrbit3 {
  0%, 100% { transform: translate(0%, 0%) scale(1); }
  40%       { transform: translate(-15%, 11%) scale(1.18); }
  75%       { transform: translate(10%, -13%) scale(0.86); }
}

@keyframes auroraOrbit4 {
  0%, 100% { transform: translate(0%, 0%) scale(1) rotate(0deg); }
  50%       { transform: translate(-13%, -9%) scale(1.16) rotate(-8deg); }
}

/* ── Floating sport particles ── */
.login-particle {
  opacity: 0;
  animation: loginFloatParticle var(--dur, 20s) var(--delay, 0s) ease-in-out infinite;
  filter: drop-shadow(0 0 6px rgba(255, 255, 255, 0.2));
}

@keyframes loginFloatParticle {
  0%   { transform: translateY(0)    translateX(0)    scale(0.82); opacity: 0; }
  8%   { opacity: 0.28; }
  46%  { transform: translateY(-38px) translateX(13px) scale(1.09); opacity: 0.3; }
  90%  { opacity: 0.18; }
  100% { transform: translateY(-72px) translateX(-9px) scale(0.88); opacity: 0; }
}

/* ── Hero panel entrance (desktop) ── */
.login-hero-panel > * {
  opacity: 0;
  animation: loginFadeUp 0.65s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.login-hero-panel > *:nth-child(1) { animation-delay: 0.12s; }
.login-hero-panel > *:nth-child(2) { animation-delay: 0.26s; }
.login-hero-panel > *:nth-child(3) { animation-delay: 0.4s;  }
.login-hero-panel > *:nth-child(4) { animation-delay: 0.54s; }
.login-hero-panel > *:nth-child(5) { animation-delay: 0.68s; }
.login-hero-panel > *:nth-child(6) { animation-delay: 0.82s; }

@keyframes loginFadeUp {
  from { opacity: 0; transform: translateY(22px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ── Activity feed items stagger ── */
.login-activity-item {
  opacity: 0;
  animation: loginFadeUp 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
}

/* ── New login card entrance ── */
.login-card-new-enter {
  animation: loginCardMobileIn 0.72s 0.06s cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes loginCardMobileIn {
  from { opacity: 0; transform: translateY(52px); }
  to   { opacity: 1; transform: translateY(0); }
}

@media (min-width: 1024px) {
  .login-card-new-enter {
    animation: loginCardDesktopIn 0.72s 0.1s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  @keyframes loginCardDesktopIn {
    from { opacity: 0; transform: translateX(44px) scale(0.97); }
    to   { opacity: 1; transform: translateX(0)   scale(1); }
  }
}

/* ── Glass input field ── */
.login-glass-input {
  width: 100%;
  border: 0;
  background: transparent;
  padding: 0.78rem 0;
  color: rgba(255, 241, 226, 0.9);
  font: 700 0.875rem/1.25 var(--f-body, system-ui);
  outline: none;
}

.login-glass-input::placeholder {
  color: rgba(255, 255, 255, 0.2);
  font-weight: 500;
}

/* ── Submit button: gradient + shimmer ── */
.login-submit-btn {
  position: relative;
  overflow: hidden;
  display: block;
  border: 0;
  border-radius: 0.875rem;
  background: linear-gradient(135deg, #ff6a00 0%, #ff9840 50%, #ff6a00 100%);
  background-size: 200% 100%;
  padding: 0.9rem 1.5rem;
  font-family: var(--f-display, system-ui);
  font-size: 0.9375rem;
  font-weight: 900;
  color: #fff;
  letter-spacing: 0.01em;
  text-align: center;
  box-shadow:
    0 8px 32px rgba(255, 106, 0, 0.42),
    0 2px 8px rgba(255, 106, 0, 0.28);
  cursor: pointer;
  transition:
    box-shadow 0.3s ease,
    background-position 0.6s ease,
    transform 0.15s ease;
}

.login-submit-btn:hover:not(:disabled) {
  background-position: 100% 0;
  box-shadow:
    0 12px 44px rgba(255, 106, 0, 0.58),
    0 4px 14px rgba(255, 106, 0, 0.38);
  transform: translateY(-1px);
}

.login-submit-btn:active:not(:disabled) {
  transform: translateY(0) scale(0.99);
}

.login-submit-btn:disabled {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.2);
  box-shadow: none;
  cursor: not-allowed;
}

.login-submit-shimmer {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    110deg,
    transparent 25%,
    rgba(255, 255, 255, 0.32) 50%,
    transparent 75%
  );
  background-size: 200% 100%;
  animation: loginNewShimmer 3.6s 1.4s ease-in-out infinite;
  pointer-events: none;
}

.login-submit-btn:disabled .login-submit-shimmer {
  display: none;
}

@keyframes loginNewShimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* ── Mobile tweaks ── */
@media (max-width: 639px) {
  .login-card-new-enter {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
    border-bottom: 0;
  }
}
`;

const existingCss = readFileSync(CSS_PATH, { encoding: 'utf8' });
writeFileSync(CSS_PATH, existingCss + NEW_CSS, { encoding: 'utf8' });

const newLineCount = (existingCss + NEW_CSS).split('\n').length;
console.log(`✅ global.css updated — now ${newLineCount} lines`);
console.log('Done! New aurora login design is ready.');
