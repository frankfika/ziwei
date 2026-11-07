# Rokid 用户社区发帖文案 · 紫微星盘

> 用途：Rokid 用户社区（Rokid 官方社区 / AI Glasses 用户圈）发帖。非国际化奖项的**强制**材料项。
> 中文为主，英文版备用（面向海外用户社区或作品英文页同步）。
>
> **发布前两件事**：
> 1. 把「现在的状态」那一段按实际进展更新后再发，不要保留过时表述（模板写于 2026-11-06）；
> 2. 通读一遍 `PROPOSAL.md` 9.3 的用词口径再发。社区帖子虽然不是商店审核字段，但它是公开内容，评审和用户都会看到，口径必须与商店描述一致。

---

## 一、标题（备选，挑一个）

1. 我为什么要把一张十二宫盘面做成**能复算的计算**，而不是让模型现场编
2. 同一个生辰，在眼镜上、在手机上、在我电脑上，结果必须完全一样
3. 用 IMU 把「看哪里」变成「选什么」：我在 Rokid AI Glasses 上做的一张盘面

---

## 二、正文（中文版，直接粘贴）

```
先交代一下这是什么，免得误会。

我在做一个跑在 Rokid AI Glasses 上的 AIUI 智能体：说出生辰，它在 HUD 上画出一张紫微斗数的十二宫盘面，你抬头低头用准星点中哪一宫，按确认键，它就讲那一宫。盘面还能在本命、大限、流年、流月四层之间切换。它是一个「传统术数的结构化学习与研究工具」——文化兴趣向，不做任何人生决策建议。

这帖主要想聊一个设计选择：**为什么排盘这一步，我不交给模型。**

### 我要解决的问题

紫微斗数的排盘不是自由发挥，它是一套有确定输入输出的规则：十二宫的宫位按固定顺序排，主星按固定规则安到宫里，五行局由五行与月令推出，大限从五行局起排。同一组生辰参数进去，输出是唯一的。

那就有两种做法：

**做法 A（很多人在做）**：把生辰丢给大模型，让它「算一张盘」。快，演示效果好，一次调用就出结果。

**做法 B（我做的）**：把这套规则原样实现成一个确定性引擎，打包成单文件 ESM 塞进 assets/engine.js，跟着 AIUI 包分发。眼镜端不联网也能出盘。

我选了 B，理由有三个：

1. **可复算 = 可复核。** 同一个生辰，在眼镜上、在手机上、在我本机的引擎里，结果逐字段一致。我给它写了 9 份金标准盘做回归测试，打包产物和源码引擎的输出做整对象深比较。这个性质是「可复算」给的，不是「模型很聪明」给的。
2. **它不占模型的活。** 模型在这件事上没有任何优势——规则比模型更可靠、更快、更便宜，而且能塞进 860 KB 塞进眼镜。模型应该去干它擅长的事：把检索到的原文讲成人话。
3. **行为边界是硬的。** 智能体的系统提示里写死了「不允许自己推算星曜、编造落宫」，材料没收录的维度就回「没收录」。这比事后去查模型有没有乱说要可靠得多。

### 顺带说说交互

盘面是 4×4 的空间布局，中间两格是中宫。我用头部绝对朝向（AbsoluteOrientationSensor，四元数转欧拉角）算出一个**连续的二维准星**：偏航 ±22°、俯仰 ±16° 覆盖整个盘面，准星落在哪格就选中哪格，格子边缘留了 0.2 的保护带免得它在边界上抖。

对比一下我在社区里看到的做法：有的作品用「点一下头」这种离散手势切内容；我用连续的二维指向，是因为盘面本身就是二维空间化的——「看哪里」天然对应「选哪格」，用户不需要先学会「内容在哪」。加速度计抬头切宫和镜腿按键都留着做兜底。

镜腿按键那套分配我改过一次，值得单独说。四四方阵去掉中宫之后，十二个宫正好构成**一圈**：巳 午 未 申 酉 戌 亥 子 丑 寅 卯 辰。而这一圈恰好就是**十二宫序**（命 → 兄弟 → 夫妻 → …）——所以左右键巡宫等于按传统顺序走宫，用惯紫微的人不用重新学。

改成外圈是被逼出来的：上下键已经让给「切时间层」（那是这个作品的主功能），剩下的左右键如果还做网格式横移，中宫挡在盘面中间，**辰、卯、酉、戌 四个宫根本选不到**，模拟器里根本选不满十二宫。而眼镜没有触摸屏，模拟器里四向键是唯一的选择通道——选不满十二宫，这个作品在评审手上就走不通。外圈巡宫还带来一个副产品：+1 恰好等于地支 +1，跟抬头低头切宫是同一个方向，两套通道不打架。

HUD 是 480×352 单色绿屏，13 个维度的正文动辄几千字，视觉上根本读不完。所以信息分配是「屏幕管结构、声音管长文本」——这块也是被硬件逼出来的，不是加个朗读按钮。

### 顺带说说时间层

盘面分四层：本命、大限、流年、流月，上下键循环切。做这一层是我想清楚之后才决定的，理由是**本命盘是静态的**——排一次就固定，用户没有理由再来第二次；而运限是变的，大限十年一换、流年每年一换、流月每月一换。「我现在走到哪一步」这件事每个月都有新答案，这是它天然的复访理由。

这里有个刻意的取舍：运限层只给**结构定位**——这一层的命宫落在哪一宫、哪几个宫被四化引动。它不预测，也不给建议。十三维解读原文仍然来自本命盘数据集，运限层不重写一遍文本；单色绿屏没有颜色可区分，所以四化带「限」「流」前缀，本命四化在运限层直接不显示。

运限层跟排盘共用同一份端侧引擎。引擎没加载成功、走了服务端兜底的时候，运限层整体不可用，界面退成只有本命盘——我宁可少一层，也不给一层空白。

还有一个细节：切层的时候眼镜会把这一层的标题念出来（「流年 丙午 2026」），因为在眼镜上你不一定盯着中宫，光靠眼睛确认自己在哪一层不可靠。

### 还有一个我踩到的坑：许可

解读正文来自一份公开数据集（CC BY 4.0，674,976 张盘面 × 13 个维度），按 key 检索返回。但我实测发现：数据集正文里引用了他人原话的那部分，**不在这个 CC BY 4.0 的覆盖范围内**，不能随商业分发。

所以服务端加了一层降级：返回前把受限引文替换成占位符，输入层（拼提示词之前）、输出层（模型吐出来的引文再过一次）、提示词红线三层一起做，界面同时标注当前文本形态。我抽样实测过，降级之后残留标记为 0。

有同学遇到过类似情况吗？数据集里夹带第三方受限内容，你觉得「服务端降级 + 界面标注」这个处理够不够，还是必须在采集阶段就把引文剔掉？

### 现在的状态

- 端侧排盘引擎已打包（约 860 KB，单文件 ESM），有 9 份金标准盘的回归测试背书；
- 服务端三个接口（解读 / 追问 / 排盘兜底）已经上线并验证通过；
- 时间层（运限四层）已接进页面，上下键切层，在端侧算；真机上还没验证过；
- 真机全链路还在跑通的路上。

所以这帖是来聊思路的，不是来宣布完工的。

### 想问大家几个问题

1. 传统术数这类内容做成眼镜应用，你觉得边界应该画在哪？我目前定的是「只讲盘面上客观存在的结构性事实，不给建议」。
2. 如果一个内容型智能体把核心计算放在端侧、只把检索放服务端，你会更信任它，还是更信任纯云端的？
3. 你觉得眼镜上做「连续二维指向」，比手机上的点选，是不是真的更好用？还是只是新鲜感？

欢迎拍砖，尤其是第一条。

（本文内容仅供传统文化学习与研究之用，不构成医疗、法律、投资或人生决策建议。）
```

---

## 三、English version (paste as-is)

```
Some context first, so there is no confusion about what this is.

I am building an AIUI agent for Rokid AI Glasses: say your birth date and time, and it draws a twelve-palace Ziwei Doushu chart on the HUD. You look up and down to aim a crosshair at a palace, press the confirm key, and it reads out that palace. The chart also cycles through four layers: natal, decade, yearly and monthly. It is a structured tool for studying a traditional chart-casting system - cultural interest, no life advice of any kind.

The main thing I want to discuss is a design choice: **why I do not let the model cast the chart.**

### The problem I wanted to solve

Casting a Ziwei Doushu chart is not free-form. The twelve palaces sit in a fixed order, main stars are placed by fixed rules, the five-element frame comes from the five elements and the month, and the decade limits start from that frame. The same input always produces the same output.

So there are two ways to build this:

**Option A (what most people do)**: hand the birth date to a large model and ask it to "cast a chart". Fast, demos well, one call.

**Option B (what I did)**: implement those rules as a deterministic engine, bundle it as a single-file ESM in assets/engine.js, and ship it inside the AIUI package. The chart works with the device offline.

I chose B for three reasons:

1. **Recomputable means checkable.** The same birth data gives the same chart on the glasses, on a phone, and on my local engine. I wrote nine golden charts as a regression suite and compare the bundled output against the source engine field by field. That property comes from the computation being deterministic, not from the model being smart.
2. **It does not consume the model's job.** The model has no advantage here - the rules are more reliable, faster and cheaper, and they fit in 860 KB. The model should do what models are good at: turning retrieved source text into a spoken paragraph.
3. **The boundary is hard.** The agent's system prompt explicitly forbids it from deriving star placements or inventing them. If a dimension is not in the dataset, it says so.

### On the interaction

The chart is a 4x4 spatial layout with a two-cell centre that holds no stars. I derive a **continuous two-dimensional crosshair** from absolute head orientation (AbsoluteOrientationSensor, quaternion to Euler angles): yaw +/-22 degrees and pitch +/-16 degrees cover the whole chart, and whatever cell the crosshair lands in is the selected one. A 0.2 guard band near cell edges keeps it from flickering on a boundary.

Some other community projects use discrete gestures, like a nod to advance. I use continuous two-dimensional pointing because the chart is inherently spatial: "where you look" maps directly onto "which cell you mean", and there is no need to learn where the content lives. Accelerometer tilt and the temple buttons remain as fallbacks.

I changed how the temple keys are allocated once, and it is worth a paragraph. With the centre cell removed, the twelve palaces form exactly **one ring**: 巳 午 未 申 酉 戌 亥 子 丑 寅 卯 辰. That ring happens to be exactly the traditional palace order (Life, Brothers, Spouse, ...), so walking it with the left and right keys is walking the palaces in their traditional sequence, and a Ziwei reader does not have to relearn anything.

Going round the ring was forced on me: the up and down keys were needed for switching time layers (the main feature of the piece), and if the left and right keys still panned the grid, the centre cell would block the 辰, 卯, 酉 and 戌 palaces - you simply could not reach all twelve. The glasses have no touchscreen, so in the simulator the four-way keys are the only way to select anything; not being able to reach all twelve means the piece cannot be demonstrated at all. The ring also gives a bonus: +1 there is exactly +1 on the branches, which is the same direction as the tilt-to-select gesture, so the two channels do not fight each other.

The HUD is a 480x352 monochrome green display, and the text across 13 dimensions runs to thousands of characters - it cannot be read visually. So the split is: the screen carries structure, the voice carries long text. The hardware forced that; it is not a read-aloud button bolted on.

### On the time layers

The chart has four layers - natal, decade, yearly and monthly - and the up and down keys cycle through them. I only added this after working out why it was worth doing: **the natal chart is static**. You cast it once and it never changes, so there is no reason to come back. The time layers are not static: the decade limit turns over every ten years, the yearly layer every year, the monthly layer every month. "Which step am I at now" has a new answer every month, and that is a genuine reason to return.

The deliberate trade-off: a layer gives **structural placement only** - where that layer's Life palace lands, and which palaces the four transformations touch. It does not forecast and it does not advise. The thirteen dimensions of interpretation text still come from the natal dataset, and the layer does not rewrite that text. The HUD is monochrome green, so transformations carry a "限" or "流" prefix to tell the layers apart, and the natal transformations are simply hidden once you are on another layer.

The layers are computed on the device, by the same engine that casts the chart. If that engine fails to load and the chart falls back to the server, the layers are unavailable as a whole and the interface shows the natal chart only - I would rather have one fewer layer than a blank one.

One more detail: when you switch layers the glasses read the layer title aloud ("流年 丙午 2026"), because on glasses you are not necessarily looking at the centre cell and cannot rely on your eyes alone to confirm which layer you are on.

### A licence trap I ran into

The interpretation text comes from a public dataset (CC BY 4.0, 674,976 charts across 13 dimensions), retrieved by key. When I measured it, I found that quotations from other authors embedded in that text **are not covered by the CC BY 4.0 grant** and cannot travel with commercial distribution.

So the server redacts them before responding. Three layers: redaction before the prompt is assembled, redaction again on what the model returns, and a licence clause in the prompt. The interface labels the current form of the text. I sampled the dataset and found no residual markers after redaction.

Has anyone hit something similar? When a dataset carries third-party restricted material, is "redact on the server plus label it in the UI" enough, or does the quotes have to be stripped at ingestion time?

### Where things stand

- The on-device engine is bundled (about 860 KB, single-file ESM) and backed by a nine-chart regression suite.
- The three server endpoints (interpretation, follow-up, chart fallback) are live and verified.
- The four time layers are wired into the page and computed on the device, but they have not been verified on the hardware yet.
- The full device flow is still being brought up.

So this post is to discuss the approach, not to announce a finished product.

### Questions for you

1. For traditional-system content on glasses, where do you think the line should sit? My current rule: describe only structural facts that exist on the chart, and give no advice.
2. If an assistant keeps its core computation on-device and puts only retrieval on a server, does that make you trust it more, or less than a fully cloud-based one?
3. Is continuous two-dimensional pointing genuinely better than tapping on a phone, or is it just novel?

Criticism welcome, especially on question one.

(For cultural interest and study only. Not medical, legal or investment advice.)
```

---

## 四、发帖时的用词与合规提醒

1. **别把「算出来的盘」和「结果对不对」混为一谈。** 帖子里可以强调「可复算、可复核」，但不要给出任何形式的量化承诺——这类说法既经不起追问，也是用词红线。
2. **不要在评论区回答「结果有多准」这类提问。** 统一口径：盘面由规则算出，同一生辰必得同一张盘；解读是传统文本的原文检索。回答不了的问题就说「这个我不做」。
3. **转述数据集内容要带出处。** 帖子里提到解读正文来自公开数据集时，作者与许可（CC BY 4.0 / 王多鱼AI）至少出现一次；CC BY 的署名义务不因为换到社区就不成立。
4. **如果有人问「能不能用它做决定」**，按 `AGENTS.md` 的口径回：只讲盘面上客观存在的结构性事实，不给决策建议，并说明这是传统术数的文化解读。
5. **别在帖子里贴具体的接口地址。** 服务端三个接口已上线并验证通过，帖子里提到接口时只说「已上线」，不要贴具体 endpoint 或链接让人试。
6. **看到「数字 + 百分比」这类结论性评论不要接。** 一旦应下具体数字，后续截图就会被当证据。
7. **别把时间层说成「运势」「转运」「命好命坏」。** 运限层的口径是结构定位：这一层的命宫落在哪一宫、哪几个宫被四化引动。有人问「这层是什么意思」，就按这个说法答，不要往「预测」上靠，也不要承诺任何判断。
8. **帖子要等上架之后发。** 非国际化奖项的硬要求是：完成中文化 → 通过 `aiui.rokid.com` 提审并上架**国内** Agent 商店 → 上架后在 Rokid 用户社区发帖（国际化单项奖才免发帖）。用户使用分只统计国内商店上架后的有效使用，所以顺序不能倒。
