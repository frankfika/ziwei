# 紫微助手 · 设计改造说明书（HOW TO CHANGE）

> 给实现者，不是给评审。每条都能落到文件 / token / class。  
> 基线：`ux/iter-1` @ `a5945db9741c7c11d951f36b8511a737ddf297c3`（`ux(iter-18): 夜空星图深色主题，盘面一屏自适应`）  
> Preview：`http://localhost:3000/`（仅 localhost）  
> 证据：`shots/` + `shots/design-howto/` + 先前 `PRODUCT-UX-VISUAL-REPORT.md`  
> **本文件只规定怎么改；不要在本回合改产品代码。**

---

## A. 设计主张（1 页内）

### 我们要成为什么

**夜空观星仪式感 + 轻国风 + 消费级灵性。**

用户打开盘，应感到：指尖按在星图上，不是填完表进了后台。  
隐喻一句：**「在静谧的永恒之海，指尖拨动星辰的涟漪。」**

| | 现状（停在 iter-18） | 目标 |
|---|---|---|
| 气质 | SaaS 深色后台 / 数据表 | 观星仪 × 冷玉册 |
| 中宫 | 字段表（四柱格子 + Row 列表） | 神圣虚空：局数呼吸，细节退后 |
| 宫位 | 扁平 `gap-px` 线框格 | 黑曜石宫卡，选中有呼吸光 |
| 解读 | 同页堆 3 万字长文 | 盘是舞台；解读是面板/底 Tab |
| 动效 | `animEls=0`，只有 transition-colors | 恒星呼吸、连线淡入、Tab 溶化 |

### 五个设计关键词

1. **玄邃** — 深靛蓝夜空，信息像从深处浮起，不是贴在黑底上。  
2. **静穆** — 字距、行距、边距像碑刻：收得住，不抢戏。  
3. **星等** — 主星 / 辅星 / 杂曜必须三级亮度与字重，一眼辨星等。  
4. **冷玉** — 控件像按过一块凉玉：低反光、低饱和、边缘受光 0.5px。  
5. **呼吸** — 选宫、连线、Tab、提交都有可命名的微交互；禁止弹跳。

### 三件我们拒绝

1. **拒绝霓虹赛博** — 高饱和紫粉描边、故障闪、扫描线、纯黑+荧光。  
2. **拒绝庙红堆砌** — 太极八卦贴图、宣纸泛黄底、五行大红大绿「国风皮肤」。  
3. **拒绝 Bootstrap badge 汤** — 四化做成高饱和 pill 军团；命/身/空宫 chip 满宫飘。

---

## B. 视觉系统处方（可直接落地）

改入口优先：

- `apps/web/tailwind.config.ts` — 全部色 token  
- `apps/web/src/app/globals.css` — 材质、星空层、组件 class、motion keyframes  
- `apps/web/src/app/layout.tsx` — **立刻**把 `themeColor` / `colorScheme` 与 dark 对齐  
- `apps/web/src/components/PalaceCell.tsx` — `brightnessClass`、星等、选中态  
- `apps/web/src/lib/motion.ts` — 从 10 行扩成命名 motion tokens

### B1. Color（before → after）

| Token | 现状 hex | 处方 hex | 用途 |
|---|---|---|---|
| `paper` | `#0b0e1c` | `#070A14` | 最深夜空底 |
| `surface` | `#161b31` | `#0F1426` | 宫卡 / panel |
| `surface-2`（新增） | — | `#161C33` | 抬一层：详情 sheet、Ask 气泡 |
| `line` | `#2a3252` | `#243052` | 默认描边（略降对比） |
| `lineSoft` | `#202744` | `#1A223C` | 内分隔 |
| `ink` | `#eceef8` | `#E8EAF4` | 主文字 |
| `ink.2` | `#aab1cf` | `#9AA3C4` | 次文字 |
| `ink.3` | `#7a81a3` | `#6B7394` | meta / 杂曜 |
| `zhu` | `#8b7cf6` | `#8B7CF6`（保留） | 紫微紫强调 |
| `zhu.soft` | `#2a2352` | `#1E1A3A` | 选中底（更沉） |
| `zhu.deep` | `#7365e8` | `#6E5FE0` | 主按钮 hover |
| `zhu.glow`（新增） | — | `rgba(139,124,246,0.28)` | 选宫呼吸光 |
| `hua.lu` | `#6fd79a` | `#5FAF86` | 禄 · 低彩度 |
| `hua.quan` | `#7fa9f0` | `#6E92D4` | 权 |
| `hua.ke` | `#e8c468` | `#C9A85A` | 科 · 星金 |
| `hua.ji` | `#f08080` | `#C97A7A` | 忌 · 降饱和 |
| `star.miao`（新增） | 硬编码 `#8a5512` | **`#C4A06A`** | 庙旺主星墨色 |
| `star.xian`（新增） | `ink-3` | `#5C6488` | 落陷主星 |
| `danger` | `#f08080` | `#C97A7A` | 与忌同谱 |
| `theme-color` meta | `#f7f1ea` ❌ | `#070A14` | `layout.tsx` viewport |
| `colorScheme` meta | `'light'` ❌ | `'dark'` | 同文件 |

**庙旺棕必须死。** `PalaceCell.tsx` 的 `brightnessClass`：

```ts
// BEFORE
case '庙': case '旺': return 'text-[#8a5512]';
// AFTER
case '庙': case '旺': return 'text-star-miao'; // #C4A06A
case '得': case '利': return 'text-ink';
case '平': return 'text-ink-2';
case '不': case '陷': return 'text-star-xian';
```

四化 badge：去掉高对比 fill，改为 **字色 + 0.5px 边 + 8% 底**，class 仍走 `SIHUA_CLASS`，但 token 换成上表低彩度。

### B2. Type

在 `tailwind.config.ts` `fontSize` 扩展，并在组件里**只准用这些档**：

| 档 | 用途 | 建议 | 字重规则 |
|---|---|---|---|
| `display` | Home 大标题、中宫局名 | `1.75rem / 1.15`，`tracking-[0.14em]`，serif 可选 | Semibold 600 |
| `title` | 盘页 H1、解读维名 | `1.125–1.25rem`，`tracking-[0.08em]` | Semibold |
| `star-major` | 主星名 | `13–14px` desktop / `12–13px` mobile | **Semibold only** |
| `star-minor` | 辅星 / 吉星 | `11px` | Regular；色 `ink-2` |
| `star-misc` | 煞曜 / 杂曜 | `10–11px` | Regular；色 `ink-3`；不显亮度字 |
| `meta` | 干支、大限、字数 | `2xs` + `tabular-nums` + mono 干支 | Regular |

规则：

- **主星**才允许庙旺色；辅星永远不要跟主星抢色。  
- 宫名：命宫用 `zhu`，身宫用 `hua.quan` 低彩，其余 `ink-2`。  
- Home hero 的 `ZIWEI DOU SHU` 保持超宽字距；中文主标改 serif 或「伪碑刻」字距，别再像 Admin 标题。

### B3. Space · Radius · Stroke

- **8pt 节奏**：padding / gap 只用 `4 / 8 / 16 / 24 / 32`（Tailwind `1 / 2 / 4 / 6 / 8`）。  
- **盘面**：桌面保留一体网格，但把 `gap-px bg-line` 改成 **hairline 内描边**（`box-shadow: inset 0 0 0 1px lineSoft`），宫与宫之间不再「水泥缝」。  
- **Radius**：宫格外框 `rounded-2xl`（16）；宫内选中不要再加第二层大圆角；chip `rounded-full` 仅用于跳转/三方，**星旁四化改 `rounded-sm`**。  
- **Stroke**：默认 1px `line`；强调用 `zhu/35`；**禁止** 2px+ 粗框 + 外 glow 叠两层。

### B4. Material

在 `globals.css` `body` 扩成 **3 层星空**（固定、极低透明度）：

1. 远：`radial` 紫微紫 `0.10` @ 右上  
2. 中：星金 `0.05` @ 左上  
3. 近：极细 noise（CSS `filter` 或 1–2% SVG noise data-uri），**不动画**

宫卡：

- 默认：`bg-surface/85` + 内 hairline  
- 选中：`bg-zhu-soft/50` + `box-shadow: 0 0 0 1px zhu/40, 0 0 24px zhu.glow`  
- 三方：仅底色 `zhu-soft/20`，**不要**再加第二圈 ring（现状 `ring-zhu/15` 几乎看不见又脏）

中宫（`CenterPanel.tsx` + `ChartBoard` 移动端中宫精简块）：

- 目标构图：**局名 display 居中 → 命主/身主一行 → 虚岁一行**；四柱与 Row 表移到「展开」或桌面侧栏。  
- 视觉：中宫比宫卡 **更深一档**（`paper`），制造「洞 / 虚空」，不要 `border` 小格子四柱墙。

`.panel`：保留，但阴影改成 `0 12px 40px rgba(3,5,16,0.45)`，去掉「浮卡片电商感」。

### B5. Motion language（写入 `motion.ts` + `globals.css`）

| 名 | 场景 | 时长 / easing | 实现落点 |
|---|---|---|---|
| `palace-breathe` | 选中宫光晕 | 1.8s ease-in-out infinite alternate；opacity 0.35→0.55 | `PalaceCell` selected / mobile active |
| `sanfang-fade` | 三方高亮出现 | 220ms `cubic-bezier(0.22,1,0.36,1)` | `inSanFang` class 切换 |
| `tab-crossfade` | 解读维切换 | 180ms opacity + 6px translateY | `ReadingPanel` article |
| `chart-submit` | 排盘提交 | 按钮 → spinner 120ms；进 loading 骨架 fade 200ms | `BirthForm` + `chart/loading.tsx` |
| `detail-sheet` | 移动宫位详情 | 240ms slide-up + fade；关 180ms | `#mobile-palace-detail` |

`prefers-reduced-motion: reduce`：全部改为 0–1 opacity 瞬时或 ≤80ms；**关掉** breathe 循环（已有 globals 雏形，扩覆盖到自定义 keyframes）。

现状 `motion.ts` 只有 `prefersReducedMotion` / `preferredScrollBehavior` —— 扩成导出 `DURATION` / `EASE` 常量，组件引用，禁止魔法数字散落。

---

## C. 关键屏「怎么改」

### C0. 全局壳

**痛点一句：** sticky header 56px + chart 页再生辰大标题 + 章节横滑 nav，把盘顶推到 `top≈279`；footer 再拖长卷。

**目标：** 盘页「顶区 chrome ≤ **112px**」；解读/追问不跟盘抢同页首屏。

**改法：**

- `layout.tsx`：`themeColor: '#070A14'`，`colorScheme: 'dark'`。  
- `SiteHeader.tsx`：盘路由（`/chart`）可缩成 48px 高、藏英文副标；或保持 56，但 **盘页不要再叠第二层 sticky 章节 nav**。  
- `chart/page.tsx`：删除（移动端）顶部 `#` 章节 nav；改为 **底 Tab：命盘 | 解读 | 追问**（见 C2）。  
- `SiteFooter.tsx`：在 `/chart` 折叠为单行「口径 · 数据集」，或 `md` 以下大幅收紧 `py`，避免给 scrollRatio 送人头。

---

### C1. Home（`app/page.tsx` + `BirthForm.tsx`）

**痛点：** Hero 像说明文档；表单 panel 是标准 SaaS 表；sticky CTA 出现前首屏仪式感为零。

**目标构图（mobile 375×812）：**

```
┌─────────────────────┐  ~56  SiteHeader
│  ZIWEI · 眉题        │
│  排一张紫微命盘       │  ~120  Hero（短文案 ≤2 行）
│  一句信任文案         │
├─────────────────────┤
│  生辰卡片（冷玉）     │  ~420  表单主体（日期/时辰/性别）
│  …                   │
├─────────────────────┤
│  [ 排 盘 ] sticky    │  ~64   信息完整后升起
└─────────────────────┘
  「我的命盘」可折到次屏 / 默认折叠
```

**具体改法：**

- `page.tsx`：hero 副文案砍到 **1 句**；覆盖范围 `#coverage` 改成 footer 旁链或折叠 `<details>`。  
- `BirthForm.tsx`：  
  - panel 增加极弱星光内高光（globals `.panel-ritual`）。  
  - 主 CTA 文案保持「排 盘」，但加 `chart-submit` 态。  
  - 「我的命盘」aside：mobile 默认折叠为「已存 N 张 · 展开」。  
- Copy：把「十三方面解读」改成「看盘 · 再读」语气，避免一上来承诺读完 3 万字。

---

### C2. Chart — Mobile + Desktop（`chart/page.tsx` + `ChartBoard.tsx`）

**痛点一句：** Mobile 盘 `bottom≈1083 > vh=812`（溢出 ~271）；同页解读把 `scrollRatio` 打到 **10.2**。Desktop 盘大致一屏，但中宫仍是表、选中无呼吸、庙旺 `#8a5512` 脏在夜空上。

**目标构图 — Mobile（硬约束）：**

```
┌─────────────────────┐  ≤56   SiteHeader
│ 1990-05-15 · 午 · 男 │  ≤56   单行摘要 + 分享 icon
├─────────────────────┤
│ ▢▢▢▢                 │
│ ▢ 中宫 ▢             │  ≥ calc(100dvh - 112px - 56px)
│ ▢▢▢▢                 │  盘本体必须整块入屏
├─────────────────────┤  ≤56   底 Tab：命盘|解读|追问
└─────────────────────┘
```

**关键数字：**

- **顶区 chrome 预算：≤ 112px**（header + 单行摘要）。  
- 底 Tab：≤ 56px + safe-area。  
- 验收：`#chart-board [role=group]` 或桌面 grid 的 `getBoundingClientRect().bottom ≤ window.innerHeight`。  
- 默认盘页（未开解读）`scrollHeight / clientHeight < 2`。

**具体改法：**

1. `chart/page.tsx` header：H1 缩成单行 `text-sm`；排盘日说明默认藏进「详情」popover。  
2. 移动章节 nav → **固定底 Tab**（新小组件如 `ChartTabBar.tsx`）：  
   - 命盘：只渲染 `ChartBoard`  
   - 解读：全屏/近全屏 panel，挂 `ReadingPanel`（不再堆在盘下方）  
   - 追问：同理挂 `AskPanel`  
3. `ChartBoard.tsx` mobile grid：

```tsx
// BEFORE
gridTemplateRows: 'repeat(4, minmax(5.25rem, auto))'
// AFTER
height: 'calc(100dvh - var(--chart-chrome, 112px) - var(--chart-tab, 56px))'
gridTemplateRows: 'repeat(4, minmax(0, 1fr))'
```

   宫内主星过多时 **格内滚动**，不要撑破盘。  
4. Desktop：已有 `height: max(26rem, calc(100dvh - 14rem))` —— 把 `14rem` 与真实顶栏对齐，改为 CSS 变量；选中加 `palace-breathe`。  
5. 跳转芯片（命/身/大限）：移到底 Tab 上方一条细 scrap，或并入中宫长按；**不要**插在盘和中宫详情之间再吃 40px（现状 `mb-3 flex gap-2`）。  
6. 四化图例：桌面保留一行；mobile 放进宫详情 sheet 顶，首屏盘下不再重复两行 chip 汤。

---

### C3. Palace detail（`ChartBoard` `#mobile-palace-detail` + `PalaceCell`）

**痛点：** 详情是又一张大卡片塞回页面流，把盘顶走；`PalaceCell` 在 sheet 里继续 badge 汤；下面还挂完整 `CenterPanel` 表格。

**目标构图：**

```
盘保持在背板（可 4% dim）
┌──────── sheet ────────┐  max-h 70vh，从底滑上
│ 命宫 · 干支     [收起] │
│ 主星（星等清晰）        │
│ 辅/吉/煞 分行降对比    │
│ 三方四正 四枚冷玉 chip  │
└───────────────────────┘
```

**改法：**

- `#mobile-palace-detail`：改为 `fixed`/`sticky` bottom sheet + `detail-sheet` motion；关时回焦点（已有 Escape，保留）。  
- Sheet 内复用 `PalaceCell` 时加 `variant="sheet"`：隐藏大「命宫/身宫」重复 chip（宫名已在标题）。  
- 盘下那块完整 `CenterPanel`（`ChartBoard` ~L360）mobile **默认不渲染**；需要时从中宫 tap 打开。  
- `brightnessClass` 换 token；四化改细边字色。

---

### C4. Reading（`ReadingPanel.tsx`）

**痛点：** 「13 维 · 约 29,689 字」像威胁；同页长文杀死一屏；横滑 13 tab + sticky 又抢顶。

**目标构图：**

```
底 Tab「解读」→ 独立面板
┌ 维名 · 字数          ┐
│ 左侧或底部：维 Tab    │  mobile：底部 5 显 +「更多」
│ 正文 Markdown         │  一次只一维；切维 tab-crossfade
└──────────────────────┘
```

**改法：**

- IA：从 `chart/page.tsx` 拔出，由 Tab 控制挂载；盘默认不加载 3 万字进首屏 DOM（可保留 SSR 但 `hidden`/`display:none` 面板，或 client fetch —— 优先 **hidden panel** 少改后端）。  
- Header 文案：去掉「约 29,689 字」总吓阻；改为当前维「本维 2,340 字」。  
- Citation 大框降为一行 tip，链到 about。  
- Tab：mobile 改 **底部分段** 或横向 + 当前维大标题；桌面可保留左栏。  
- `tab-crossfade` 挂在 article。

---

### C5. Ask（`AskPanel.tsx`）

**痛点：** 折叠尚可，但视觉仍是「又一块 panel + 虚线空态」；与解读、盘无统一材质。

**目标：** 追问 = 第三 Tab；空态一句人话 + 2 枚推荐 chip；气泡用 `surface-2`，问标用冷玉小方，不要大虚线箱。

**改法：**

- 随 ChartTabBar 挂载；去掉 `mt-14` 巨顶距。  
- Pending 态保留 spinner，但加一句「星图检索中」类微文案（克制，别玄乎过度）。  
- Verification warn：用 `hua.ke`/`zhu` 低彩边，避免又一个紫警告盒。

---

### C6. Library / 我的命盘（Home aside）

**痛点：** 空态虚线框像后台零数据；与仪式感无关。

**目标：** 「星册」—— 空态插画级极简（一颗线描星 + 一句「排过的盘会留在这」）；有数据时列表行高 48，左星点指示。

**改法：** 仅 `BirthForm.tsx` aside + 文案；mobile 折叠。不必新路由。

---

### C7. Loading（`chart/loading.tsx`）

**痛点：** Mobile skeleton 仍是「列表块」叙事，与真实 4×4 盘不一致（文件注释自己也写了 list skeleton）。

**改法：** Mobile 骨架改成 **4×4 矮格 + 中宫**，与真盘同几何；文案「正在排布十二宫…」。接 `chart-submit` 淡入。

---

## D. 7 天落地切片（Claude Code 可照做）

统一约定：分支继续 `ux/iter-1`；commit 前缀 `ux(iter-N): …`；**不 push / 不 merge**；只测 `http://localhost:3000/`。

### Day 1 — `iter-19` theme + contrast

**Files：** `tailwind.config.ts`，`globals.css`，`layout.tsx`，`PalaceCell.tsx`（`brightnessClass` + `SIHUA_CLASS`）

**做：** 全表 token 换血；theme-color/colorScheme dark；杀掉 `#8a5512`；四化降彩。

**验收：**

- `document.querySelector('meta[name=theme-color]').content === '#070A14'`  
- `meta color-scheme` = dark  
- 页面源码 / computed 无 `#8a5512`  
- 庙旺主星色 ≈ `#C4A06A`

### Day 2 — `iter-20` mobile one-screen chrome

**Files：** `chart/page.tsx`，`ChartBoard.tsx`，`SiteHeader.tsx`（可选），新 `ChartTabBar.tsx`，`globals.css`（`--chart-chrome`）

**做：** 顶区 ≤112px；底 Tab；mobile 盘 `height: calc(100dvh - chrome - tab)` + `minmax(0,1fr)` 行。

**验收：**

- Mobile 375×812：盘 grid `bottom ≤ vh`  
- 默认命盘 Tab：`scrollRatio < 2`  
- 顶区（header+摘要）高度合计 ≤ 112px

### Day 3 — `iter-21` reading as panel

**Files：** `chart/page.tsx`，`ReadingPanel.tsx`，`AskPanel.tsx`，`ChartTabBar.tsx`

**做：** 解读/追问离开盘首屏；文案去掉总字数恐吓；citation 降级为一行。

**验收：**

- 命盘 Tab 下不出现「约 29,689 字」  
- 切到解读 Tab 才见 `ReadingPanel`  
- 维切换有 crossfade 或至少无整页跳闪

### Day 4 — `iter-22` palace material + hierarchy

**Files：** `PalaceCell.tsx`，`ChartBoard.tsx`，`CenterPanel.tsx`，`globals.css`

**做：** 宫卡材质；选中/三方；中宫虚空化；mobile 详情改 sheet；砍盘下重复 CenterPanel。

**验收：**

- 选中宫有 glow/breathe class  
- 中宫首屏无四柱 4 格墙（mobile）  
- 详情为 sheet，不把盘顶出视口

### Day 5 — `iter-23` motion

**Files：** `motion.ts`，`globals.css`，`PalaceCell.tsx`，`ReadingPanel.tsx`，`BirthForm.tsx`，`ChartBoard.tsx`

**做：** 五段命名动效 + reduced-motion 全覆盖。

**验收：**

- `animEls > 0`（选中宫时）或存在 `@keyframes palace-breathe`  
- `prefers-reduced-motion: reduce` 下无无限循环  
- 排盘提交可见 pending 过渡

### Day 6 — `iter-24` home ritual CTA

**Files：** `page.tsx`，`BirthForm.tsx`，`globals.css`（`.panel-ritual`），`chart/loading.tsx`

**做：** Hero 收束；表单冷玉；sticky CTA；loading 骨架几何对齐；Library 空态。

**验收：**

- Home 首屏可见主 CTA 或信息完整后 sticky  
- Loading mobile 为 4×4 而非纯列表条  
- Hero 副文案 ≤ 2 行

### Day 7 — 收口回归

**做：** 对照本说明书 A–C 打勾；重跑关键 metrics（boardBottom、scrollRatio、themeColor、无 `#8a5512`、anim）；补 4 张 after 截图到 `shots/design-howto/after/`。

**验收总表：**

| Check | 阈值 |
|---|---|
| Mobile boardBottom ≤ vh | true |
| Default chart scrollRatio | < 2 |
| themeColor | `#070A14` |
| `#8a5512` hits | 0 |
| 选中宫 anim/keyframes | present |
| 解读不在盘首屏 | true |

---

## E. Claude Code 一键 Prompt

复制即用：

```text
你在仓库 /Users/fangchen/Baidu/GitHub/ziwei 的分支 ux/iter-1 上实现设计改造。

唯一设计源：/Users/fangchen/Projects/ziwei-full-ux-20261101/DESIGN-HOWTO-CHANGE.md
严格按文档 §D 的 Day/iter 顺序做（iter-19 → iter-24），一次只做一个 Day 的 PR/commit。

硬约束：
- 不要 push、不要 merge、不要改远程。
- 不要改排盘引擎口径与数据集逻辑；只改 apps/web 视觉 / 布局 / IA / motion。
- UI 文案保持中文；克制、消费级灵性，禁止庙红堆砌与霓虹赛博。
- 预览与自测只用 http://localhost:3000/（不要用 127.0.0.1）。
- 移动端命盘一屏：顶区 chrome ≤ 112px；盘 bottom ≤ vh；默认命盘 Tab scrollRatio < 2。
- layout.tsx 的 themeColor / colorScheme 必须与 dark 夜空一致。
- 消灭 PalaceCell 里的 #8a5512，改用文档 token #C4A06A。

每天结束：本地 commit（前缀 ux(iter-N): …），在 DESIGN-HOWTO-CHANGE 同级写一小段 AFTER-NOTES-iter-N.md（改了哪些文件、验收数字），并可选截图到 shots/design-howto/after/。

先读 DESIGN-HOWTO-CHANGE.md 全文与 apps/web 下 globals.css、tailwind.config.ts、layout.tsx、ChartBoard、PalaceCell、CenterPanel、ReadingPanel、AskPanel、BirthForm、motion.ts、chart/page.tsx、chart/loading.tsx，再开始 Day 1。
```

---

## 附录 · 源码地图（真路径）

| 区域 | 路径 |
|---|---|
| Token | `apps/web/tailwind.config.ts` |
| 全局材质 / 打印 | `apps/web/src/app/globals.css` |
| Shell | `apps/web/src/app/layout.tsx` |
| Home | `apps/web/src/app/page.tsx` |
| Chart 页壳 | `apps/web/src/app/chart/page.tsx` |
| Loading | `apps/web/src/app/chart/loading.tsx` |
| 盘 | `apps/web/src/components/ChartBoard.tsx` |
| 宫 | `apps/web/src/components/PalaceCell.tsx` |
| 中宫 | `apps/web/src/components/CenterPanel.tsx` |
| 解读 | `apps/web/src/components/ReadingPanel.tsx` |
| 追问 | `apps/web/src/components/AskPanel.tsx` |
| 生辰 | `apps/web/src/components/BirthForm.tsx` |
| Header/Footer | `SiteHeader.tsx` / `SiteFooter.tsx` / `NavLinks.tsx` |
| Motion | `apps/web/src/lib/motion.ts` |

## 附录 · 艺术方向（已消化，非原文倾倒）

Mood：**玄邃 / 静穆 / 灵启**。材质：深空渐变 + 黑曜石宫卡 + 中宫引力虚空 + 冷玉按钮。动效只要恒星呼吸与溶化，不要弹性弹窗。拒绝电商扁、赛博霓虹、旧式庙堂皮肤。

---

*说明书版本：2026-11-01 Asia/Shanghai · 对应 HEAD `a5945db` · 只设计不改码*
