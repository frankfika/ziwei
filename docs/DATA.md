# 数据运维（DATA）

> 数据集下载、解压、建索引、扩展覆盖的操作手册。

---

## 1. 数据形态

| 项 | 值 |
|---|---|
| 数据集 | 紫微斗数开源解读数据集 v4.0-13d |
| Release | https://github.com/Renhuai123/ziwei-doushu/releases/tag/v4.0-13d |
| 文件 | 77 个年度文件 `year-YYYY.jsonl.zst`（1950–2026）+ 全量包 `ziwei-interp-v4-all.tar` |
| 压缩体积 | 单年约 2MB；全部约 161–182MB |
| 解压体积 | 单年约 **740MB**；全部约 **56.6GB** |
| 每盘 | 13 维，约 3.0 万字 |
| 许可 | CC BY 4.0（须署名，见 `ATTRIBUTION.md`） |

**解压必须带 `--long=27`**（上游用了长窗口压缩，不带会解码失败）：

```bash
zstd -d --long=27 year-1990.jsonl.zst
```

---

## 2. 目录布局

```
data/                      ← gitignore，大文件不进 git
├── zst/                   ← 压缩包（全部 77 年已就位，约 182MB）
│   ├── year-1950.jsonl.zst
│   └── …
├── raw/                   ← 解压后的 JSONL（每份约 740MB）
│   ├── year-1990.jsonl
│   ├── year-2000.jsonl
│   └── year-2020.jsonl
└── index/                 ← 偏移索引（每份约 342KB）
    ├── year-1990.idx.json
    ├── year-2000.idx.json
    └── year-2020.idx.json
```

---

## 3. 索引设计：为什么是「偏移」而不是导入数据库

数据集体积 56.6GB（解压后）。三种做法：

| 方案 | 磁盘 | 查询 | 评价 |
|---|---|---|---|
| 全量导入 SQLite | +56.6GB | 快 | 磁盘翻倍，导入慢 |
| 全量导入向量库 | +几十 GB | 语义检索 | 本项目不需要语义检索 |
| **偏移索引** ✅ | **+342KB/年** | **O(1) seek** | 正文原地读，索引极小 |

**本项目采用偏移索引。** 索引文件里存 `key → [byteOffset, byteLength]`，
查询时 `fs.readSync(fd, buf, 0, length, offset)` 直接 seek 到那一行读出来。

- 索引体积 = 源文件的 **0.05%**
- 建索引速度：单年 8766 行约 **3.3 秒**
- 新增一年 = 单独 build 那一年，不影响其它年份

---

## 4. 常用操作

### 4.1 下载

```bash
# 指定年份（压缩包）
scripts/download_data.sh --years 1990,2000,2020

# 全部 77 年压缩包（已就位，重跑会跳过已存在的）
scripts/download_data.sh --all

# 下载并解压指定年份
scripts/download_data.sh --years 1990,2000,2020 --decompress 1990,2000,2020
```

脚本会自动跳过已存在的文件，下载走 GitHub Release 直链（公开仓库，无需登录）。

### 4.2 建索引

```bash
# 指定年份
npm run index:build -- --years 1990,2000,2020

# 全部已解压的年份
npm run index:build
```

输出示例：

```
✅ 完成：77 个年份，共 674,976 条记录，用时 210.8s
```

### 4.3 压缩形态（compact）：1.5GB 顶替 53GB raw

`data/compact/` 是每条记录压成一个独立 zstd 帧（共享字典，约 **34 倍**压缩）。
查询时**优先走 compact**，缺帧才回退 raw —— 所以 raw 解压完可以删掉。

```bash
# 全量压缩（幂等：已完成的年份会跳过）
npm run data:compact -- --all

# 只压指定年份
npm run data:compact -- --years 1990,2000,2020

# 并行（默认 6 进程）
npm run data:compact -- --all --jobs 8
```

压完的目录布局：

```
data/compact/
├── dict                     ← 共享字典（zstd 训练得出）
├── year-1950.bin            ← 每条记录一个独立帧，可随机 seek
└── …
```

体积：全年代 raw 53GB → compact **1.5GB**（`data/index/` 15MB 不变）。
部署只需挂 compact + index，详见 `deploy/README.md` 第 9 节。

> 前提是 raw 已经解压过 —— compact 是从 raw 压出来的。
> 只想留 compact 的机器：压完删 `data/raw/`，查询自动走 compact。

### 4.4 扩展覆盖年份

**当前状态：已全年代覆盖（1950–2026，674,976 条）。**

| 目录 | 内容 | 体积 |
|---|---|---|
| `data/zst/` | 77 个压缩包 | 164MB |
| `data/raw/` | 77 个解压后的 JSONL | 53GB |
| `data/compact/` | 77 份压缩形态（推荐部署用） | 1.5GB |
| `data/index/` | 77 份偏移索引 | 15MB |

> 索引总共只有 15MB —— 这是偏移索引方案的价值：
> 53GB 的正文原地读，索引只存 `key → [offset, length]`。

**如果需要重新铺一遍**（例如换机器 / 清理磁盘）：

```bash
# 全量：解压 77 年
for y in $(seq 1950 2026); do
  scripts/download_data.sh --years $y --decompress $y
done

# 建全量索引（约 3.5 分钟）
npm run index:build
```

**如果只需要一部分年份**（磁盘紧张时）：

```bash
# 只解压 + 索引 3 年，约 2.1GB
scripts/download_data.sh --years 1990,2000,2020 --decompress 1990,2000,2020
npm run index:build -- --years 1990,2000,2020
```

未建索引的年份会走「样本库未覆盖」分支，界面诚实提示，
**不许用模型生成的内容填补**（`docs/ARCHITECTURE.md` 第 2 节硬规则）。

> ⚠️ 磁盘提示：全年代需约 53GB 解压空间。压缩包（164MB）可长期保留，
> 需要哪年再解压哪年。

---

## 5. 数据目录解析

`packages/reading-index` 的 `resolveDataDir()` 按顺序：

1. 显式参数 `new ReadingIndex({ dataDir })`
2. 环境变量 `ZIWEI_DATA_DIR`
3. 从 `process.cwd()` 向上找含 `data/index` 或 `data/raw` 的目录（≤8 层）
4. 从模块自身路径向上找（源码直跑时的兜底）

第 3 步是给 Next.js 打包场景准备的 —— 打包后 `import.meta.url` 指向构建产物，
靠它找仓库根会失败。

```bash
# 临时切到别处的数据
ZIWEI_DATA_DIR=/path/to/data npm run chart -- --date 1990-01-01
```

---

## 6. 数据格式

### JSONL 每行一张盘

```json
{
  "k": "1990-01-01-0-male",
  "y": 1990, "m": 1, "d": 1,
  "h": 0,
  "g": "male",
  "ms": "天府",
  "t": { "overview": 2940, "personality": 1897, "...": 0 },
  "c": {
    "overview": "**【命格总览】**\n\n你是天生的守护者。...",
    "personality": "...",
    "love": "...", "career": "...", "wealth": "...", "health": "...",
    "family": "...", "children": "...", "move": "...", "friends": "...",
    "home": "...", "spirit": "...", "parents": "..."
  }
}
```

| 字段 | 含义 |
|---|---|
| `k` | 键：`YYYY-MM-DD-时辰序号-性别` |
| `y/m/d` | 公历**排盘日**（晚子时已按次日折算） |
| `h` | 时辰序号 0–11（子=0 … 亥=11）—— **不是** 0–23 点钟 |
| `g` | `male` / `female` |
| `ms` | 命宫第一颗主星；无则 `null` |
| `t` | 各维字数 |
| `c` | 13 维解读正文（Markdown） |

> 键口径的完整说明与实证校验见 `docs/KEY_SEMANTICS.md`。

### 记录数预期

| 年 | 记录数 |
|---|---|
| 平年 | 365 × 12 × 2 = **8,760** |
| 闰年 | 366 × 12 × 2 = **8,784** |

---

## 7. 覆盖情况自查

```bash
npx tsx apps/cli/src/index.ts coverage
```

或直接看索引目录：

```bash
ls data/index/
```

**没建索引的年份**必须走「样本库未覆盖」分支，界面诚实提示，
**不许用模型生成的内容填补**（`docs/ARCHITECTURE.md` 第 2 节硬规则）。
