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
        // 宣纸底 —— 明亮国风：米白纸面、炭黑正文、靛青主色、朱砂只做四化点睛
        paper: '#F6F2E9',
        surface: '#FDFBF5',
        'surface-2': '#EFE9DA', // 抬一层：详情 sheet、Ask 气泡
        line: '#DDD4C0',
        lineSoft: '#E9E2D1',
        ink: {
          DEFAULT: '#2E2A23',
          2: '#6E6656',
          3: '#A2987F',
        },
        zhu: {
          DEFAULT: '#3D5A85', // 黛青主色：选中、焦点、链接
          soft: '#E7ECF3',
          deep: '#2F4869',
          glow: 'rgba(61, 90, 133, 0.22)', // 选宫呼吸光
        },
        hua: {
          lu: '#3E8A58', // 化禄 · 绿
          quan: '#7C5FB8', // 化权 · 紫
          ke: '#3868B0', // 化科 · 蓝
          ji: '#C1402F', // 化忌 · 朱砂
        },
        star: {
          miao: '#A8792F', // 庙旺主星 · 鎏金
          xian: '#8D8574', // 落陷主星
        },
        danger: '#C1402F',
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
