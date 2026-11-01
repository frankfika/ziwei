# AFTER-NOTES · iter-19（theme + contrast）

日期：2026-11-01 · 基线 `a5945db` → 本次提交 `ux(iter-19)`

## 改了哪些文件
| 文件 | 改动 |
|---|---|
| `apps/web/tailwind.config.ts` | 色 token 全表换血；新增 `surface-2` / `zhu.glow` / `star.miao` / `star.xian`；新增字体档 `display` / `title` / `star-major` / `star-minor` / `star-misc`；加 `safelist` 保证新 class 即使未被引用也进产物 CSS |
| `apps/web/src/app/globals.css` | body 扩成三层星空（近 noise 1.8% / 远 zhu 0.10 / 中星金 0.05）；`.panel` 阴影改 `0 12px 40px rgba(3,5,16,0.45)`；新增 `.panel-ritual` / `.palace-grid` / `.palace-cell(.is-selected/.is-sanfang)` / `.palace-sheet` / `.chip-sihua` / `.tab-bar`；五段 keyframes；reduced-motion 全覆盖 |
| `apps/web/src/app/layout.tsx` | `viewport.themeColor` `#f7f1ea` → `#070A14`；`colorScheme` `'light'` → `'dark'` |
| `apps/web/src/components/PalaceCell.tsx` | 庙旺棕 `#8a5512` → `text-star-miao`；落陷 → `text-star-xian`；主星/辅星/煞曜三级星等；四化降为字色 + 40% 描边 + 10% 底、圆角 4px |

## 验收数字
- `meta[name=theme-color]` = `#070A14` ✅
- `meta color-scheme` = `dark` ✅
- 页面源码 `#8a5512` 命中 = **0** ✅
- 产物 CSS 里 `.text-star-miao` = `rgb(196 160 106)` = `#C4A06A` ✅
- 产物 CSS 里 `.bg-surface-2` = `rgb(22 28 51)` = `#161C33` ✅
- 宫卡实测（computed）：`.palace-cell` 底 `rgba(15,20,38,0.85)` + `inset 0 0 0 1px #1A223C`；`.is-selected` 底 `rgba(30,26,58,0.5)` + `inset 0 0 0 1px rgba(139,124,246,0.4)` + `0 0 24px rgba(139,124,246,0.28)`；`.is-sanfang` 仅底 `rgba(30,26,58,0.2)`，无第二圈 ring ✅

## 与说明书的偏差
- `.palace-*` / `.panel-ritual` / `.chip-sihua` / `.tab-bar` 刻意放在 `@layer` **之外**（未分层 CSS 优先级高于 Tailwind utilities），这样 `.palace-grid` 能真正盖掉遗留的 `gap-px` / `bg-line`「水泥缝」。若日后把它们挪进 `@layer components`，会静默失效。
- 四化圆角写死 4px（Tailwind v3 的 `rounded-sm` 实际是 2px，与说明书 4px 不符）。
