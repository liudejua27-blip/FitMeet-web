import { useId } from 'react';
import type { AntGuideState } from './AntGuide.types';

export function AntGuideSvg({ state }: { state: AntGuideState }) {
  const id = useId().replace(/:/g, '');
  const headId = `${id}-ant-guide-head`;
  const goldId = `${id}-ant-guide-gold`;
  const bodyId = `${id}-ant-guide-body`;
  const armorId = `${id}-ant-guide-armor`;
  const eyeId = `${id}-ant-guide-eye`;
  const glowId = `${id}-ant-guide-soft-glow`;
  const glassId = `${id}-ant-guide-card-glass`;

  return (
    <svg
      className="ant-guide-svg"
      viewBox="0 0 220 220"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      data-ant-state={state}
    >
      <defs>
        <radialGradient id={headId} cx="38%" cy="26%" r="82%">
          <stop offset="0%" stopColor="#565044" />
          <stop offset="34%" stopColor="#171a21" />
          <stop offset="74%" stopColor="#080a0d" />
          <stop offset="100%" stopColor="#020303" />
        </radialGradient>
        <linearGradient id={goldId} x1="42" y1="24" x2="182" y2="190">
          <stop stopColor="#fff5c5" />
          <stop offset="38%" stopColor="#f0c15f" />
          <stop offset="72%" stopColor="#a8752d" />
          <stop offset="100%" stopColor="#5c3b17" />
        </linearGradient>
        <linearGradient id={bodyId} x1="54" y1="90" x2="166" y2="195">
          <stop stopColor="#343a43" />
          <stop offset="44%" stopColor="#11161d" />
          <stop offset="100%" stopColor="#050607" />
        </linearGradient>
        <linearGradient id={armorId} x1="78" y1="116" x2="147" y2="178">
          <stop stopColor="#1f252d" />
          <stop offset="58%" stopColor="#090d12" />
          <stop offset="100%" stopColor="#030405" />
        </linearGradient>
        <radialGradient id={eyeId} cx="45%" cy="36%" r="66%">
          <stop offset="0%" stopColor="#fff7d2" />
          <stop offset="54%" stopColor="#f0be4d" />
          <stop offset="100%" stopColor="#6c4315" />
        </radialGradient>
        <linearGradient id={glassId} x1="156" y1="70" x2="208" y2="130">
          <stop stopColor="rgba(255,255,255,0.9)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.18)" />
        </linearGradient>
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="9" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="1 0 0 0 0.98 0 1 0 0 0.72 0 0 1 0 0.22 0 0 0 0.78 0"
          />
          <feBlend in="SourceGraphic" />
        </filter>
      </defs>

      <g className="ant-guide-scan-ring">
        <circle cx="110" cy="111" r="49" stroke="var(--ant-glow-color)" strokeWidth="2" />
        <circle cx="110" cy="111" r="67" stroke="var(--ant-glow-color)" strokeWidth="1.2" />
        <path d="M56 110a55 55 0 0 1 94-39" stroke="#f2cc75" strokeWidth="1.5" />
        <path d="M91 47a68 68 0 0 1 85 58" stroke="#16b87a" strokeWidth="1.2" />
      </g>

      <g className="ant-guide-aura" filter={`url(#${glowId})`}>
        <circle cx="110" cy="114" r="66" fill="var(--ant-glow-color)" opacity="0.12" />
      </g>

      <g className="ant-guide-state-card">
        <rect x="158" y="74" width="50" height="58" rx="12" fill="#10151c" opacity="0.92" />
        <rect
          x="158"
          y="74"
          width="50"
          height="58"
          rx="12"
          stroke="var(--ant-glow-color)"
          strokeWidth="1.8"
        />
        <circle cx="168" cy="87" r="4" fill="#16b87a" />
        <path d="M178 86h19M168 102h29M168 113h22" stroke={`url(#${glassId})`} strokeWidth="3" strokeLinecap="round" />
        <rect x="167" y="119" width="31" height="7" rx="3.5" fill="#16b87a" opacity="0.86" />
      </g>

      <g className="ant-guide-confirm-pill">
        <rect x="151" y="99" width="58" height="19" rx="9.5" fill="#102413" />
        <rect x="151" y="99" width="58" height="19" rx="9.5" stroke="#8ff06a" strokeWidth="2" />
        <path d="M169 109h22" stroke="#f6ffe8" strokeWidth="4" strokeLinecap="round" />
        <rect x="153" y="125" width="52" height="17" rx="8.5" fill="#171735" />
        <rect x="153" y="125" width="52" height="17" rx="8.5" stroke="#8c85ff" strokeWidth="1.7" />
        <path d="M169 134h20" stroke="#f6f2ff" strokeWidth="3.5" strokeLinecap="round" />
      </g>

      <g className="ant-guide-safety-badge">
        <path d="M174 91l21 8v17c0 13-8 25-21 30-13-5-21-17-21-30V99l21-8Z" fill="#15181f" />
        <path
          d="M174 91l21 8v17c0 13-8 25-21 30-13-5-21-17-21-30V99l21-8Z"
          stroke="#f2b84b"
          strokeWidth="3"
        />
        <path d="M174 104v17" stroke="#f8d98c" strokeWidth="4" strokeLinecap="round" />
        <circle cx="174" cy="130" r="2.7" fill="#f8d98c" />
      </g>

      <g className="ant-guide-error-mark">
        <path d="M171 102c8-13 26-10 28 3 2 12-12 13-15 23" stroke="#9d95ff" strokeWidth="5" strokeLinecap="round" />
        <circle cx="181" cy="140" r="3.2" fill="#9d95ff" />
      </g>

      <g className="ant-guide-success-particles">
        <circle cx="58" cy="93" r="3" fill="#16b87a" />
        <circle cx="176" cy="78" r="3.5" fill="#16b87a" />
        <circle cx="65" cy="152" r="2.5" fill="#f2cc75" />
        <circle cx="168" cy="157" r="2.5" fill="#f2cc75" />
        <circle cx="143" cy="46" r="2" fill="#16b87a" />
      </g>

      <g className="ant-guide-body-group">
        <ellipse className="ant-guide-shadow" cx="111" cy="199" rx="50" ry="8" fill="#000" opacity="0.28" />

        <g className="ant-guide-leg ant-guide-leg--left">
          <path d="M94 165c-8 9-13 18-14 29" stroke={`url(#${goldId})`} strokeWidth="7" strokeLinecap="round" />
          <rect x="69" y="190" width="28" height="11" rx="5.5" fill="#11151b" stroke={`url(#${goldId})`} strokeWidth="2.5" />
        </g>
        <g className="ant-guide-leg ant-guide-leg--right">
          <path d="M129 165c8 9 13 18 15 29" stroke={`url(#${goldId})`} strokeWidth="7" strokeLinecap="round" />
          <rect x="128" y="190" width="29" height="11" rx="5.5" fill="#11151b" stroke={`url(#${goldId})`} strokeWidth="2.5" />
        </g>

        <path
          className="ant-guide-body"
          d="M77 126c0-26 16-43 35-43s36 17 36 43c0 28-16 49-36 49-19 0-35-22-35-49Z"
          fill={`url(#${bodyId})`}
        />
        <path
          className="ant-guide-body-shine"
          d="M88 122c1-14 8-26 20-31"
          stroke="#fff4c8"
          strokeWidth="3.2"
          strokeLinecap="round"
          opacity="0.23"
        />
        <path
          className="ant-guide-chest"
          d="M96 122h33l7 11-8 24H98l-8-24 6-11Z"
          fill={`url(#${armorId})`}
          stroke={`url(#${goldId})`}
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <path d="M105 133h15l4 7-8 8-10-8 4-7Z" fill="#080a0c" stroke={`url(#${goldId})`} strokeWidth="1.8" />
        <circle className="ant-guide-chest-dot" cx="115" cy="141" r="3.8" fill="var(--ant-glow-color)" />
      </g>

      <g className="ant-guide-arm ant-guide-arm--left">
        <path className="ant-guide-arm-path" d="M79 132c-18 7-27 18-30 34" stroke={`url(#${goldId})`} strokeWidth="7" strokeLinecap="round" />
        <circle cx="49" cy="166" r="8" fill="#11131a" stroke={`url(#${goldId})`} strokeWidth="3" />
        <path className="ant-guide-fingers" d="M42 160l-7-5M42 166l-8 1M44 172l-6 6" stroke="#f5cf75" strokeWidth="2.4" strokeLinecap="round" />
      </g>

      <g className="ant-guide-arm ant-guide-arm--right">
        <path className="ant-guide-arm-path" d="M145 132c19 5 30 17 34 31" stroke={`url(#${goldId})`} strokeWidth="7" strokeLinecap="round" />
        <circle cx="181" cy="164" r="8" fill="#11131a" stroke={`url(#${goldId})`} strokeWidth="3" />
        <path className="ant-guide-fingers" d="M188 158l7-4M190 164l8 1M188 171l6 6" stroke="#f5cf75" strokeWidth="2.4" strokeLinecap="round" />
      </g>

      <g className="ant-guide-head-group">
        <g className="ant-guide-antenna ant-guide-antenna--left">
          <path className="ant-guide-antenna-stem" d="M90 70c-9-28-20-43-38-48" stroke={`url(#${goldId})`} strokeWidth="5.5" strokeLinecap="round" />
          <circle className="ant-guide-antenna-dot" cx="52" cy="22" r="7.5" fill="var(--ant-glow-color)" />
          <circle className="ant-guide-antenna-halo" cx="52" cy="22" r="13" fill="var(--ant-glow-color)" opacity="0.12" />
        </g>
        <g className="ant-guide-antenna ant-guide-antenna--right">
          <path className="ant-guide-antenna-stem" d="M128 70c10-27 24-41 43-43" stroke={`url(#${goldId})`} strokeWidth="5.5" strokeLinecap="round" />
          <circle className="ant-guide-antenna-dot" cx="171" cy="27" r="7.5" fill="var(--ant-glow-color)" />
          <circle className="ant-guide-antenna-halo" cx="171" cy="27" r="13" fill="var(--ant-glow-color)" opacity="0.12" />
        </g>

        <g className="ant-guide-ear ant-guide-ear--left">
          <circle cx="56" cy="85" r="13" fill="#10141b" stroke={`url(#${goldId})`} strokeWidth="3" />
          <circle cx="56" cy="85" r="6" fill="#20150a" stroke="#f0c15f" strokeWidth="1.5" />
        </g>
        <g className="ant-guide-ear ant-guide-ear--right">
          <circle cx="164" cy="85" r="13" fill="#10141b" stroke={`url(#${goldId})`} strokeWidth="3" />
          <circle cx="164" cy="85" r="6" fill="#20150a" stroke="#f0c15f" strokeWidth="1.5" />
        </g>

        <ellipse className="ant-guide-head" cx="110" cy="85" rx="58" ry="50" fill={`url(#${headId})`} />
        <path
          className="ant-guide-face-shine"
          d="M78 64c13-16 40-23 62-12"
          stroke="#fff3c4"
          strokeWidth="4"
          strokeLinecap="round"
          opacity="0.2"
        />
        <path className="ant-guide-brow ant-guide-brow--left" d="M76 76c9-5 20-5 29 0" stroke="#73501f" strokeWidth="3.5" strokeLinecap="round" />
        <path className="ant-guide-brow ant-guide-brow--right" d="M120 76c9-5 20-5 29 0" stroke="#73501f" strokeWidth="3.5" strokeLinecap="round" />

        <g className="ant-guide-eye ant-guide-eye--left">
          <ellipse className="ant-guide-eye-white" cx="89" cy="91" rx="17" ry="19" fill="#fff7da" />
          <circle className="ant-guide-iris" cx="92" cy="91" r="10" fill={`url(#${eyeId})`} />
          <circle className="ant-guide-pupil" cx="94" cy="91" r="5.2" fill="#101113" />
          <circle cx="99" cy="84" r="3.2" fill="#fff" opacity="0.92" />
        </g>
        <g className="ant-guide-eye ant-guide-eye--right">
          <ellipse className="ant-guide-eye-white" cx="132" cy="91" rx="17" ry="19" fill="#fff7da" />
          <circle className="ant-guide-iris" cx="135" cy="91" r="10" fill={`url(#${eyeId})`} />
          <circle className="ant-guide-pupil" cx="137" cy="91" r="5.2" fill="#101113" />
          <circle cx="142" cy="84" r="3.2" fill="#fff" opacity="0.92" />
        </g>
        <g className="ant-guide-success-eyes">
          <path d="M77 92c8 9 19 9 27 0" stroke="#f8d98c" strokeWidth="5" strokeLinecap="round" />
          <path d="M119 92c8 9 19 9 27 0" stroke="#f8d98c" strokeWidth="5" strokeLinecap="round" />
        </g>
        <path className="ant-guide-mouth" d="M96 111c9 8 22 8 31 0" stroke={`url(#${goldId})`} strokeWidth="4.5" strokeLinecap="round" />
        <path className="ant-guide-error-mouth" d="M96 113c9-7 22-7 31 0" stroke="#c7b792" strokeWidth="4.5" strokeLinecap="round" />
      </g>

      <g className="ant-guide-dots">
        <circle cx="150" cy="85" r="4" />
        <circle cx="169" cy="86" r="4" />
        <circle cx="188" cy="87" r="4" />
      </g>
    </svg>
  );
}
