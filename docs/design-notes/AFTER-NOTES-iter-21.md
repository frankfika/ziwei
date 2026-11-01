# AFTER-NOTES · iter-21（reading as panel）

日期：2026-11-01

## 改了哪些文件
| 文件 | 改动 |
|---|---|
| `apps/web/src/components/ReadingPanel.tsx` | 头部「13 维 · 约 29,689 字」整块删除 → 右侧弱化为「共 13 维」，正文标题旁改为「本维 N 字」；引文声明从整块 `rounded-lg border` 盒子降为**一行 tip** + `/about` 链接；移动端维度导航从 sticky 吸顶改为**不吸顶的横向分段行**；切维用 `key` 重挂载 + `tab-crossfade` 原地溶化；两处虚线空态换成 `bg-surface-2` 冷玉面板 |
| `apps/web/src/components/AskPanel.tsx` | 根容器去掉 `mt-14` 巨顶距；`expanded` 默认 `true`（独立 Tab 直接可答）；空态从虚线箱改为**一句人话 + 2 枚推荐 chip**；气泡 `bg-paper` → `bg-surface-2`；「问」标记改冷玉小方（`rounded-sm`）；pending 文案加「星图检索中…」；verification 警告盒从紫盒改低彩星金边（`border-hua-ke/40 bg-surface-2`） |

## 验收数字
- 命盘 Tab 下页面可见文本里 **「29,689」出现 0 次** ✅
- 切到解读 Tab 才见 `ReadingPanel` ✅
- 切维无整页跳闪：删掉 `articleRef.current?.scrollIntoView({block:'start'})`，只保留维度标签的 `scrollIntoView({inline:'center', block:'nearest'})` —— **页面纵向位移 = 0** ✅
- `grep -n "block: 'start'"` 两个文件均无输出 ✅
- `grep -n "mt-14" AskPanel.tsx` 无输出 ✅
- `grep -n "totalChars.toLocaleString" ReadingPanel.tsx` 无输出 ✅
- 引文信息一字未删（处数、授权范围），只换了载体 ✅
- 所有 `data-ask-*` 属性、`id="ask-panel"`、props 签名保持不变 ✅

## 与说明书的偏差
- `totalChars` prop 保留在签名里（父组件仍在传），但面板不再展示它 —— 保留签名是为了不连带改 `chart/page.tsx` 的调用契约。
- 桌面端维度导航仍保留左栏竖排（说明书允许「桌面可保留左栏」）；移动端改为横向分段行而非底部分段，因为解读已是独立 Tab，再加一条底部分段会和盘页底栏打架。
