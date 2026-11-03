# 署名与许可（ATTRIBUTION）

> 本文件是法律义务的落地，**不是可选项**。
> 任何分发形态（网页、CLI、截图、演示、模型卡、二次分发）都必须保留以下来源标注。

---

## 1. 必须展示的署名文案

以下文案在 **Web 页脚、关于页、CLI 输出末尾、README、ATTRIBUTION.md** 中出现。
措辞可微调，**来源与许可不得删改**。

```
本项目使用了「紫微斗数开源解读数据集 v4.0」（674,976 张命盘 × 13 维）
以及开源排盘引擎。
来源：https://github.com/Renhuai123/ziwei-doushu
作者：王多鱼AI
数据集许可：CC BY 4.0；引擎代码：MIT。
```

### 英文版（如需对外英文材料）

```
This project uses the "Ziwei Doushu Open Interpretation Dataset v4.0"
(674,976 charts x 13 dimensions) and the open-source chart engine.
Source: https://github.com/Renhuai123/ziwei-doushu
Author: Wang Duoyu AI
Dataset license: CC BY 4.0; engine code: MIT.
```

---

## 2. 许可矩阵

| 组成部分 | 来源 | 许可 | 本项目用法 |
|---|---|---|---|
| 排盘引擎 `lib/ziwei/`（vendored 于 `packages/chart-engine/src/engine/`） | [ziwei-doushu](https://github.com/Renhuai123/ziwei-doushu) | **MIT** | 直接使用，保留 LICENSE 与署名 |
| 解读数据集 v4.0-13d（`year-1950…2026.jsonl.zst`） | 同上 Release | **CC BY 4.0** | 运行时检索，**须署名** |
| 上游 React 组件（`vendor/upstream-reference/components/`） | 同上 | **MIT** | 改造后用于 `apps/web`，须保留署名 |
| 《紫微斗数全书》等古籍原文 | 公有领域 | Public Domain | 可自由使用 |
| **倪海厦《天纪》原话（数据集解读中的引文）** | 倪海厦 | **CC BY-NC-SA 4.0**（不在 CC BY 4.0 覆盖范围） | **见第 3 节** |
| `iztro`（引擎底层依赖） | [SylarLong/iztro](https://github.com/SylarLong/iztro) | MIT | 间接依赖 |
| `lunar-javascript`（引擎底层依赖） | [6tail/lunar-javascript](https://github.com/6tail/lunar-javascript) | MIT | 间接依赖 |

---

## 3. ⚠️ 倪海厦《天纪》引文：不在 CC BY 4.0 覆盖范围

数据集的解读文本中，**引用了倪海厦《天纪》原话**的段落，是为了说明断语出处
而注明的简短引用。这些引文：

- **著作权归原权利人**，不属于数据集的 CC BY 4.0 授权范围
- 若要**单独成批使用**，须按 `docs/tianji-ziwei/LICENSE.md`（**CC BY-NC-SA 4.0**）处理
  —— 即：**不可商用**，且须以相同方式共享

### 本项目的处理方式

MVP 阶段的处置（保守但合法）：

1. 解读文本**按数据集原样检索展示**，不做二次分发、不做批量导出
2. 展示层如遇**明显的倪师引文块**（成段引用并注明《天纪》集数与时间码），
   **降级为「略」或跳过**
3. 任何**对外分发**（如导出 PDF、批量 API、镜像数据集）前，
   必须单独审查引文段落并按 CC BY-NC-SA 处理

> 详细检查清单见 `docs/LEGAL_NOTES.md`。

---

## 4. 免责声明（必须展示）

```
本工具仅供文化兴趣与学习之用，不构成任何医疗、法律、投资或人生决策建议。
```

英文版：

```
For cultural interest and study only. Not medical, legal, or investment advice.
```

**不得**把任何输出包装成医疗建议、投资建议或确定性预测。

---

## 5. 二次分发数据集时

如果本项目未来要对外分发数据集本身（例如提供全量下载）：

- 必须附上上游的 `DATASET-LICENSE` 全文
- 必须保留 `MANIFEST.json` / `SHA256SUMS.txt`
- 必须明确区分「CC BY 4.0 的断语正文」与「CC BY-NC-SA 4.0 的倪师引文」
- 商用前需单独评估引文部分的处理方式

---

## 6. 上游链接

- 仓库：https://github.com/Renhuai123/ziwei-doushu
- 数据 Release：https://github.com/Renhuai123/ziwei-doushu/releases/tag/v4.0-13d
- 数据许可原文：仓库内 `DATASET-LICENSE`
- 在线参考（非必须依赖）：https://metisziwei.com/
