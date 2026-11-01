# AFTER-NOTES · iter-20（mobile one-screen chrome + 底 Tab）

日期：2026-11-01

## 改了哪些文件
| 文件 | 改动 |
|---|---|
| `apps/web/src/components/ChartTabBar.tsx`（新建） | 客户端 tab 壳：移动端 `fixed inset-x-0 top-14 bottom-[var(--chart-tab)] z-30`（不占文档流 → 页面零滚动），桌面端 `md:static md:h-[calc(100dvh-3.5rem)]`；内含摘要行 / tab 内容区（`flex-1 min-h-0 overflow-y-auto`）/ 署名行 / 底栏；hash 深链（`replaceState` + `hashchange`）；`role=tablist` + 方向键 |
| `apps/web/src/app/chart/page.tsx` | 删掉 sticky 章节 nav、`section#reading`、直接渲染的 `AskPanel`、大标题 H1；改为算好数据传给 `<ChartTabs>`；「排盘日 / 时辰范围 / 真太阳时 / 重新排盘 / 口径说明」收进「详情」折叠；「分享」折叠 |
| `apps/web/src/components/ChartBoard.tsx` | 桌面网格改 `.palace-grid`（无水泥缝）、去掉 wrapper 的 `bg-surface`、高度改 `h-full` 跟随外壳；移动端行改 `repeat(4, minmax(0,1fr))`，格内滚动；中宫改 `bg-paper` 虚空、跳转芯片收进中宫；删掉盘下方的跳转行 / 图例行 / 完整 CenterPanel |

## 验收数字（375×812，命盘 Tab）
| 指标 | 改造前 | 改造后 |
|---|---|---|
| 盘面 top | 364 | **112** |
| 盘面 bottom | 705（但被顶到 364 才出现） | **740** |
| 顶区 chrome（header + 摘要） | 364 | **112**（header 57 + 摘要 55） |
| 页面滚动量 | scrollRatio **10.7** | **0 px**（scrollRatio 1.000） |
| 解读是否在盘首屏 | 是（同页堆 3 万字） | 否（独立 Tab） |

**盘面必须整块入屏**：375×812 下盘面 112→740，底 740 ≤ vh 812 ✅
**页面零滚动**：`documentElement.scrollHeight - clientHeight = 0` ✅（壳 `position: fixed` 不占文档流，页面上只剩 header 与被盖住的 footer）
**解读/追问面板各自滚动**：内容容器 `overflow-y: auto`，`scrollHeight > clientHeight` 时只在容器内滚，页面不动 ✅
**Tab 切换**：命盘 / 解读 / 追问，`aria-selected` 正确，hash 同步（`#chart-board` / `#reading` / `#ask-panel`）✅

## 与说明书的偏差
- 顶区 chrome 用满 112px 预算（摘要行 `h-14`），没有再压到 96px —— 摘要行含日期 / 时辰 / 性别 / 详情 / 分享，再压会挤。
- `SiteHeader.tsx` **未改动**：说明书里「盘路由可缩成 48px」是可选项；保持 56px 即可满足 ≤112px 预算，少改一个文件。
- `SiteFooter.tsx` **未改动**：盘页底部另起了一行署名（CC BY 4.0 署名要求，见 iter-20 验收），全局 footer 仍在其它页面。
- 分享按钮放进「分享」`<details>` 折叠（`ChartShareButton` 根节点自带 `mt-4` + 状态位，常驻会撑高 56px 摘要行）。要常驻需改 `ChartShareButton.tsx`，不在本次范围。
