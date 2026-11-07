# 提审操作手册 · 紫微星盘 · Rokid Spatial Joy 2026

> 写给下一个执行体（含本人在内）。按顺序做，别跳步 —— 每一步的产物是下一步的输入。
> 最后更新：**2026-11-07**。事实来源见文末「本文事实的来源」。

---

## 0. 一句话现状

工程侧已经齐了，**卡在一个外部依赖上：Rokid 专业认证仍在 Under Review**。
认证不通过 → 报名表打不开 → 提审也提交不了（提审同样卡实名认证）。
除此之外的所有材料都已做好，放在 `apps/rokid-agent/submit-kit/`。

---

## 1. 阻塞项（唯一硬阻塞）

| 项 | 状态 | 证据 |
|---|---|---|
| Rokid 专业认证（Personal） | **Under Review** | `account-web.rokid.com/verify` → Professional Authentication（Personal）= Under Review（已提交身份证正反面） |
| 报名表 | 打不开 | `https://spatialjoy.rokid.com/signup?eventId=15` → *"Verification not completed. Please complete professional verification in the Rokid account center before registering."* |
| 提审提交 | 同卡 | AIUI Studio 提审入口文案：*"实名认证正在审核中，请等待审核通过后再进行提交。"* |

**⚠️ 不要去补「基础实名认证」来绕这个。** 赛事前端 `front/user/checkAuth` 的判定逻辑是：

```js
async function T(e){                     // e = front/user/login 的返回
  if (2===e.majorCheckStatus) return;    // majorCheckStatus === 2 → 放行
  const {res:a} = await Ve();            // Ve() = front/user/checkAuth
  2!==((a?.majorCheckStatus)??e.majorCheckStatus) && (E.value=!0)  // ≠2 → 硬拦
}
```

只认 `majorCheckStatus === 2`（专业认证）。账户中心的 **Basic Authentication（基础实名）不能替代**。

**认证一过，剩下的动作按 §3 的顺序推进。** 在此之前，能做的准备都做完了。

---

## 2. 已完成的产物（全部在 `apps/rokid-agent/submit-kit/`）

| 产物 | 文件 | 生成命令 | 状态 |
|---|---|---|---|
| 作品策划案 PDF | `proposal/紫微星盘-作品策划案.pdf` | `npm run proposal:pdf` | ✅ 17 页 / 5.2 MB；红线词表已脱敏 |
| 作品信息介绍 PPT | `ppt/紫微星盘-作品信息介绍.pptx` | `npm run submit:ppt` | ✅ 10 页 / 0.85 MB |
| 智能体图标 | `icon/icon-{1024,512,256}.png` | `npm run icon:render` | ✅ 1:1；**默认图标会被打回，必须换** |
| 盘面预览图 | `preview/board-{natal,liunian}.png` | `npm run board:preview` | ✅ 480×352 @3x，**模拟器渲染** |
| 商店描述 / 社区帖 / FAQ / 视频脚本 / 合规清单 | `store-description.md` `community-post.md` `faq.md` `video-script.md` `compliance-checklist.md` | 手写 | ✅ |

> 盘面预览图是**模拟器渲染**（真实引擎数据 + 真实布局函数 + 真实 Ink 样式），不是真机照片。
> 任何对外场合用它都必须标注「模拟器渲染」；**视频必须是真机录的**，不能拿这个画面冒充。

---

## 3. 操作顺序（认证通过后按这个走）

### 步骤 1 · 把工程导入 AIUI Studio

1. 打开 `https://aiui.rokid.com`（左侧栏「新建智能体」下拉）。
2. 选 **「本地导入」**（不是对话创建 / 不是 AIUI Coding）→ 选择本仓库的 `apps/rokid-agent/` 目录。
   - Studio 用浏览器的目录句柄读工程，会把 `app.json` / `app.js` / `pages/` / `assets/` / `AGENTS.md` 整体读进浏览器工作区。
   - 目录根的 `.aixignore` 会被打包器识别 —— **不要删**。
   - 导入后的编辑**不回写本地文件**（Studio 侧提示「可编辑但不会回写原文件」）。要改代码仍在本仓库改，再重新导入。
3. 导入后点 **「上传云端」**，把工程传到云端。**提审必须云端有工程**，本地目录本身不参与提审。

### 步骤 2 · 模拟调试

顶部 tab：**AIUI CODING → 模拟调试**。在 `/debug` 模式里跑一遍：说生辰 → 出盘 → 准星选宫 → 确认键听解读 → 上下键切层。

### 步骤 3 · 打包并保存

顶部 **「打包并保存」**（不是「重新打包」）。产物是 `.aix`（gzip 包）+ `VERSION` 文件。

### 步骤 4 · 真机调试

**这一步是当前最大的质量缺口，也是权重最高、最容易补齐的一项。**
「作品完成度」在评委打分榜（占 20%）与用户使用榜（占 20%）里**各算一次**。
2026-11-07 之前**全链路从未在 Rokid AI Glasses 真机上跑过**，以下全部未验：

- `AbsoluteOrientationSensor` 在真机是否可用、要不要宿主显式 enable（代码有 1.5 s 首帧超时降级）
- 加速度计通道的轴向与方向（代码默认 `axis: 'x'` / `signFlip: false`，切宫阈值 12°、回中死区 5°）
- 镜腿手势 GlobalHook 在滑动时会不会误上报按键（已有 150 ms 同 code 去抖防线）
- `wx.request` 在真机的跨域与弱网表现
- Ink 模板对三元表达式的支持
- TTS 音质 / 语速 / 能否打断
- 运限层在真机上的渲染与切换手感（「限 / 流」前缀在 120 px 格里挤不挤）
- 左右键沿外圈巡宫的连按手感

借不到设备时的替代路径：向赛事组申请**开发样机**（见 §5）。

### 步骤 5 · 提审

顶部 **「提审」** tab。表单要填的东西与我们的素材对应关系：

| 表单字段 | 填什么 | 来源 |
|---|---|---|
| 智能体图标 | `submit-kit/icon/icon-1024.png` | 必须换掉默认图标，否则打回 |
| 基本信息（名称 / 简介 / 场景） | 名称「紫微星盘」；简介与场景见 `submit-kit/store-description.md` | — |
| 使用场景说明 | 目标场景、前置条件、典型用户请求三件事 | `store-description.md` §一 |
| 网络用途 | 本作品只用网络取解读原文与追问，域名 `ziwei.secondplanet.cc` | — |
| 摄像头 / 麦克风用途 | **都不勾** | 本作品不采集、不上传图像与音频 |
| 扬声器用途 | 勾选（用于 TTS 朗读） | — |
| Rokid 账号信息用途 | **不勾** | 不调用「Rokid 账号信息获取插件」 |
| 更新日志 | ≥5 字符、≤1000 字符 | 见下 |
| 隐私政策 / 用户协议 URL | **不需要** | 只有调用了「Rokid 账号信息获取插件」才要求上传 |

更新日志示例（本次首版）：

```
首个版本。端侧确定性排盘（十二宫 / 大限 / 流年 / 流月四层），头部准星连续二维选宫，
镜腿按键兜底，逐宫朗读公开数据集的解读原文，并支持基于当前盘面与时间层追问。
```

> 提交审核前必须完成实名认证 —— 与报名是同一道门。

---

## 4. 报名表怎么填（`https://spatialjoy.rokid.com/signup?eventId=15`）

> 注意 URL **没有 `/2026` 前缀**，带前缀会 404。

### 第一步 · 参赛信息

| 字段 | 填什么 | 备注 |
|---|---|---|
| 参赛者名称 | `紫微星盘` | **必须与提审商店名称逐字一致** |
| 负责人姓名 | `陈放` | — |
| 负责人手机号 | 11 位手机号 | — |
| 负责人邮箱 | 常用邮箱 | — |
| 参赛者类型 | **社会** | 另一档是「校园」（校园才要学校+专业与学籍证明） |
| 校园材料 | 留空 | 选「社会」不需要 |

### 第二步 · 作品与策划案

| 字段 | 填什么 | 备注 |
|---|---|---|
| 作品名称 | `紫微星盘` | ≤50 字符 |
| 赛道 | AI 赛道 | — |
| 作品类型（子赛道） | `学习` | 四类里只有「学习」当前还没有作品 |
| 子赛道类型（三级） | 认证通过后在表单里现选 | 选项来自 `front/signup/formMeta` |
| 作品策划案 | `submit-kit/proposal/紫微星盘-作品策划案.pdf` | PDF / Word，≤30 MB；名称 ≤50 字符 |

提交后：**策划案审核约 3 个工作日**反馈 → 通过即获得参赛资格（500 美金 Token）→ 可申请样机借用。

---

## 5. 样机借用（可跳过）

策划案审核通过后，在赛事管理系统里可申请开发样机：每赛道限 1 台、**先到先得**、需签合同（3 个工作日内签完，邮寄地址精确到省市区）。
已有可靠设备可直接点 **「我有设备跳过」** —— 跳过不影响后续提交。

---

## 6. 提交作品材料（初赛，节点轮数有配额）

| 材料 | 规格 | 我们的来源 | 状态 |
|---|---|---|---|
| **APK** | 必填，≤500 MB，AI 赛道配套安装包 | AIUI Studio 提审上架后产出 | ⏳ 待上架 |
| **PPT** | 必填，≤1 GB，作品信息介绍 | `submit-kit/ppt/紫微星盘-作品信息介绍.pptx` | ✅ 已完成 |
| **视频** | 必填，≤1 GB，实机录制 | **必须在真机上拍** | ⏳ 待真机 |
| 应用 ID | 上架后由商店回调给出 | — | ⏳ 待上架 |
| 测试说明 | 可选 | 如有特殊测试要求，提供测试方法与账号 | — |

---

## 7. 上架之后的收尾

- **Rokid 用户社区发帖**（必须，角逐非国际化奖项的作品都要做）—— `submit-kit/community-post.md`。
  ⚠️ 发之前先把「现在的状态」那段按实际进展更新（模板写于 2026-11-06，里面关于接口状态的描述已在本轮更新过）。
- **视频号 + 小红书**（各 50 美金 Token）—— 把作品视频按要求发到这两个平台，与社区发帖是两件事。

---

## 8. 待官方回复的问题（已随 `MAIL-TO-ROKID.md` 发出）

软著是否必需、题材可否收录与分类口径、素材规格、敏感词预检、后端域名是否符合上架要求、
持续运营下限、个人认证审核周期与能否预登记。**那封邮件还没发** —— 需要 Frank 确认署名口径后再发。

---

## 9. 本文事实的来源

- 赛事规则、流程、材料规格、评分权重：**Rokid 赛事前端 bundle**（`static.rokidcdn.com/prod/rokid-competition-web/2.0.9/assets/*.js`）的 i18n 与逻辑代码，以及 `spatialjoy.rokid.com/2026`、`/2026/leaderboard` 页面实查。
- 报名资格判定逻辑：`front/user/checkAuth` 与 `front/user/login` 的 `majorCheckStatus` 判断（见 §1 代码）。
- AIUI Studio 导入 / 打包 / 提审表单字段：`static.rokidcdn.com/prod/rokid-aiuistudio/1.3.6/assets/index-*.js` 的 i18n 与文案。
- 接口现状：2026-11-07 对 `https://ziwei.secondplanet.cc/api/agent/{chart,reading,ask}` 各 POST 一次实测，三个均 200。
- 认证状态：2026-11-07 用已登录的 Rokid 账号实测 `account-web.rokid.com/verify`。

**这类前端 bundle 往往比官方文档更准** —— 文档不会写 `majorCheckStatus === 2` 这种判定细节。
遇到「规则不明」的问题，先扒 bundle 再问官方。
