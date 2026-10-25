# 紫微助手（ziwei-assistant）

> 输入生辰 → 确定性排盘 → 展示 12 宫命盘与 13 维解读 →（可选）基于命盘追问。

**不是「再训一个紫微大模型」项目。** 排盘是确定性计算由程序做，
解读正文来自大规模预生成的数据集按需检索，模型只负责可选的追问环节。

---

## 快速开始

```bash
# 1. 装依赖
npm install

# 2. 准备数据（详见 docs/DATA.md）
scripts/download_data.sh --years 1990,2000,2020 --decompress 1990,2000,2020

# 3. 建索引
npm run index:build -- --years 1990,2000,2020

# 4. 跑起来
npm run chart -- --date 1990-01-01 --hour 0 --gender male   # 命令行
npm run web:dev                                             # 浏览器
```

打开 http://localhost:3000 ，输入生辰即可出盘。

---

## 架构

```
[用户生辰：公历日期 + 时辰 + 性别]
              ↓
      @ziwei/chart-engine          确定性排盘（vendored 上游引擎，MIT）
              ↓  ChartJSON
      @ziwei/core                 应用服务层（三端共用入口）
              ↓
      @ziwei/reading-index        偏移索引检索 → 13 维解读原文
              ↓
      ┌──────────┬──────────┬──────────┐
      │ apps/web │ apps/cli │packages/ask│
      │ Next.js  │ 命令行   │ 可选追问  │
      └──────────┴──────────┴──────────┘
```

### 四条硬规则

1. **排盘只走确定性引擎**，禁止 LLM 自己算盘或编星曜。
2. **解读正文只从数据集检索**，不让模型凭空生成整盘断语。
3. **默认不做微调**（无 LoRA / 全参训练 / 继续预训练）。
4. **检索键与数据集严格一致**：`YYYY-MM-DD-时辰序号-性别`，时辰序号 0–11。

> 键口径是**实测确认**的，不是照抄文档 —— 600 条样本 100% 直排匹配，
> 详见 `docs/KEY_SEMANTICS.md`。

---

## 三种用法

### Web

```bash
npm run web:dev      # http://localhost:3000
```

| 路由 | 说明 |
|---|---|
| `/` | 输入页：出生日期 + 时辰/钟点 + 性别，实时口径预览，本地排盘历史 |
| `/chart?y=&m=&d=&h=&g=` | 12 宫盘面 + 13 维解读 + 晚子时提示 |
| `/about` | 口径说明、检索键、覆盖情况、署名与免责声明 |

排盘在 **Server Action** 里算（浏览器端不进排盘引擎，避免把 iztro 打进客户端包）。

### 命令行

```bash
npm run chart -- chart --date 1990-01-01 --hour 0 --gender male
npm run chart -- read  --date 1990-01-01 --hour 0 --gender male
npm run chart -- read  --date 1990-01-01 --hour 0 --gender male --dim love
npm run chart -- coverage
```

| 开关 | 说明 |
|---|---|
| `--date` | 公历出生日期 `YYYY-MM-DD` |
| `--hour` | 时辰序号 0–11，**或**中文 `子丑寅…` |
| `--clock` | 用钟点代替时辰序号（`--clock 23:30` → 晚子时按次日排盘） |
| `--gender` | `male`/`female`，或 `男`/`女`/`m`/`f` |
| `--dim` | 只看某一维（`love` 或 `感情`） |
| `--full` | 打印 13 维全文（默认每维 200 字预览） |
| `--json` | 机器可读输出 |

退出码：`0` 成功 / `2` 参数错误 / `3` 样本库未覆盖 / `1` 其他。

### 追问（可选）

```bash
export ZIWEI_ASK_PROVIDER=openai     # openai | anthropic | echo
export ZIWEI_ASK_BASE_URL=https://api.deepseek.com
export ZIWEI_ASK_API_KEY=sk-...
export ZIWEI_ASK_MODEL=deepseek-chat
```

**默认不接任何真实 API**（成本约束：单次预期花费 > ≈¥7 / USD $1 须先确认）。
未配置时调用方拿到明确的 `AskProviderNotConfiguredError`，不会静默降级。

追问的硬约束：只允许使用引擎产出的盘面事实 + 检索到的原文；
材料没写的必须回答「原文未写」。回答返回后还会跑一遍**机械自检**
（落宫检查 + 参考星表比对），越界内容会被标出来。

---

## 目录结构

```
ziwei-assistant/
├── packages/
│   ├── chart-engine/      排盘引擎（vendored 上游 MIT）+ chart() 适配器 + ChartJSON 契约
│   ├── reading-index/     数据集偏移索引：构建、查询、键口径
│   ├── core/              应用服务层：ZiweiService（Web/CLI/追问共用）
│   ├── citation-guard/    倪师《天纪》引文检测与降级
│   └── ask/               可选追问：可插拔 LLM provider + 防编造自检
├── apps/
│   ├── web/               Next.js 16 + React 19 界面
│   └── cli/               命令行工具
├── tests/                 回归套件 + 金标准盘快照
├── scripts/
│   └── download_data.sh   数据集下载/解压
├── docs/
│   ├── ARCHITECTURE.md    架构契约（实现方必读）
│   ├── KEY_SEMANTICS.md   键口径与排盘语义
│   ├── DATA.md            数据运维手册
│   └── LEGAL_NOTES.md     法务要点与引文处理
├── vendor/upstream-reference/   上游 MIT 组件参考（只读）
├── ATTRIBUTION.md         署名与许可（法律义务）
└── data/                  数据集（gitignore）
```

---

## 数据

解读数据集 v4.0-13d：674,976 张命盘 × 13 维，1950–2026。

```bash
# 只下并解压 3 年（MVP 够用）
scripts/download_data.sh --years 1990,2000,2020 --decompress 1990,2000,2020
npm run index:build -- --years 1990,2000,2020

# 全部 77 年压缩包（约 182MB，已就位）
scripts/download_data.sh --all
```

**索引采用「字节偏移」方案** —— 索引文件仅 342KB/年（源文件 740MB），
查询时直接 seek 到那一行。建索引：单年约 3.3 秒。

详见 `docs/DATA.md`。

---

## 已知边界

| 项 | 状态 |
|---|---|
| 数据覆盖 | 默认只解压 3 年；扩展见 `docs/DATA.md` 第 4.3 节 |
| 真太阳时 / 夏令时 | **不做**（数据集未做，做了检索键会错位）。后续独立需求 |
| 倪师《天纪》引文 | 数据集里密度很高（98.9% 的维度文本含引文）。已提供检测与降级工具，商业化前须处理，见 `docs/LEGAL_NOTES.md` |
| 闰月 / 亮度流派 | 引擎内部固定为 `split`（月中分界）+ 全书派亮度表，与数据集生成口径一致 |
| 闰月标记 | `isLeapMonth` 在 `split` 下**恒为 false**，闰月体现为农历月归属，别拿它判断闰月 |
| 盘面缓存 | `currentAge` 随当天日期变 → 整个 `ChartJSON` **不可缓存** |
| 盘外星曜检测 | 引擎每张盘都落全部 70 颗星（只落宫不同），所以集合判定几乎不触发；防编造靠**落宫检查** + 参考星表 |
| 追问模块 | 默认不接任何真实 API（需自行配置 provider 环境变量） |
| 上游商业站功能 | **不**实现会员/支付/防刷/SEO 站群；界面为自研 |

---

## 开发

```bash
npm run typecheck     # 全仓类型检查（packages + apps + tests）
npm test              # 回归套件（56 用例，含金标准盘与键口径实证）
npm run acceptance    # MVP 总验收（24 项，typecheck + test + CLI 端到端 + web build）
npm run index:build   # 建索引
npm run chart -- ...  # CLI
npm run web:dev       # Web 开发服务器
npm run web:build     # Web 生产构建
npm run ask:selftest  # 追问模块自测（零网络）
```

回归套件包含**金标准盘快照**（9 份，覆盖闰日/闰月/年末/时辰边界/男女/数据集首尾年）：
引擎变更若静默改盘，测试会指出**具体哪个 JSON 路径**变了。

```bash
npm test
# ✗ 金标准盘被改动了：2000-02-29-h06-male（闰年 2 月 29 日 · 午时 · 男）
#   共 3 处差异：
#     · $.mingGongFirstMajorStar   快照: "紫微"   重算: "天同"
#     · $.wuxingJuName             快照: "木三局"  重算: "水二局"
```

刷新快照（确认变更是**有意**的之后）：

```bash
ZIWEI_UPDATE_GOLDEN=1 npm test
```

然后 review `git diff` 再提交。

CI：`.github/workflows/ci.yml`（push / PR → 装依赖 → typecheck → test）。
CI 没有 56GB 数据集，数据相关用例**自动跳过并说明原因**，纯引擎用例照跑。

---

## 署名与许可

**必须保留**以下来源标注（详见 `ATTRIBUTION.md`）：

```
本项目使用了「紫微斗数开源解读数据集 v4.0」（674,976 张命盘 × 13 维）
以及开源排盘引擎。
来源：https://github.com/Renhuai123/ziwei-doushu
作者：王多鱼AI
数据集许可：CC BY 4.0；引擎代码：MIT。
```

```
本工具仅供文化兴趣与学习之用，不构成任何医疗、法律、投资或人生决策建议。
```

上游仓库：https://github.com/Renhuai123/ziwei-doushu
