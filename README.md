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

> 键口径是**实测确认**的，不是照抄文档 —— 详见 `docs/KEY_SEMANTICS.md`。

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
| 追问模块 | 默认不接任何真实 API（需自行配置 provider 环境变量） |
| 上游商业站功能 | **不**实现会员/支付/防刷/SEO 站群；界面为自研 |

---

## 开发

```bash
npm run typecheck     # 全包类型检查
npm test              # 回归套件（含金标准盘）
npm run index:build   # 建索引
npm run chart -- ...  # CLI
npm run web:dev       # Web 开发服务器
npm run web:build     # Web 生产构建
```

回归套件包含**金标准盘快照**：引擎变更若静默改盘，测试会指出具体哪个字段变了。
刷新快照（确认变更是有意的后）：

```bash
ZIWEI_UPDATE_GOLDEN=1 npm test
```

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
