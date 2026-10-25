# 上游参考代码（只读参考，非本项目构建产物）

来源：https://github.com/Renhuai123/ziwei-doushu  作者: 王多鱼AI  许可: MIT
（LICENSE 同目录）

本目录是**上游开源仓库的可复用部分拷贝**，供 `apps/web` 改造视觉时参考：

| 路径 | 说明 |
|------|------|
| `components/` | 上游 React 组件：`ChartBoard`（12 宫格盘面）、`PalaceCell`、`BirthForm`、`StarField`、`ChartSummary`、`ThemeProvider` 等 |
| `app-chart/` | 上游 `app/chart/page.tsx` 最小可运行示例 |
| `globals.css` / `tailwind.config.ts` / `postcss.config.js` | 上游样式基线 |

## 使用规则

1. 可以**改造**这些组件用于本项目 `apps/web`，但**必须**在 `apps/web` 内保留
   MIT 署名（见 `ATTRIBUTION.md`）。
2. **不要**把上游整站（`app/` 全量、博客、SEO、支付、会员、数据库分析）
   搬进来 —— 那是上游商业站，不是本项目要做的东西。
3. 本项目的产品边界见 `docs/ARCHITECTURE.md`。
