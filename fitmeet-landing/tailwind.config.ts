import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './data/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
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
        sans: ['Inter', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
        display: ['Inter', 'Noto Sans SC', 'sans-serif'],
      },
      letterSpacing: { ultra: '-0.04em' },
      transitionTimingFunction: { brand: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    },
  },
  plugins: [],
};
export default config;
