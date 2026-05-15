// fix-loginmodal-v3-css-r2.mjs
// r2: Centered card modal — does NOT cover entire viewport.
// Restores original character positions (23%/54%) so intro animation works.
// Panel positioned inside card at right:24px.

import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('frontend/src/global.css');
const src  = fs.readFileSync(file, 'utf8');

const MARK = '/* ===============================================================\n   AI MATCH UNIVERSE LOGIN DESIGN';
const idx  = src.indexOf(MARK);
if (idx === -1) { console.error('Marker not found'); process.exit(1); }

const head = src.slice(0, idx);

const css = `/* ===============================================================
   AI MATCH UNIVERSE LOGIN DESIGN — v3 Cinematic (r2)
   • Centered card modal — does NOT cover entire viewport
   • Characters at original 23%/54% — animations work correctly
   • Panel inside card, right side (24px from edge)
   =============================================================== */

/* ─────────────────────────  BACKDROP WRAPPER  ───────────────────────── */
.ai-universe-wrap {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

/* Semi-transparent backdrop behind the card */
.ai-universe-wrap::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  background: rgba(3, 1, 10, 0.74);
  pointer-events: none;
}

/* ─────────────────────────  CARD  ───────────────────────── */
.ai-universe-card {
  position: relative;
  z-index: 1;
  width: min(1200px, 96vw);
  height: min(700px, 90vh);
  border-radius: 20px;
  overflow: hidden;
  flex-shrink: 0;
  box-shadow:
    0 32px 100px rgba(0, 0, 0, 0.82),
    0 6px 28px rgba(0, 0, 0, 0.55),
    0 0 0 1px rgba(255, 255, 255, 0.04);
}

/* Character shell fills the card */
.ai-char-shell {
  position: absolute;
  inset: 0;
  isolation: isolate;
  overflow: hidden;
}

/* ─────────────────────────  BACKGROUND  ───────────────────────── */
.ai-space-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: linear-gradient(160deg, #08051a 0%, #0a0418 32%, #060212 60%, #0d0518 100%);
  overflow: hidden;
}
.ai-space-city {
  position: absolute;
  inset: 0;
  background: url('/images/fitmeet/generated/login-stage-city-sunlight.webp') center / cover no-repeat;
  opacity: 0.08;
  filter: grayscale(0.55) saturate(0.55) blur(1px);
}
.ai-space-overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  background:
    radial-gradient(ellipse at 18% 78%, rgba(255, 118, 28, 0.18), transparent 42%),
    radial-gradient(ellipse at 82% 18%, rgba(72, 90, 220, 0.16), transparent 46%),
    linear-gradient(to top, rgba(4,2,13,0.78) 0%, rgba(4,2,13,0.22) 24%, transparent 56%, rgba(4,2,13,0.42) 100%);
  pointer-events: none;
}

/* ─────────────────────  ORBS (2 only)  ───────────────────── */
.ai-orb {
  position: absolute;
  border-radius: 999px;
  filter: blur(110px);
  mix-blend-mode: screen;
  will-change: transform;
  pointer-events: none;
  z-index: 1;
  opacity: 0.78;
}
.ai-orb--orange {
  width: min(60vw, 740px); height: min(60vw, 740px);
  bottom: -22%; left: -16%;
  background: radial-gradient(circle, rgba(255,108,28,0.7) 0%, rgba(210,52,0,0.32) 32%, transparent 64%);
  animation: aiOrb1 32s ease-in-out infinite;
}
.ai-orb--blue {
  width: min(46vw, 600px); height: min(46vw, 600px);
  top: -18%; right: -10%;
  background: radial-gradient(circle, rgba(64,96,220,0.5) 0%, rgba(40,52,180,0.26) 32%, transparent 66%);
  animation: aiOrb2 38s ease-in-out infinite;
}
.ai-orb--purple, .ai-orb--cyan { display: none; }

@keyframes aiOrb1 {
  0%,100% { transform: translate(0,0) scale(1); }
  50%     { transform: translate(8%,-6%) scale(1.08); }
}
@keyframes aiOrb2 {
  0%,100% { transform: translate(0,0) scale(1); }
  50%     { transform: translate(-6%,8%) scale(1.06); }
}

/* ─────────────────────  ECG  ───────────────────── */
.ai-ecg-svg {
  position: absolute; left: 0; right: 0; top: 46%;
  z-index: 5; width: 100%; height: 56px;
  pointer-events: none; opacity: 0;
}
.login-dialog--intro .ai-ecg-svg {
  animation: aiEcgFade 4.6s cubic-bezier(0.2,0.8,0.2,1) both;
}
.ai-ecg-path { stroke: rgba(22,199,132,0.95); stroke-dasharray: 2200; stroke-dashoffset: 2200; }
.login-dialog--intro .ai-ecg-path {
  animation: aiEcgDraw 1.6s 0.15s ease-out both, aiEcgColor 4.4s 0.15s ease both;
}
@keyframes aiEcgFade {
  0%       { opacity: 0; }
  10%      { opacity: 0.92; }
  68%,100% { opacity: 0; }
}
@keyframes aiEcgDraw { from { stroke-dashoffset: 2200; } to { stroke-dashoffset: 0; } }
@keyframes aiEcgColor {
  0%   { stroke: rgba(22,199,132,0.95); filter: drop-shadow(0 0 6px rgba(22,199,132,0.7)); }
  60%  { stroke: rgba(120,200,255,0.9); filter: drop-shadow(0 0 8px rgba(120,200,255,0.6)); }
  100% { stroke: rgba(255,108,28,0.0); filter: none; }
}

/* ─────────────────────  NETWORK NODES  ───────────────────── */
.ai-network-node {
  opacity: 0; transform: scale(0.6);
  animation: aiNodePulse var(--dur, 4s) var(--delay, 0s) ease-in-out infinite;
  filter: blur(0.3px);
}
@keyframes aiNodePulse {
  0%   { opacity: 0;    transform: scale(0.6); }
  20%  { opacity: 0.7;  transform: scale(1); }
  50%  { opacity: 0.45; transform: scale(1.16); }
  80%  { opacity: 0.7;  transform: scale(1); }
  100% { opacity: 0;    transform: scale(0.6); }
}
.login-dialog--intro .ai-network-node { animation-delay: 2.4s; }

/* ─────────────────────  STAGE  ───────────────────── */
.ai-stage { inset: 0 !important; }

/* Halo centered between the two characters (midpoint ≈ 39% of card) */
.ai-universe-wrap .login-stage-v2__halo {
  left: 39%;
  bottom: 8%;
  width: clamp(380px, 50vw, 720px);
  height: clamp(160px, 22vh, 240px);
  transform: translateX(-50%);
  background:
    radial-gradient(ellipse at 50% 60%,
      rgba(255,148,52,0.28) 0%,
      rgba(255,108,0,0.14) 24%,
      transparent 62%);
  filter: blur(28px);
  opacity: 0.85;
}
.ai-universe-wrap .login-stage-v2__floor {
  left: 39%;
  bottom: 12%;
  width: clamp(320px, 44vw, 620px);
  height: 8px;
  transform: translateX(-50%);
  background: linear-gradient(90deg,
    transparent 0%, rgba(255,180,90,0.22) 22%,
    rgba(255,210,150,0.36) 50%, rgba(160,140,255,0.22) 78%, transparent 100%);
  filter: blur(2px);
  opacity: 0.9;
}

/* Characters: keep original left positions (23%/54%) so intro animation works.
   Only override height for larger cinematic presence. */
@media (min-width: 1024px) {
  .ai-universe-wrap .login-character-v2--man {
    height: clamp(380px, 58vh, 600px);
  }
  .ai-universe-wrap .login-character-v2--woman {
    height: clamp(340px, 52vh, 540px);
  }
}

/* Soften lighting on characters */
.ai-universe-wrap .login-character-v2__state {
  filter:
    saturate(1.04) contrast(1.03)
    drop-shadow(14px 22px 22px rgba(0,0,0,0.5))
    drop-shadow(-6px -4px 12px rgba(255,160,60,0.14));
}
.ai-universe-wrap .login-character-v2--woman .login-character-v2__state {
  filter:
    saturate(1.03) contrast(1.02)
    drop-shadow(12px 20px 20px rgba(0,0,0,0.42))
    drop-shadow(-5px -4px 10px rgba(160,180,255,0.12));
}
.ai-universe-wrap .login-character-v2--man::after {
  opacity: 0.32 !important;
  filter: blur(8px) saturate(0.95) !important;
}

/* ─────────────────────  GROUND SHADOWS  ───────────────────── */
/* Positions match original character positions: man 23%, woman 54% */
.ai-ground-shadow {
  position: absolute;
  z-index: 4;
  border-radius: 999px;
  background: radial-gradient(ellipse at center,
    rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.28) 38%, transparent 72%);
  filter: blur(6px);
  pointer-events: none;
  animation: aiShadowBreath 5.4s ease-in-out infinite;
}
.ai-ground-shadow--man {
  width: clamp(140px, 16vw, 210px);
  height: clamp(28px, 3.2vh, 42px);
  bottom: 11%;
  left: 23%;
  transform: translateX(-50%);
}
.ai-ground-shadow--woman {
  width: clamp(120px, 14vw, 176px);
  height: clamp(24px, 2.8vh, 36px);
  bottom: 12%;
  left: 54%;
  transform: translateX(-50%);
  opacity: 0.86;
}
@media (max-width: 1023px) {
  .ai-ground-shadow--man   { left: 31%; bottom: 8%; }
  .ai-ground-shadow--woman { left: 63%; bottom: 9%; }
}
@keyframes aiShadowBreath {
  0%,100% { opacity: 1;    transform: translateX(-50%) scale(1); }
  50%     { opacity: 0.86; transform: translateX(-50%) scale(0.96); }
}
.login-dialog--intro .ai-ground-shadow {
  opacity: 0;
  animation:
    aiShadowAppear 800ms 4.6s cubic-bezier(0.22,1,0.36,1) forwards,
    aiShadowBreath 5.4s 5.4s ease-in-out infinite;
}
@keyframes aiShadowAppear {
  from { opacity: 0; transform: translateX(-50%) scale(0.7); }
  to   { opacity: 1; transform: translateX(-50%) scale(1); }
}

/* ─────────────────────  AI ENERGY LINK ARC  ───────────────────── */
/* Span from man (23%) to woman (54%): left=23%, width=31% */
.ai-link-arc {
  position: absolute;
  z-index: 5;
  left: 23%;
  width: 31%;
  height: 80px;
  pointer-events: none;
}
@media (min-width: 1024px) {
  .ai-link-arc {
    bottom: calc(11% + clamp(300px, 52vh, 560px));
  }
}
@media (max-width: 1023px) {
  .ai-link-arc {
    left: 31%;
    width: 34%;
    bottom: calc(8% + clamp(220px, 36vh, 360px));
  }
}
.ai-link-arc__path {
  stroke-dasharray: 320;
  stroke-dashoffset: 320;
  filter: drop-shadow(0 0 4px rgba(160,140,255,0.5));
}
.login-dialog--intro .ai-link-arc__path {
  animation:
    aiLinkDraw 1.4s 4.4s cubic-bezier(0.22,1,0.36,1) forwards,
    aiLinkPulse 3.2s 5.8s ease-in-out infinite;
}
.login-dialog--quick .ai-link-arc__path {
  animation: aiLinkPulse 3.2s ease-in-out infinite;
  stroke-dashoffset: 0;
}
@keyframes aiLinkDraw { to { stroke-dashoffset: 0; } }
@keyframes aiLinkPulse {
  0%,100% { opacity: 0.5; }
  50%     { opacity: 0.9; }
}

/* ─────────────────────  PANEL (inside card)  ───────────────────── */
.ai-login-panel {
  position: absolute !important;
  top: 0;
  bottom: 0;
  right: 24px;
  margin-block: auto;
  width: min(400px, 44%);
  height: fit-content;
  max-height: 96%;
  z-index: 30;
  border-radius: 22px;
  border: 1px solid rgba(255,255,255,0.06);
  background: linear-gradient(160deg, rgba(14,8,32,0.94) 0%, rgba(8,4,20,0.97) 100%);
  backdrop-filter: blur(22px) saturate(1.1);
  -webkit-backdrop-filter: blur(22px) saturate(1.1);
  box-shadow:
    0 20px 56px rgba(0,0,0,0.52),
    0 4px 16px rgba(0,0,0,0.38),
    inset 0 1px 0 rgba(255,255,255,0.05),
    inset 0 0 0 1px rgba(140,100,255,0.08);
  overflow-y: auto;
  overflow-x: hidden;
}
.ai-login-panel::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 1px;
  background: linear-gradient(90deg,
    transparent 0%, rgba(255,180,90,0.42) 30%,
    rgba(180,140,255,0.42) 70%, transparent 100%);
  pointer-events: none;
  border-radius: 22px 22px 0 0;
}

/* ── Bottom-sheet on tablet/mobile (< 1024px) ── */
@media (max-width: 1023px) {
  .ai-universe-card {
    width: min(680px, 96vw);
    height: min(720px, 93vh);
    border-radius: 24px;
  }
  .ai-login-panel {
    top: auto;
    bottom: 0;
    right: 0; left: 0;
    margin-block: 0;
    width: 100%;
    height: auto;
    max-height: 57%;
    border-radius: 22px 22px 0 0;
    border-left: none; border-right: none; border-bottom: none;
    box-shadow:
      0 -20px 56px rgba(0,0,0,0.58),
      inset 0 1px 0 rgba(255,255,255,0.05);
  }
}
@media (max-width: 520px) {
  .ai-universe-card {
    width: 100%;
    height: 100%;
    border-radius: 0;
  }
  .ai-login-panel {
    max-height: 64%;
    border-radius: 24px 24px 0 0;
  }
}

/* ─────────────────────  TAB SWITCHER  ───────────────────── */
.ai-tab-active {
  background: linear-gradient(135deg, rgba(255,108,28,0.32) 0%, rgba(255,80,0,0.18) 100%);
  border: 1px solid rgba(255,108,28,0.42);
  box-shadow:
    0 6px 18px rgba(255,108,28,0.28),
    inset 0 1px 0 rgba(255,200,140,0.32);
}

/* ─────────────────────  GLASS INPUT  ───────────────────── */
.ai-glass-input {
  width: 100%;
  border: 0;
  background: transparent;
  padding: 0.78rem 0;
  color: rgba(255,241,226,0.94);
  font: 700 0.875rem/1.25 var(--f-body, system-ui);
  outline: none;
}
.ai-glass-input::placeholder {
  color: rgba(255,255,255,0.22);
  font-weight: 500;
}

/* ─────────────────────  SUBMIT BUTTON  ───────────────────── */
.ai-submit-btn {
  position: relative;
  overflow: hidden;
  display: block;
  width: 100%;
  border: none;
  border-radius: 14px;
  background: linear-gradient(135deg, #ff6a00 0%, #ff9840 50%, #ff6a00 100%);
  background-size: 200% 100%;
  padding: 0.96rem 1.5rem;
  font-family: var(--f-display, system-ui);
  font-size: 0.9375rem;
  font-weight: 900;
  color: #fff;
  letter-spacing: 0.02em;
  text-align: center;
  box-shadow:
    0 10px 36px rgba(255,108,28,0.46),
    0 2px 10px rgba(255,108,28,0.32),
    inset 0 1px 0 rgba(255,220,180,0.4);
  cursor: pointer;
  transition: background-position 0.6s, box-shadow 0.3s, transform 0.15s;
}
.ai-submit-btn:hover:not(:disabled) {
  background-position: 100% 0;
  box-shadow:
    0 16px 48px rgba(255,108,28,0.62),
    0 4px 16px rgba(255,108,28,0.42),
    inset 0 1px 0 rgba(255,230,200,0.5);
  transform: translateY(-2px);
}
.ai-submit-btn:active:not(:disabled) { transform: translateY(0) scale(0.99); }
.ai-submit-btn:disabled {
  background: linear-gradient(135deg, rgba(255,108,28,0.22) 0%, rgba(255,140,60,0.18) 100%);
  color: rgba(255,220,190,0.55);
  box-shadow: inset 0 0 0 1px rgba(255,180,120,0.22), inset 0 1px 0 rgba(255,220,190,0.08);
  cursor: not-allowed;
  filter: saturate(0.85);
}
.ai-submit-shimmer {
  position: absolute;
  inset: 0;
  background: linear-gradient(110deg, transparent 28%, rgba(255,255,255,0.36) 50%, transparent 72%);
  background-size: 200% 100%;
  animation: aiShimmer 4.2s 1.6s ease-in-out infinite;
  pointer-events: none;
}
.ai-submit-btn:disabled .ai-submit-shimmer { display: none; }
@keyframes aiShimmer {
  0%   { background-position:  200% 0; }
  100% { background-position: -200% 0; }
}

/* ─────────────────────  FOCUS PEEK (quick mode only)  ───────────────────── */
.login-dialog--quick.ai-universe-wrap:has(input[name='email']:focus) .login-character-v2--man {
  transform: translate(4px, -2px) rotate(0.5deg) !important;
  transition: transform 480ms cubic-bezier(0.2,0.8,0.2,1) !important;
}
.login-dialog--quick.ai-universe-wrap:has(input[name='email']:focus) .login-character-v2--woman {
  transform: translate(3px, -2px) rotate(-0.4deg) !important;
  transition: transform 480ms cubic-bezier(0.2,0.8,0.2,1) !important;
}
.login-dialog--quick.ai-universe-wrap:has(input[type='password']:focus) .login-character-v2--man {
  animation: none !important;
  transform: translate(7px, -3px) rotate(1.1deg) !important;
  transition: transform 520ms cubic-bezier(0.2,0.8,0.2,1) !important;
}
.login-dialog--quick.ai-universe-wrap:has(input[type='password']:focus) .login-character-v2--woman {
  transform: translate(-2px, 1px) rotate(-1.5deg) scale(0.993) !important;
  transition: transform 520ms cubic-bezier(0.2,0.8,0.2,1) !important;
}
.login-dialog--quick.ai-universe-wrap:has(input[type='password']:focus) .login-character-v2--man .login-character-v2__peek-pose {
  opacity: 1;
  transform: translateX(-50%) translate(2px, -2px) scale(1.005);
}
.login-dialog--quick.ai-universe-wrap:has(input[type='password']:focus) .login-character-v2--man .login-character-v2__state--pose {
  opacity: 0;
}

/* ─────────────────────  PANEL ENTRANCE  ───────────────────── */
.ai-universe-wrap .login-panel-enter {
  animation: loginPanelV2In 0.5s 0.1s cubic-bezier(0.22,1,0.36,1) both;
}
.ai-universe-wrap.login-dialog--intro .login-panel-enter {
  animation: loginPanelV2In 0.55s 5.0s cubic-bezier(0.22,1,0.36,1) both;
}

/* ─────────────────────  LEGACY OVERRIDES  ───────────────────── */
.ai-universe-wrap.login-dialog-v2 {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  grid-template-columns: unset !important;
  grid-template-rows: unset !important;
  gap: 0 !important;
  padding: 0 !important;
}

/* ─────────────────────  REDUCED MOTION  ───────────────────── */
@media (prefers-reduced-motion: reduce) {
  .ai-orb, .ai-network-node, .ai-ecg-svg, .ai-ecg-path,
  .ai-link-arc__path, .ai-ground-shadow,
  .login-dialog-v2.login-dialog--intro .login-character-v2,
  .login-dialog-v2.login-dialog--intro .login-character-v2__state,
  .login-stage-v2__handshake-burst { animation: none !important; }
  .ai-link-arc__path { stroke-dashoffset: 0 !important; opacity: 0.7; }
  .ai-ground-shadow { opacity: 1 !important; }
  .ai-space-city { opacity: 0.12; }
}
`;

const out = head + css;
fs.writeFileSync(file, out, 'utf8');
console.log('[ok] global.css updated (v3 r2)');
console.log('  old length:', src.length);
console.log('  new length:', out.length);
console.log('  cut at idx:', idx);
