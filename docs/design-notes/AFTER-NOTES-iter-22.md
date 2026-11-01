# AFTER-NOTES · iter-22（palace material + hierarchy）

日期：2026-11-01

## 改了哪些文件
| 文件 | 改动 |
|---|---|
| `apps/web/src/components/CenterPanel.tsx` | 根元素 `bg-paper`（比宫卡深一档 → 「洞/虚空」）；四柱从「4 个带边框格子墙」改为**一行 年/月/日/时 + 一行干支、无边框**；主视觉改为**局名 display 居中**（`font-serif text-display`）→ 命主/身主一行 → 虚岁一行；细节行只留不重复的「落宫」三项（命宫/身宫/紫微），五行局·命主·身主·阴阳男女·虚岁已上移至主视觉 |
| `apps/web/src/components/ChartBoard.tsx`（与 iter-20 同文件，随 iter-20 提交） | 移动端宫格改真 `.palace-cell` + `is-selected`/`is-sanfang`；宫位详情由「塞回页面流的大卡片」改为**底部 sheet**（`absolute inset-x-0 bottom-0 max-h-[70vh]` + `.palace-sheet.detail-sheet`）；盘留在背板 + 遮罩压暗 4%（`fixed inset-0 bg-paper/40`）；sheet 内复用 `<PalaceCell variant="sheet">`（隐藏重复的命/身宫 chip）；四化图例搬进 sheet 顶部；Escape / 点遮罩关闭、焦点回触发宫格；盘下方那块完整 `CenterPanel` 移动端不再渲染（改为点中宫开 sheet） |

## 验收数字
- 选中宫有 glow + 呼吸：`.is-selected::after` computed = `animation: palace-breathe 1.8s`，`box-shadow: inset 0 0 20px rgba(139,124,246,0.28)` ✅
- 点选后 `document.getAnimations().length` = **6**（改造前 **0**）✅
- 三方四正 = 3 宫，`.is-sanfang` computed 底色 `rgba(30,26,58,0.2)`，无第二圈 ring ✅
- 中宫首屏无四柱 4 格墙（移动端中宫只有局名 + 命主身主 + 虚岁 + 跳转芯片）✅
- 详情是 sheet，实测 `top 455 / bottom 740`（落在盘区内，不压底栏），不把盘顶出视口 ✅
- 星等实测：庙旺 `rgb(196,160,106)`、落陷 `rgb(92,100,136)`；辅星/煞曜不抢庙旺色 ✅
- 桌面中宫首屏 = `土五局 | 命主 巨门 · 身主 火星 | 阳男 · 虚岁 37 岁 | …` ✅

## 与说明书的偏差
- 桌面端中宫仍保留了四柱与落宫细节（放在局名主视觉之下）。说明书写的是「移到展开或桌面侧栏」，本次用「主视觉 / 细节」两级层次实现，比再加一个侧栏改动小。
- 文件级拆分说明：`ChartBoard.tsx` 同时含 iter-20（壳与网格几何）与 iter-22（材质与 sheet）两类改动，按文件归属随 iter-20 一次提交，未强拆成两个 commit。
