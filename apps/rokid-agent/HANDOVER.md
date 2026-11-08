# 交接说明 —— 紫微星盘（Rokid Spatial Joy 2026 AI 赛道）

> 交接时间：2026-11-06 21:50（Asia/Shanghai）
> 仓库：`/Users/fangchen/Baidu/GitHub/ziwei`（远端 `github.com/frankfika/ziwei`）
> 分支：`feat/rokid-spatial-joy-2026`（最新 commit `25894ec`，**已推送**）
> `main` 停在 `57abdc8`，**至今未动** —— 这是铁律，不要在 main 上干活。

---

## 0. 一句话现状

工程主体、**时间层（运限）功能**、提审材料包全部完成并通过验证；后端三个接口已部署并验证通过。
卡在**两个外部依赖**上：Rokid 专业认证审核中（报名表打不开）、眼镜真机零验证。

---

## 1. 作品是什么

「**紫微星盘**」—— 跑在 Rokid AI Glasses 上的 AIUI 智能体。

- **端侧确定性排盘**：十二宫安星、五行局、大限/流年/流月全部由固定规则算出，**不允许模型代算**。
- **服务端数据集原文检索解读**：13 维解读正文来自 674,976 盘开源数据集（CC BY 4.0），
  **不允许模型凭空生成**。
- **眼镜原生交互**：头部准星二维选宫 → 抬头低头上下切宫 → 镜腿按键永远兜底。
- **时间层（运限）**：本命 / 大限 / 流年 / 流月四层可循环切换 —— 这是**复访理由**
  （本命盘静态，运限每月都变）。

分类选「学习」。AI 赛道版权始终归开发者（AR 游戏 / 数字文旅强制 6DoF+可编辑源码，不选）。

---

## 2. 仓库铁律（违反即返工）

1. **排盘只走确定性引擎**，禁 LLM 代算。
2. **解读只从数据集检索**，禁模型凭空生成。
3. **检索键 `YYYY-MM-DD-时辰序号-性别`** 严格一致（时辰序号 0–11，子=0；23 点按次日排盘）。
4. **眼镜端口径必须与 Web 端一致**（运限层的「今年」取**公历年**，与
   `apps/web/src/app/chart/page.tsx` 同一口径；农历年到正月初一才换）。
5. **只在 `feat/rokid-spatial-joy-2026` 分支干活**，不要在 main 上直接改。
<!-- compliance:internal -->
6. **合规禁用词**（PROPOSAL.md 9.3 全表）：预测吉凶、转运、开运、改命、化解厄运、
   消灾避祸、趋吉避凶、算命、占卜、卜卦、看运势、灵验、准不准、准确率、命中率、
   风水调理、能量/磁场/灵力、注定、一生命运、开光、法事、灵摆。
   界面文案与提审材料一律不得出现（PROPOSAL 9.3 词表本身除外）。
<!-- /compliance:internal -->

---

## 3. 本轮已完成（都已提交推送）

### 3.1 时间层（运限）—— 本轮最大增量

| 文件 | 内容 |
|---|---|
| `apps/rokid-agent/lib/time-layer.js` | `buildTimeLayers` / `nextLayerKey` / `currentLunarOf` / `detectLayer` / `focusFromQuestion` / `fortuneSiHuaOf` / `fortuneSiHuaText` |
| `apps/rokid-agent/lib/chart-layout.js` | 运限四化优先渲染、`fortuneShort` 运限宫名小标、`RING_ORDER` + `stepRing` 外圈巡宫、`speakableStars` 朗读文本、宫名归一 |
| `apps/rokid-agent/pages/index/index.ink` | 上下键切层、中宫 7 行改版、追问带时间层焦点、切层语音播报 |
| `apps/rokid-agent/lib/chart-source.js` | `resolveChart` 返回 `{ chart, source, engine }`（运限层要端侧引擎） |
| `tests/rokid_agent.test.ts` | 47 → **67 项**（+17 时间层，+3 按键去抖 `/lib/key-guard.js`） |

**最终键位映射（全模式一致）**：

- **左右键**：沿**盘面外圈**巡宫，十二宫全覆盖。外圈 = 巳午未申酉戌亥子丑寅卯辰，
  恰好是**十二宫序**的反向；`+1` 恰好等于地支 `+1`，与「抬头低头切宫」同向。
- **上下键**：切换时间层（本命→大限→流年→流月→本命）。
  **唯一例外**：端侧引擎没加载（走了服务端兜底、压根没有运限层）时退回纵向选宫。
- **确认键（Enter）**：听当前宫解读 / 追问。
- **返回键（Backspace）**：退出。
- **准星**（AbsoluteOrientationSensor）二维选宫 = 主交互；
  **抬头低头**（Accelerometer）上下切宫 = 兜底。

**标签与前缀**：大限 `大限 32–41 岁` / 流年 `流年 丙午 2026` / 流月 `流月 九月 戊戌`；
运限四化带前缀（大限「限禄」、流年流月「流禄」），本命四化在运限层**整层隐藏**
（单色绿 HUD 没颜色可区分，挂了两个标记就分不清是哪一层的）。

### 3.2 提审材料包（`apps/rokid-agent/submit-kit/`，5 个文件）

`store-description.md`（176 行）/ `community-post.md`（183）/ `video-script.md`（168，9 镜 88 秒，旁白 285 字）/
`faq.md`（312，20 条）/ `compliance-checklist.md`（235，72 项可勾选，其中 2 项已完成）。
禁用词扫描 0 命中（仅「禁止使用它们」的说明句属预期例外）。

### 3.3 文档同步

`README.md`（新增「时间层（运限）」章节）、`PROPOSAL.md`（流程图加「切时间层」一步、
硬差异三条→四条、完成度表同步）、`AGENTS.md`（AIUI 智能体定义：四层运限 + 能力边界措辞）。

---

## 4. 本轮修掉的 6 个真 bug（每条都有独立证据，不是猜的）

| # | 现象 | 根因 | 证据 |
|---|---|---|---|
| 1 | 流月层标签写「流月 腊月」，而用户当下在九月 | 用了 `chart.lunar.lunarMonth` —— 那是**出生时**的农历月 | 1990-01-01 生 → 农历腊月；今天农历九月廿八（`lunar-javascript` 独立换算核对） |
| 2 | 人际维度的解读永远取不到（静默退回总览） | 映射表写「交友宫」，引擎盘上却是「仆役宫」（两套叫法） | `chart().palaces[6].name === '仆役宫'` |
| 3 | 运限层里本命四化盖住运限四化 | `formatStar` 实现是「层四化优先，否则回落本命」 | 单测断言 `formatStar({name:'紫微',siHua:'禄'}, fortune) === '紫微'` |
| 4 | 界面写着「单击…双击返回」，按了没反应 | 工程里**没有任何 tap/dblclick 处理** | `grep tap\|dblclick` 全工程 0 命中 |
| 5 | 「端侧计算」那行几乎看不见 | `#174526` 深绿，对比度仅 2.1:1 | 实测 computed color |
| 6 | TTS 把「紫微(限禄)」带括号念出来 | 直接把屏幕文本丢给 TTS | 新增 `speakableStars` |

---

## 5. 验证口径（全部自己跑过，不是 child 自陈）

```bash
cd /Users/fangchen/Baidu/GitHub/ziwei

npm test                                  # 12 文件 / 154 用例全绿
npx tsx tests/rokid_agent.test.ts         # 64/64
npm run typecheck                         # 9 包全过
npx tsc --noEmit -p tests/tsconfig.json   # 干净
node apps/rokid-agent/scripts/build-engine.mjs --check   # sha256:c28b129d…aa67, 862.4 KB
cd /tmp/aix-gjRL && npx aix check /Users/fangchen/Baidu/GitHub/ziwei/apps/rokid-agent  # 0 diagnostic
```

**480×352 几何复验**（playwright 在 `/tmp/pw-sZQY`）：
中宫内容不溢出（scrollH 176 ≤ clientH 176）、12 个宫格头部不横向溢出、
中宫各行互不重叠、无黑字黑底。脚本：`/tmp/gen-board-mock.mts` + `/tmp/check-board.mjs`
（用真实引擎数据生成 mock，不是手写假数据）。

> ⚠️ **写验收断言的纪律**：期望值必须来自独立权威源（引擎源码 / 官方规格 / 历法库），
> 不能抄被测实现本身。已栽过一次：worker 把 `HOUR_BY_PERIOD.晚上 = 10` 抄成期望值，
> 语义上「晚上十一点」是 23:00 = 晚子时 = 时辰序号 0 且次日排盘。

---

## 6. 两个硬阻塞（当前无法靠写代码解决）

### 6.1 Rokid 专业认证审核中 —— 报名表打不开

- 报名入口：**`https://spatialjoy.rokid.com/signup?eventId=15`**（**无 `/2026` 前缀**，带前缀 404）。
- 账户中心 `account-web.rokid.com/verify`：Frank 的 Professional Authentication（Personal）= **Under Review**
  （身份证正反面已交），无补充材料提示、无 SLA。
- 报名页只显示「Verification not completed」，表单点不开。
- **报名资格只认专业认证**：赛事前端 `front/user/checkAuth` 返回的 `majorCheckStatus` 必须等于 `2` 才解锁报名表；
  **Basic Authentication（基础实名认证）不能替代** —— 不要把「先补基础实名」当成报名前的准备工作。
- 邮件草稿已在 `apps/rokid-agent/MAIL-TO-ROKID.md`（中英双版），**署名方式尚未定**（个人 / 个人+公司 / 公司主体）。

### 6.2 眼镜真机零验证 —— 最大风险项

「作品完成度」在总分里**被算两遍**（评委榜 20% + 用户使用榜 20%）。
未验证项：传感器轴向、tilt 的 `axis`/`signFlip`、镜腿 `event.code` 实际键值、
TTS 音质、**新加的上下键切层与外圈巡宫手感**、运限层实际渲染效果。

### 6.3 生产接口 —— **不再是阻塞**（2026-11-06 22:40 部署完成，2026-11-07 复测通过）

`https://ziwei.secondplanet.cc/api/agent/{chart,reading,ask}` 三个接口已上线并实测通过
（各 POST 一次均 **HTTP 200**：排盘返回十二宫 JSON、`palaces` 12 项；解读返回 `status: "ok"` +
`citationMode: "inline"`，受限引文已按三层防线降级；追问返回真实回答文本）。
镜像 `ziwei-assistant:agent-20261106` 由 feature 分支构建，回滚标签 `ziwei-assistant:backup-20261106`。
**注意**：服务端可用 ≠ 眼镜上跑通，`wx.request` 跨域与朗读链路仍未在真机实测（见 6.2）。部署操作步骤留档见第 7 节。

---

## 7. 生产部署：留档与操作步骤（已于 2026-11-06 22:40 完成）

**服务器**：`49.234.25.35`（腾讯云上海 CVM，与 SecondPlanet 企业版同机）
→ `ssh -i ~/.ssh/sp-deploy-rsa ubuntu@49.234.25.35`（**sshd 只认 RSA 密钥**）

**部署前的现状（2026-11-06 22:40 之前，留档）**：
- `/opt/ziwei` = 源码副本（**不是 git 仓库**），`/opt/ziwei.new` = 本轮同步的 feature 分支 HEAD。
- 当时容器 `ziwei-assistant` 跑 `ziwei-assistant:compact`（21:36 构建，**来自 main，没有 agent 路由**），状态健康。
- 容器是 **`docker run` 建的**（没有 compose 标签），env 直接在容器里：
  `ZIWEI_ASK_API_KEY`（125 字符）/ `BASE_URL` / `MODEL` / `PROVIDER` / `DAILY_LIMIT` / `MAX_TOKENS` / `VIP_EMAILS` —— **都非空**。
- 卷：`ziwei-data → /app/data`、`ziwei-state → /app/state`（重建容器不丢）。
- `deploy/docker-compose.yml` 里的 `${VAR:-}` 会解析成空 —— **别用 compose 重跑**，会把模型 key 弄丢。

**当时的失败原因（留档）**：
```
ERROR: failed to resolve source metadata for docker.io/library/node:22-slim:
dial tcp 69.63.176.143:443: i/o timeout
```
服务器连不上 docker.io（境内网络）。`--build-context node:22-slim=docker-image://...`
**对多阶段 Dockerfile 的 FROM 不生效**（三个阶段各有一行 FROM）。

**已完成（2026-11-06 22:40）**：按方案 A 执行 —— `git archive HEAD` 导出到 `/opt/ziwei.new`（服务器上旧的已被清理）、
`sudo sed` 三处 FROM → `docker.m.daocloud.io/library/node:22-slim`、带 `--build-arg DEBIAN_MIRROR=mirrors.aliyun.com` 构建
（20.8s 完成 Next 构建阶段，整机约 6 分钟），旧镜像打 `backup-20261106` 标签，
容器按原参数用 `--env-file /opt/ziwei-runtime.env`（由 `docker inspect` 导出的现容器 env，chmod 600）重建，
三个接口 curl 实测通过。原始操作步骤留档如下：

- **A（不动仓库）**：在服务器侧改构建副本的 FROM：
  ```bash
  cd /opt/ziwei.new
  sudo sed -i 's|FROM node:22-slim|FROM docker.m.daocloud.io/library/node:22-slim|g' deploy/Dockerfile
  docker build -f deploy/Dockerfile -t ziwei-assistant:agent-20261106 .
  ```
  npm 源 Dockerfile 里已经写死 npmmirror.com ✓，不用管。
- **B（改 daemon）**：给 docker 配 `registry-mirrors` 再重启 docker —— 会波及同机其它容器，**不建议**。

**换容器（务必按现容器参数原样重建）**：
```bash
# 1) 备份旧镜像与现容器参数（回滚用）
docker tag ziwei-assistant:compact ziwei-assistant:backup-20261106
docker inspect ziwei-assistant > /tmp/ziwei-inspect.json
docker inspect ziwei-assistant --format '{{range .Config.Env}}{{println .}}{{end}}' > /opt/ziwei-runtime.env
chmod 600 /opt/ziwei-runtime.env
# 2) 停旧起新（端口 3000:3000、两个卷、restart=unless-stopped、--env-file）
docker rm -f ziwei-assistant
docker run -d --name ziwei-assistant --restart unless-stopped -p 3000:3000 \
  --env-file /opt/ziwei-runtime.env \
  -v ziwei-data:/app/data -v ziwei-state:/app/state \
  ziwei-assistant:agent-20261106
# 3) 验证 + 出问题就换回 backup 标签重建
```

**⚠️ 部署源码必须是 feature 分支，不能是 main** —— main 没有 `apps/web/src/app/api/agent/`。

**验收口径**（必须真的返回数据，不是 200 就算数）：
```bash
curl -s -X POST -H 'content-type: application/json' \
  -d '{"year":1990,"month":1,"day":1,"hour":0,"gender":"male"}' \
  https://ziwei.secondplanet.cc/api/agent/chart   # 应返回十二宫 JSON
# reading 应返回 13 维正文 + citationModeLabel；ask 应返回 answer
```

---

## 8. 并发写入事故（交接模型必读）

**本轮发生过另一个 agent / 进程并发操作同一个仓库**：

- 它用 `git commit -a` 提交了我在途的改动（commit `51f6f83`，WIP），然后 `git checkout main`，
  把 `apps/rokid-agent/` 整个从工作区移走了 —— 我一度以为文件丢了（其实都已被提交）。
- 它还独立推了 `b0f2f4c`、`733fe59`、`0483fa7`（`apps/web` 侧改动），并把 **main 部署到了生产**。
- 同一时间窗内 `apps/web/src/app/api/ask/route.ts`、`AskPanel.tsx` 被并发改写（它提交了）。

**纪律**：
1. 动手前先 `git status` + `git log --oneline -5` + `git branch --show-current`，
   确认还在 feature 分支、HEAD 是谁。
2. **只 `git add` 明确列出的路径**，不要 `git add -A`（会连带提交别人的在途改动）。
3. 发现别人的未提交改动 → 报告，不要覆盖、不要提交。
4. 提交前确认 `git diff --cached --stat` 里没有意外文件。

---

## 9. 待 Frank 决策（6 项，按阻塞程度排）

1. **Rokid 认证**：盯审核状态；发 `MAIL-TO-ROKID.md` 需先定**署名方式**（个人 / 个人+公司 / 公司主体）、
   是否附作品视频链接。
2. **软件著作权**：是否立即登记？规范疑似要求，周期以月计，不启动会卡死 2027-01-28。
3. **作品名与分类定稿**：「紫微星盘 / 学习」为主选，备选「十二宫盘 / Twelve Palace Chart」。
4. **借一台 Rokid Glasses**：真机验证 + 提审素材视频的前置。可在赛事系统申请开发样机借用（每赛道限 1 台，先到先得；已有设备可点「我有设备跳过」；借用需签合同，3 个工作日内签，邮寄地址精确到省市区）。
5. **生产模型 key**：本地 `apps/web/.env.local` 已有 `ZIWEI_ASK_*`（含 125 字符 key），
   确认是否就用它发生产；模型**禁用思维链型**（会撞 180s 超时），推荐 `deepseek-chat` 或 `MiniMax-M1`。
6. **提审素材**：AIUI 商店提审的「1 图 + 1 视频」必须**真机实拍**，现在没有。赛事侧的**作品提交材料是另一套**：
   APK（≤500MB，AI 赛道配套安装包，**提审上架后才有**）+ PPT（≤1GB，作品信息介绍）+ 视频（≤1GB，实机录制），
   另有可选的测试说明；提交时要填**应用 ID**。

---

## 10. 赛事信息（已实测，别再重复调研）

- **赛程**：12 周循环赛，2026.10.27 起至 2027.01.28 止；报名开始 2026.10.27 / 作品提交 2026.10.27–2027.01.28 / 评选 2027.01.28–2027.02.28 / 决赛 2027.3 中旬。**2027-03-02 公布决赛入围名单，决赛为线下路演 + 答辩**。
- **流程节点**：报名提交作品策划案 → 策划案审核**约 3 个工作日**反馈 → 通过即获得参赛资格（对应 500 美金 Token）→ 可申请开发样机借用（每赛道限 1 台，先到先得；已有设备可点「我有设备跳过」；需签合同，3 个工作日内签，邮寄地址精确到省市区）→ 提审上架国内 Agent 商店 → 提交作品材料（APK / PPT / 视频，需填应用 ID）→ 上架后在 Rokid 用户社区发帖。
- **作品提交材料（三样必填）**：**APK（≤500MB，AI 赛道配套安装包 —— 这一项来自「提审上架后才有」）** + PPT（≤1GB，作品信息介绍）+ 视频（≤1GB，实机录制），另有可选的测试说明。与 AIUI 商店提审的「1 图 + 1 视频」不是同一套，别混。
- **报名资格**：只认**专业认证**（赛事前端 `checkAuth` 的 `majorCheckStatus` 必须为 `2`），Basic Authentication 不能替代。
- **作品类型（子赛道）只有四类**：生活 / 工作 / 娱乐 / 学习。当前 AI 赛道榜单 8 个作品里「学习」类为 0，「生活」4 个、「娱乐」4 个 —— 只作客观现状，不作胜负承诺。
- **榜单**：每周四 18:00 更新；10.27 当周轮空；11.05 首榜。当前累计 **8 个作品**，
  TOP1「跑步大师」7.03，TOP5「颈动书空」3.67（娱乐，用颈部动作 → **与我们的头部准星撞创意**）。
- **评分**：综合榜 = 评委 70% + 用户使用 30%。
  - 用户使用榜：UV 30% / 总有效时长 30% / **作品完成度 20%** / PV 20%。
  - 评委榜：实用价值 30% / 产品体验 20% / 差异亮点 20% / **作品完成度 20%** / 使用频率与传播性 10%。
- **硬要求**：中文化 + 通过 `aiui.rokid.com` 提审并上架**国内** Agent 商店 +
  提交资料到赛事管理系统 + 上架后**在 Rokid 用户社区发帖**（国际化单项奖才免发帖）。
  **用户使用分只统计国内商店上架后的有效使用。**
- 另有 3 个国际化单项奖（需 `aiui-global.rokid.com` 海外提审）。
- **奖项**：每周 TOP1–5 = ¥2000/1500/1000/700/500，霸榜奖 ¥30,000，1–10 名 $100 算力额度/团队。
- **节奏判断**：12 周循环赛、目前只有 8 个作品 → **早比完美更值钱**，认证一过就挂第一个版本抢头几周榜。
- **差异亮点不能是「抬头选宫」**（「颈动书空」已占位）→ 必须讲
  准星连续二维光标 + 排盘零模型可复算 + 674,976 盘数据集原文检索且受限引文已降级 + 四层运限。

---

## 11. 关键路径速查

```
工程        apps/rokid-agent/（AIUI 智能体：pages/index/index.ink + lib/* + assets/engine.js）
后端路由    apps/web/src/app/api/agent/{chart,reading,ask}/route.ts
引文工具    apps/web/src/lib/{citations,agentCitation}.ts
引擎源码    packages/chart-engine/src/（adapter.ts 有 daXianLayer/liuNianLayer/liuYueLayer）
提审材料    apps/rokid-agent/submit-kit/
策划案      apps/rokid-agent/PROPOSAL.md（含 9.3 禁用词表、10.2 未完成项）
邮件草稿    apps/rokid-agent/MAIL-TO-ROKID.md
数据集      data/{raw,index,compact,zst}（1950–2026 / 77 年 / 674,976 盘 × 13 维，CC BY 4.0）
生产域名    https://ziwei.secondplanet.cc
```

**仓库根有两个与本项目无关的 untracked `frankfika-chat.jpeg` / `frankfika.jpeg`（Frank 的 OpenDesk 资产）——不要提交。**

---

## 12. 建议的下一步顺序

1. 三个接口已部署并验证通过（第 6.3 / 第 7 节）；接下来是**在眼镜上实测解读与追问这条链路**（按 `submit-kit/compliance-checklist.md` 第五节逐项过）。
2. 同时发 `MAIL-TO-ROKID.md` 给官方（先定署名），问「在审期间能否预登记 + 审核时长」。
3. 启动软著登记（第 9 节第 2 项，周期最长）。
4. 借真机：按 `submit-kit/compliance-checklist.md` 逐项验（含时间层渲染、上下键手感、外圈巡宫手感），
   拍提审用 1 图 + 1 视频。
5. 认证一过 → 提审上架 → 社区发帖。

> 提审口径统一：**传统文化学习与研究用 · 不构成医疗、法律、投资或人生决策建议**
> （已写进眼镜端浮层与全部材料）。
