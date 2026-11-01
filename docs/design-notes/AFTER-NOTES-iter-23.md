# AFTER-NOTES · iter-23（motion language）

日期：2026-11-01

## 改了哪些文件
| 文件 | 改动 |
|---|---|
| `apps/web/src/lib/motion.ts` | 扩成命名 motion token：`DURATION`（breathe 1800 / sanfang 220 / tab 180 / submit 120 / skeleton 200 / sheet 240 / sheetClose 180）、`EASE.standard`、`motionStyle(duration)`、`motionDuration(duration)`；原有两个导出函数原样保留 |
| `apps/web/src/app/globals.css` | keyframes 上方加「时长/缓动对应 `motion.ts` 的 DURATION/EASE，改一处要改两处」注释；`.palace-breathe` 改为只作用于 `::after` 光晕层（动元素自身 opacity 会把星名压暗到 35%）；`sanfang-fade` 由淡 opacity 改为淡 **background-color**（淡整格的话点选瞬间 3 个宫格的星名会灭一下）；新增 `--sanfang-tint` 作三方底色唯一来源；reduced-motion 补 `.palace-breathe::after` |
| `apps/web/src/components/PalaceCell.tsx` | `stateClass` = `is-selected palace-breathe` / `is-sanfang sanfang-fade`（class 增删才重播 keyframes → 只在状态刚变时各播一次） |
| `apps/web/src/components/ReadingPanel.tsx` | 切维的 `tab-crossfade` 改为 token 驱动：`style={motionStyle(DURATION.tab)}` |
| `apps/web/src/components/AskPanel.tsx` | pending 气泡接 `chart-submit` + `motionStyle(DURATION.sanfang)` |
| `apps/web/src/components/BirthForm.tsx` | pending「排盘中…」的内联 `animationDuration: '120ms'` → `motionStyle(motionDuration(DURATION.submit))` |
| `apps/web/src/components/ChartBoard.tsx` | 宫格接 `palace-breathe` / `sanfang-fade`；sheet 关闭加 `is-closing` 反向动画，卸载时机与 `DURATION.sheetClose` 同步（关闭不再瞬切） |

## 验收数字
- 组件里**裸毫秒字面量 = 0**（`grep -rnE "animationDuration: *'?[0-9]+ms" apps/web/src` 只命中 globals.css 的 reduced-motion 兜底）✅
- 组件里**散落 `cubic-bezier` = 0**（`grep -rn "cubic-bezier" apps/web/src --include='*.tsx'` 无输出）✅
- 点选宫位后 `document.getAnimations().length` = **6**，其中 `palace-breathe` 1800ms `running` ✅
- sheet 关闭实测：`animation: detail-sheet / reverse / 0.18s`，关闭时 opacity 1→0，动画结束才卸载 ✅
- reduced-motion 覆盖清单：
  - `animation: none !important`（无限循环）：`.animate-spin` `.animate-pulse` `.palace-breathe` `.palace-breathe::after` `.palace-cell.is-selected` `.palace-cell.is-selected::after`
  - `animation-duration: 80ms !important; animation-iteration-count: 1 !important`（一次性，保留终态）：`.sanfang-fade` `.tab-crossfade` `.detail-sheet` `.detail-sheet.is-closing` `.chart-submit`

## 注意
- CSS 里没法 import TS 常量，所以 keyframes 的时长/缓动与 `motion.ts` 是**两份**数值，靠注释约束同步。改任一侧都要改另一侧。
- 一次性动效在 reduced-motion 下压到 80ms 而**不是** `animation: none` —— 用 none 会停在 `opacity: 0`，元素直接不可见。
