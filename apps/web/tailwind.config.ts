import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  // 新增 token 的 class 契约：即使组件还没引用，也保证产物 CSS 里存在（Day2/4/5 组件按这套名字写 class）
  safelist: [
    'bg-surface-2',
    'text-surface-2',
    'border-surface-2',
    'bg-zhu-glow',
    'text-star-miao',
    'text-star-xian',
    'text-display',
    'text-title',
    'text-star-major',
    'text-star-minor',
    'text-star-misc',
  ],
  theme: {
    extend: {
      colors: {
        // 夜空底 —— 紫微即星，全盘围绕「星图」气质
        paper: '#070A14',
        surface: '#0F1426',
        'surface-2': '#161C33', // 抬一层：详情 sheet、Ask 气泡
        line: '#243052',
        lineSoft: '#1A223C',
        ink: {
          DEFAULT: '#E8EAF4',
          2: '#9AA3C4',
          3: '#6B7394',
        },
        zhu: {
          DEFAULT: '#8B7CF6',
          soft: '#1E1A3A',
          deep: '#6E5FE0',
          glow: 'rgba(139,124,246,0.28)', // 选宫呼吸光
        },
        hua: {
          lu: '#5FAF86',
          quan: '#6E92D4',
          ke: '#C9A85A',
          ji: '#C97A7A',
        },
        star: {
          miao: '#C4A06A', // 庙旺主星
          xian: '#5C6488', // 落陷主星
        },
        danger: '#C97A7A',
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
        display: ['1.75rem', { lineHeight: '1.15', letterSpacing: '0.14em' }],
        title: ['1.125rem', { lineHeight: '1.35', letterSpacing: '0.08em' }],
        'star-major': ['0.8125rem', { lineHeight: '1.3' }],
        'star-minor': ['0.6875rem', { lineHeight: '1.35' }],
        'star-misc': ['0.625rem', { lineHeight: '1.4' }],
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
