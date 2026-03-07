/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        base: '#09090A',
        surface: '#111113',
        surfaceMuted: '#191A1C',
        border: 'rgba(255,255,255,0.08)',
        borderStrong: 'rgba(200,255,0,0.25)',
        lime: '#C8FF00',
        limeDim: 'rgba(200,255,0,0.12)',
        textMuted: 'rgba(236,236,236,0.75)',
        textSofter: 'rgba(236,236,236,0.55)',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        card: '0 18px 50px rgba(0,0,0,0.35)',
        glow: '0 0 0 1px rgba(200,255,0,0.15), 0 20px 60px rgba(200,255,0,0.12)',
      },
      borderRadius: {
        xl: '16px',
        '2xl': '20px',
        '3xl': '28px',
      },
    },
  },
  plugins: [],
};
