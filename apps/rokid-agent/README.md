# 紫微星盘 · Rokid AI Glasses AIUI 智能体

> 输入生辰 → 端侧确定性排出十二宫盘 → 抬头低头用准星选宫 → 逐宫听解读 → 基于这张盘追问。
>
> 参赛：Rokid Spatial Joy 2026 全球开发大赛 · AI 赛道
> 作品策划案见 [`PROPOSAL.md`](./PROPOSAL.md)（报名要交的那份）

---

## 1. 这个工程是什么

一个标准的 **AIUI 智能体工程**，跑在 Rokid AI Glasses 的 YodaOS 上。

- **单 Page 应用**：一个 `.ink` 文件同时承载配置、逻辑、结构、样式，没有多文件页面；
- **端侧优先**：十二宫的宫位、安星、五行局、大限全部由端侧引擎按固定规则算出，**不经过大模型**；
- **检索式解读**：解读正文来自公开的「紫微斗数开源解读数据集 v4.0-13d」（674,976 张命盘 × 13 维），服务端本地检索后返回，**不是模型生成的**；
- **眼镜原生交互**：绝对方向传感器（准星）为主，加速度计（抬头切宫）与镜腿按键为兜底；TTS 承担长文本朗读。

**三条不可破的边界**（已写进 `AGENTS.md`，改代码时别破坏）：

1. 排盘只走确定性引擎，智能体不得自行推算星曜；
2. 解读只从数据集原文检索，材料没收录就说「没收录」；
3. 不做人生决策建议：只讲盘面上客观存在的结构性事实。

---

## 2. 目录结构

```
apps/rokid-agent/
├── AGENTS.md                  # 智能体身份、系统提示词、能力边界、隐私口径（AIUI 会读它）
├── app.json                   # 页面声明、权限（仅 INTERNET）、窗口配置
├── app.js                     # 应用级生命周期：onLaunch / onShow / onHide / onError
├── package.json               # name: ziwei-chart-agent, version: 1.0.0
├── tsconfig.json              # 只覆盖 lib/ 与 types/（checkJs，用于 IDE 与类型检查）
├── .aixignore                 # AIX 打包排除项
├── pages/
│   └── index/
│       └── index.ink          # 唯一的 Page：<script def> + <script setup> + <page> + <style>
├── lib/                       # 纯 ESM 模块，1289 行，零第三方依赖
│   ├── chart-layout.js        # 十二宫网格布局 + 宫位↔维度映射（与 Web 端 GRID_POS 一致）
│   ├── head-cursor.js         # IMU：四元数 → 欧拉角 → 准星网格 → 地支；加速度计兜底
│   ├── birth-parser.js        # 口语生辰 → 年/月/日/时辰/性别（纯函数）
│   ├── chart-source.js        # 端侧引擎优先，失败静默落服务端
│   ├── api.js                 # wx.request 优先 / fetch 兜底，带超时
│   ├── tts.js                 # TTS 双通道（wx.speech / speechSynthesis）
│   ├── voice-input.js         # ASR 双通道（wx.speech / SpeechRecognition）
│   └── storage.js             # localStorage 命盘库（最多 20 张，只存本机）
├── types/
│   ├── runtime.d.ts           # AIUI 运行时类型（AbsoluteOrientationSensor 等）
│   └── wx.d.ts                # wx.* 风格 API 类型
├── assets/
│   └── engine.js              # 端侧排盘引擎（esbuild 产出的单文件 ESM，859.9 KB）
└── scripts/
    └── build-engine.mjs       # 打包 / 指纹核对脚本
```

**AIUI 标准项目结构对照**：官方样例为 `AGENTS.md / app.json / app.js / pages/ / widgets/ / workers/ / assets/`。本工程**没有 `widgets/` 和 `workers/`**——单页面、且 Agent Worker 不提供 `fetch`（网络请求必须由 Page 或 Widget 发起），因此所有网络调用都放在 Page 侧的 `lib/api.js` 里。

---

## 3. 端侧引擎：重新打包与指纹核对

### 3.1 为什么需要打包

AIUI 工程**不允许安装第三方 npm 包**，而排盘引擎依赖 `iztro` + `lunar-javascript`；眼镜端也没有 `tsx` / `node_modules`。所以引擎被打成**单文件 ESM**放进 `assets/engine.js`。

### 3.2 重新打包

```bash
# 在仓库根目录执行
node apps/rokid-agent/scripts/build-engine.mjs
```

输出示例：

```
✓ 已生成 apps/rokid-agent/assets/engine.js（859.9 KB）
  指纹 sha256:b02dc5de6740b5d9752bef556d6513956b641222e3ebcaf35e92997038b2135d
```

打包参数（`BUILD_OPTIONS`，改动即改变指纹）：

```js
{ bundle: true, format: 'esm', platform: 'browser', target: 'es2020',
  minify: true, legalComments: 'none' }
```

产物 banner 里写着同一个指纹值：

```js
/*
 * 紫微星盘 · 端侧排盘引擎（自动生成，勿手改）
 * 来源：packages/chart-engine（vendored 自 https://github.com/Renhuai123/ziwei-doushu，MIT）
 * 生成：node apps/rokid-agent/scripts/build-engine.mjs
 * 指纹：sha256:b02dc5de...
 * 署名义务见 ATTRIBUTION.md：数据集 CC BY 4.0 / 作者 王多鱼AI；引擎代码 MIT。
 */
```

### 3.3 核对指纹

```bash
node apps/rokid-agent/scripts/build-engine.mjs --check
```

- 打印**当前产物的实际指纹**（对 banner 之后的正文计算 sha256）；
- 与 banner 里写的值一致 → 产物没被动过；
- 与仓库记录不一致 → 说明产物过期或被手改，**重新打包**；
- 提审材料里应写上这个指纹，用来证明「真机跑的是哪一份产物」。

> 当前记录值（2026-11-06 实测）：
> `sha256:b02dc5de6740b5d9752bef556d6513956b641222e3ebcaf35e92997038b2135d`，859.9 KB。

### 3.4 ⚠️ 尚未自动化的一环

`scripts/build-engine.mjs` 与 `lib/chart-source.js` 的注释都提到 `tests/rokid_agent.test.ts` 会用 9 份金标准盘逐字段比对打包产物与源码引擎 —— **这个测试文件现在存在了**（2026-11-06 补上，47 例，已登记进 `tests/run.ts` 的 `SUITE_FILES`）。`tests/golden/` 下 9 份金标准盘是齐的（`1950-01-01-h00-male.json` … `2026-12-31-h11-female.json`）。**「打包不失真」现在有自动化测试背书**：打包产物与源码引擎的 `chart()` 输出整对象 `deepEqual`，未做任何归一化。

---

## 4. 在 AIUI Studio 里导入、打包、提审

### 4.1 导入工程

AIUI Studio 地址：**`https://aiui.rokid.com/`**（浏览器内运行，无需本地开发环境；用 Rokid 账号登录）。

创建智能体有三种方式，本工程走**本地导入**：

1. **本地导入**（本工程）
   - 先在本地准备一个标准 AIUI 工程骨架：
     ```bash
     npm create @yodaos-pkg/aiui-agent@latest my-agent
     ```
   - 把本目录（`apps/rokid-agent/`）的文件覆盖进去；
   - 在 AIUI Studio 点「**本地导入**」，授权并选择该文件夹。
2. **GitHub 导入**（若把工程推到远端）
   - 按仓库地址 + 分支 / 标签 + 子目录导入；
   - 官方样例仓库：`https://github.com/jsar-project/AIUI/tree/main/samples`
3. **对话创建**（AIUI CODEING）——不适用，本工程是手写的确定性代码，不交给 AI 生成。

> 导入后第一件事：在右侧「**代码**」页签确认文件树是 `AGENTS.md / app.json / app.js / pages/index/index.ink / lib/*.js / assets/engine.js`，且 `assets/engine.js` 不是 0 字节（`assets` 体积大，导入时留意有没有被截断）。

### 4.2 网页端模拟调试

- 右侧「**真机模拟**」页签 → 点「**效果预览**」，可在 Web 端模拟用户输入、镜腿操作与不同光照下的显示效果；
- 注意：**网页端没有 IMU**，准星通道不会工作；必须用镜腿方向键 / Enter 走完流程；
- 网页端同样没有 `wx.*`，`lib/tts.js` / `lib/voice-input.js` 会自动落到 Web 风格分支（`speechSynthesis` / `SpeechRecognition`）。

### 4.3 AIX 打包

- 右侧「**构建与提审**」→ 点「**AIX 打包**」；
- 打包成功后**自动同步到云端**；
- **真机调试前必须先完成 AIX 打包**，否则眼镜拿不到最新资源包。

### 4.4 真机调试

1. 手机上装 **Rokid Ai APP**（App Store / 应用市场搜「Rokid AI」）；
2. APP 内：`设置 → 开发者 → 更新眼镜资源包`；
3. 等到提示「**智能体资源包下载成功**」；
4. 在眼镜上**语义命中**进入智能体，例如：「打开紫微星盘」。

### 4.5 提审

「构建与提审」栏里填写 **基本信息 / 权限依赖 / 预览素材** → 保存资料 → 提交审核。

- 审核状态：审核中 → 审核拒绝（按原因改代码或资料，重新打包、保存、提交）→ 审核通过（进入可发布状态，在 Rokid AI App 智能体商店展示）。
- 提交前自检：真机核心流程已通过、权限声明与代码一致、资料无夸大内容、图片与视频数量格式合规。
- **提审素材**：至少 3–5 个文件，**必须含 1 张图 + 1 段视频**，只传截图会被打回。
- **必填内容口径见 `PROPOSAL.md` 第 9 节**（禁用词表、免责声明文案、署名文案、9 条待确认问题）。

### 4.6 权限声明一致性

`app.json` 当前只申请 `INTERNET`：

```json
{ "permissions": ["INTERNET"] }
```

`AGENTS.md` 里写的是「不申请任何权限：不使用摄像头、麦克风采集、定位或系统媒体库」——语音输入走**设备自带的识别能力**，录音不落盘、不上传。提审时「权限依赖」栏必须与代码一致，不要因为用了 TTS/ASR 就申请麦克风权限。

---

## 5. 真机调试要点与已知坑

### 5.1 已知坑（逐条）

| # | 现象 | 根因 | 规避 / 处置 |
|---|---|---|---|
| 1 | **镜腿手势 GlobalHook 在滑动时也会上报按键** | 手势识别与按键事件走同一条上报通道，滑动过程中被当成按下 | 交互上避开「滑动 = 换宫」的设计；当前选宫走 IMU 准星 / 方向键，不依赖手势。**真机上仍需复现确认是否误触发确认键** |
| 2 | **`fetch` 在真机跨域会卡住** | 眼镜上浏览器的跨域策略与手机直连不同 | `lib/api.js` 已改为 **`wx.request` 优先、`fetch` 兜底**；不要在别处直接用 `fetch` |
| 3 | **HTTPS 请求实际走蓝牙到手机 App** | 眼镜的网络链路经由手机 | 弱网表现与手机直连不同；所有请求都带超时（chart 8s / reading 10s / ask 40s），且失败一律走静默降级 |
| 4 | **Ink 模板对三元表达式支持差** | `.ink` 的模板表达式不是完整的 JS | 不要写 `{{a ? b : c}}`；当前用 `ink:if` 双层渲染规避（例如 `ink:if="{{readingLoading}}"` / `ink:if="{{!readingLoading}}"` 分两行） |
| 5 | **绝对方向传感器需宿主显式 enable 能力，否则要退回加速度计通道** | 宿主未开启能力时 `AbsoluteOrientationSensor` 不产生读数 | 代码里先建传感器并监听 `error`，同时设 **1.5 s 首帧超时**；拿不到首帧就 `fallbackToTilt()`，改用 `Accelerometer` 的「抬头切宫」通道，再不行退到镜腿方向键 |
| 6 | 加速度计的 `signFlip` 轴向开关 | 眼镜戴在脸上的姿态决定「重力 Y 分量变大」是抬头还是低头 | `TILT_DEFAULTS.signFlip` 默认 `false`，**真机确认一次**，方向反了就改成 `true` |
| 7 | 准星边界抖动 | 准星压在格子边界上会来回跳 | `CURSOR_DEFAULTS.edgeGuard = 0.2`，准星离格子边缘 0.2 范围内不换宫 |
| 8 | 落进中宫时选择丢失 | 中宫（行 1–2 × 列 1–2）不是宫位 | `gridToBranch` 对中宫返回 `null`，此时**保持当前选中宫**，不丢选择 |
| 9 | TTS 叠声 | 没有可靠的播报完成回调 | `lib/tts.js` 用 `1200 + 文本长度 × 180 ms`（上限 15 s）估算时长做抑制；浮层关闭时 `stopSpeaking()` |
| 10 | Agent Worker 没有 `fetch` | AIUI 运行时的 Worker 环境不提供网络 API | 网络请求一律由 Page 侧发起（`lib/api.js` 在 Page 的 `<script setup>` 里被 import） |
| 11 | 动态 `import('wx')` 在部分环境不可用 | 运行时以 ESM 模块形式提供 `wx` | 所有 `wx.*` 调用都包在 `try { } catch { }` 里，失败落到 Web 风格分支；**永不让能力缺失变成白屏** |

### 5.2 调试时的优先级铁律

社区实战反复验证过的一条：**「不管在线接口成不成，页面永远必须有内容出，绝不白屏。」**

当前代码的三条兜底路径都实现了，但**没有一条在真机上被触发验证过**：

- 生辰没听清 → 留在输入层 + 提示换说法（不退出、不报错页）；
- 解读取不到 → 盘面照常显示，文字区写「这一段解读暂时取不到，盘面本身是端侧算的，不影响查看」；
- 追问超时 → 「追问暂时不可用，盘面和解读不受影响」。

### 5.3 单色绿屏的设计约束

Rokid AI Glasses 的 HUD 是 **480 × 352 px、单色绿 Micro-LED、30° FOV**。

- 调色板只有三档：`#00ff66`（主）/ `#4da86c`（次）/ `#174526`（弱），没有彩色可用；
- 4 列 × 120 px，4 行 × 88 px，中宫 240 × 176 px；
- 13 维解读正文动辄数千字，**视觉上读不完** → 所以 TTS 不是附加项，是长文本的唯一可行通道；
- 不要设计需要彩色区分的图表，也不要在一屏里塞超过 12 个宫位的信息。

---

## 6. 尚未验证的部分（真机 / 模拟器 / 自动化）

> **这一节请如实对待。** 下面每一项都还没有获得实证，涉及基础要求「跑在 Rokid AI Glasses 上且不超时不报错」。

### 6.1 完全没跑过真机的

| # | 项 | 说明 |
|---|---|---|
| 1 | **全链路（唤醒 → 说生辰 → 出盘 → 选宫 → 听解读 → 追问）** | 从未在 Rokid AI Glasses 上运行过 |
| 2 | 绝对方向传感器在真机是否产生读数、是否需要宿主显式 enable | 1.5 s 超时降级路径**本身也从未在真机被触发过** |
| 3 | 加速度计通道的 `signFlip` 方向 | 真机确认一次即可 |
| 4 | `wx.request` 在真机的跨域与弱网表现 | 眼镜 HTTPS 走蓝牙到手机 App，延迟与稳定性未知 |
| 5 | `wx.speech.startRecognition` / `wx.speech.playTTS` 在真机的可用性与音质语速 | 两条路径都做了 Web 风格兜底，但兜底分支在眼镜上是否可用未验 |
| 6 | 镜腿手势 GlobalHook 的误上报 | 已知坑，真机未复现 |
| 7 | Ink 模板对三元表达式的实际支持 | 现用 `ink:if` 规避，但规避写法本身未在真机渲染验证 |
| 8 | 渲染性能（12 格盘面 + `scroll-view` 长文滚动） | AR1 + 2 GB RAM，480×352 重绘帧率未测 |
| 9 | 电池表现 | 210 mAh，IMU 30 Hz 常驻 + TTS 连续朗读的续航未测 |

### 6.2 自动化测试缺口（**已闭环**）

| # | 项 | 状态 |
|---|---|---|
| 1 | `tests/rokid_agent.test.ts`（9 份金标准盘比对打包产物 vs 源码引擎） | **已存在**（2026-11-06），47 例，已登记进 `tests/run.ts`，`npm test` 全量跑 |
| 2 | `lib/` 下纯函数模块的单元测试（`chart-layout` / `head-cursor` / `birth-parser`） | **已覆盖**：`tests/rokid_agent.test.ts`（47 例），已登记进 `tests/run.ts` 的 `SUITE_FILES`，`npm test` 会跑 |
| 3 | 仓库既有回归套件 | `npm test` 覆盖 `packages/`、`apps/web`，**现已包含 `apps/rokid-agent/`**（经由 `tests/rokid_agent.test.ts`） |

### 6.3 后端部署缺口（**Demo 的硬阻塞**）

| # | 项 | 状态 |
|---|---|---|
| 1 | `POST /api/agent/reading` | 2026-11-06 实测：生产域名 `ziwei.secondplanet.cc` 返回 **HTTP 404**（站点本身 200，确认是路由缺失）。**代码已实现**（`apps/web/src/app/api/agent/reading/route.ts`），差的是**部署** |
| 2 | `POST /api/agent/ask` | 同上，**HTTP 404**；代码已实现（含引文三层降级），未部署 |
| 3 | `POST /api/agent/chart` | 同上，**HTTP 404**（端侧成功时用不到，但兜底路径失效）；代码已实现，未部署 |
| 4 | `/api/agent/reading` 的 **`inline` 引文降级接入** | **已实现**（2026-11-06）。三层防线：① 输入层 `redactingService` 先降级再拼提示词，模型看不到受限原文；② 输出层再降级一次模型吐出的引文片段；③ 提示词追加「只讲机制、不复述原话」的许可红线。模式由 `resolveAgentCitationMode` 解析，**默认 `inline`**（与 Web 端默认 `full` 刻意不同），响应里带 `citationMode` / `citationModeLabel` 供界面披露。回归网见 `tests/agent_citation.test.ts`（10 例） |

**接口未补齐前，可演示的只有「出盘 + 准星选宫」两步**；解读与追问两步需要在 Demo 前打通，或按 `PROPOSAL.md` 8.2 节的备份路径准备离线兜底。

---

## 7. 相关文件

| 文件 | 位置 | 说明 |
|---|---|---|
| 作品策划案 | `apps/rokid-agent/PROPOSAL.md` | 报名要交的那份；含合规口径与待确认问题清单 |
| 智能体行为边界 | `apps/rokid-agent/AGENTS.md` | AIUI 会读它；改行为前先改这里 |
| 端侧引擎打包 | `apps/rokid-agent/scripts/build-engine.mjs` | 打包 + 指纹核对 |
| 署名与许可 | `ATTRIBUTION.md`（仓库根） | CC BY 4.0 署名义务、免责声明文案 |
| 法务要点 | `docs/LEGAL_NOTES.md`（仓库根） | 引文分界、降级策略、商用前必做清单 |
| 数据集检索 | `packages/reading-index/` | 服务端本地检索实现 |
| 引文检测降级 | `packages/citation-guard/` | `npm run citation:selftest`（25/25，含真实数据回归） |

---

## 8. 常用命令速查

```bash
# 端侧引擎：重新打包 / 核对指纹
node apps/rokid-agent/scripts/build-engine.mjs
node apps/rokid-agent/scripts/build-engine.mjs --check

# 引文检测自测（含真实数据集回归）
npm run citation:selftest

# 仓库整体回归（不覆盖 apps/rokid-agent/）
npm test
```
