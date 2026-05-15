/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // === Core Surface Tokens ===
        base: '#120B07',
        surface: '#1D120C',
        surfaceMuted: '#2A1A11',
        border: 'rgba(255, 219, 190, 0.14)',
        borderStrong: 'rgba(255, 106, 0, 0.55)',

        // === Human Realm (人类约练 — 晨光橙) ===
        human: '#FF6B35',
        humanBright: '#FF8A4C',
        humanDeep: '#D9421F',
        humanDim: 'rgba(255, 107, 53, 0.13)',
        humanGlow: 'rgba(255, 107, 53, 0.55)',

        // === Pet Realm (宠物约遛 — 森林绿) ===
        pet: '#2D6A4F',
        petBright: '#52B788',
        petDeep: '#1B4332',
        petDim: 'rgba(82, 183, 136, 0.13)',
        petGlow: 'rgba(82, 183, 136, 0.45)',
        petWarm: '#F4A261',

        // === AI Realm (AI 代理 — 星云紫) ===
        ai: '#7B2D8B',
        aiBright: '#A855F7',
        aiDeep: '#4C1D95',
        aiDim: 'rgba(168, 85, 247, 0.13)',
        aiGlow: 'rgba(168, 85, 247, 0.5)',
        aiCyan: '#22D3EE',

        // === Legacy / Backward Compat ===
        lime: '#FF6A00',
        limeDim: 'rgba(255, 106, 0, 0.13)',
        brand: '#FF6A00',
        brand2: '#F97316',
        amber: '#FFB000',
        coral: '#EF4444',
        mint: '#16C784',
        cream: '#FFF1E2',
        paper: '#FFF8F0',
        ink: '#24130A',
        textMuted: '#B99D86',
        textSofter: '#8F7460',

        // Living Orbit premium palette
        ivory: '#F4EFE6',
        beige: '#E7DFD1',
        charcoal: '#141413',
        graphite: '#262623',
        moss: '#6B7A5A',
        olive: '#8C8A6E',
        silver: '#B8B5AC',
        earth: '#4A3A2C',
      },
      fontFamily: {
        display: ['"Space Grotesk"', '"Noto Sans SC"', 'Inter', 'system-ui', 'sans-serif'],
        body: ['Inter', '"Noto Sans SC"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        card: '0 18px 45px rgba(62, 27, 8, 0.16)',
        glow: '0 0 0 1px rgba(255,106,0,0.18), 0 18px 42px rgba(255,106,0,0.24)',
        panel: '0 24px 70px rgba(18, 11, 7, 0.18)',
        humanGlow: '0 0 0 1px rgba(255,107,53,0.25), 0 24px 60px rgba(255,107,53,0.35)',
        petGlow: '0 0 0 1px rgba(82,183,136,0.25), 0 24px 60px rgba(45,106,79,0.35)',
        aiGlow: '0 0 0 1px rgba(168,85,247,0.25), 0 24px 60px rgba(123,45,139,0.4)',
      },
      borderRadius: {
        sm: '6px',
        md: '8px',
        lg: '10px',
        xl: '12px',
        '2xl': '16px',
        '3xl': '24px',
      },
      animation: {
        'pulse-soft': 'pulseSoft 4s ease-in-out infinite',
        'float-slow': 'floatY 6s ease-in-out infinite',
        'shine': 'shine 3s linear infinite',
        'gradient-x': 'gradientX 8s ease infinite',
        'spin-slow': 'spin 24s linear infinite',
      },
      keyframes: {
        pulseSoft: {
          '0%,100%': { opacity: '0.6', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.04)' },
        },
        floatY: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        shine: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        gradientX: {
          '0%,100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },
      backgroundImage: {
        'human-grad': 'linear-gradient(135deg, #FF6B35 0%, #FFB000 100%)',
        'pet-grad': 'linear-gradient(135deg, #2D6A4F 0%, #52B788 100%)',
        'ai-grad': 'linear-gradient(135deg, #4C1D95 0%, #A855F7 50%, #22D3EE 100%)',
        'aurora': 'linear-gradient(120deg, #FF6B35, #52B788, #A855F7, #22D3EE)',
      },
    },
  },
  plugins: [],
};
