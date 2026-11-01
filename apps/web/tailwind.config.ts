import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 夜空底 —— 紫微即星，全盘围绕「星图」气质
        paper: '#0b0e1c',
        surface: '#161b31',
        line: '#2a3252',
        lineSoft: '#202744',
        ink: {
          DEFAULT: '#eceef8',
          2: '#aab1cf',
          3: '#7a81a3',
        },
        zhu: {
          DEFAULT: '#8b7cf6',
          soft: '#2a2352',
          deep: '#7365e8',
        },
        hua: {
          lu: '#6fd79a',
          quan: '#7fa9f0',
          ke: '#e8c468',
          ji: '#f08080',
        },
        danger: '#f08080',
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
