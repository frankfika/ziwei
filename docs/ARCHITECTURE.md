# 架构契约（实现方必读）

> 所有并行开发的 agent 以本文为唯一接口依据。**不要改本文描述的公开 API 形状**；
> 如确有必要，先改本文，再改代码。

---

## 1. 分层与硬规则

```
[用户输入生辰]
      ↓
@ziwei/core        应用服务层（唯一业务入口，三端共用）
      ↓                    ↓
@ziwei/chart-engine   @ziwei/reading-index
（确定性排盘）            （数据集检索）
```

### 四条不可违反的硬规则

1. **排盘只走 `@ziwei/chart-engine` 的 `chart()`**。任何环节（Web / CLI / 追问）
   都**不得**让 LLM 计算或编造星曜、宫位、四化。追问时只能把 `chart()` 的结果
   作为**事实**喂给模型。
2. **解读正文只从 `@ziwei/reading-index` 检索**。模型不得凭空生成整盘断语。
3. **默认不做微调**。本项目不引入 LoRA / 全参训练 / 继续预训练。
4. **检索键与数据集完全一致**：key = `YYYY-MM-DD-时辰序号-性别`，
   其中时辰序号 0–11，**不是** 0–23 点钟。引擎 `chart()` 的 `hour` 就是这个序号。

---

## 2. 已实证确认的关键事实

### 2.1 键口径（已用 360/360 样本实证校验）

**数据集 key 的 `y/m/d/h` 就是 `generateChart()` 的输入**，无任何折算：

| 事实 | 状态 |
|------|------|
| `key = y-m-d-h-g` ↔ `chart({year:y, month:m, day:d, hour:h, gender:g})` | ✅ 360/360 匹配 |
| 不做真太阳时校正（数据集未做） | ✅ 已确认 |
| 不做子时换日折算进 key | ✅ 已确认（口径B 匹配率 0%） |

校验方法与代码见 `tests/test_key_alignment.test.ts`（进回归套件，600 条样本）
与 `tests/test_key_alignment.ts`（独立运行入口，输出带 `PASS` 标记）。

> **推论**：`chart()` 的 `hour` 是「时辰序号」，而数据集 key 的日期是「排盘日」。
> 若产品要接受用户输入的**钟点**（如 23:30），必须先经
> `resolveChartDate()` 转成「排盘日 + 时辰序号」再查 key —— 这段转换只发生在
> **输入层**，不改变引擎和数据集本身的口径。

### 2.2 数据集事实

| 项 | 值 |
|----|-----|
| 记录数 | 674,976 张命盘（1950–2026 真实日期 × 12 时辰 × 男女） |
| 维度 | 13 维，每盘约 3.0 万字 |
| 许可 | 数据 CC BY 4.0（**须署名**）；引擎代码 MIT |
| 来源 | https://github.com/Renhuai123/ziwei-doushu 作者: 王多鱼AI |
| 排除 | 倪海厦《天纪》原话**不在** CC BY 覆盖范围，不得批量商用 |

数据集原始行（JSONL）：
`k, y, m, d, h, g, ms, t, c` —— `c` 是 13 维 Markdown 文本的字典。

### 2.3 引擎输出的两个坑

- **`isLeapMonth` 在默认 `split` 策略下恒为 `false`**（闰月体现为农历月归属）
- **`currentAge` / `isCurrentDaXian` 随当天日期变化** → 整个 `ChartJSON` 不可缓存

详见 `docs/KEY_SEMANTICS.md` 第 8 节。

### 2.4 全部 70 颗星在每张盘里都会出现

引擎在每张盘都落全部 70 颗目录星曜（只落宫不同）。
所以「星曜名不在盘里」这类集合判定在本引擎上几乎不触发 ——
防编造要靠**落宫检查**。详见 `docs/KEY_SEMANTICS.md` 第 9 节。

---

## 3. 公开 API（照抄使用，勿改签名）

### 3.1 `@ziwei/chart-engine`

```ts
import { chart, chartSummary, HOUR_BRANCHES, HOUR_RANGES,
         shichenFromClock, isLateZi, resolveChartDate, hourLabel,
         READING_DIMENSIONS, DIMENSION_LABELS,
         InvalidBirthError } from '@ziwei/chart-engine';

chart(birth: Birth): ChartJSON            // 排盘主入口
chartSummary(c: ChartJSON): string        // 命盘 → 紧凑文本（喂给 LLM 用）
shichenFromClock(h: number, m?: number): number   // 钟点 → 时辰序号 0–11（不做真太阳时）
isLateZi(hour: number): boolean           // 是否 23 点（晚子时，按次日排盘）
resolveChartDate(y,m,d,clockH,clockM?): {year,month,day,hour}  // 钟点 → 排盘日+时辰序号
hourLabel(hour: number): string           // 0 → "子时"
```

`Birth`：
```ts
{ year: number; month: number; day: number; hour: number;  // hour 是时辰序号 0–11
  gender: 'male' | 'female'; name?: string; longitude?: number }
```

`ChartJSON`（展示层与提示词的事实来源）：
```ts
{
  birth: Birth;
  lunar: { lunarYear, lunarMonth, lunarDay, yearStem, yearBranch, isLeapMonth,
            fourPillars?, fourPillarsLunar? };
  mingGongBranch: number; shenGongBranch: number;   // 地支索引 0–11
  wuxingJu: number; wuxingJuName: string;           // 如 4 / "木三局"
  ziweiPos: number;
  mingZhu?: string; shenZhu?: string; yinYangGender?: string;
  currentAge: number;
  palaces: ChartPalace[];    // 12 个，按地支 0–11 排序
  daXians: ChartDaXian[];
}
```

`ChartPalace`：
```ts
{ branch, branchName, stem, stemName, name,           // name 如 "命宫"/"财帛宫"
  isMingGong, isShenGong, isEmpty,
  borrowedFromBranch?, borrowedFromName?, borrowedStars?,
  selfSihua?: {siHua, starName}[],
  daXianAge?: [number, number], isCurrentDaXian?, oppositeBranch?,
  stars: ChartStar[],                                  // {name, type, brightness?, brightnessRaw?, siHua?}
  majorStars: string[]; minorStars: string[];           // 已按 type 分好组
  luckyStars: string[]; shaStars: string[] }
```

### 3.2 `@ziwei/reading-index`

```ts
import { ReadingIndex, buildKey, parseKey } from '@ziwei/reading-index';

const idx = new ReadingIndex({ dataDir?: string });
idx.getByKey(key: string): LookupResult
idx.get({year, month, day, hour, gender}): LookupResult
idx.has(parts): boolean
idx.indexedYears(): number[]
idx.coverage(): { years, indexedYears, totalRecords, dataDir }
```

`LookupResult`：
```ts
{ found: true,  record: ReadingRecord }
{ found: false, reason: 'year-not-indexed' | 'key-not-found', key, year }
```

`ReadingRecord`：`{ k, y, m, d, h, g, ms, t, c }`，`c` 是 13 维文本字典。

数据目录解析顺序：`ZIWEI_DATA_DIR` 环境变量 → 仓库根 `data/`。

### 3.3 `@ziwei/core`（**三端统一入口，优先用这个**）

```ts
import { ZiweiService } from '@ziwei/core';

const svc = new ZiweiService();
svc.chart(birth): ChartJSON
svc.reading(birth): ReadingLookup
svc.full(birth): { birth, chart, reading }
svc.summary(birth): string
svc.coverage(): { years, indexedYears, totalRecords, dataDir }
```

`ReadingLookup`：
```ts
{ status: 'ok'; key: string; ms: string | null;
  dimensions: { key: ReadingDimension; label: string; text: string; chars: number }[];
  totalChars: number }

{ status: 'not-covered'; key: string; year: number;
  reason: 'year-not-indexed' | 'key-not-found';
  message: string;            // 面向用户的中文说明，直接展示，不要自己编
  availableYears: number[] }
```

> **`status === 'not-covered'` 时必须把 `message` 原样展示给用户。**
> 不允许用模型生成的内容填补空白。

---

## 4. 各端职责与文件归属

| 目录 | 归属 | 说明 |
|------|------|------|
| `packages/chart-engine/**` | 已完成，勿改 | 排盘引擎 + 适配器 |
| `packages/reading-index/**` | 已完成，勿改 | 索引构建与查询 |
| `packages/core/**` | 已完成，勿改 | 应用服务层 |
| `packages/ask/**` | ask agent | 可插拔 LLM 追问 |
| `apps/web/**` | web agent | Next.js 界面 |
| `apps/cli/**` | cli agent | 命令行工具 |
| `tests/**` | tests agent | 回归与金标准 |
| `README.md` `ATTRIBUTION.md` `docs/**` | docs agent | 文档 |

**不要改动别人负责的目录。** 需要跨目录协作时，在交付说明里写清楚诉求。

---

## 5. 署名与免责声明（**不可删改来源**）

必须出现在：Web 页脚、关于页、CLI 输出、README、ATTRIBUTION.md。

```
本项目使用了「紫微斗数开源解读数据集 v4.0」（674,976 张命盘 × 13 维）
以及开源排盘引擎。
来源：https://github.com/Renhuai123/ziwei-doushu
作者：王多鱼AI
数据集许可：CC BY 4.0；引擎代码：MIT。
```

免责声明：
```
本工具仅供文化兴趣与学习之用，不构成任何医疗、法律、投资或人生决策建议。
```

---

## 6. 提交前自检

```bash
npm run typecheck   # 三个包全部通过
npm test            # 回归套件全绿
```

Web 端额外：`npm run web:build` 必须成功。
