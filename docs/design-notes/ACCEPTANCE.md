# 设计改造验收总表（Day 7 回归）

基线 `a5945db`（ux(iter-18)）→ 本轮 `ux/iter-19 … iter-24`
预览：`http://localhost:3000/`（仅 localhost）
度量脚本：`docs/design-notes/acceptance-metrics.js`

## 验收总表

| Check | 阈值 | 实测 | |
|---|---|---|---|
| Mobile boardBottom ≤ vh | true | **740 ≤ 812**（盘 112→740，整块入屏） | ✅ |
| Mobile 页面滚动量 | 0（用户诉求：不要下滑） | **0 px**（scrollRatio 1.000） | ✅ |
| 顶区 chrome（header + 摘要） | ≤ 112px | **112px**（57 + 55） | ✅ |
| Desktop boardBottom ≤ vh | true | **806 ≤ 900**（盘 113→806） | ✅ |
| Desktop scrollRatio | < 2 | **1.36**（余量是页面下方的全局 footer） | ✅ |
| themeColor | `#070A14` | **`#070A14`** | ✅ |
| colorScheme | `dark` | **`dark`** | ✅ |
| `#8a5512` 命中 | 0 | **0** | ✅ |
| 选中宫 anim / keyframes | present | `getAnimations().length` = **6**（改造前 0）；`palace-breathe 1.8s running` | ✅ |
| 解读不在盘首屏 | true | 命盘 Tab 可见文本无「29,689」，解读在独立 Tab | ✅ |
| 庙旺主星色 | ≈ `#C4A06A` | `rgb(196,160,106)` | ✅ |
| 落陷主星色 | `#5C6488` | `rgb(92,100,136)` | ✅ |
| 排盘口径 / 数据集 | 不改 | 56 个引擎测试全绿，8 个包 typecheck 全过 | ✅ |

## 对比改造前（375×812 实测基线）

| 指标 | 改造前 | 改造后 |
|---|---|---|
| 盘面 top | 364（被大标题 + sticky 章节 nav 顶下去） | **112** |
| 顶区 chrome | 364 | **112** |
| 页面滚动比 | **10.7** | **1.00**（0 px） |
| themeColor | `#f7f1ea`（浅色残留） | `#070A14` |
| 庙旺棕 | `#8a5512` 硬编码 | `#C4A06A` |
| 动画元素数 | **0** | **6** |

## 截图（`shots/design-howto/after/`）

| 文件 | 内容 |
|---|---|
| `mobile-chart-375.png` | 375×812 命盘 Tab：整盘一屏，无滚动 |
| `mobile-reading-375.png` | 375×812 解读 Tab：维度分段行 + 一行引文 tip + 本维字数 |
| `mobile-sheet-375.png` | 375×812 宫位详情底部 sheet（盘留在背板） |
| `desktop-chart-1440.png` | 1440×900 命盘 Tab：中宫局名 display + hairline 宫格 + 底 Tab dock |

## 未做 / 留待下一轮

- `SiteHeader.tsx` 未改（保持 56px，预算够用）；`SiteFooter.tsx` 未改（盘页另起一行署名）。
- 分享按钮收在「分享」`<details>` 里；要常驻可见需改 `ChartShareButton.tsx`。
- `.btn-primary` 仍是高对比紫底；说明书未点名主按钮色，未动。
- `#coverage` 收成 `<details>` 后，锚点跳转只停在 summary 行（要跳转即展开需额外 JS）。
- 打印路径未实机验证（解读面板靠 `hidden` + `print:block` 打出），建议下一轮实打一次确认正文未被裁。
