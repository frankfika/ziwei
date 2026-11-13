<script def>
{
    "navigationBarTitleText": "紫微星盘",
    "description": "紫微斗数命盘助手。戴上眼镜说出生辰就能排出十二宫命盘。滑动镜腿选宫，单击解读这一宫，连点两下切换运限层；对话页可以开口提问，说的是生辰就重排盘，说的是问题就追问；盘面始终留在屏幕上方，不会被弹窗顶掉。",
    "schema": {
        "data": {
            "type": "object",
            "properties": {
                "year": {
                    "type": "integer",
                    "description": "公历年，例如 1990。"
                },
                "month": {
                    "type": "integer",
                    "description": "公历月 1-12。"
                },
                "day": {
                    "type": "integer",
                    "description": "公历日 1-31。"
                },
                "hour": {
                    "type": "integer",
                    "description": "时辰序号 0-11：子=0 丑=1 寅=2 卯=3 辰=4 巳=5 午=6 未=7 申=8 酉=9 戌=10 亥=11。"
                },
                "gender": {
                    "type": "string",
                    "enum": ["male", "female"],
                    "description": "性别。"
                },
                "name": {
                    "type": "string",
                    "description": "称呼，仅展示用。"
                }
            },
            "required": ["year", "month", "day", "hour", "gender"]
        }
    },
    "disableScroll": true
}
</script>

<script setup>
import {
    buildBoard,
    markActive,
    cellAt,
    stepRing,
    dimensionOfPalace,
    speakableStars,
    DIMENSION_LABELS,
    shortPalaceName
} from '../../lib/chart-layout.js';
import {
    createCursorState,
    updateCursor,
    createTiltState,
    updateTilt
} from '../../lib/head-cursor.js';
import {
    ACTION,
    createInputRouter,
    normalizeKey,
    rawKeyLabel
} from '../../lib/temple-input.js';
import {
    TIME_LAYER_NAMES,
    buildTimeLayers,
    focusFromQuestion,
    fortuneSiHuaText,
    nextLayerKey
} from '../../lib/time-layer.js';
import { resolveChart } from '../../lib/chart-source.js';
import { requestReading, requestAsk } from '../../lib/api.js';
import { latestProfile, upsertProfile } from '../../lib/storage.js';
import { resolveInitialBirth } from '../../lib/birth-source.js';
import { speak, stopSpeaking } from '../../lib/tts.js';
import { parseBirthFromSpeech } from '../../lib/birth-parser.js';
import {
    listenOnce,
    listenContinuous,
    cancelListen,
    withTimeout,
    VOICE_HARD_TIMEOUT
} from '../../lib/voice-input.js';
import {
    TURN_KIND,
    MAX_TURNS,
    SUGGESTIONS,
    palaceQuestion,
    normalizeQuestion,
    summarize,
    createTurn,
    appendTurn,
    indexOfTurn,
    viewTurns,
    viewRows,
    digestOf,
    nextSuggestionIndex
} from '../../lib/chat-store.js';

/*
 * ── 模板里的注释一律不许留（2026-11-13 真实运行时实测） ──────────
 *
 * ink 的模板解析器**不认 HTML 注释**。
 * 实测：注释里只要出现尖括号标签，解析器就会把它当成**真元素**，
 * 于是注释的正文被当成普通文字**渲染到屏幕上** ——
 * 用户在对话页第一眼看到的是开发者写给自己的说明文字。
 * （单行且不含尖括号的注释没炸，但不值得赌。）
 *
 * ⇒ 模板（页面标签之后）里**一条注释都不放**；
 *   要解释的地方写在这里，或者写进 `lib/` 里的源文件。
 *
 * ⚠️ 这段说明里也**不许**写出模板标签的字面量 ——
 * 回归用「从页面标签切到结束标签」来定位模板，
 * 注释里写出同样的字面量会把切出来的范围搞错。
 *
 * ── 会话流为什么是「一维渲染行」 ──────────────────────────────
 * `viewRows()` 把每一轮摊平成若干行（标注行 / 问题 / 小标题 / 正文段 / 列表项），
 * 每行一个文本节点，模板只用**一层** `ink:for`。
 * 为什么不用「轮次里再套段落」：ink 的 `ink:for` 嵌套没有把握，
 * 一维列表只依赖一层 —— 能确定的才写进页面。
 * 顺带解决两件事：正文按段落分行（ink 的文本节点不认换行符），
 * 以及最新一轮在最上（滚动区只有 256px，正序的话用户看不到刚到的答案）。
 */

/**
 * 传感器采样频率（Hz）与首帧超时
 */
const SENSOR = Object.freeze({
    FREQUENCY: 30,
    FIRST_FRAME_TIMEOUT_MS: 1500
});

/**
 * 屏幕形态 —— **不再是「一个页面 + 三个互斥弹窗」**。
 *
 * ⚠️ 这次重做要解决的核心问题（用户视角）：
 * 之前的版本里，解读页和追问页都是 `width:480px; height:352px` 的**整屏替换**，
 * 于是「看盘 → 看解读 → 看追问」变成三个互斥的全屏页：
 *  · 盘面在回答时整个消失，用户不知道自己问的是哪一宫；
 *  · 问答只有一轮，问完就覆盖，上下文看不见；
 *  · 没有输入框，用户只能从 4 条预设里挑 —— 这不是对话，是查表。
 *
 * 现在改成**两个屏 + 一个录入浮层**：
 *  · `board` —— 盘面页。十二宫图 + **中宫常驻对话摘要**（最近一问一答）。
 *  · `chat` —— 对话页。顶部是盘面缩略带（保住「我在看哪」），下面是**会话流**。
 *  · `input` —— 生辰录入浮层（一次性流程，可以整屏）。
 *
 * 盘面**永远可见**是这一版的硬要求：单绿 480×352 上，看得见上下文比看得全重要。
 */
const SCREEN = Object.freeze({
    BOARD: 'board',
    CHAT: 'chat',
    INPUT: 'input'
});

/**
 * 长文本的滚动步长（像素）。
 *
 * 为什么自己管滚动：宿主给方向键的默认行为是「滚动根视图」，
 * 而根视图是固定 480×352 + overflow:hidden，滚不动；
 * 页面接管方向键之后（preventDefault），scroll-view 更不会被宿主带动。
 * 长文本不自己翻页，用户就永远读不完一整段回答。
 */
const SCROLL_STEP_PX = 60;

/** 四个方向动作 */
const DIRECTION_ACTIONS = Object.freeze([
    ACTION.UP,
    ACTION.DOWN,
    ACTION.LEFT,
    ACTION.RIGHT
]);

/**
 * 是不是方向动作。
 *
 * @param {string} action
 * @returns {boolean}
 */
function isDirectionAction(action) {
    return DIRECTION_ACTIONS.indexOf(action) >= 0;
}

/**
 * 是不是「往上一档」的方向。
 *
 * ⚠️ 真机一次滑动发的是**一对**方向键（后滑 = `Left`+`Up`），
 * 两个键的到达顺序**不保证**。
 * 所以 `Left`/`Up` 必须同义、`Right`/`Down` 必须同义 ——
 * 只有这样，滑动的方向才与到达顺序无关，一次滑动才走一档。
 *
 * @param {string} action
 * @returns {boolean}
 */
function isPrevDirection(action) {
    return action === ACTION.UP || action === ACTION.LEFT;
}

export default {
    data: {
        ready: false,
        needInput: false,
        /** 当前屏：board / chat / input */
        screen: 'board',
        cells: [],
        center: {
            yinYangGender: '',
            mingZhu: '',
            shenZhu: '',
            wuxingJuName: '',
            lunarText: '',
            pillarsText: '',
            currentAge: 0
        },
        selectedBranch: 0,
        selectedName: '',
        /** 当前时间层：natal / daxian / liunian / liuyue */
        layerKey: 'natal',
        /** 当前层标题（例：大限 32–41 岁） */
        layerTitle: '本命盘',
        /** 当前层补充（运限层=本层命宫落位） */
        layerSub: '',
        /** 当前层四化（运限层才有） */
        layerExtra: '',
        /** 选中宫在本层的宫名（运限层才有） */
        layerRole: '',
        /** 运限层是否可用（端侧引擎没加载时不可用） */
        layersReady: false,
        sourceLabel: '',
        sensorLabel: '',
        /**
         * 最近一次输入的**原始键值**（例：`ArrowLeft`、`GlobalHook`、`Enter`）。
         *
         * 为什么把它显示出来：真机上报的到底是 `code` 还是 `key`、
         * 镜腿点按是不是只有 `GlobalHook` —— 这些**源码里读不出来**，
         * 只有真机能回答（DEVICE-CHECKLIST §1.5 T2）。
         */
        lastInput: '',
        /** 状态行（端侧计算 / 正在听 / 正在推演） */
        statusLine: '',
        /**
         * 瞬时状态（正在听 / 正在推演 / 没听清）。
         *
         * ⚠️ 为什么要单独一个字段：
         * 盘面页的状态行是**诊断行**（传感器通道 + 计算来源 + 最近按键），
         * 对话页页脚是**用户行**（计算来源 + 瞬时状态）——
         * 两者内容不同，但都由同一份瞬时状态驱动。
         */
        transient: '',
        /** 对话页页脚的状态行（不含诊断信息） */
        footStatus: '',
        /**
         * 示例盘标注。
         *
         * 拿不到任何出生信息时会先亮一张内置示例盘（见 lib/birth-source.js），
         * 这一行必须告诉用户「这不是你的盘」——否则会被误读成算错了。
         */
        demoLabel: '',
        /**
         * 「时辰按午时估算」标注。
         *
         * 用户说不出时辰是常态（他自己多半也不知道），所以缺时辰时按午时兜底排盘，
         * 但**必须明示** —— 时辰决定命宫落点，静默兜底等于给出一张看起来很真的错盘。
         */
        hourNote: '',
        /** 示例盘 / 时辰估算的合并文案 */
        noticeLabel: '',

        /* ---- 盘面页（中宫 = 常驻对话区） ---- */
        /** 焦点行：当前宫 + 当前时间层 */
        focusLine: '',
        /** 焦点详情行：命主身主（本命层）/ 本层落位与四化（运限层） */
        focusDetail: '',
        /** 最近一问（摘要） */
        digestQuestion: '',
        /** 最近一答（摘要）；等待中显示「正在推演……」 */
        digestAnswer: '',
        /** 还没有任何对话时的引导语 */
        digestLead: '说出生辰，或直接问我',

        /* ---- 对话页 ---- */
        /** 会话流视图模型 */
        chatTurns: [],
        /** 会话流 → 扁平的渲染行（模板只用这一层） */
        chatRows: [],
        /** 会话流为空 */
        chatEmpty: true,
        /** 对话页空态的标题（示例盘时改成「先说说你的生辰」） */
        chatEmptyTitle: '你可以问我这张盘的任何事',
        /** 会话流滚动位置 */
        chatScrollTop: 0,
        /** 顶部盘面缩略带 */
        stripCells: [],
        /** 建议语（不依赖语音的兜底路径） */
        suggestions: SUGGESTIONS,
        suggestionIndex: 0,
        /** 当前这条建议语（盘面页中宫空态展示「试试问：…」） */
        suggestionText: SUGGESTIONS[0],

        /* ---- 通用 ---- */
        /** 当前屏的操作提示（每屏只说一件事） */
        hintLine: '',
        /** 语音录入 */
        voiceHint: '',
        inputHint: '',
        heardText: '',
        errorText: ''
    },

    /* ================================================================ *
     * 生命周期
     * ================================================================ */

    onLoad(query) {
        this._cursor = createCursorState();
        this._tilt = createTiltState();
        /**
         * 镜腿输入路由（真机契约层）。
         *
         * `onAction` 只接**异步**动作 —— 镜腿点按的延迟确认
         * （GlobalHook 挂起 ~300ms 后才敢确认）是在定时器里触发的，
         * 没有返回值可拿，只能走回调。
         */
        this._input = createInputRouter({
            onAction: (action) => {
                /**
                 * **异步动作**（镜腿点按的延迟确认）走这里 ——
                 * 它是在契约层的定时器里触发的，没有返回值可拿。
                 */
                console.info(`[ziwei-agent] input 延迟确认 → ${action}`);
                this._dispatchKey(action);
            }
        });
        this._sensorMode = 'none';
        this._readingCache = null;
        this._citationLabel = '';
        this._lastError = '';
        /** 语音录入代际令牌：取消录入后，迟到的识别结果不得再触发排盘 */
        this._voiceSeq = 0;
        /** 追问代际令牌：回答等待期间用户可能取消，迟到的答案不得落地 */
        this._askSeq = 0;
        /** 解读代际令牌：同上 */
        this._readingSeq = 0;
        /** 是否正在识别中（防重复触发） */
        this._listening = false;
        /**
         * 当前是不是示例盘（首屏没有生辰时是）。
         * 记在实例上，不靠 `data.noticeLabel` —— setData 是异步落地的。
         */
        this._isDemo = true;
        /** 会话流（最近 MAX_TURNS 轮） */
        this._turns = [];
        /** 给后端的上文（最近 3 轮问答） */
        this._askTurns = [];
        /** 是否有一个追问请求正在等待（防重复提交） */
        this._askLoading = false;
        /** 四个时间层（运限）。端侧引擎不可用时全是 null。 */
        this._layers = null;
        /** 运限层是否可用 */
        this._layersReady = false;

        /**
         * 出生参数三级兜底：对话流入参 → 本机存档 → 内置示例盘。
         *
         * 模拟器没有麦克风，`startRecognition` 永远拿不到文本 —— 之前页面因此
         * 永远停在「说出你的生辰」浮层，盘面一次都出不来（2026-11-07 实测）。
         * 所以第三级是**必须的**，不是兜底装饰。
         */
        const { birth, demo } = resolveInitialBirth(query, latestProfile());
        this._birth = birth;
        this._chart(birth, { demo, persist: !demo });
    },

    onReady() {
        this._startSensors();
    },

    onUnload() {
        this._stopSensors();
        /** 清掉挂起的镜腿确认定时器，别让回调打到已销毁的页面上 */
        if (this._input) this._input.cancel();
        /** 作废一切挂起的语音识别 / 回答响应 */
        this._voiceSeq += 1;
        this._askSeq += 1;
        this._readingSeq += 1;
        cancelListen();
        stopSpeaking();
    },

    onVoiceWakeup(event) {
        // 唤醒即回到盘面，避免用户停在别的屏
        if (this.data.screen === SCREEN.CHAT) {
            this._goBoard();
        }
        if (!this._sensorMode || this._sensorMode === 'none') {
            this._startSensors();
        }
    },

    /* ================================================================ *
     * 按键
     * ================================================================ */

    /**
     * 按键**按下**。
     *
     * 为什么同时挂 onKeyDown 和 onKeyUp：
     * 镜腿滑动是一个**手势**，真机有可能只报 keydown（手指还没抬起），
     * keyup 迟迟不来；只挂 onKeyUp 的页面在真机上就是「按了没反应」。
     * 官方事件文档也把 onKeyDown 的用途写成「按下瞬间的焦点移动或状态反馈」。
     *
     * 一次物理操作只执行一次，靠 lib/temple-input.js 的按下/抬起配对保证。
     */
    onKeyDown(event) {
        this._feedKey(event, 'down');
    },

    /**
     * 按键**抬起**。
     *
     * ⚠️ `preventDefault()` 必须在**所有分支之前**无条件调用。
     *
     * 官方事件文档写明 keyup 的宿主默认行为：
     *   · `Backspace` → 返回上一页或请求关闭应用；
     *   · `ArrowUp` / `ArrowDown` → 滚动根视图；
     *   · `Enter` → 进入导航模式或激活当前目标。
     *
     * 之前这段代码把 `preventDefault()` 放在函数**末尾**，
     * 而且解读/追问/录入三个浮层分支都提前 `return` 了 —— 于是：
     *   · 在解读或追问页按返回键 → 页关了，**应用也一起退了**；
     *   · 在页上按确认键 → 同时**进入宿主导航模式**，
     *     之后方向键被导航层吃掉，表现为「滑动切不动 / 无法产生交互」。
     */
    onKeyUp(event) {
        this._feedKey(event, 'up');
    },

    /**
     * 按键统一入口：归一化 → 接管默认行为 → 交给输入路由。
     *
     * @param {Object} event 宿主派发的按键事件
     * @param {'down' | 'up'} phase
     */
    _feedKey(event, phase) {
        const action = normalizeKey(event);
        if (!action) return;

        /**
         * 只在 keyup 阶段接管默认行为。
         *
         * 官方把默认行为挂在 keyup 上；而在 keydown 里调 preventDefault()
         * 有可能让宿主不再投递 keyup —— 那样配对状态永远悬着，
         * 下一次同键按压会被当成「重复按下」吞掉。
         */
        if (phase === 'up' && typeof event.preventDefault === 'function') {
            try {
                event.preventDefault();
            } catch (err) {
                /* 宿主不支持就算了，不能因此把按键整个丢掉 */
            }
        }

        /**
         * 最近输入的原始键值 —— 真机上机第一分钟就能看到设备到底报了什么，
         * 不用再靠猜（DEVICE-CHECKLIST §1.5 T2）。
         */
        const raw = rawKeyLabel(event);
        if (raw && raw !== this.data.lastInput) {
            const short = raw.length > 12 ? raw.slice(0, 12) : raw;
            this.setData({ lastInput: short });
            this._refreshStatus(undefined, undefined, short ? `按键 ${short}` : '');
        }

        const emitted = this._input.feed(action, phase);

        /**
         * **真机日志自证**：把「设备报了什么 → 归一化成什么 → 最终执行了什么」打全。
         *
         * 「（吸收）」表示这一次被契约层吃掉了（配对键、回声、冷却）——
         * 「按了没反应」和「被吞了」在界面上长得一样，日志能区分。
         */
        console.info(
            `[ziwei-agent] input ${phase} raw=${raw || '-'} action=${action} ` +
                (emitted ? `→ ${emitted}` : '→ （吸收）')
        );

        if (emitted) this._dispatchKey(emitted);
    },

    /**
     * 动作分发 —— 页面交互的唯一入口。
     *
     * 键位语义（**全部按真机手势实测表**对齐，见 DEVICE-CHECKLIST §1.5）：
     *
     * | 手势 | 真机键值 | 盘面页 | 对话页 | 录入页 |
     * |---|---|---|---|---|
     * | 前滑 | `ArrowRight`+`ArrowDown` | 下一宫 | 往下翻 | — |
     * | 后滑 | `ArrowLeft`+`ArrowUp` | 上一宫 | 往上翻 | — |
     * | 单击 | `GlobalHook`→`Enter` | 问这一宫 | 开口说话 | 开始识别 |
     * | 双击 | `GlobalHook`×2→`Backspace` | 切时间层 | 问建议语 | — |
     * | 返回 | 裸 `Backspace` | 退出应用 | 回盘面 | 回盘面 |
     *
     * ⚠️ **为什么每个手势在每屏只有一个含义**：
     * 之前的版本里单击在三个屏分别是「听解读 / 进追问 / 发送追问」，
     * 双击是「切层 / 关浮层 / 换预设问题」—— 同一手势三套语义，
     * 用户每换一个屏就要重新记一次，这是「交互和逻辑全是问题」的主要来源。
     * 社区实战的结论也是「**每屏只给两个动作**」。
     *
     * ⚠️ **「换生辰」为什么不在手势里**：
     * 盘面页只有 4 个手势（滑动 / 单击 / 双击 / 返回），而产品要的动作有 5 个：
     * 选宫、问这宫、切层、换生辰、退出。硬塞进去必然有一个手势背两个意思。
     * 所以**换生辰走语音** —— 对话页开口说话，说的是生辰就重排，说的是问题就追问。
     * 这也符合眼镜的形态：**说话本来就是这里最自然的输入**，
     * 而「双击换生辰」在真机上是最容易被误触成切层的手势。
     *
     * ⚠️ **为什么四个方向键一律同义**：
     * 真机一次滑动发的是**一对**方向键（前滑 `Right`+`Down`，后滑 `Left`+`Up`），
     * 上下键从来不是独立手势 —— 只是配对键。
     * 所以「上下切层、左右选宫」那套旧映射在真机上等于
     * **一次滑动同时触发两个动作域**（切宫 + 切层），
     * 表现就是评审说的「arrow 滑动事件问题 / 焦点切换问题 / 无法切换」。
     *
     * @param {string} action
     */
    _dispatchKey(action) {
        const screen = this.data.screen;

        if (screen === SCREEN.INPUT) {
            if (action === ACTION.CONFIRM) this._startVoiceInput();
            else if (action === ACTION.BACK) this._closeInput();
            /**
             * 双击在录入页**没有动作**：
             * 这一层只有「开始识别」和「取消重录」两件事，
             * 双击（换一个）在这里没有可换的东西。
             */
            return;
        }

        if (screen === SCREEN.CHAT) {
            if (action === ACTION.BACK) this._goBoard();
            /**
             * 对话页：双击 = **用建议语发问**。
             *
             * 为什么不是「回盘面」：眼镜上没有键盘，语音是唯一提问通道，
             * 而语音在嘈杂环境里识别率不稳定（社区实测：一句含混的话识别正确率不到一半）。
             * 只有语音路径 = 只要识别失败一次，用户就彻底问不了。
             * 建议语是**不依赖识别的兜底路径**，必须留在最好按到的位置（双击）。
             */
            else if (action === ACTION.DOUBLE) this._askSuggestion();
            else if (action === ACTION.CONFIRM) this._startVoiceQuestion();
            else if (isDirectionAction(action)) {
                this._scrollChat(isPrevDirection(action) ? -1 : 1);
            }
            return;
        }

        /**
         * 盘面页：**四个方向键一律选宫**（真机只有一维手势轴）。
         */
        if (action === ACTION.LEFT || action === ACTION.UP) {
            this._stepPalace(-1);
        } else if (action === ACTION.RIGHT || action === ACTION.DOWN) {
            this._stepPalace(1);
        } else if (action === ACTION.CONFIRM) this._askPalace();
        /**
         * **双击 = 切时间层**。
         *
         * 为什么不给方向键：方向键整条让给选宫了（真机只有一维手势）。
         * 为什么不用倾斜通道：倾斜通道是**准星不可用时的兜底**，职责是选宫。
         * 双击是唯一「镜腿 + 真机可测 + 模拟器可测」的独立手势，
         * 拿它做「换一层」最稳（同一族项目（言值）也是这个用法）。
         *
         * ⚠️ 「换生辰」**不占手势**，走语音（见对话页单击）。
         * 之前返回键承担「换生辰」，导致**用户想退出应用却退不掉**，
         * 而且一按就把自己辛苦排的盘抹掉。退出改回返回键。
         */
        else if (action === ACTION.DOUBLE) this._cycleLayer(1);
        /** 返回键 = 退出应用（用户必须能退出） */
        else if (action === ACTION.BACK) this.finish();
    },

    /* ================================================================ *
     * 排盘
     * ================================================================ */

    /**
     * 出生参数解析已抽到 lib/birth-source.js（resolveInitialBirth）。
     * 抽出来是为了能被单测直接跑 —— 页面模板里的方法在 node 里测不了。
     */

    async _chart(birth, opts = {}) {
        const demo = opts.demo === true;
        /**
         * 示例盘状态记在**实例**上，不靠 `data.noticeLabel` 判断 ——
         * `setData` 是异步落地的，刚排完盘时 `data.noticeLabel` 还是旧值，
         * 拿它判断会得出「还是示例盘」的错误结论。
         */
        this._isDemo = demo;
        /**
         * 换盘必清：解读缓存、引文标注、会话流、追问上下文都是**上一张盘**的，
         * 不清掉用户会读到旧人的解读（缓存按维度命中，新盘照中）。
         */
        this._readingCache = null;
        this._citationLabel = '';
        this._askTurns = [];
        this._turns = [];
        this._askLoading = false;
        this.setData({ ready: false, errorText: '' });
        try {
            const result = await resolveChart(birth);
            const board = buildBoard(result.chart);
            const mingBranch =
                result.chart && typeof result.chart.mingGongBranch === 'number'
                    ? result.chart.mingGongBranch
                    : 0;

            this._cursor = createCursorState({ branch: mingBranch });
            this._tilt = createTiltState({ branch: mingBranch });
            this._chartJson = result.chart;

            /**
             * 运限层：端侧引擎才算得出（引擎已打包进 assets/engine.js）。
             * 走服务端兜底时 engine 为 null → 运限层整体不可用，
             * 界面退成「只有本命盘」，和传感器失效时同款的降级。
             */
            this._layers = buildTimeLayers(result.chart, result.engine);
            this._layersReady = Boolean(
                result.engine && (this._layers.daxian || this._layers.liunian || this._layers.liuyue),
            );

            /**
             * 示例盘**不写本机命盘库** —— 否则下次启动它会被当成「用户自己的盘」读回来，
             * 用户说了自己的生辰却看到别人的盘。
             */
            if (opts.persist !== false) {
                upsertProfile(birth);
            }

            const layerView = this._layerView('natal', board.center);

            /**
             * 示例盘标注 + 时辰估算标注（合并成一行）。
             */
            const hourNote = !demo && birth && birth.hourEstimated ? '时辰按午时估算' : '';
            const demoLabel = demo ? '示例盘　说话换成你的生辰' : '';
            const noticeLabel = [demoLabel, hourNote].filter(Boolean).join('　');

            console.info(
                '[ziwei-agent] 盘面来源=' + result.source +
                ' 运限层可用=' + this._layersReady +
                ' 示例盘=' + demo +
                ' 时辰估算=' + hourNote
            );

            this.setData({
                ready: true,
                needInput: false,
                /**
                 * 关掉生辰录入页。
                 *
                 * ⚠️ 这里以前**漏了**，后果是：用户说完生辰 → 解析成功 → 排盘成功，
                 * 但录入页还盖在盘面上；录入页态下按返回键是 `this.finish()`（退出应用），
                 * 于是用户**永远看不到自己刚排出来的盘**，只能退出重开。
                 * 眼镜上没有别的出口 —— 模拟器没有麦克风，这条路径以前从没被跑到过。
                 */
                screen: SCREEN.BOARD,
                cells: markActive(board.cells, mingBranch),
                center: board.center,
                selectedBranch: mingBranch,
                selectedName: (cellAt(board.cells, mingBranch) || {}).name || '命宫',
                layerKey: 'natal',
                layerTitle: layerView.layerTitle,
                layerSub: layerView.layerSub,
                layerExtra: layerView.layerExtra,
                layerRole: '',
                layersReady: this._layersReady,
                sourceLabel: result.source === 'device' ? '端侧计算' : '服务端计算',
                demoLabel,
                hourNote,
                noticeLabel
            });
            /**
             * 状态行单独重算 —— 这一刻 `data.sourceLabel` 还是旧值
             * （setData 是异步落地的），所以把来源显式传进去。
             */
            this._refreshStatus('', result.source === 'device' ? '端侧计算' : '服务端计算');
            this._syncChat();
        } catch (err) {
            console.info(
                '[ziwei-agent] 排盘失败：',
                err && err.message ? err.message : String(err)
            );
            /**
             * 排盘失败 → 进生辰录入页，让用户重来一次。
             *
             * ⚠️ 这里**不能白屏**（社区实战铁律）：
             * 「不管在线接口成不成，页面永远必须有内容出」。
             * 所以失败分支必须落到一个用户还能操作的界面上，
             * 而不是停在空盘面。
             */
            this._openInput();
            this.setData({
                ready: true,
                errorText: '排盘失败，请重新说出生辰。'
            });
        }
    },

    /* ================================================================ *
     * 时间层（运限）
     * ================================================================ */

    /**
     * 某一层的展示字段。
     *
     * 本命层与运限层的中宫行**结构一致**，用户切换时视线不用重新找位置。
     *
     * @param {string} key
     * @param {Object} [center] 本命盘中宫信息（首次排盘时 data 里还是空的，必须显式传）
     * @returns {{ layerTitle: string, layerSub: string, layerExtra: string }}
     */
    _layerView(key, center) {
        const info = center || this.data.center || {};
        const layer = this._layers ? this._layers[key] : null;
        if (key === 'natal' || !layer) {
            return {
                layerTitle: '本命盘',
                layerSub: `${info.yinYangGender || ''}　${info.wuxingJuName || ''}`.trim(),
                layerExtra: info.lunarText || ''
            };
        }
        return {
            layerTitle: layer.label,
            layerSub: layer.mingPalaceName ? `本层命宫落 ${layer.mingPalaceName}` : '',
            layerExtra: fortuneSiHuaText(layer)
        };
    },

    /**
     * 切到某一层：重画盘面（运限四化标记 + 运限宫名小标）+ 更新中宫。
     *
     * @param {string} key
     */
    _applyLayer(key) {
        const chart = this._chartJson;
        if (!chart) return;
        const layer = this._layers ? this._layers[key] : null;
        const fortune = key === 'natal' ? null : layer;
        const board = buildBoard(chart, fortune);
        const branch = this.data.selectedBranch;
        const view = this._layerView(key, board.center);
        const cell = cellAt(board.cells, branch);

        this.setData({
            cells: markActive(board.cells, branch),
            layerKey: key,
            layerTitle: view.layerTitle,
            layerSub: view.layerSub,
            layerExtra: view.layerExtra,
            selectedName: cell ? cell.name : this.data.selectedName,
            layerRole: fortune && cell ? (cell.fortuneShort || '') : ''
        });

        this._syncChat();
        // 切层给一句语音：眼镜上用户不一定盯着看，得让他知道自己在哪一层。
        speak(view.layerTitle || TIME_LAYER_NAMES[key] || '');
    },

    /**
     * 切时间层。
     *
     * ⚠️ **入口是镜腿双击，不是方向键**。
     *
     * 真机的镜腿手势只有一维：前滑 = `ArrowRight`+`ArrowDown` 一对，
     * 后滑 = `ArrowLeft`+`ArrowUp` 一对 —— 上下键**只是滑动的配对键**，
     * 从来不是独立手势。所以方向键整条让给选宫（核心交互），
     * 切层交给**双击**（`GlobalHook`×2 → 补发 `Backspace`）。
     *
     * ⚠️ 双击没有方向，所以只能**向前循环**（本命 → 大限 → 流年 → 流月 → 本命）。
     */
    _cycleLayer(delta) {
        if (!this._layersReady) return;
        const next = nextLayerKey(this.data.layerKey, delta, (k) => {
            if (k === 'natal') return true;
            const layer = this._layers ? this._layers[k] : null;
            return Boolean(layer);
        });
        if (next && next !== this.data.layerKey) this._applyLayer(next);
    },

    /* ================================================================ *
     * 提示文案
     * ================================================================ */

    /**
     * 当前屏的操作提示 —— **每屏只说一件事**。
     *
     * 之前只有盘面态一句 `navHint`，切到别的屏就没提示了，
     * 用户只能靠猜。现在每一屏都有一句，且只列这一屏能做的动作。
     *
     * @returns {string}
     */
    _hintFor(screen) {
        if (screen === SCREEN.INPUT) return this.data.inputHint;
        /**
         * ⚠️ 「向前滑动看更早」不是随口写的：
         * 真机前滑 = `Right`+`Down` ⇒ `isPrevDirection` 为假 ⇒ 滚动量 +1 ⇒ **往下**。
         * 而会话流是**倒序**的（最新在最上），往下 = 更早的一轮。
         * 前滑 = 往过去翻，与盘面页「前滑 = 下一宫」是同一个方向逻辑。
         */
        if (screen === SCREEN.CHAT) return '向前滑动看更早　单击开口问　双击问建议语';
        return '滑动选宫　单击问这宫　双击切层';
    },

    /**
     * 中宫 / 页脚的状态行：传感器通道 + 计算来源 + 最近一次输入的原始键值。
     *
     * @param {string} [sourceLabel] 传了就用传值，否则用 data 里已有的
     * @param {string} [lastInput] 传了就用传值，否则用 data 里已有的
     * @returns {string}
     */
    /**
     * 重算两处状态行。
     *
     * ⚠️ **为什么要分成两行、两种内容**：
     * · 盘面页中宫的 `statusLine` 是**诊断行** ——
     *   传感器通道 + 计算来源 + 最近一次输入的**原始键值**。
     *   真机上**看不到开发者工具**，这行是唯一能自证
     *   「设备到底报了什么键、间隔多少」的地方（DEVICE-CHECKLIST §1.5 T2 / E19）。
     *   但光秃秃一个 `Enter` 用户看不懂 ⇒ 前面加「按键」两个字。
     * · 对话页页脚的 `footStatus` 是**用户行** —— 计算来源 + 瞬时状态。
     *   传感器通道和原始键值是给验收人员看的，
     *   不该混进用户长时间停留的页面。
     *
     * @param {string} [extra] 瞬时状态（正在听 / 正在推演 / 没听清）；不给就沿用 data 里的
     * @param {string} [sourceOverride] 计算来源（排盘那一刻 data 里还是旧值）
     * @param {string} [keyOverride] 最近按键（这一轮刚按下的）
     * @returns {void}
     */
    _refreshStatus(extra, sourceOverride, keyOverride) {
        const t = extra !== undefined ? extra : this.data.transient || '';
        const source = sourceOverride !== undefined ? sourceOverride : this.data.sourceLabel;
        const key =
            keyOverride !== undefined
                ? keyOverride
                : this.data.lastInput
                    ? `按键 ${this.data.lastInput}`
                    : '';
        this.setData({
            transient: t,
            statusLine: [this.data.sensorLabel, source, t || key].filter(Boolean).join('　'),
            footStatus: [source, t].filter(Boolean).join('　')
        });
    },

    /**
     * 焦点行：当前宫 + 当前时间层。
     *
     * @returns {string}
     */
    _focusLine() {
        const name = this.data.selectedName || '命宫';
        const layer = this.data.layerTitle || '本命盘';
        return `${name}　${layer}`;
    },

    /**
     * 焦点详情行。
     *
     * 本命层给「命主 / 身主 / 阴阳男女 · 五行局」（紫微里这几个是入口信息）；
     * 运限层给「本层命宫落位 + 本层四化」（这一层跟本命层不同的地方就在这两项）。
     *
     * @returns {string}
     */
    _focusDetail() {
        const center = this.data.center || {};
        if (this.data.layerKey === 'natal') {
            const parts = [];
            if (center.mingZhu) parts.push(`命主${center.mingZhu}`);
            if (center.shenZhu) parts.push(`身主${center.shenZhu}`);
            if (center.yinYangGender) parts.push(center.yinYangGender);
            if (center.wuxingJuName) parts.push(center.wuxingJuName);
            return summarize(parts.join('　'), 22);
        }
        return summarize([this.data.layerSub, this.data.layerExtra].filter(Boolean).join('　'), 24);
    },

    /* ================================================================ *
     * 会话流
     * ================================================================ */

    /**
     * 会话流视图同步 —— 盘面页中宫摘要 + 对话页会话流 + 顶部缩略带，一次 setData。
     *
     * @returns {void}
     */
    _syncChat() {
        const digest = digestOf(this._turns);
        /**
         * 中宫引导语要跟着「有没有自己的盘」变。
         *
         * ⚠️ 之前是一句写死的话「说出生辰，或直接问我」，
         * 但盘面页上**不能说话**（盘面页的单击是「问这宫」）——
         * 用户说了自己的生辰之后，这句话就变成了假指引：
         * 他在盘面页找不到开口说话的地方。
         * ⇒ 示例盘：说生辰（盘面页的单击就是开口）；
         *   自己的盘：先选一宫，单击就解读。
         */
        const digestLead = this._isDemo
            ? '说出生辰，或直接问我'
            : '滑动选宫　单击就解读这一宫';
        this.setData({
            chatTurns: viewTurns(this._turns),
            chatRows: viewRows(this._turns),
            chatEmpty: this._turns.length === 0,
            digestQuestion: digest.question ? summarize(digest.question, 20) : '',
            digestAnswer: digest.answer,
            digestLead,
            focusLine: this._focusLine(),
            focusDetail: this._focusDetail(),
            stripCells: this._stripCells(),
            suggestionText: (this.data.suggestions || [])[this.data.suggestionIndex] || '',
            hintLine: this._hintFor(this.data.screen)
        });
    },

    /**
     * 对话页顶部的盘面缩略带：12 格横排，当前宫高亮。
     *
     * ⚠️ 为什么要有这条带子：对话页之前是「解读页」——
     * 整屏换成一段文字，用户读到一半完全不知道自己问的是哪一宫。
     * 这条带子把「我在看哪」常驻在屏幕上，是这一版最要紧的改动之一。
     *
     * @returns {Array<Object>}
     */
    _stripCells() {
        return (this.data.cells || []).map((c) => ({
            branch: c.branch,
            short: shortPalaceName(c.name),
            activeClass: c.branch === this.data.selectedBranch ? 'on' : ''
        }));
    },

    /**
     * 标记一轮对话完成（落地答案 / 落地失败）。
     *
     * @param {string} id
     * @param {{ answer?: string, citation?: string, failed?: boolean }} patch
     */
    _settleTurn(id, patch) {
        const i = indexOfTurn(this._turns, id);
        if (i < 0) return;
        const turn = this._turns[i];
        this._turns[i] = {
            ...turn,
            answer: typeof patch.answer === 'string' ? patch.answer : turn.answer,
            citation: typeof patch.citation === 'string' ? patch.citation : turn.citation,
            pending: false,
            failed: Boolean(patch.failed)
        };
        /**
         * 答案落地 → 滚回顶部。
         *
         * ⚠️ 为什么必须回顶：
         * 回答是最长的一屏（1400 字 ≈ 30 行），落地时正文会把下面的一切顶下去；
         * 如果用户此刻停在别的位置，他看到的是「内容被推走」的混乱画面，
         * 而不是刚到手的答案。最新一轮本来就在最上面，回顶正好落在它的开头。
         */
        this.setData({ chatScrollTop: 0 });
        this._syncChat();
    },

    /**
     * 追问焦点：宫位 + 时间层。
     *
     * 时间层焦点靠**问题里的话**决定（「今年怎么样」→ 流年），
     * 问题没说就跟随当前盘面停在哪一层 —— 用户正在看的就是他要问的。
     * 后端只认白名单里的时间层（liunian / daxian），其余一律不传。
     *
     * @param {string} question
     * @returns {Object} focus
     */
    _focusFor(question) {
        const cell = cellAt(this.data.cells, this.data.selectedBranch);
        const focus = {};
        if (cell) {
            const dimension = dimensionOfPalace(cell.name);
            if (dimension) focus.dimension = dimension;
            focus.palace = cell.name;
        }
        const timeFocus = focusFromQuestion(question, this.data.layerKey);
        if (timeFocus && timeFocus.time) {
            focus.time = timeFocus.time;
            if (timeFocus.time === 'liunian') focus.targetYear = new Date().getFullYear();
        }
        return focus;
    },

    /**
     * 焦点的人话版（界面上要让用户看见自己在问哪一块）。
     *
     * @param {string} question
     * @returns {string}
     */
    _focusLabel(question) {
        const parts = [];
        const cell = cellAt(this.data.cells, this.data.selectedBranch);
        if (cell) parts.push(cell.name);
        const focus = this._focusFor(question);
        if (focus.time) parts.push(TIME_LAYER_NAMES[focus.time] || '');
        return parts.length ? `焦点：${parts.join('　·　')}` : '';
    },

    /* ================================================================ *
     * 提问
     * ================================================================ */

    /**
     * 盘面页单击 —— **就当前这一宫发问**。
     *
     * ⚠️ 为什么是「替用户问」而不是「让用户先说话」：
     * 盘面页是用户看到的第一样东西，此刻他手上只有一张陌生的盘，
     * 还不知道该问什么。此时要求他开口 = 第一分钟就卡住。
     * 替用户问一句「这一宫怎么样」，他立刻看到一问一答的样子，
     * 也立刻明白「这东西会跟我说话」。
     *
     * 回答走**数据集原文检索**（项目硬规则：解读正文不许模型凭空生成）。
     *
     * @returns {Promise<void>}
     */
    async _askPalace() {
        const cell = cellAt(this.data.cells, this.data.selectedBranch);
        if (!cell) return;

        /**
         * 示例盘不能问解读 —— 那解读是**别人**的盘，问出来只会误导。
         *
         * ⚠️ 示例盘上单击 = **直接开口**（不是「问这一宫」）：
         * 用户此刻手里只有一张陌生人的盘，他需要的是「说出你的生辰」，
         * 不是「解读这张盘」。示例盘上问解读，等于拿别人的盘回答他，
         * 他还分不清这是不是自己的 —— 这是最不该出错的地方。
         */
        if (this.data.demoLabel) {
            await this._startVoiceQuestion();
            return;
        }

        const question = palaceQuestion(cell.name);
        const dimension = dimensionOfPalace(cell.name);
        /**
         * 解读原文来自**本命盘**的数据集（13 维按本命宫位收录，没有运限版本），
         * 所以必须把「这段话说的是哪一宫」讲清楚 —— 尤其在运限层里，
         * 同一个地支在本命和本层的宫名不是一回事。
         */
        const roleText =
            this.data.layerKey === 'natal' || !this.data.layerRole
                ? ''
                : `　·　本层为${this.data.layerRole}`;

        const turn = createTurn({
            question,
            kind: TURN_KIND.READING,
            focus: `本命${cell.name} · ${dimension ? DIMENSION_LABELS[dimension] : '命盘'}${roleText}`
        });
        this._turns = appendTurn(this._turns, turn, MAX_TURNS);
        this._goChat();
        /**
         * 先念**宫位摘要**（宫名 + 主星），再接解读正文（enqueue）。
         *
         * ⚠️ 为什么不是念问题句：
         * 问题是**我们替用户生成的**，用户没说过，念出来是「自问自答」；
         * 而宫名 + 主星是用户真正需要被告知的上下文 ——
         * 眼镜上他不一定盯着屏，得让他知道自己在问哪一宫。
         */
        speak(`${cell.name}，${speakableStars(cell.majorText)}`);

        const seq = ++this._readingSeq;
        try {
            const text = await this._readingFor(cell, dimension);
            if (seq !== this._readingSeq) return;
            this._settleTurn(turn.id, { answer: text, citation: this._citationLabel || '' });
            /** 接在宫位摘要后面播（enqueue），不打断摘要 */
            speak(text, { replace: false });
        } catch (err) {
            if (seq !== this._readingSeq) return;
            this._settleTurn(turn.id, {
                answer: '这一段暂时没有取到，单击重试。',
                failed: true
            });
        }
    },

    /**
     * 对话页双击 —— **用建议语发问**（不依赖语音识别的兜底路径）。
     *
     * @returns {Promise<void>}
     */
    async _askSuggestion() {
        const list = this.data.suggestions || [];
        if (!list.length) return;
        const question = list[this.data.suggestionIndex] || list[0];
        /** 问完自动轮到下一条，用户连按就是连问 */
        this.setData({
            suggestionIndex: nextSuggestionIndex(list, this.data.suggestionIndex, 1)
        });
        await this._submitAsk(question);
    },

    /**
     * 对话页单击 —— **开口提问**。
     *
     * ⚠️ 走**连续识别**（lib/voice-input.js 的 listenContinuous）：
     * 一次说完一整句，中间不停顿 —— 旧的一次性识别会把长句截断。
     *
     * @returns {Promise<void>}
     */
    async _startVoiceQuestion() {
        if (this._listening) return;
        this._listening = true;
        const seq = ++this._voiceSeq;
        this.setData({ hintLine: this._hintFor(SCREEN.CHAT) });
        this._refreshStatus('在听……请说出你的问题');
        let text = '';
        try {
            /**
             * 看门狗：识别会话**必须**有终点。
             *
             * ⚠️ 为什么不能只靠 listenSession 自己的超时（2026-11-13 实测）：
             * 宿主有可能既不回调 `onend`、也不给结果，
             * 于是 `await` 永远挂着 ⇒ `_listening` 永远是 true
             * ⇒ **这之后的每一次开口都被 `if (this._listening) return;` 挡掉**
             * ⇒ 语音输入在真机上彻底死掉，而且用户没有任何办法恢复。
             * 眼镜上没有键盘，「重开应用」是唯一的出路 —— 不能接受。
             *
             * 所以这里再套一层**硬超时**：超了就算没听到，
             * 状态行回到「没听清，再说一次」，`_listening` 复位，下一次开口照常能用。
             */
            text = await withTimeout(
                listenContinuous({
                    onPartial: (partial) => {
                        /** 会话已经结束就别再改状态行（迟到的回调不许把界面说谎） */
                        if (seq !== this._voiceSeq || !this._listening) return;
                        this._refreshStatus(partial ? `在听：${summarize(partial, 18)}` : '在听……');
                    }
                }),
                VOICE_HARD_TIMEOUT
            );
        } catch (err) {
            /** 超时/异常都当「没听到」，不能把页面卡在「在听……」 */
            text = '';
        } finally {
            /** 只有还是这一轮的时候才复位，别把后来那一轮的锁给拆了 */
            if (seq === this._voiceSeq) this._listening = false;
        }
        if (seq !== this._voiceSeq) return;

        const question = normalizeQuestion(text);
        if (!question) {
            this.setData({ hintLine: this._hintFor(SCREEN.CHAT) });
            this._refreshStatus('没听清，再说一次');
            this._syncChat();
            return;
        }

        /**
         * 说的是不是**生辰**？
         *
         * 「换生辰」没有占手势（盘面页只有 4 个手势，要干的却是 5 件事：
         * 选宫 / 问这宫 / 切层 / 换生辰 / 退出），
         * 所以它走**语音** —— 对话页开口说话，识别到生辰就重排，说的是问题就追问。
         * 这也符合眼镜的形态：说话本来就是这里最自然的输入。
         *
         * ⚠️ 误判风险很低：parseBirthFromSpeech 要求**年 + 月 + 日 + 性别**齐全，
         * 「我今年怎么样」这种问句解析不出来（缺月/日），不会被误当成生辰。
         */
        const birth = parseBirthFromSpeech(text);
        if (birth) {
            this._birth = birth;
            speak('好，重新给你排盘');
            await this._chart(birth);
            return;
        }

        /**
         * 说的是问题 —— 进对话页再问。
         *
         * ⚠️ 盘面页也能开口（示例盘上单击就是听），
         * 所以这里必须自己切屏，不能假设已经在对话页。
         */
        if (this.data.screen !== SCREEN.CHAT) this._goChat();
        await this._submitAsk(question);
    },

    /**
     * 发一轮自由追问（走模型）。
     *
     * @param {string} question
     * @returns {Promise<void>}
     */
    async _submitAsk(question) {
        const q = normalizeQuestion(question);
        if (!q || this._askLoading) return;

        /**
         * 代际令牌：回答最长要等 120s（lib/api.js TIMEOUTS.ask），
         * 等待期间用户可能已取消 —— 迟到的答案不得落地
         * （更不能 speak 给一个已经取消的会话）。
         */
        const seq = ++this._askSeq;
        /** 带上最近几轮问答作上下文，追问才接得上话 */
        const turns = this._askTurns.slice();

        const turn = createTurn({
            question: q,
            kind: TURN_KIND.ASK,
            focus: this._focusLabel(q)
        });
        this._turns = appendTurn(this._turns, turn, MAX_TURNS);
        this._askLoading = true;
        this.setData({ hintLine: this._hintFor(SCREEN.CHAT), chatScrollTop: 0 });
        this._refreshStatus('正在推演……');
        this._syncChat();

        try {
            const res = await requestAsk(this._birth, q, turns, this._focusFor(q));
            if (seq !== this._askSeq) return;
            this._askLoading = false;
            const answer = (res && res.answer) || '这一问暂时没有回答。';
            this._settleTurn(turn.id, {
                answer,
                citation: (res && res.citationModeLabel) || ''
            });
            this._askTurns.push({ question: q, answer });
            if (this._askTurns.length > 3) this._askTurns.shift();
            this._refreshStatus('');
            speak(answer);
        } catch (err) {
            if (seq !== this._askSeq) return;
            this._askLoading = false;
            /**
             * 把失败原因打出来 —— 真机上没有开发者工具，
             * 页面自带的 `[ziwei-agent] …` 日志是**唯一的诊断入口**。
             * DEVICE-CHECKLIST §1.5 T2 就是靠它确认设备到底报了什么。
             */
            console.info(
                '[ziwei-agent] 追问失败：',
                err && err.message ? err.message : String(err)
            );
            this._settleTurn(turn.id, {
                answer: '这一问暂时没有回答，单击重试。',
                failed: true
            });
            this._refreshStatus('');
        }
    },

    /**
     * 取某宫的解读原文（**数据集原文检索**，不是模型生成）。
     *
     * @param {Object} cell
     * @param {string|null} dimension
     * @returns {Promise<string>}
     */
    async _readingFor(cell, dimension) {
        if (this._readingCache) {
            const hit = this._readingCache.find((d) => d.key === dimension);
            if (hit) return hit.text;
        }

        const res = await requestReading(this._birth);
        if (!res || res.status !== 'ok' || !Array.isArray(res.dimensions)) {
            throw new Error((res && res.message) || 'not-covered');
        }
        this._readingCache = res.dimensions;

        /**
         * 引文模式要**在界面上披露** —— 用户得知道当前拿到的文本是什么形态
         * （受限引文是不是被降级过）。这是许可要求，不是装饰。
         */
        this._citationLabel = (res && res.citationModeLabel) || '';

        const hit = res.dimensions.find((d) => d.key === dimension);
        if (hit && hit.text) return hit.text;

        // 该宫没有对应维度时，退到总览
        const fallback = res.dimensions.find((d) => d.key === 'overview');
        return fallback ? fallback.text : '这一段解读暂时没有收录。';
    },

    /* ================================================================ *
     * 屏切换
     * ================================================================ */

    /**
     * 去对话页。
     *
     * @returns {void}
     */
    _goChat() {
        stopSpeaking();
        this.setData({
            screen: SCREEN.CHAT,
            chatScrollTop: 0,
            hintLine: this._hintFor(SCREEN.CHAT)
        });
        this._syncChat();
    },

    /**
     * 回盘面页。
     *
     * @returns {void}
     */
    _goBoard() {
        this._askSeq += 1;
        this._readingSeq += 1;
        this._askLoading = false;
        stopSpeaking();
        this.setData({
            screen: SCREEN.BOARD,
            hintLine: this._hintFor(SCREEN.BOARD)
        });
        this._refreshStatus();
        this._syncChat();
    },

    /* ================================================================ *
     * 滚动
     * ================================================================ */

    /**
     * 会话流翻页。
     *
     * @param {number} delta -1 往上 / +1 往下
     */
    _scrollChat(delta) {
        const next = Math.max(0, this.data.chatScrollTop + delta * SCROLL_STEP_PX);
        this.setData({ chatScrollTop: next });
    },

    /* ================================================================ *
     * 传感器
     * ================================================================ */

    _startSensors() {
        if (this._sensorMode !== 'none') return;

        try {
            const sensor = new AbsoluteOrientationSensor({ frequency: SENSOR.FREQUENCY });
            this._orient = sensor;
            this._orientGotFrame = false;

            sensor.addEventListener('reading', () => {
                this._orientGotFrame = true;
                /** 对话页开着时转头不得在会话背后换宫 */
                if (this.data.screen !== SCREEN.BOARD) return;
                const q = sensor.quaternion;
                if (!q) return;
                const res = updateCursor(this._cursor, q);
                this._cursor = res.state;
                if (res.changed) this._select(res.branch);
            });

            sensor.addEventListener('error', () => {
                this._fallbackToTilt();
            });

            sensor.start();

            // 宿主可能没开绝对方向能力（文档明确提示要显式 enable）：
            // 首帧超时即认定不可用，落到加速度计通道。
            this._orientTimer = setTimeout(() => {
                if (!this._orientGotFrame) this._fallbackToTilt();
            }, SENSOR.FIRST_FRAME_TIMEOUT_MS);

            this._sensorMode = 'cursor';
            this.setData({
                sensorLabel: '头部准星'
            });
            this._refreshStatus();
        } catch (err) {
            this._fallbackToTilt();
        }
    },

    _fallbackToTilt() {
        if (this._sensorMode === 'tilt') return;
        this._sensorMode = 'tilt';
        this.setData({
            sensorLabel: '抬头选宫'
        });
        this._refreshStatus();

        try {
            const sensor = new Accelerometer({ frequency: SENSOR.FREQUENCY });
            this._accel = sensor;
            sensor.addEventListener('reading', () => {
                /** 对话页开着时抬头低头不得在会话背后换宫 */
                if (this.data.screen !== SCREEN.BOARD) return;
                const res = updateTilt(this._tilt, {
                    x: sensor.x,
                    y: sensor.y,
                    z: sensor.z
                });
                this._tilt = res.state;
                /**
                 * 抬头/低头 = **选宫**（沿盘面外圈走一宫）。
                 *
                 * ⚠️ 用 `res.direction`（±1）走 `stepRing`，
                 * 不能直接用 `res.branch` —— 那是倾斜自己的计数器，
                 * 与当前选中的宫无关。
                 */
                if (res.changed) this._stepPalace(res.direction);
            });
            sensor.start();
        } catch (err) {
            this._sensorMode = 'none';
            this.setData({
                sensorLabel: '镜腿选宫'
            });
            this._refreshStatus();
        }
    },

    _stopSensors() {
        if (this._orientTimer) {
            clearTimeout(this._orientTimer);
            this._orientTimer = null;
        }
        try {
            if (this._orient) this._orient.stop();
        } catch (err) {
            /* ignore */
        }
        try {
            if (this._accel) this._accel.stop();
        } catch (err) {
            /* ignore */
        }
        this._orient = null;
        this._accel = null;
        /**
         * 复位通道状态 —— 否则 onVoiceWakeup 的「none 才重启」判断
         * 永远为假，传感器停过一次就再也起不来。
         */
        this._sensorMode = 'none';
    },

    /* ================================================================ *
     * 选宫
     * ================================================================ */

    /**
     * 沿盘面外圈走一宫。
     *
     * 十二宫按「巳午未申酉戌亥子丑寅卯辰」排布（见 `lib/chart-layout.js`），
     * `stepRing(branch, ±1)` 就是相邻宫 —— 与抬头低头的方向一致。
     *
     * @param {number} delta -1 上一宫 / +1 下一宫
     */
    _stepPalace(delta) {
        this._select(stepRing(this.data.selectedBranch, delta));
    },

    _select(branch) {
        if (branch === this.data.selectedBranch) return;
        const cells = markActive(this.data.cells, branch);
        const cell = cellAt(cells, branch);
        this.setData({
            cells,
            selectedBranch: branch,
            selectedName: cell ? cell.name : ''
        });
        /**
         * 滑动 / 转头选宫要有声音反馈：眼镜上用户不一定盯着屏，
         * 不报宫名就是「盲滑」。tts 模块头注释就要求每步操作出声，
         * 之前这里是哑的。
         */
        if (cell) speak(cell.name);
        this._syncChat();
    },

    /* ================================================================ *
     * 语音录入生辰
     * ================================================================ */

    /**
     * 打开生辰录入页 —— **盘面页双击**（换生辰）的入口。
     */
    _openInput() {
        /** 新一次录入，作废旧识别的迟到结果，停掉可能还在念的播报 */
        this._voiceSeq += 1;
        /**
         * ⚠️ 必须同时解掉「正在听」那把锁：
         * `_voiceSeq` 作废了旧会话，但 `_listening` 还是 true 的话，
         * 这一页上再开口说话会被 `if (this._listening) return;` 直接挡掉 ——
         * 用户在这个页面上唯一能做的事就是说话，挡掉就等于页面死了。
         */
        this._listening = false;
        cancelListen();
        stopSpeaking();
        this.setData({
            screen: SCREEN.INPUT,
            needInput: true,
            heardText: '',
            errorText: '',
            voiceHint: '说出你的生辰：哪年哪月哪日、大概几点、男或女',
            inputHint: this._chartJson
                ? '单击开始识别　返回键回盘面'
                : '单击开始识别　返回键退出',
            hintLine: this._hintFor(SCREEN.INPUT)
        });
    },

    /**
     * 生辰录入页的返回键。
     *
     * 分两种情况：
     *   · **已经有盘**（`_chartJson` 有值）→ 回到盘面，这是「取消这次重录」；
     *   · **还没有盘**（首次启动必须录入，语音解析失败）→ 才退出应用。
     *
     * 判据用 `_chartJson` 而不是 `data.ready`：`ready` 在排盘失败的分支里
     * 也会被置成 true，拿它当「有没有盘」的判据会把用户留在一个空屏上。
     */
    _closeInput() {
        /**
         * 作废正在进行的语音识别 —— 否则用户按返回键取消了，
         * listenOnce 的迟到 resolve 仍会把这次生辰排成盘。
         * cancelListen 尽力把设备上的识别也停掉（麦克风别对着空气收音）。
         */
        this._voiceSeq += 1;
        this._listening = false;
        cancelListen();
        if (this._chartJson) {
            this.setData({
                screen: SCREEN.BOARD,
                needInput: false,
                heardText: '',
                errorText: '',
                voiceHint: '说出你的生辰：哪年哪月哪日、大概几点、男或女',
                hintLine: this._hintFor(SCREEN.BOARD)
            });
            this._syncChat();
            return;
        }
        this.finish();
    },

    async _startVoiceInput() {
        /** 防重入：识别中再按单击不重复触发 */
        if (this._listening) return;
        this._listening = true;
        /**
         * 代际令牌：识别等待期间用户可能按返回键取消（_closeInput）
         * 或重新打开录入 —— 迟到的识别结果不得再触发排盘。
         */
        const seq = this._voiceSeq;
        this.setData({ voiceHint: '在听……请说出你的生辰', heardText: '' });
        /**
         * ⚠️ 连续识别：生辰是「1990年1月1日早上男」这种**多个信息位**的话，
         * 一次性识别会把后半句截断（社区实战踩过的坑）。
         */
        let text = '';
        try {
            /** 同样的看门狗：识别必须有终点，否则这一页上的说话功能会死掉 */
            text = await withTimeout(
                listenOnce({
                    onPartial: (partial) => {
                        if (seq !== this._voiceSeq || !this._listening) return;
                        this.setData({ voiceHint: '在听……', heardText: partial });
                    }
                }),
                VOICE_HARD_TIMEOUT
            );
        } catch (err) {
            text = '';
        } finally {
            if (seq === this._voiceSeq) this._listening = false;
        }
        if (seq !== this._voiceSeq) return;
        if (!text) {
            this.setData({ voiceHint: '没听清，再说一次：1990年1月1日 早上 男' });
            return;
        }

        this.setData({ heardText: text });

        const birth = parseBirthFromSpeech(text);
        if (!birth) {
            this.setData({ voiceHint: '没听清出生日期，再说一次：1990年1月1日 早上 男' });
            return;
        }

        /**
         * 语音反馈。
         *
         * 眼镜上没有屏幕回看，识别结果**必须念出来**才算确认 ——
         * 用户需要知道自己听成了什么，尤其是时辰被估算的时候。
         */
        if (birth.hourEstimated) {
            this.setData({ voiceHint: '已识别，时辰按午时估算，正在排盘' });
            speak('已识别，时辰未指定，按午时估算，正在排盘');
        } else {
            this.setData({ voiceHint: '已识别，正在排盘' });
            speak('已识别，正在排盘');
        }
        this._birth = birth;
        this._chart(birth);
    }
};
</script>

<page>
    <view class="board" ink:if="{{screen === 'board'}}">
        <view ink:for="{{cells}}" ink:key="branch" class="cell p{{item.branch}} {{item.activeClass}}">
            <view class="cell-head">
                <view class="head-left">
                    <text class="palace-name">{{item.name}}</text>
                    <text class="fortune-name" ink:if="{{item.fortuneShort}}">{{item.fortuneShort}}</text>
                </view>
                <text class="gan-zhi">{{item.stemName}}{{item.branchName}}</text>
            </view>
            <text class="major">{{item.majorText}}</text>
            <text class="minor">{{item.minorText}}</text>
        </view>

        <view class="center">
            <view class="center-top">
                <text class="focus-line">{{focusLine}}</text>
                <text class="focus-detail" ink:if="{{focusDetail}}">{{focusDetail}}</text>
            </view>

            <view class="center-divider"></view>

            <view class="center-mid">
                <text class="digest-q" ink:if="{{digestQuestion}}">{{digestQuestion}}</text>
                <text class="digest-a" ink:if="{{digestAnswer}}">{{digestAnswer}}</text>
                <text class="digest-lead" ink:if="{{!digestQuestion}}">{{digestLead}}</text>
                <text class="center-suggest" ink:if="{{!digestQuestion && suggestionText}}">试试问：{{suggestionText}}</text>
            </view>

            <view class="center-bottom">
                <text class="center-hint demo" ink:if="{{noticeLabel}}">{{noticeLabel}}</text>
                <text class="center-hint">{{hintLine}}</text>
                <text class="center-hint dim" ink:if="{{statusLine}}">{{statusLine}}</text>
            </view>
        </view>
    </view>

    <view class="chat" ink:if="{{screen === 'chat'}}">
        <view class="strip">
            <view class="strip-head">
                <text class="strip-title">{{layerTitle}}</text>
                <text class="strip-focus">{{selectedName}}</text>
            </view>
            <view class="strip-row">
                <text class="strip-cell {{item.activeClass}}" ink:for="{{stripCells}}" ink:key="branch">{{item.short}}</text>
            </view>
        </view>

        <scroll-view class="chat-scroll" scroll-y="{{true}}" scroll-top="{{chatScrollTop}}">
            <view class="row" ink:for="{{chatRows}}" ink:key="id">
                <text class="{{item.cls}}">{{item.text}}</text>
            </view>

            <view class="chat-empty" ink:if="{{chatEmpty}}">
                <text class="chat-empty-title">{{chatEmptyTitle}}</text>
                <text class="chat-empty-sub">单击镜腿开口问　双击直接问建议语</text>
                <text class="chat-empty-format">说生辰：1990年1月1日 早上 男</text>
                <view class="chat-sug" ink:for="{{suggestions}}" ink:key="*this">
                    <text class="chat-sug-item">{{item}}</text>
                </view>
            </view>
        </scroll-view>

        <view class="chat-foot">
            <text class="foot-hint">{{hintLine}}</text>
            <text class="foot-status" ink:if="{{footStatus}}">{{footStatus}}</text>
        </view>
    </view>

    <view class="overlay" ink:if="{{screen === 'input'}}">
        <text class="overlay-title">说出你的生辰</text>
        <text class="overlay-body">{{voiceHint}}</text>
        <text class="overlay-body strong" ink:if="{{heardText}}">{{heardText}}</text>
        <text class="overlay-body dim">格式：1990年1月1日 早上 男　不知道时辰就说「不知道时辰」</text>
        <text class="overlay-body error" ink:if="{{errorText}}">{{errorText}}</text>
        <text class="overlay-hint">{{hintLine}}</text>
    </view>
</page>

<style>
page {
    width: 480px;
    height: 352px;
    background-color: #000000;
}

/*
 * 颜色与字体挂在**根 view 的 class** 上，不挂 `page {}`。
 *
 * 原因：AIUI 的 WXSS 元素选择器文档只列了 view / text / image 等**组件**类型，
 * 没有列 `page`；官方三个样例（gyroscope-test / cut-card / tts）也**没有一个**
 * 用 `page {}`，全部把 background / color / font-family 写在根 view 的 class 上。
 *
 * 代价很致命：单色绿屏是黑底，若 color 继承不上，
 * 所有没显式写 color 的文字（宫名、中宫标题、正文）会变成**黑字黑底 = 整屏隐形**。
 * 颜色必须自己有落点，不能指望继承。
 *
 * 主色用官方绿主题的 #40FF5E（不是自选的 #00ff66）；
 * 层级靠**四档亮度**区分（100% / 60% / 40%），不靠换色相。
 */
.board {
    position: relative;
    width: 480px;
    height: 352px;
    overflow: hidden;
    background-color: #000000;
    color: #40FF5E;
    font-family: monospace;
}

.cell {
    position: absolute;
    width: 120px;
    height: 88px;
    box-sizing: border-box;
    padding: 4px 5px;
    overflow: hidden;
    border-right: 1px solid #174526;
    border-bottom: 1px solid #174526;
}

.cell-head {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    height: 15px;
}

/* 本命宫名 + 运限宫名小标并排 */
.head-left {
    display: flex;
    flex-direction: row;
    align-items: center;
}

.palace-name {
    font-size: 13px;
    line-height: 15px;
    font-weight: bold;
}

/*
 * 运限宫名小标（只在运限层出现，且与本命宫名相同时不显示）。
 *
 * 字号压到 10px、颜色用次级绿：它是**补充信息**，
 * 不能抢本命宫名的视觉权重，也不能让 120px 宽的格子溢出。
 */
.fortune-name {
    font-size: 10px;
    line-height: 15px;
    color: #269938;
    margin-left: 2px;
}

.gan-zhi {
    font-size: 9px;
    line-height: 15px;
    color: #269938;
}

.major {
    display: block;
    font-size: 12px;
    line-height: 15px;
    color: #40FF5E;
    max-height: 30px;
    overflow: hidden;
}

.minor {
    display: block;
    font-size: 9px;
    line-height: 11px;
    color: #269938;
    max-height: 11px;
    overflow: hidden;
}

.cell.on {
    border: 2px solid #40FF5E;
    padding: 3px 4px;
}

.cell.on .palace-name {
    text-decoration: underline;
}

/* 十二宫网格：4×4 四四方阵，中宫留空（与 Web 端 GRID_POS 完全一致） */
.p0 { left: 240px; top: 264px; }
.p1 { left: 120px; top: 264px; }
.p2 { left: 0px; top: 264px; }
.p3 { left: 0px; top: 176px; }
.p4 { left: 0px; top: 88px; }
.p5 { left: 0px; top: 0px; }
.p6 { left: 120px; top: 0px; }
.p7 { left: 240px; top: 0px; }
.p8 { left: 360px; top: 0px; }
.p9 { left: 360px; top: 88px; }
.p10 { left: 360px; top: 176px; }
.p11 { left: 360px; top: 264px; }

/*
 * 中宫 = **常驻对话区**。
 *
 * ⚠️ 这里原来是「命主/身主/阴阳男女/农历/四化」的静态数据区，
 * 整屏没有任何「对话」的痕迹 —— 用户看到的是一张盘，不是一个能问的东西。
 * 现在中宫的第一行是**焦点**（哪一宫、哪一层），下面就是**最近一问一答**。
 * 十二宫的网格一点没动（这是产品辨识度），对话区正好落在四四方阵中间那个洞上。
 */
.center {
    position: absolute;
    left: 120px;
    top: 88px;
    width: 240px;
    height: 176px;
    box-sizing: border-box;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
}

/*
 * 中宫分三块：**焦点 / 对话 / 底部提示**。
 *
 * ⚠️ 为什么中间那块要 flex:1：
 * 之前所有行都堆在顶部（justify-content 默认 flex-start），
 * 中宫下面空出 40% 的高度，整块看起来「什么都没发生」。
 * 让对话块撑开、底部提示块沉底，三块各就各位 ——
 * 空白是留白，不是漏排。
 *
 * ⚠️ 为什么三块都要显式 `display:flex; flex-direction:column`：
 * `<text>` 在 ink 里默认是**行内**元素。一旦把几个 text 包进一个 view，
 * 它们就会**串成一行**（「命宫 本命盘 命主巨门 身主天机」糊成一片）。
 * 每一块自己开一个纵向 flex，行与行才真正分开。
 */
.center-top {
    flex: none;
    display: flex;
    flex-direction: column;
}

.center-mid {
    flex: 1;
    display: flex;
    flex-direction: column;
}

.center-bottom {
    flex: none;
    display: flex;
    flex-direction: column;
}

/* 焦点行：当前宫 + 当前时间层 */
.focus-line {
    display: block;
    font-size: 15px;
    line-height: 20px;
    font-weight: bold;
}

/* 焦点详情行：命主身主（本命层）/ 本层落位与四化（运限层） */
.focus-detail {
    display: block;
    font-size: 10px;
    line-height: 13px;
    color: #269938;
}

.center-divider {
    height: 1px;
    background-color: #174526;
    margin: 5px 0;
}

/* 最近一问：60% 亮度（是「用户说的」，不是主角） */
.digest-q {
    display: block;
    font-size: 12px;
    line-height: 17px;
    color: #269938;
}

/* 最近一答：100% 亮度（这是主角） */
.digest-a {
    display: block;
    font-size: 12px;
    line-height: 17px;
    color: #40FF5E;
    max-height: 51px;
    overflow: hidden;
}

/* 还没有对话时的引导语 */
.digest-lead {
    display: block;
    font-size: 12px;
    line-height: 17px;
    color: #269938;
}

/* 空态下再给一句「试试问」—— 让用户第一眼就知道这东西能问 */
.center-suggest {
    display: block;
    font-size: 12px;
    line-height: 17px;
    color: #40FF5E;
}

.center-hint {
    display: block;
    font-size: 10px;
    line-height: 13px;
    color: #269938;
}

/*
 * 末行（端侧计算 / 服务端计算）。
 *
 * 原来用的是 #174526（深绿）——对比度只有 2.1:1，在单色绿 HUD 上几乎看不见，
 * 而「端侧计算」恰恰是最该让评审看到的一行。
 * 层级靠字号（10px，比正文小）区分，不靠把字调暗。
 */
.center-hint.dim {
    color: #269938;
}

/*
 * 示例盘标注。
 *
 * 「这不是你的盘」这一行必须**比正文更亮**，不能调暗 —— 用户第一眼看到的是
 * 一张陌生人的盘，如果这行很淡，误读成「算错了」的代价很大。
 */
.center-hint.demo {
    color: #7fe3a0;
}

/*
 * ================= 对话页 =================
 *
 * 之前没有「对话页」—— 只有两个整屏替换的浮窗（解读 / 追问），
 * 用户看到的是文档，不是对话。现在是：
 *   顶部 56px 盘面缩略带（保住上下文）+ 会话流 + 页脚提示。
 */
.chat {
    position: absolute;
    left: 0;
    top: 0;
    width: 480px;
    height: 352px;
    box-sizing: border-box;
    background-color: #000000;
    color: #40FF5E;
    font-family: monospace;
    display: flex;
    flex-direction: column;
}

.strip {
    height: 56px;
    padding: 6px 8px;
    box-sizing: border-box;
    border-bottom: 1px solid #174526;
}

.strip-head {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    height: 16px;
}

.strip-title {
    font-size: 12px;
    line-height: 16px;
    font-weight: bold;
}

.strip-focus {
    font-size: 11px;
    line-height: 16px;
    color: #269938;
}

.strip-row {
    display: flex;
    flex-direction: row;
    height: 20px;
    margin-top: 4px;
}

.strip-cell {
    width: 38px;
    font-size: 11px;
    line-height: 18px;
    text-align: center;
    color: #269938;
}

.strip-cell.on {
    color: #40FF5E;
    font-weight: bold;
}

.chat-scroll {
    flex: 1;
    padding: 8px 12px;
}

/*
 * 一行 = 一个 <view>，里面一个 <text>。
 *
 * ⚠️ 为什么每行都要包一层 view：
 * ink 里 `<text>` 默认是**行内**元素，直接并排会串成一行。
 * 一行一个 view（纵向 flex）才真正一行一行往下排。
 */
.row {
    display: flex;
    flex-direction: column;
}

/*
 * 轮次标注行（出处 + 焦点 + 引文模式）。
 *
 * ⚠️ 为什么提到正文**前面**：
 * 原来它在正文后面 —— 用户要先读完 1400 字才知道这段在讲哪一宫、
 * 是不是降级引文。引文模式是**必须披露**的合规信息，更不该压在最后。
 * 字号也从 9px 提到 11px：9px 在 480×352 的绿屏上基本读不出来。
 */
.turn-tag {
    font-size: 11px;
    line-height: 15px;
    color: #269938;
    margin-bottom: 3px;
}

/* 最新一轮在最上面，不额外留上边距 */
.turn-tag.newest {
    margin-top: 0;
}

/* 更早的一轮：和上一轮拉开距离 */
.turn-tag.sep {
    margin-top: 12px;
}

/* 用户问的那一句：60% 亮度（是「用户说的」，不是主角） */
.turn-q {
    display: block;
    font-size: 12px;
    line-height: 17px;
    color: #269938;
    margin-bottom: 5px;
}

/*
 * 小标题（`【命格总览】` 这种）：100% 亮度 + 加粗。
 *
 * ⚠️ 单色绿屏没有颜色可分，层级只能靠**字重**和**段距**拉开。
 */
.turn-h {
    display: block;
    font-size: 13px;
    line-height: 19px;
    font-weight: bold;
    color: #40FF5E;
    margin-top: 8px;
    margin-bottom: 2px;
}

/* 正文段：100% 亮度 */
.turn-p {
    display: block;
    font-size: 13px;
    line-height: 19px;
    color: #40FF5E;
    margin-bottom: 7px;
}

/* 列表项（推导条目）：比正文段略紧 */
.turn-li {
    display: block;
    font-size: 13px;
    line-height: 19px;
    color: #40FF5E;
    margin-bottom: 3px;
}

.turn-p.loading {
    color: #269938;
}

.turn-p.failed {
    color: #7fe3a0;
}

.chat-empty {
    margin-top: 4px;
}

.chat-empty-title {
    display: block;
    font-size: 13px;
    line-height: 19px;
    font-weight: bold;
}

.chat-empty-sub {
    display: block;
    font-size: 11px;
    line-height: 16px;
    color: #269938;
    margin-top: 2px;
}

/* 换生辰的格式提示 —— 用户得知道「怎么说」才说得出 */
.chat-empty-format {
    display: block;
    font-size: 11px;
    line-height: 16px;
    color: #269938;
    margin-top: 6px;
}

.chat-sug {
    margin-top: 8px;
}

.chat-sug-item {
    display: block;
    font-size: 12px;
    line-height: 18px;
    color: #269938;
}

.chat-foot {
    height: 40px;
    padding: 4px 12px 6px;
    box-sizing: border-box;
    border-top: 1px solid #174526;
}

.foot-hint {
    display: block;
    font-size: 10px;
    line-height: 14px;
    color: #269938;
}

.foot-status {
    display: block;
    font-size: 10px;
    line-height: 13px;
    color: #269938;
}

/* ================= 生辰录入页 ================= */
.overlay {
    position: absolute;
    left: 0;
    top: 0;
    width: 480px;
    height: 352px;
    box-sizing: border-box;
    padding: 14px 16px;
    background-color: #000000;
    color: #40FF5E;
    font-family: monospace;
    display: flex;
    flex-direction: column;
}

.overlay-title {
    font-size: 18px;
    line-height: 24px;
    font-weight: bold;
    margin-bottom: 6px;
}

.overlay-body {
    font-size: 13px;
    line-height: 19px;
    margin-bottom: 4px;
}

.overlay-body.strong {
    font-size: 15px;
    line-height: 21px;
    font-weight: bold;
}

.overlay-body.dim {
    color: #269938;
    font-size: 11px;
}

.overlay-body.error {
    color: #7fe3a0;
    font-size: 11px;
}

.overlay-hint {
    position: absolute;
    left: 16px;
    bottom: 12px;
    font-size: 10px;
    line-height: 14px;
    color: #269938;
}
</style>
