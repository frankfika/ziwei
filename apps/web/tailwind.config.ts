import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#f7f5f1',
        surface: '#ffffff',
        line: '#e4dfd5',
        lineSoft: '#eeebe4',
        ink: {
          DEFAULT: '#24211d',
          2: '#57524a',
          3: '#8b8479',
        },
        zhu: {
          DEFAULT: '#a33b2a',
          soft: '#f6ebe8',
        },
        hua: {
          lu: '#4a7c3f',
          quan: '#2f5fa8',
          ke: '#9a6b16',
          ji: '#a33b2a',
        },
      },
      fontFamily: {
        sans: [
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          '"Noto Sans SC"',
          'system-ui',
          'sans-serif',
        ],
        serif: ['"Songti SC"', '"Noto Serif SC"', '"Source Han Serif SC"', 'serif'],
        mono: ['"SF Mono"', '"JetBrains Mono"', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      letterSpacing: {
        wide2: '0.18em',
      },
      maxWidth: {
        board: '58rem',
      },
    },
  },
  plugins: [],
};

export default config;
