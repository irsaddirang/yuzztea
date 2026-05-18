import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  safelist: ['glass', 'glass-solid'],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: 'var(--brand-primary)',
          secondary: 'var(--brand-secondary)',
          accent: 'var(--brand-accent)',
        },
        surface: {
          bg: 'var(--surface-bg)',
          card: 'var(--surface-card)',
          'card-solid': 'var(--surface-card-solid)',
        },
        text: {
          strong: 'var(--text-strong)',
          muted: 'var(--text-muted)',
        },
        state: {
          success: 'var(--state-success)',
          warning: 'var(--state-warning)',
          error: 'var(--state-error)',
          info: 'var(--state-info)',
        },
      },
      fontFamily: {
        heading: ['Satoshi', 'DM Sans', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
