# AFTER-NOTES · iter-24（home ritual CTA）

日期：2026-11-01

## 改了哪些文件
| 文件 | 改动 |
|---|---|
| `apps/web/src/app/page.tsx` | Hero 副文案砍到**一句 28 字**（「输入生辰，先看盘，再读解读；没有依据的地方，直说不编造。」，旧 63 字 4 句已删，「不编造」底线保留）；中文主标改 `font-serif text-display`（碑刻字距 0.14em）；`#coverage` 从大 panel 卡片改为**默认收起的 `<details>`**；上下留白按 8pt 收紧 |
| `apps/web/src/components/BirthForm.tsx` | form 容器 `panel` → `panel panel-ritual`（冷玉）；sticky CTA 底色改 `bg-surface-2/90` + 低反光边；「我的命盘」→ **星册**：加副标「只存在本机，不上传。」、空态去掉虚线框换成**线描星 SVG + 「排过的盘会留在这」**、列表行高 48px（`min-h-12`）+ 左侧星点、操作按钮横排、移动端默认折叠成「已存 N 张 · 展开/收起」 |
| `apps/web/src/app/chart/loading.tsx` | 移动端骨架从「列表块」叙事改成与真盘**同几何的 4×4 矮格 + 中央 2×2 中宫**；容器接 `chart-submit` 淡入；文案「正在排盘与检索解读…」→「正在排布十二宫…」；解读骨架限制为桌面端（移动端解读已是 Tab） |

## 验收数字
- Home 首屏可见主 CTA（信息完整后 sticky 升起，逻辑未改）✅
- Hero 副文案 **28 字 ≈ 1 行** ✅
- Loading 移动端为 4×4（`grid-cols-4` + 显式 gridColumn/gridRow），非纯列表条 ✅
- `#coverage` 折叠生效（`curl` 命中 `<details` 与 `id="coverage"`）✅
- 表单 Server Action 契约未动：hidden input 的 `name/year/month/day/timeMode/shichen/ziVariant/clockHour/clockMinute/gender` 全在，`form="birth-form"` 关联与 `#chart-submit-status` 不变 ✅
- `useHistory` 的增删改命名行为不变 ✅

## 附带修掉的一个问题
星册列表行在桌面端出现**横向滚动条**：`truncate` 需要 flex 子项带 `min-w-0` 才能收缩，链接缺了它 → 加 `min-w-0` 修复。

## 与说明书的偏差
- `#coverage` 收成 `<details>` 后，原生锚点跳转只会停在 summary 行（`<details>` 无法用锚点自动展开）。要「跳转即展开」需要额外 JS，本次没做。
- 桌面端 `.btn-primary` 仍是高对比紫底（`bg-zhu`）。说明书没有点名要改按钮主色，只点名了 badge 汤与宫红堆砌；改主按钮色会牵连全局 CTA 体系，留到下一轮。
