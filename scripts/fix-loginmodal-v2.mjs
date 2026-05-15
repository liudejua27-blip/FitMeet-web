/**
 * AI Match Universe Login Design
 * Rewrites LoginModal.tsx + replaces aurora CSS section in global.css
 * Characters: Man (left) + Woman (right) with walk→handshake→pose intro
 * Background: Deep space orbs + ECG heartbeat + AI network nodes
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ─── 1. LoginModal.tsx ───────────────────────────────────────────────────────

const LOGINMODAL_PATH = join(ROOT, 'frontend/src/components/auth/LoginModal.tsx');

const TSX = `import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../stores';
import { STORAGE_KEYS, migrateSessionStorageKey } from '../../lib/storageKeys';

migrateSessionStorageKey(STORAGE_KEYS.legacyLoginIntroSeen, STORAGE_KEYS.loginIntroSeen);

const ASSET_BASE = '/images/fitmeet/generated/login-characters-v2';
const MAN = {
  walk:      \`\${ASSET_BASE}/man-walk-barefoot.png\`,
  handshake: \`\${ASSET_BASE}/man-handshake-barefoot.png\`,
  pose:      \`\${ASSET_BASE}/man-pose-zeus-barefoot.png\`,
  peek:      \`\${ASSET_BASE}/man-pose-zeus-peek-barefoot.png\`,
};
const WOMAN = {
  walk:      \`\${ASSET_BASE}/woman-walk.png\`,
  handshake: \`\${ASSET_BASE}/woman-handshake.png\`,
  pose:      \`\${ASSET_BASE}/woman-pose.png\`,
};

// AI network node definitions [left%, top%, radius, color, delay, duration]
const NODES = [
  { x: 10, y: 18, r: 4,  c: 'rgba(99,210,255,0.9)',   d: '0s',    t: '3.4s' },
  { x: 82, y: 14, r: 5,  c: 'rgba(160,100,255,0.85)', d: '0.8s',  t: '4.2s' },
  { x: 6,  y: 64, r: 3,  c: 'rgba(22,199,132,0.8)',   d: '1.6s',  t: '3.8s' },
  { x: 88, y: 72, r: 6,  c: 'rgba(255,110,0,0.85)',   d: '0.3s',  t: '2.9s' },
  { x: 32, y: 10, r: 3,  c: 'rgba(99,210,255,0.6)',   d: '2.2s',  t: '5.4s' },
  { x: 68, y: 84, r: 4,  c: 'rgba(160,100,255,0.65)', d: '1.1s',  t: '4.1s' },
  { x: 48, y: 6,  r: 5,  c: 'rgba(22,199,132,0.7)',   d: '2.7s',  t: '4.6s' },
  { x: 42, y: 90, r: 3,  c: 'rgba(255,200,0,0.65)',   d: '1.8s',  t: '3.3s' },
  { x: 20, y: 48, r: 2,  c: 'rgba(99,210,255,0.45)',  d: '3.5s',  t: '6.2s' },
  { x: 76, y: 44, r: 2,  c: 'rgba(22,199,132,0.45)',  d: '3.0s',  t: '5.7s' },
  { x: 16, y: 34, r: 2,  c: 'rgba(255,200,100,0.4)',  d: '4.3s',  t: '7.1s' },
  { x: 58, y: 26, r: 2,  c: 'rgba(160,100,255,0.45)', d: '3.8s',  t: '6.5s' },
] as const;

type NodeDef = (typeof NODES)[number];

export const LoginModal = memo(function LoginModal() {
  const { showLoginModal, closeLogin, login, register, loading, error, isLoggedIn } =
    useAuthStore();

  const [agreed,     setAgreed]     = useState(false);
  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [name,       setName]       = useState('');
  const [isRegister, setIsRegister] = useState(false);

  const visible   = !isLoggedIn && showLoginModal;
  const introSeen = useRef(!!sessionStorage.getItem(STORAGE_KEYS.loginIntroSeen));
  const playIntro = !introSeen.current;

  useEffect(() => {
    if (visible && playIntro) {
      const t = setTimeout(() => {
        sessionStorage.setItem(STORAGE_KEYS.loginIntroSeen, '1');
        introSeen.current = true;
      }, 5700);
      return () => clearTimeout(t);
    }
  }, [visible, playIntro]);

  const closeAll     = useCallback(() => closeLogin(), [closeLogin]);
  const handleSubmit = useCallback(async () => {
    if (!email || !password || !agreed) return;
    if (isRegister && !name) return;
    try {
      if (isRegister) { await register({ email, password, name }); }
      else            { await login({ email, password }); }
      closeAll();
    } catch { /* error handled by store */ }
  }, [agreed, closeAll, email, isRegister, login, name, password, register]);

  const canSubmit = useMemo(
    () => Boolean(email && password && agreed && (!isRegister || name)),
    [agreed, email, isRegister, name, password],
  );

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="FitMeet"
      className={clsx(
        'fixed inset-0 z-[100] overflow-hidden',
        'ai-universe-wrap login-dialog-v2',
        'flex min-h-0 flex-col lg:grid lg:grid-cols-[1fr_420px]',
        playIntro ? 'login-dialog--intro' : 'login-dialog--quick',
      )}
    >
      <CharacterShell nodes={NODES} />
      <LoginPanel
        agreed={agreed}     canSubmit={canSubmit} closeAll={closeAll}
        email={email}       error={error}         isRegister={isRegister}
        loading={loading}   name={name}           password={password}
        setAgreed={setAgreed}     setEmail={setEmail}
        setIsRegister={setIsRegister}             setName={setName}
        setPassword={setPassword} onSubmit={handleSubmit}
      />
    </div>
  );
});

// ──────────────────────────────────────────────────────────────
//  Character Shell  (left visual stage)
// ──────────────────────────────────────────────────────────────

const CharacterShell = memo(function CharacterShell({ nodes }: { nodes: readonly NodeDef[] }) {
  return (
    <div className="ai-char-shell relative overflow-hidden">
      {/* Deep-space animated background */}
      <div className="ai-space-bg" aria-hidden="true">
        <div className="ai-space-city" />
        <div className="ai-orb ai-orb--orange" />
        <div className="ai-orb ai-orb--blue"   />
        <div className="ai-orb ai-orb--purple"  />
        <div className="ai-orb ai-orb--cyan"    />
        <div className="ai-space-overlay" />
      </div>

      {/* ECG heartbeat line (intro only) */}
      <svg
        className="ai-ecg-svg pointer-events-none"
        viewBox="0 0 1000 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          className="ai-ecg-path"
          d="M0,50 L90,50 L108,50 L124,6 L140,94 L156,26 L172,74 L188,50
             L260,50 L280,4 L298,96 L316,22 L334,78 L352,50
             L430,50 L462,2 L480,98 L498,20 L516,80 L534,50
             L620,50 L640,7 L658,93 L676,28 L694,72 L712,50
             L800,50 L820,4 L838,96 L856,24 L874,76 L892,50
             L1000,50"
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* AI pulsing network nodes */}
      <div className="pointer-events-none absolute inset-0 z-[4]" aria-hidden="true">
        {nodes.map((n, i) => (
          <span
            key={i}
            className="ai-network-node absolute rounded-full"
            style={{
              left:            \`\${n.x}%\`,
              top:             \`\${n.y}%\`,
              width:           \`\${n.r * 2}px\`,
              height:          \`\${n.r * 2}px\`,
              background:      n.c,
              boxShadow:       \`0 0 \${n.r * 5}px \${n.c}\`,
              animationDelay:    n.d,
              animationDuration: n.t,
            }}
          />
        ))}
      </div>

      {/* Brand mark */}
      <div className="absolute left-5 top-5 z-30 flex items-center gap-2.5 lg:left-8 lg:top-7">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#ff6a00] to-[#ffaa40] shadow-[0_6px_24px_rgba(255,106,0,0.52)]">
          <span className="text-lg">⚡</span>
        </div>
        <div>
          <div className="font-display text-xl font-black text-white">
            Fit<span className="text-[#ff6a00]">Meet</span>
          </div>
          <div className="text-[9px] font-bold uppercase tracking-widest text-white/35">
            AI 运动社交
          </div>
        </div>
      </div>

      {/* Character animation stage */}
      <div className="login-stage-v2 ai-stage" aria-hidden="true">
        <div className="login-stage-v2__halo"            />
        <div className="login-stage-v2__floor"           />
        <div className="login-stage-v2__handshake-burst"><span /></div>
        {/* Man */}
        <div className="login-character-v2 login-character-v2--man">
          <img className="login-character-v2__state login-character-v2__state--walk"
            src={MAN.walk}      alt="" draggable={false} />
          <img className="login-character-v2__state login-character-v2__state--handshake"
            src={MAN.handshake} alt="" draggable={false} />
          <img className="login-character-v2__state login-character-v2__state--pose"
            src={MAN.pose}      alt="" draggable={false} />
          <img className="login-character-v2__peek-pose"
            src={MAN.peek}      alt="" draggable={false} />
        </div>
        {/* Woman */}
        <div className="login-character-v2 login-character-v2--woman">
          <img className="login-character-v2__state login-character-v2__state--walk"
            src={WOMAN.walk}      alt="" draggable={false} />
          <img className="login-character-v2__state login-character-v2__state--handshake"
            src={WOMAN.handshake} alt="" draggable={false} />
          <img className="login-character-v2__state login-character-v2__state--pose"
            src={WOMAN.pose}      alt="" draggable={false} />
        </div>
      </div>

      {/* Feature badges */}
      <div
        className="absolute bottom-5 left-4 z-10 flex flex-wrap gap-2 lg:bottom-9 lg:left-8"
        aria-hidden="true"
      >
        {[
          { icon: '📍', label: '附近约练' },
          { icon: '🤖', label: 'AI 匹配'  },
          { icon: '🔥', label: '实时搭子' },
        ].map((b) => (
          <div
            key={b.label}
            className="flex items-center gap-1.5 rounded-full border border-white/[0.12] bg-black/40 px-3 py-1.5 backdrop-blur-sm"
          >
            <span className="text-xs">{b.icon}</span>
            <span className="text-[11px] font-bold text-white/65">{b.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
});

// ──────────────────────────────────────────────────────────────
//  Login Panel  (right side / bottom sheet on mobile)
// ──────────────────────────────────────────────────────────────

interface LoginPanelProps {
  agreed: boolean; canSubmit: boolean; closeAll: () => void;
  email: string;   error: string | null; isRegister: boolean;
  loading: boolean; name: string; password: string;
  setAgreed:     (v: boolean) => void;
  setEmail:      (v: string)  => void;
  setIsRegister: (v: boolean) => void;
  setName:       (v: string)  => void;
  setPassword:   (v: string)  => void;
  onSubmit: () => void;
}

const LoginPanel = memo(function LoginPanel({
  agreed, canSubmit, closeAll, email, error, isRegister,
  loading, name, password,
  setAgreed, setEmail, setIsRegister, setName, setPassword, onSubmit,
}: LoginPanelProps) {
  return (
    <div className="ai-login-panel login-panel-enter relative flex flex-col justify-center">
      {/* Close */}
      <button
        aria-label="关闭"
        className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.05] text-base text-white/35 transition hover:border-white/[0.26] hover:text-white/75"
        onClick={closeAll}
        type="button"
      >
        ×
      </button>

      {/* Header */}
      <div className="px-8 pt-10 lg:px-10 lg:pt-12">
        <div className="mb-1 text-[10px] font-black uppercase tracking-[0.22em] text-[#63d2ff]/55">
          AI FITNESS MATCH
        </div>
        <h2 className="font-display text-[1.7rem] font-black leading-tight text-white">
          {isRegister ? '加入运动圈子' : '欢迎回来'}
        </h2>
        <p className="mt-1 text-sm font-semibold text-white/35">
          {isRegister ? '和 12,847 位运动搭子一起出发' : '你的运动搭子正在等你'}
        </p>
      </div>

      {/* Scrollable form */}
      <div className="flex-1 overflow-y-auto px-8 pb-8 pt-6 lg:px-10 lg:pb-10">
        {/* Tab switcher */}
        <div className="mb-5 grid grid-cols-2 rounded-xl border border-white/[0.07] bg-white/[0.03] p-[3px]">
          {[{ label: '登录', reg: false }, { label: '注册', reg: true }].map(({ label, reg }) => (
            <button
              key={label}
              className={clsx(
                'rounded-[10px] py-2.5 text-sm font-black transition-all duration-200',
                isRegister === reg
                  ? 'ai-tab-active text-white shadow-[0_3px_14px_rgba(255,106,0,0.38)]'
                  : 'text-white/28 hover:text-white/55',
              )}
              onClick={() => setIsRegister(reg)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        {/* Fields */}
        <div className="space-y-3.5">
          {isRegister && (
            <GlassField label="昵称" icon="✦">
              <input name="name"     className="ai-glass-input" placeholder="你想展示的昵称"
                value={name}     onChange={(e) => setName(e.target.value)} />
            </GlassField>
          )}
          <GlassField label="邮箱" icon="@">
            <input name="email"    className="ai-glass-input" placeholder="常用邮箱地址"
              type="email"    autoComplete="email"
              value={email}    onChange={(e) => setEmail(e.target.value)} />
          </GlassField>
          <GlassField label="密码" icon="◈">
            <input name="password" className="ai-glass-input" placeholder="登录密码"
              type="password" autoComplete={isRegister ? 'new-password' : 'current-password'}
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </GlassField>
        </div>

        {/* Agree */}
        <label className="mt-4 flex cursor-pointer items-start gap-2 text-xs font-semibold leading-[1.65] text-white/28">
          <input
            checked={agreed}
            className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded accent-[#ff6a00]"
            onChange={(e) => setAgreed(e.target.checked)}
            type="checkbox"
          />
          <span>
            我已阅读并同意{' '}
            <Link className="text-[#ff6a00] hover:underline" to="/terms"   onClick={closeAll}>用户协议</Link>
            {' '}和{' '}
            <Link className="text-[#ff6a00] hover:underline" to="/privacy" onClick={closeAll}>隐私政策</Link>
          </span>
        </label>

        {/* Error */}
        {error && (
          <div className="mt-3.5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm font-bold text-red-300">
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          className="ai-submit-btn mt-5 w-full"
          disabled={!canSubmit || loading}
          onClick={onSubmit}
          type="button"
        >
          <span className="ai-submit-shimmer" aria-hidden="true" />
          <span className="relative z-10">
            {loading ? '处理中...' : isRegister ? '立即注册 →' : '登录 FitMeet →'}
          </span>
        </button>

        {/* Social */}
        <div className="mt-6">
          <div className="mb-3 flex items-center gap-3">
            <span className="h-px flex-1 bg-white/[0.06]" />
            <span className="text-[10px] font-bold text-white/20">其他方式登录</span>
            <span className="h-px flex-1 bg-white/[0.06]" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[['💬', '微信'], [' ', 'Apple'], ['📱', '手机']].map(([icon, label]) => (
              <button
                key={label}
                className="rounded-xl border border-white/[0.07] bg-white/[0.03] py-2.5 text-[11px] font-black text-white/25 transition hover:border-white/[0.16] hover:bg-white/[0.07] hover:text-white/55"
                type="button"
              >
                {icon?.trim() && <span className="mr-1">{icon}</span>}
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Stats strip */}
        <div className="mt-6 flex items-center justify-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
          <div className="text-center">
            <div className="text-sm font-black text-[#ff6a00]">12,847</div>
            <div className="text-[9px] font-bold text-white/25">活跃搭子</div>
          </div>
          <span className="h-7 w-px bg-white/[0.07]" />
          <div className="text-center">
            <div className="text-sm font-black text-[#16c784]">3,291</div>
            <div className="text-[9px] font-bold text-white/25">本周约练</div>
          </div>
          <span className="h-7 w-px bg-white/[0.07]" />
          <div className="text-center">
            <div className="text-sm font-black text-white/70">98+</div>
            <div className="text-[9px] font-bold text-white/25">覆盖城市</div>
          </div>
        </div>
      </div>
    </div>
  );
});

// ──────────────────────────────────────────────────────────────
//  Glass Field
// ──────────────────────────────────────────────────────────────

const GlassField = memo(function GlassField({
  label, icon, children,
}: {
  label: string; icon: string; children: ReactNode;
}) {
  return (
    <label className="group block">
      <span className="mb-1.5 block text-[11px] font-black text-white/35">{label}</span>
      <span className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 transition-all duration-200 focus-within:border-[#ff6a00]/55 focus-within:bg-white/[0.07] focus-within:shadow-[0_0_0_3px_rgba(255,106,0,0.13)] group-hover:border-white/[0.14]">
        <span className="shrink-0 text-xs font-black text-[#ff6a00]/75">{icon}</span>
        {children}
      </span>
    </label>
  );
});
`;

writeFileSync(LOGINMODAL_PATH, TSX, { encoding: 'utf8' });
console.log(`✅ LoginModal.tsx written (${TSX.split('\n').length} lines)`);

// ─── 2. Replace CSS section in global.css ────────────────────────────────────

const CSS_PATH = join(ROOT, 'frontend/src/global.css');
const existing = readFileSync(CSS_PATH, { encoding: 'utf8' });

// Markers for previously appended sections
const AURORA_MARKER = '\n\n/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n   AURORA LOGIN REDESIGN';
const AI_MARKER    = '\n\n/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n   AI MATCH UNIVERSE';

let base = existing;
const auroraIdx = existing.indexOf(AURORA_MARKER);
const aiIdx     = existing.indexOf(AI_MARKER);
if (auroraIdx !== -1) { base = existing.slice(0, auroraIdx); }
else if (aiIdx !== -1) { base = existing.slice(0, aiIdx); }

const NEW_CSS = `

/* ===============================================================
   AI MATCH UNIVERSE LOGIN DESIGN
   Deep-space animated bg · ECG heartbeat · Character stage ·
   AI network nodes · Premium glass card · Micro-interactions
=============================================================== */

/* ── Outer wrapper ── */
.ai-universe-wrap {
  background: #04020d;
}

/* ── Character shell ── */
.ai-char-shell {
  min-height: clamp(340px, 48vh, 680px);
  isolation: isolate;
}
@media (min-width: 1024px) {
  .ai-char-shell { min-height: 100vh; }
}

/* ── Deep-space background ── */
.ai-space-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: linear-gradient(155deg, #07021a 0%, #0b0418 28%, #050212 56%, #0a0316 100%);
  overflow: hidden;
}

.ai-space-city {
  position: absolute;
  inset: 0;
  background: url('/images/fitmeet/generated/login-stage-city-sunlight.webp') center / cover no-repeat;
  opacity: 0.1;
  filter: grayscale(0.4) saturate(0.6);
}

.ai-space-overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  background:
    radial-gradient(ellipse at 22% 80%, rgba(255,110,0,0.12), transparent 48%),
    linear-gradient(to top,
      rgba(4,2,13,0.72) 0%,
      rgba(4,2,13,0.28) 22%,
      transparent 52%,
      rgba(4,2,13,0.5) 100%);
  pointer-events: none;
}

/* ── Animated orbs ── */
.ai-orb {
  position: absolute;
  border-radius: 999px;
  filter: blur(72px);
  mix-blend-mode: screen;
  will-change: transform;
  pointer-events: none;
  z-index: 1;
}

.ai-orb--orange {
  width: min(55vw,700px); height: min(55vw,700px);
  bottom: -28%; left: -18%;
  background: radial-gradient(circle, rgba(255,90,0,0.82) 0%, rgba(210,40,0,0.46) 34%, transparent 64%);
  animation: aiOrb1 24s ease-in-out infinite;
}
.ai-orb--blue {
  width: min(48vw,640px); height: min(48vw,640px);
  top: -22%; right: -12%;
  background: radial-gradient(circle, rgba(40,100,255,0.68) 0%, rgba(20,60,200,0.38) 34%, transparent 64%);
  animation: aiOrb2 30s ease-in-out infinite;
}
.ai-orb--purple {
  width: min(40vw,560px); height: min(40vw,560px);
  top: 20%; left: 28%;
  background: radial-gradient(circle, rgba(140,50,255,0.48) 0%, rgba(90,20,200,0.24) 36%, transparent 66%);
  animation: aiOrb3 36s ease-in-out infinite;
}
.ai-orb--cyan {
  width: min(36vw,500px); height: min(36vw,500px);
  bottom: 4%; right: 14%;
  background: radial-gradient(circle, rgba(0,200,220,0.52) 0%, rgba(0,150,180,0.28) 36%, transparent 64%);
  animation: aiOrb4 26s ease-in-out infinite;
}

@keyframes aiOrb1 {
  0%,100% { transform: translate(0,0)     scale(1); }
  25%     { transform: translate(6%,-10%) scale(1.1); }
  50%     { transform: translate(14%,8%)  scale(0.92); }
  75%     { transform: translate(-4%,12%) scale(1.08); }
}
@keyframes aiOrb2 {
  0%,100% { transform: translate(0,0)      scale(1); }
  33%     { transform: translate(-12%,16%) scale(1.12); }
  66%     { transform: translate(9%,-8%)   scale(0.88); }
}
@keyframes aiOrb3 {
  0%,100% { transform: translate(0,0)       scale(1); }
  42%     { transform: translate(-16%,12%)  scale(1.2); }
  78%     { transform: translate(12%,-14%)  scale(0.84); }
}
@keyframes aiOrb4 {
  0%,100% { transform: translate(0,0)       scale(1); }
  50%     { transform: translate(-14%,-10%) scale(1.18); }
}

/* ── ECG heartbeat line ── */
.ai-ecg-svg {
  position: absolute;
  left: 0; right: 0;
  bottom: 48%;
  z-index: 5;
  width: 100%;
  height: 60px;
  pointer-events: none;
  opacity: 0;
}

.login-dialog--intro .ai-ecg-svg {
  animation: aiEcgFade 5.2s cubic-bezier(0.2,0.8,0.2,1) both;
}

.ai-ecg-path {
  stroke: rgba(22,199,132,0.95);
  stroke-dasharray: 2200;
  stroke-dashoffset: 2200;
}

.login-dialog--intro .ai-ecg-path {
  animation:
    aiEcgDraw  1.8s 0.15s ease-out both,
    aiEcgColor 5.0s 0.15s ease both;
}

@keyframes aiEcgFade {
  0%       { opacity: 0; }
  8%       { opacity: 1; }
  65%,100% { opacity: 0; }
}
@keyframes aiEcgDraw {
  from { stroke-dashoffset: 2200; }
  to   { stroke-dashoffset: 0; }
}
@keyframes aiEcgColor {
  0%   { stroke: rgba(22,199,132,0.95);  filter: drop-shadow(0 0 8px  rgba(22,199,132,0.8)); }
  40%  { stroke: rgba(99,210,255,0.95);  filter: drop-shadow(0 0 12px rgba(99,210,255,0.9)); }
  70%  { stroke: rgba(255,106,0,0.85);   filter: drop-shadow(0 0 16px rgba(255,106,0,0.7));  }
  100% { stroke: rgba(22,199,132,0.4);   filter: none; }
}

/* ── AI network pulsing nodes ── */
.ai-network-node {
  opacity: 0;
  transform: scale(0.6);
  animation: aiNodePulse var(--dur,4s) var(--delay,0s) ease-in-out infinite;
}

@keyframes aiNodePulse {
  0%   { opacity: 0;    transform: scale(0.6);  }
  20%  { opacity: 0.85; transform: scale(1);    }
  50%  { opacity: 0.6;  transform: scale(1.18); }
  80%  { opacity: 0.85; transform: scale(1);    }
  100% { opacity: 0;    transform: scale(0.6);  }
}

/* Nodes appear after ECG completes during intro */
.login-dialog--intro .ai-network-node {
  animation-delay: calc(2.2s + 0s);
}

/* ── Stage inner: extend inset so it uses full shell height ── */
.ai-stage {
  inset: 5rem 0 0 !important;
}

/* ── Login panel (right / bottom) ── */
.ai-login-panel {
  position: relative;
  background: linear-gradient(160deg, rgba(12,6,30,0.97) 0%, rgba(8,4,20,0.99) 100%);
  border-left: 1px solid rgba(140,100,255,0.12);
  overflow-y: auto;
  overflow-x: hidden;
}

@media (max-width: 1023px) {
  .ai-login-panel {
    border-left: none;
    border-top: 1px solid rgba(140,100,255,0.12);
    border-radius: 24px 24px 0 0;
    box-shadow: 0 -20px 60px rgba(0,0,0,0.6);
  }
}

/* ── Active tab pill ── */
.ai-tab-active {
  background: linear-gradient(135deg, rgba(255,106,0,0.28) 0%, rgba(255,80,0,0.18) 100%);
  border: 1px solid rgba(255,106,0,0.32);
}

/* ── Glass input ── */
.ai-glass-input {
  width: 100%;
  border: 0;
  background: transparent;
  padding: 0.78rem 0;
  color: rgba(255,241,226,0.9);
  font: 700 0.875rem/1.25 var(--f-body, system-ui);
  outline: none;
}
.ai-glass-input::placeholder {
  color: rgba(255,255,255,0.18);
  font-weight: 500;
}

/* ── Submit button ── */
.ai-submit-btn {
  position: relative;
  overflow: hidden;
  display: block;
  border: none;
  border-radius: 14px;
  background: linear-gradient(135deg, #ff6a00 0%, #ff9840 50%, #ff6a00 100%);
  background-size: 200% 100%;
  padding: 0.92rem 1.5rem;
  font-family: var(--f-display, system-ui);
  font-size: 0.9375rem;
  font-weight: 900;
  color: #fff;
  letter-spacing: 0.015em;
  text-align: center;
  box-shadow: 0 8px 36px rgba(255,106,0,0.46), 0 2px 10px rgba(255,106,0,0.3);
  cursor: pointer;
  transition: background-position 0.6s, box-shadow 0.3s, transform 0.15s;
}
.ai-submit-btn:hover:not(:disabled) {
  background-position: 100% 0;
  box-shadow: 0 14px 48px rgba(255,106,0,0.62), 0 4px 16px rgba(255,106,0,0.4);
  transform: translateY(-2px);
}
.ai-submit-btn:active:not(:disabled) {
  transform: translateY(0) scale(0.99);
}
.ai-submit-btn:disabled {
  background: rgba(255,255,255,0.05);
  color: rgba(255,255,255,0.18);
  box-shadow: none;
  cursor: not-allowed;
}

/* Shimmer on submit */
.ai-submit-shimmer {
  position: absolute;
  inset: 0;
  background: linear-gradient(110deg, transparent 28%, rgba(255,255,255,0.36) 50%, transparent 72%);
  background-size: 200% 100%;
  animation: aiShimmer 3.8s 1.6s ease-in-out infinite;
  pointer-events: none;
}
.ai-submit-btn:disabled .ai-submit-shimmer { display: none; }

@keyframes aiShimmer {
  0%   { background-position:  200% 0; }
  100% { background-position: -200% 0; }
}

/* ── Email-focus: characters subtly look inward ── */
.ai-universe-wrap:has(input[name='email']:focus) .login-character-v2--man {
  transform: translateX(12px) rotate(1.8deg) !important;
  transition: transform 500ms cubic-bezier(0.2,0.8,0.2,1) !important;
  animation: none !important;
}
.ai-universe-wrap:has(input[name='email']:focus) .login-character-v2--woman {
  transform: translateX(-12px) rotate(-1.8deg) !important;
  transition: transform 500ms cubic-bezier(0.2,0.8,0.2,1) !important;
  animation: none !important;
}

/* ── Panel entrance override ── */
.ai-universe-wrap .login-panel-enter {
  animation: loginPanelV2In 0.56s 0.1s cubic-bezier(0.22,1,0.36,1) both;
}
.ai-universe-wrap.login-dialog--intro .login-panel-enter {
  animation: loginPanelV2In 0.56s 5.05s cubic-bezier(0.22,1,0.36,1) both;
}

/* ── Mobile adjustments ── */
@media (max-width: 1023px) {
  .ai-char-shell .login-stage-v2 {
    inset: 4rem 0 0;
  }
  .ai-char-shell .login-character-v2--man {
    --login-intro-handshake-x: 44px;
    --login-intro-pose-x: 6px;
  }
  .ai-char-shell .login-character-v2--woman {
    --login-intro-handshake-x: -54px;
    --login-intro-pose-x: -4px;
  }
}

/* ── Reduced-motion fallback ── */
@media (prefers-reduced-motion: reduce) {
  .ai-orb, .ai-network-node, .ai-ecg-svg, .ai-ecg-path,
  .login-dialog-v2.login-dialog--intro .login-character-v2,
  .login-dialog-v2.login-dialog--intro .login-character-v2__state,
  .login-character-v2__state--pose,
  .login-stage-v2__handshake-burst {
    animation: none !important;
  }
  .ai-login-panel .login-panel-enter,
  .login-character-v2__state--pose { opacity: 1 !important; }
  .ai-space-city { opacity: 0.15; }
}
`;

writeFileSync(CSS_PATH, base + NEW_CSS, { encoding: 'utf8' });
const totalLines = (base + NEW_CSS).split('\n').length;
console.log(`\u2705 global.css updated \u2014 now ${totalLines} lines`);
console.log('Done! AI Match Universe login is ready.');
