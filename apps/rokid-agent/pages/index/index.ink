<script def>
{
    "navigationBarTitleText": "紫微星盘",
    "description": "展示紫微斗数十二宫命盘：宫位、主星与四化，可切换本命、大限、流年、流月四层运限。镜腿滑动选宫（也可用准星或抬头低头），单击听该宫解读，双击切时间层，也可以基于这张盘追问。",
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
} from '../../lib/chart-layout.js';
import {
    createCursorState,
    updateCursor,
    createTiltState,
    updateTilt,
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
    nextLayerKey,
} from '../../lib/time-layer.js';
import { resolveChart } from '../../lib/chart-source.js';
import { requestReading, requestAsk } from '../../lib/api.js';
import { latestProfile, upsertProfile } from '../../lib/storage.js';
import { resolveInitialBirth } from '../../lib/birth-source.js';
import { speak, stopSpeaking } from '../../lib/tts.js';
import { parseBirthFromSpeech } from '../../lib/birth-parser.js';
import { listenOnce } from '../../lib/voice-input.js';

/**
 * 传感器采样频率（Hz）与首帧超时
 */
const SENSOR = Object.freeze({
    FREQUENCY: 30,
    FIRST_FRAME_TIMEOUT_MS: 1500
});

/**
 * 解读/追问长文本的滚动步长（像素）。
 *
 * 为什么自己管滚动：宿主给方向键的默认行为是「滚动根视图」，
 * 而根视图是固定 480×352 + overflow:hidden，滚不动；
 * 页面接管方向键之后（preventDefault），scroll-view 更不会被宿主带动。
 * 长文本不自己翻页，用户就永远读不完一整段解读。
 */
const SCROLL_STEP_PX = 60;

/** 快捷问题（语音不可用时的兜底，也保证演示路径是确定的） */
const PRESET_QUESTIONS = Object.freeze([
    '今年这一层盘面有什么变化',
    '我的性格特点是什么',
    '事业上什么时候适合变动',
    '和伴侣的相处要注意什么'
]);

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
        overlay: '',
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
        /** 中宫第 2 行：本命层=阴阳男女·五行局；运限层=本层命宫落位 */
        layerSub: '',
        /** 中宫第 3 行：本命层=农历日期；运限层=本层四化 */
        layerExtra: '',
        /** 选中宫在本层的宫名（运限层才有） */
        layerRole: '',
        /** 运限层是否可用（端侧引擎没加载时不可用） */
        layersReady: false,
        /** 键位提示（随能力变）；引擎就绪前用最保守的一档，见 _navHint() */
        navHint: '滑动选宫　单击听解读',
        sourceLabel: '',
        sensorLabel: '',
        /** 中宫状态行（传感器通道 + 计算来源），见 _statusLine() */
        statusLine: '',
        /**
         * 最近一次输入的**原始键值**（例：`ArrowLeft`、`GlobalHook`、`Enter`）。
         *
         * 为什么把它显示出来：真机上报的到底是 `code` 还是 `key`、
         * 镜腿点按是不是只有 `GlobalHook` —— 这些**源码里读不出来**，
         * 只有真机能回答（DEVICE-CHECKLIST §1.5 T2）。
         * 显示原始值，上机第一分钟就能看到答案，不用靠猜。
         */
        lastInput: '',
        /** 解读原文的滚动位置（scroll-view 的 scroll-top 绑定） */
        readingScrollTop: 0,
        /** 追问答案的滚动位置（scroll-view 的 scroll-top 绑定） */
        askScrollTop: 0,
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
        /**
         * 中宫最后一行（示例盘 / 时辰估算）的合并文案。
         *
         * ⚠️ 中宫高度是死的（176px，padding 8px → 内容区 160px），
         * 现有几行**已经排满**，再加一行就会压到下排宫位上。
         * 所以两类提示合并成一行显示。
         */
        noticeLabel: '',
        voiceHint: '说出你的生辰：哪年哪月哪日、大概几点、男或女',
        /** 录入浮层的键位提示（返回键语义随「有没有盘」变） */
        inputHint: '单击开始识别　返回键退出',
        heardText: '',
        readingTitle: '',
        readingDimension: '',
        readingText: '',
        readingLoading: false,
        /** 当前引文降级模式（由服务端下发，界面必须披露） */
        readingCitation: '',
        askQuestion: '',
        askAnswer: '',
        askLoading: false,
        askCitation: '',
        /** 追问焦点（宫位 + 时间层），要让用户看得见自己在问哪一块 */
        askFocus: '',
        presets: PRESET_QUESTIONS,
        errorText: ''
    },

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
                 *
                 * 补一条日志：真机上「点一下没反应」到底是
                 * 「延迟确认没触发」还是「触发了但页面没响应」，
                 * 看这条日志就能分开。
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
        /** 追问代际令牌：浮层关闭后，迟到的答案不得落地 */
        this._askSeq = 0;
        /** 是否正在识别中（防重复触发） */
        this._listening = false;
        /** 追问上下文（最近几轮问答），换盘时清空 */
        this._askTurns = [];
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
        /** 作废一切挂起的语音识别 / 追问响应 */
        this._voiceSeq += 1;
        this._askSeq += 1;
        stopSpeaking();
    },

    onVoiceWakeup(event) {
        // 唤醒即回到盘面，避免用户停在别的浮层
        if (this.data.overlay && this.data.overlay !== 'input') {
            this._closeOverlay();
        }
        if (!this._sensorMode || this._sensorMode === 'none') {
            this._startSensors();
        }
    },

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
     *   · `Backspace` → 返回上一页或请求关闭应用
     *   · `ArrowUp` / `ArrowDown` → 滚动根视图
     *   · `Enter` → 进入导航模式或激活当前目标
     *
     * 之前这段代码把 `preventDefault()` 放在函数**末尾**，
     * 而且解读/追问/录入三个浮层分支都提前 `return` 了 —— 于是：
     *   · 在解读或追问浮层按返回键 → 浮层关了，**应用也一起退了**；
     *   · 在浮层按确认键 → 同时**进入宿主导航模式**，
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
            this.setData({ lastInput: short, statusLine: this._statusLine(undefined, short) });
        }

        const emitted = this._input.feed(action, phase);

        /**
         * **真机日志自证**：把「设备报了什么 → 归一化成什么 → 最终执行了什么」打全。
         *
         * 为什么要打这一行：样机到手之前，真机的键值/时序全靠推断；
         * 有了这行日志，上机连着 logcat 一看就知道
         * 设备到底报的是 `code` 还是 `key`、方向键是一对还是只有一个、
         * `GlobalHook` 与补发的 `Enter` 差多少毫秒。
         *
         * `（吸收）` 表示这一次被契约层吃掉了（配对键、回声、冷却）——
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
     * | 手势 | 真机键值 | 盘面态 | 解读浮层 | 追问浮层 |
     * |---|---|---|---|---|
     * | 前滑 | `ArrowRight`+`ArrowDown` | 下一宫 | 往下翻 | 往下翻 |
     * | 后滑 | `ArrowLeft`+`ArrowUp` | 上一宫 | 往上翻 | 往上翻 |
     * | 单击 | `GlobalHook`→`Enter` | 打开解读 | 打开追问 | 发送追问 |
     * | 双击 | `GlobalHook`×2→`Backspace` | 切时间层 | 关闭浮层 | 换预设问题 |
     * | 返回 | 裸 `Backspace` | 重新说生辰 | 关闭浮层 | 关闭浮层 |
     *
     * ⚠️ **为什么四个方向键一律同义**：
     * 真机一次滑动发的是**一对**方向键（前滑 `Right`+`Down`，后滑 `Left`+`Up`），
     * 上下键从来不是独立手势 —— 只是配对键。
     * 所以「上下切层、左右选宫」那套旧映射在真机上等于
     * **一次滑动同时触发两个动作域**（切宫 + 切层），
     * 表现就是评审说的「arrow 滑动事件问题 / 焦点切换问题 / 无法切换」。
     *
     * ⚠️ **为什么上下键的方向也是同义的**：
     * 真机一次滑动里两个键的**到达顺序不保证**，
     * 只有「`Left`/`Up` 一律上一档、`Right`/`Down` 一律下一档」才与顺序无关。
     *
     * @param {string} action
     */
    _dispatchKey(action) {
        const overlay = this.data.overlay;

        if (overlay === 'input') {
            if (action === ACTION.CONFIRM) this._startVoiceInput();
            else if (action === ACTION.BACK) this._closeInput();
            /**
             * 双击在录入浮层**没有动作**：
             * 这一层只有「开始识别」和「取消重录」两件事，
             * 双击（换一个）在这里没有可换的东西。
             */
            return;
        }

        if (overlay === 'reading') {
            if (action === ACTION.BACK || action === ACTION.DOUBLE) this._closeOverlay();
            else if (action === ACTION.CONFIRM) this._openAsk();
            /**
             * 解读浮层：四个方向键一律翻页。
             * 长解读必须读得完 —— 宿主的方向键默认只滚根视图（固定 480×352，滚不动），
             * 所以滚动由页面自己管（`scroll-top` 绑定）。
             */
            else if (isDirectionAction(action)) {
                this._scrollReading(isPrevDirection(action) ? -1 : 1);
            }
            return;
        }

        if (overlay === 'ask') {
            if (action === ACTION.BACK) this._closeOverlay();
            /**
             * 追问浮层：双击 = **换预设问题**。
             *
             * 为什么不是「翻答案」：真机上只剩一条方向轴（滑动），
             * 而答案是长文本 —— 必须让给滑动去翻。
             * 换问题就交给双击（语义上「换一个」）。
             */
            else if (action === ACTION.DOUBLE) this._cyclePreset(1);
            else if (action === ACTION.CONFIRM) this._submitAsk(this.data.askQuestion);
            else if (isDirectionAction(action)) {
                this._scrollAsk(isPrevDirection(action) ? -1 : 1);
            }
            return;
        }

        /**
         * 盘面态：**四个方向键一律选宫**。
         *
         * 理由见上面的表格 —— 真机上下键只是滑动的配对键，不是独立手势。
         */
        if (action === ACTION.LEFT || action === ACTION.UP) {
            this._stepPalace(-1);
        } else if (action === ACTION.RIGHT || action === ACTION.DOWN) {
            this._stepPalace(1);
        } else if (action === ACTION.CONFIRM) this._openReading();
        /**
         * **双击 = 切时间层**。
         *
         * 为什么不给方向键：方向键整条让给选宫了（真机只有一维手势）。
         * 为什么不给倾斜通道：倾斜通道是**准星不可用时的兜底**，职责是选宫。
         * 双击是唯一「镜腿 + 真机可测 + 模拟器可测」的独立手势，
         * 拿它做「换一层」最稳（同一族项目（言值）也是这个用法）。
         */
        else if (action === ACTION.DOUBLE) this._cycleLayer(1);
        /**
         * 返回键 = 回到上一步 = 重新说生辰（再按一次返回键才退出应用）。
         *
         * 之前这里直接 `this.finish()`，于是**盘面态没有任何入口能重新说生辰**：
         * 语音录入只在「还没排出盘」时可达，一旦语音失败一次，用户就被锁死在
         * 第一张盘上，只能退出重开。
         */
        else if (action === ACTION.BACK) this._openInput();
    },

    /* ---------------------------------------------------------------- *
     * 排盘
     * ---------------------------------------------------------------- */

    /**
     * 出生参数解析已抽到 lib/birth-source.js（resolveInitialBirth）。
     * 抽出来是为了能被单测直接跑 —— 页面模板里的方法在 node 里测不了。
     */

    async _chart(birth, opts = {}) {
        const demo = opts.demo === true;
        /**
         * 换盘必清：解读缓存、引文标注、追问上下文都是**上一张盘**的，
         * 不清掉用户会读到旧人的解读（缓存按维度命中，新盘照中）。
         */
        this._readingCache = null;
        this._citationLabel = '';
        this._askTurns = [];
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
             * 中宫最后一行：示例盘标注 + 时辰估算标注（合并成一行，见 data.noticeLabel）。
             */
            const hourNote = !demo && birth && birth.hourEstimated ? '时辰按午时估算' : '';
            const demoLabel = demo ? '示例盘　返回键换成你的生辰' : '';
            const noticeLabel = [demoLabel, hourNote].filter(Boolean).join('　');

            console.info(
                '[ziwei-agent] 盘面来源=' + result.source +
                ' 运限层可用=' + this._layersReady +
                ' 示例盘=' + demo +
                ' 时辰估算=' + hourNote,
            );

            this.setData({
                ready: true,
                needInput: false,
                /**
                 * 关掉生辰录入浮层。
                 *
                 * ⚠️ 这里以前**漏了**，后果是：用户说完生辰 → 解析成功 → 排盘成功，
                 * 但录入浮层还盖在盘面上；而浮层态下按返回键是 `this.finish()`（退出应用），
                 * 于是用户**永远看不到自己刚排出来的盘**，只能退出重开。
                 * 眼镜上没有别的出口 —— 模拟器没有麦克风，这条路径以前从没被跑到过。
                 */
                overlay: '',
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
                navHint: this._navHint(),
                sourceLabel: result.source === 'device' ? '端侧计算' : '服务端计算',
                statusLine: this._statusLine(result.source === 'device' ? '端侧计算' : '服务端计算'),
                demoLabel,
                hourNote,
                noticeLabel
            });
        } catch (err) {
            console.info(
                '[ziwei-agent] 排盘失败：',
                err && err.message ? err.message : String(err),
            );
            this.setData({
                ready: true,
                needInput: true,
                overlay: 'input',
                demoLabel: '',
                hourNote: '',
                noticeLabel: '',
                /** 排盘失败 = 没有盘，返回键只能退出应用 */
                inputHint: '单击开始识别　返回键退出',
                errorText: '排盘失败，请重新说出生辰。'
            });
        }
    },

    /* ---------------------------------------------------------------- *
     * 时间层（运限）
     * ---------------------------------------------------------------- */

    /**
     * 某一层的展示字段。
     *
     * 本命层与运限层的中宫行**结构一致**，用户切换时视线不用重新找位置：
     *   第 2 行  本命层=阴阳男女·五行局      运限层=本层命宫落位
     *   第 3 行  本命层=农历日期            运限层=本层四化
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
                layerExtra: info.lunarText || '',
            };
        }
        return {
            layerTitle: layer.label,
            layerSub: layer.mingPalaceName ? `本层命宫落 ${layer.mingPalaceName}` : '',
            layerExtra: fortuneSiHuaText(layer),
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
            layerRole: fortune && cell ? (cell.fortuneShort || '') : '',
            navHint: this._navHint()
        });

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
     * 为什么不用倾斜通道：那条通道只在准星不可用时才启动，
     * 职责是替准星做选宫；切层已经被双击独占。
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

    /**
 * 键位提示（界面文案必须跟实际能力一致，不能承诺做不到的事）。
 *
 * 现在的映射（与真机手势一一对应）：
 *   · 滑动（前后）= 选宫
 *   · 单击 = 听解读 / 追问
 *   · 双击 = 切时间层（运限层不可用时没有这一项，所以不写）
 *
 * @returns {string}
 */
_navHint() {
    return this._layersReady ? '滑动选宫　单击听解读　双击切层' : '滑动选宫　单击听解读';
},

/**
 * 中宫状态行：传感器通道 + 计算来源 + 最近一次输入的原始键值。
 *
 * 为什么不用模板里的 `{{sensorLabel}}　{{sourceLabel}}`：
 * 传感器标签为空时（例如模拟器没有传感器），那行会留下一个前导全角空格，
 * 把「端侧计算」顶得缩进一格，看起来像排版坏了。
 * 而且中宫内容宽只有 220px，操作提示 + 状态拼一起正好 220px 会折行 ——
 * 所以状态**独占一行**才是对的。
 *
 * @param {string} [sourceLabel] 传了就用传值，否则用 data 里已有的
 * @param {string} [lastInput] 传了就用传值，否则用 data 里已有的
 * @returns {string}
 */
_statusLine(sourceLabel, lastInput) {
    const parts = [
        this.data.sensorLabel,
        sourceLabel || this.data.sourceLabel,
        lastInput !== undefined ? lastInput : this.data.lastInput
    ].filter(Boolean);
    return parts.join('　');
},

/**
 * 解读原文翻页 —— **自己管滚动**，不靠宿主。
 *
 * 宿主的默认行为是「ArrowUp/ArrowDown 滚动根视图」，
 * 而根视图固定 480×352 且 overflow:hidden，滚不动；
 * 页面接管方向键之后（preventDefault），scroll-view 更不会被宿主带动。
 * 长文本不自己翻页，用户就永远读不完一整段解读。
 *
 * @param {number} delta -1 往上 / +1 往下
 */
_scrollReading(delta) {
    const next = Math.max(0, this.data.readingScrollTop + delta * SCROLL_STEP_PX);
    this.setData({ readingScrollTop: next });
},

/**
 * 追问答案翻页（与解读原文同一套机制）。
 *
 * @param {number} delta -1 往上 / +1 往下
 */
_scrollAsk(delta) {
    const next = Math.max(0, this.data.askScrollTop + delta * SCROLL_STEP_PX);
    this.setData({ askScrollTop: next });
},

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

    /* ---------------------------------------------------------------- *
     * 传感器：准星通道（绝对方向）优先，倾斜通道（加速度计）兜底
     * ---------------------------------------------------------------- */

    _startSensors() {
        if (this._sensorMode !== 'none') return;

        try {
            const sensor = new AbsoluteOrientationSensor({ frequency: SENSOR.FREQUENCY });
            this._orient = sensor;
            this._orientGotFrame = false;

            sensor.addEventListener('reading', () => {
                this._orientGotFrame = true;
                /** 浮层打开时转头不得在浮层背后换宫 */
                if (this.data.overlay) return;
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
                sensorLabel: '头部准星',
                navHint: this._navHint(),
                statusLine: this._statusLine()
            });
        } catch (err) {
            this._fallbackToTilt();
        }
    },

    _fallbackToTilt() {
        if (this._sensorMode === 'tilt') return;
        this._sensorMode = 'tilt';
        this.setData({
            sensorLabel: '抬头选宫',
            navHint: this._navHint(),
            statusLine: this._statusLine()
        });

        try {
            const sensor = new Accelerometer({ frequency: SENSOR.FREQUENCY });
            this._accel = sensor;
            sensor.addEventListener('reading', () => {
                /** 浮层打开时抬头低头不得在浮层背后换宫 */
                if (this.data.overlay) return;
                const res = updateTilt(this._tilt, {
                    x: sensor.x,
                    y: sensor.y,
                    z: sensor.z
                });
                this._tilt = res.state;
                /**
                 * 抬头/低头 = **选宫**（沿盘面外圈走一宫）。
                 *
                 * 为什么不是切层：
                 *   · 这条通道只在**准星不可用时**才启动（`_fallbackToTilt`），
                 *     职责就是替准星做空间选宫；
                 *   · 切层已经由**双击**独占（唯一不占用方向轴的手势），
                 *     倾斜再切层就变成两个入口抢同一个动作；
                 *   · 准星与倾斜都用「相对盘面外圈」移动，语义一致。
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
                sensorLabel: '镜腿选宫',
                navHint: this._navHint(),
                statusLine: this._statusLine()
            });
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

    /* ---------------------------------------------------------------- *
     * 选宫与解读
     * ---------------------------------------------------------------- */

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
    },

    async _openReading() {
        const branch = this.data.selectedBranch;
        const cell = cellAt(this.data.cells, branch);
        if (!cell) return;

        const dimension = dimensionOfPalace(cell.name);
        /**
         * 解读原文来自**本命盘**的数据集（13 维按本命宫位收录，没有运限版本），
         * 所以必须把「这段话说的是哪一宫」讲清楚 —— 尤其在运限层里，
         * 同一个地支在本命和本层的宫名不是一回事。
         */
        const dimensionLabel = dimension ? DIMENSION_LABELS[dimension] : '命盘';
        const roleText =
            this.data.layerKey === 'natal' || !this.data.layerRole
                ? ''
                : `　·　本层为${this.data.layerRole}`;

        this.setData({
            overlay: 'reading',
            readingTitle: `${cell.name}　${cell.stemName}${cell.branchName}`,
            readingDimension: `本命${cell.name} · ${dimensionLabel}${roleText}`,
            readingText: '',
            readingLoading: true,
            /** 换一段解读就从头读起 */
            readingScrollTop: 0
        });

        speak(
            `${this.data.layerKey === 'natal' ? '' : `${TIME_LAYER_NAMES[this.data.layerKey]}层，`}` +
            `${cell.name}，${speakableStars(cell.majorText)}`
        );

        try {
            const text = await this._readingFor(cell, dimension);
            this.setData({
                readingText: text,
                readingLoading: false,
                readingCitation: this._citationLabel || ''
            });
            /** 接在宫位摘要后面播（enqueue），不打断摘要 */
            speak(text, { replace: false });
        } catch (err) {
            this.setData({
                readingText: '这一段解读暂时取不到，盘面本身是端侧算的，不影响查看。',
                readingLoading: false
            });
        }
    },

    async _readingFor(cell, dimension) {
        if (this._readingCache) {
            const hit = this._readingCache.find((d) => d.key === dimension);
            if (hit) return hit.text;
        }

        const res = await requestReading(this._birth);
        if (!res || res.status !== 'ok' || !Array.isArray(res.dimensions)) {
            throw new Error(res && res.message ? res.message : 'not-covered');
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

    _openAsk() {
        const question = this.data.presets[0];
        this.setData({
            overlay: 'ask',
            askQuestion: question,
            askAnswer: '',
            askFocus: this._focusLabel(question),
            askScrollTop: 0
        });
    },

    _cyclePreset(delta) {
        const list = this.data.presets;
        const current = list.indexOf(this.data.askQuestion);
        const next = list[((current < 0 ? 0 : current) + delta + list.length) % list.length];
        this.setData({ askQuestion: next, askFocus: this._focusLabel(next) });
    },

    async _submitAsk(question) {
        const q = (question || '').trim();
        if (!q || this.data.askLoading) return;

        /**
         * 代际令牌：追问响应最长要等 120s（lib/api.js TIMEOUTS.ask），
         * 等待期间用户可能已关掉浮层 —— 迟到的答案不得落地
         * （更不能 speak 给一个已关的浮层）。
         */
        const seq = ++this._askSeq;
        /** 带上最近几轮问答作上下文，追问才接得上话 */
        const turns = this._askTurns.slice();

        this.setData({
            askLoading: true,
            askQuestion: q,
            askAnswer: '',
            askFocus: this._focusLabel(q),
            /** 新问题从头看起 */
            askScrollTop: 0
        });
        try {
            const res = await requestAsk(this._birth, q, turns, this._focusFor(q));
            if (seq !== this._askSeq) return;
            const answer = (res && res.answer) || '这一问暂时没有回答。';
            this.setData({
                askAnswer: answer,
                askLoading: false,
                // 追问的回答同样可能含受限引文，模式一并披露
                askCitation: (res && res.citationModeLabel) || ''
            });
            /** 保留最近 3 轮上下文，换盘时在 _chart 里清空 */
            this._askTurns.push({ question: q, answer });
            if (this._askTurns.length > 3) this._askTurns.shift();
            speak(answer);
        } catch (err) {
            if (seq !== this._askSeq) return;
            this.setData({
                askAnswer: '追问暂时不可用，盘面和解读不受影响。',
                askLoading: false
            });
        }
    },

    _closeOverlay() {
        /** 作废等待中的追问响应 */
        this._askSeq += 1;
        stopSpeaking();
        this.setData({ overlay: '', askLoading: false, readingLoading: false });
    },

    /* ---------------------------------------------------------------- *
     * 语音录入生辰
     * ---------------------------------------------------------------- */

    /**
     * 打开生辰录入浮层 —— **盘面态唯一的「重新说生辰」入口**（返回键）。
     *
     * 之前盘面态没有这个入口：返回键直接退出应用，而语音录入只在「还没排出盘」
     * 时可达。语音失败一次，用户就再也换不了自己的盘。
     */
    _openInput() {
        /** 新一次录入，作废旧识别的迟到结果 */
        this._voiceSeq += 1;
        this.setData({
            overlay: 'input',
            needInput: true,
            heardText: '',
            voiceHint: '说出你的生辰：哪年哪月哪日、大概几点、男或女',
            /**
             * 返回键的语义跟着「有没有盘」走：
             * 有盘 = 取消这次重录、回盘面；没盘 = 退出应用。
             */
            inputHint: this._chartJson
                ? '单击开始识别　返回键回盘面'
                : '单击开始识别　返回键退出'
        });
    },

    /**
     * 生辰录入浮层的返回键。
     *
     * 之前这里直接 `this.finish()` —— 退出应用，于是
     * 「盘面态按返回键重新说生辰」这条路径进去就出不来了：
     * 用户想取消，整个应用被关掉。
     *
     * 分两种情况：
     *   · **已经有盘**（`_chartJson` 有值）→ 回到盘面，这是「取消这次重录」；
     *   · **还没有盘**（首次启动必须录入，语音解析失败）→ 才退出应用，
     *     因为这时候没有别的地方可退。
     *
     * 判据用 `_chartJson` 而不是 `data.ready`：`ready` 在排盘失败的分支里
     * 也会被置成 true，拿它当「有没有盘」的判据会把用户留在一个空屏上。
     */
    _closeInput() {
        /**
         * 作废正在进行的语音识别 —— 否则用户按返回键取消了，
         * listenOnce 的迟到 resolve 仍会把这次生辰排成盘。
         */
        this._voiceSeq += 1;
        this._listening = false;
        if (this._chartJson) {
            this.setData({
                overlay: '',
                needInput: false,
                heardText: '',
                errorText: '',
                voiceHint: '说出你的生辰：哪年哪月哪日、大概几点、男或女'
            });
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
        const text = await listenOnce();
        if (seq !== this._voiceSeq) return;
        this._listening = false;
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
    <view class="board">
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
            <text class="center-title">{{layerTitle}}</text>
            <text class="center-line">命主 {{center.mingZhu}}　身主 {{center.shenZhu}}</text>
            <text class="center-line dim">{{layerSub}}</text>
            <text class="center-line dim">{{layerExtra}}</text>
            <text class="center-line dim">{{center.pillarsText}}</text>
            <view class="center-divider"></view>
            <view class="selected-row">
                <text class="center-line strong">{{selectedName}}</text>
                <text class="center-role" ink:if="{{layerRole}}">{{layerRole}}</text>
            </view>
            <text class="center-hint">{{navHint}}</text>
            <text class="center-hint dim">{{statusLine}}</text>
            <text class="center-hint demo" ink:if="{{noticeLabel}}">{{noticeLabel}}</text>
        </view>

        <view class="overlay" ink:if="{{overlay === 'input'}}">
            <text class="overlay-title">说出你的生辰</text>
            <text class="overlay-body">{{voiceHint}}</text>
            <text class="overlay-body strong" ink:if="{{heardText}}">{{heardText}}</text>
            <text class="overlay-body dim">格式：1990年1月1日 早上 男　不知道时辰就说「不知道时辰」</text>
            <text class="overlay-body error" ink:if="{{errorText}}">{{errorText}}</text>
            <text class="overlay-hint">{{inputHint}}</text>
        </view>

        <view class="overlay" ink:if="{{overlay === 'reading'}}">
            <text class="overlay-title">{{readingTitle}}</text>
            <text class="overlay-body dim">{{readingDimension}}</text>
            <scroll-view class="reading-scroll" scroll-y="{{true}}" scroll-top="{{readingScrollTop}}">
                <text class="reading-text" ink:if="{{!readingLoading}}">{{readingText}}</text>
                <text class="reading-text dim" ink:if="{{readingLoading}}">正在检索解读原文……</text>
            </scroll-view>
            <text class="overlay-note" ink:if="{{readingCitation}}">{{readingCitation}}</text>
            <text class="overlay-note">传统文化学习与研究用 · 不构成医疗、法律、投资或人生决策建议</text>
            <text class="overlay-hint">滑动翻页　单击追问　返回键退出</text>
        </view>

        <view class="overlay" ink:if="{{overlay === 'ask'}}">
            <text class="overlay-title">追问</text>
            <text class="overlay-body strong">{{askQuestion}}</text>
            <text class="overlay-body dim" ink:if="{{askFocus}}">{{askFocus}}</text>
            <scroll-view class="reading-scroll" scroll-y="{{true}}" scroll-top="{{askScrollTop}}">
                <text class="reading-text" ink:if="{{!askLoading}}">{{askAnswer}}</text>
                <text class="reading-text dim" ink:if="{{askLoading}}">正在推演……</text>
            </scroll-view>
            <text class="overlay-note" ink:if="{{askCitation}}">{{askCitation}}</text>
            <text class="overlay-note">传统文化学习与研究用 · 不构成医疗、法律、投资或人生决策建议</text>
            <text class="overlay-hint">滑动看答案　双击换问题　单击发送　返回键退出</text>
        </view>
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
 */
.board {
    position: relative;
    width: 480px;
    height: 352px;
    overflow: hidden;
    background-color: #000000;
    color: #00ff66;
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
    color: #4da86c;
    margin-left: 2px;
}

.gan-zhi {
    font-size: 9px;
    line-height: 15px;
    color: #4da86c;
}

.major {
    display: block;
    font-size: 12px;
    line-height: 15px;
    color: #00ff66;
    max-height: 30px;
    overflow: hidden;
}

.minor {
    display: block;
    font-size: 9px;
    line-height: 11px;
    color: #4da86c;
    max-height: 11px;
    overflow: hidden;
}

.cell.on {
    border: 2px solid #00ff66;
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
    justify-content: center;
}

.center-title {
    font-size: 15px;
    line-height: 20px;
    font-weight: bold;
    margin-bottom: 4px;
}

.center-line {
    font-size: 11px;
    line-height: 15px;
}

.center-line.dim {
    color: #4da86c;
}

.center-line.strong {
    font-size: 16px;
    line-height: 20px;
    font-weight: bold;
}

/* 选中宫：本命宫名（大字）+ 运限层宫名（小字） */
.selected-row {
    display: flex;
    flex-direction: row;
    align-items: center;
    margin-top: 4px;
}

.center-role {
    font-size: 12px;
    line-height: 20px;
    color: #4da86c;
    margin-left: 5px;
}

.center-divider {
    height: 1px;
    background-color: #174526;
    margin: 6px 0;
}

.center-hint {
    font-size: 10px;
    line-height: 13px;
    color: #4da86c;
}

/*
 * 末行（端侧计算 / 服务端计算）。
 *
 * 原来用的是 #174526（深绿）——对比度只有 2.1:1，在单色绿 HUD 上几乎看不见，
 * 而「端侧计算」恰恰是最该让评审看到的一行。
 * 层级靠字号（10px，比正文小）区分，不靠把字调暗。
 */
.center-hint.dim {
    color: #4da86c;
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

.overlay {
    position: absolute;
    left: 0;
    top: 0;
    width: 480px;
    height: 352px;
    box-sizing: border-box;
    padding: 14px 16px;
    background-color: #000000;
    color: #00ff66;
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
    color: #4da86c;
    font-size: 11px;
}

.overlay-body.error {
    color: #00ff66;
    font-size: 11px;
}

.overlay-hint {
    position: absolute;
    left: 16px;
    bottom: 12px;
    font-size: 10px;
    line-height: 14px;
    color: #4da86c;
}

.reading-scroll {
    flex: 1;
    width: 448px;
    margin-top: 6px;
}

.reading-text {
    font-size: 13px;
    line-height: 19px;
    color: #00ff66;
}

.reading-text.dim {
    color: #4da86c;
}

/*
 * 底注：引文模式披露 + 免责声明。
 *
 * 颜色用 #4da86c（不是更暗的 #174526）—— 这是**必须让用户看清**的内容，
 * 不能为了「低调」牺牲可读性（之前踩过一次 page {} 继承导致黑字黑底的坑）。
 */
.overlay-note {
    font-size: 9px;
    line-height: 13px;
    color: #4da86c;
    /* 给绝对定位的 .overlay-hint 让出位置，两者不叠字 */
    margin-bottom: 18px;
}
</style>
