/**
 * 镜腿输入契约层 —— 把 Rokid Glasses 的硬件事件翻译成页面动作。
 *
 * ⚠️ 这个模块的存在理由：**镜腿上的按键不是标准键盘**。
 * 之前页面只认 `event.code === 'ArrowUp' | ... | 'Enter' | 'Backspace'`，
 * 真机上等于「几乎什么都收不到」—— 因为：
 *
 * 1. **`GlobalHook` 是 Rokid Glasses 专属键值**，官方定义是
 *    「用户触摸到了镜腿按键」（Rokid AIUI 事件文档 · Rokid Glasses 章节）。
 *    它不是标准 Web 键值，是设备侧额外提供的输入信号，
 *    可以在 `onKeyDown` / `onKeyUp` 里像普通按键一样处理。
 *    **页面完全不认它 ⇒ 镜腿点按（唯一的确认动作）永远无效。**
 *
 * 2. **一次滑动 = 先 GlobalHook，50~120ms 后才来方向键**
 *    （FlexiLingo v0.5.74 真机实测）。
 *    所以「把 GlobalHook 当点按」会让一次滑动同时触发「移动 + 确认」。
 *    契约必须是：**GlobalHook 挂起 ~180ms，期间方向键到达就取消这次确认。**
 *
 * 3. **GlobalHook 不携带可靠的「单击 / 滑动」分类**（词境项目真机结论）。
 *    所以判定只能靠时序启发式，不能靠字段。
 *
 * 4. **宿主可能一次物理操作同时上报 keydown 和 keyup**
 *    （词境项目）。两个都执行确认，一次 Enter 会触发两次。
 *    靠「按下/抬起配对」抑制，而不是靠固定时间窗口 ——
 *    固定窗口会吞掉用户快速连续按键，两类问题不能共用一套参数。
 *
 * 5. **keyup 的宿主默认行为会抢走按键**（官方事件文档）：
 *    `Backspace` → 返回上一页或请求关闭应用；
 *    `ArrowUp` / `ArrowDown` → 滚动根视图；
 *    `Enter` → 进入导航模式或激活当前目标。
 *    页面一旦接管某个键，就必须在**该键的所有分支**里 `preventDefault()`。
 *
 * 纯函数 + 显式状态：不依赖 AIUI 运行时，可以在 node 里直接单测。
 */

/* ------------------------------------------------------------------ *
 * 动作
 * ------------------------------------------------------------------ */

/** 页面动作（与硬件键值解耦） */
export const ACTION = Object.freeze({
    UP: 'up',
    DOWN: 'down',
    LEFT: 'left',
    RIGHT: 'right',
    CONFIRM: 'confirm',
    BACK: 'back',
    /** 镜腿触摸（真机上「点按」的载体，需要延迟判定才能知道是不是滑动） */
    TEMPLE: 'temple'
});

/** 动作 → 界面上的一个字（调试行用，省地方） */
export const ACTION_GLYPH = Object.freeze({
    [ACTION.UP]: '↑',
    [ACTION.DOWN]: '↓',
    [ACTION.LEFT]: '←',
    [ACTION.RIGHT]: '→',
    [ACTION.CONFIRM]: '确认',
    [ACTION.BACK]: '返回',
    [ACTION.TEMPLE]: '镜腿'
});

/* ------------------------------------------------------------------ *
 * 参数
 * ------------------------------------------------------------------ */

/**
 * 契约参数。
 *
 * - `settleMs` —— GlobalHook 挂起窗口。
 *   取 180ms：FlexiLingo 用 ~180ms，词境用 ~200ms；
 *   真机上滑动到方向键的间隔是 50~120ms，180ms 能稳稳盖住，
 *   又短到用户感觉不到「点按有延迟」。
 * - `cooldownMs` —— 确认后的冷却。
 *   盖住同一次点按的回声上报（GlobalHook + Enter 两种通道同时来）。
 * - `repeatWindowMs` —— 同方向键「按下」事件的最短间隔。
 *   挡滑动轨迹抖动（同一次滑动会连着报好几个 down）；
 *   比它长的两次真实按压都放行。
 * - `upPairWindowMs` —— 配对抬起的作用时间。
 *   宿主有时只报 keyup 不报 keydown，有时两个都报；
 *   超过这个窗口还没等到配对抬起，就当它不存在，下一次按压照常执行。
 */
export const TEMPLE_DEFAULTS = Object.freeze({
    settleMs: 180,
    cooldownMs: 350,
    repeatWindowMs: 150,
    upPairWindowMs: 1000,
    /** 抬起回声窗口：同一个键在这么短时间内的重复抬起是回声，不是第二次按压 */
    upEchoMs: 120
});

/* ------------------------------------------------------------------ *
 * 归一化
 * ------------------------------------------------------------------ */

/** 标准 code / key → 动作 */
const CODE_MAP = {
    ArrowUp: ACTION.UP,
    ArrowDown: ACTION.DOWN,
    ArrowLeft: ACTION.LEFT,
    ArrowRight: ACTION.RIGHT,
    Up: ACTION.UP,
    Down: ACTION.DOWN,
    Left: ACTION.LEFT,
    Right: ACTION.RIGHT,
    Enter: ACTION.CONFIRM,
    NumpadEnter: ACTION.CONFIRM,
    Return: ACTION.CONFIRM,
    Backspace: ACTION.BACK,
    Escape: ACTION.BACK,
    BrowserBack: ACTION.BACK,
    GlobalHook: ACTION.TEMPLE
};

/** 数字 keyCode → 动作（真机上报 keyCode 而不是 code 时的兜底） */
const KEYCODE_MAP = {
    8: ACTION.BACK,
    10: ACTION.CONFIRM,
    13: ACTION.CONFIRM,
    27: ACTION.BACK,
    37: ACTION.LEFT,
    38: ACTION.UP,
    39: ACTION.RIGHT,
    40: ACTION.DOWN
};

/**
 * 把一个按键事件归一化成页面动作。
 *
 * 判定顺序：`code` → `key` → 数字 `keyCode`。
 * 三者都认，是因为真机上报哪个字段**没有公开承诺**，
 * 而「认不出来」在眼镜上等于「这个键彻底失灵」，不能赌。
 *
 * @param {{code?: string, key?: string, keyCode?: number} | null | undefined} event
 * @returns {string | null} 动作；认不出来返回 null
 */
export function normalizeKey(event) {
    if (!event) return null;

    const code = typeof event.code === 'string' ? event.code : '';
    if (code && CODE_MAP[code]) return CODE_MAP[code];

    const key = typeof event.key === 'string' ? event.key : '';
    if (key && CODE_MAP[key]) return CODE_MAP[key];

    const kc = Number(event.keyCode);
    if (Number.isFinite(kc) && KEYCODE_MAP[kc]) return KEYCODE_MAP[kc];

    return null;
}

/**
 * 事件的原始标识（调试行用）。
 *
 * 真机上报的到底是什么字段，只有真机能回答（DEVICE-CHECKLIST §1.5 T2）。
 * 把原始值显示出来，上机第一分钟就能看到答案，不必靠猜。
 *
 * @param {{code?: string, key?: string, keyCode?: number} | null | undefined} event
 * @returns {string}
 */
export function rawKeyLabel(event) {
    if (!event) return '';
    if (typeof event.code === 'string' && event.code) return event.code;
    if (typeof event.key === 'string' && event.key) return event.key;
    if (event.keyCode != null && Number.isFinite(Number(event.keyCode))) {
        return String(event.keyCode);
    }
    return '';
}

/* ------------------------------------------------------------------ *
 * 输入路由
 * ------------------------------------------------------------------ */

/**
 * 创建输入路由。
 *
 * 用法：
 * ```js
 * const router = createInputRouter({ onAction: (a) => this._dispatchKey(a) });
 * router.feed(ACTION.LEFT, 'down');
 * ```
 *
 * `feed()` 收到的必须是**已经归一化**的动作，
 * 页面负责先 `normalizeKey(event)` 再喂进来 ——
 * 这样「认不出来的键」在页面层就被挡掉了，不会污染路由状态。
 *
 * @param {Object} [opts]
 * @param {(action: string) => void} [opts.onAction] 动作回调（异步确认也走它）
 * @param {number} [opts.settleMs]
 * @param {number} [opts.cooldownMs]
 * @param {number} [opts.repeatWindowMs]
 * @param {number} [opts.upPairWindowMs]
 * @param {number} [opts.upEchoMs]
 * @param {() => number} [opts.now] 时钟（测试可注入）
 * @returns {Object}
 */
export function createInputRouter(opts = {}) {
    const settleMs = opts.settleMs ?? TEMPLE_DEFAULTS.settleMs;
    const cooldownMs = opts.cooldownMs ?? TEMPLE_DEFAULTS.cooldownMs;
    const repeatWindowMs = opts.repeatWindowMs ?? TEMPLE_DEFAULTS.repeatWindowMs;
    const upPairWindowMs = opts.upPairWindowMs ?? TEMPLE_DEFAULTS.upPairWindowMs;
    const upEchoMs = opts.upEchoMs ?? TEMPLE_DEFAULTS.upEchoMs;
    const now = typeof opts.now === 'function' ? opts.now : () => Date.now();
    const onAction = typeof opts.onAction === 'function' ? opts.onAction : null;

    /** 每个动作的按下状态：{ lastDownAt, pendingUpAt } */
    const keyState = new Map();

    /** 待确认的镜腿点按 */
    let templeTimer = null;
    /** 最近一次 GlobalHook 的到达时间（回声抑制用） */
    let lastTempleAt = -Infinity;
    /** 最近一次**真正执行**的确认的时间 */
    let lastConfirmAt = -Infinity;
    /** 最近一次确认来自哪个通道：'temple'（镜腿点按）/ 'key'（Enter 键） */
    let lastConfirmChannel = '';

    function stateOf(action) {
        let s = keyState.get(action);
        if (!s) {
            s = { lastDownAt: -Infinity, pendingUpAt: -Infinity, lastUpEmitAt: -Infinity };
            keyState.set(action, s);
        }
        return s;
    }

    function deliver(action) {
        if (onAction) onAction(action);
        return action;
    }

    /** 取消挂起的镜腿确认。返回 true = 确实取消了一次待确认。 */
    function cancelTemple() {
        if (!templeTimer) return false;
        clearTimeout(templeTimer);
        templeTimer = null;
        return true;
    }

    /**
     * 按下 / 抬起配对。
     *
     * - down：距上一次同键 down 不足 `repeatWindowMs` → 判为滑动抖动，丢弃。
     * - up：如果有配对的 down（还没被消费）→ 丢弃（那一次按压已经在 down 时执行过）。
     * - up：如果没有配对的 down（宿主只报 keyup）→ 执行。
     */
    function keyOnce(action, phase, ts) {
        const s = stateOf(action);

        if (phase === 'down') {
            if (ts - s.lastDownAt < repeatWindowMs) return null; // 滑动抖动
            s.lastDownAt = ts;
            s.pendingUpAt = ts;
            return action;
        }

        // phase === 'up'
        if (s.pendingUpAt > -Infinity) {
            /**
             * 有配对的 down —— 那一次按压已经在 down 时执行过了，
             * 抬起只做配对收尾，**不再执行**（隔多久都不重复执行）。
             */
            s.pendingUpAt = -Infinity;
            s.lastUpEmitAt = ts;
            return null;
        }
        /**
         * 完全没有配对的 down ⇒ 宿主只报 keyup。
         * 这一下才是唯一信号，执行。
         *
         * 但**紧跟着再来一个同键抬起**是回声（宿主把同一次物理操作报了两遍），
         * 用 `upEchoMs` 挡掉 —— 窗口要短，否则会吞掉用户真实的连续按压。
         */
        if (ts - s.lastUpEmitAt < upEchoMs) {
            s.lastUpEmitAt = ts;
            return null;
        }
        s.lastUpEmitAt = ts;
        return action;
    }

    /**
     * 确认动作（Enter 键通道）。
     *
     * 冷却**只挡跨通道回声**：上一次确认来自镜腿点按、而这次是 Enter 键 ——
     * 那多半是同一次物理点按被宿主用两条通道各报了一遍。
     *
     * 同通道（用户自己连按确认）**不挡**：
     * 挡掉的话，「打开解读 → 再按确认打开追问」这种正常操作会被吞掉。
     */
    function confirmOnce(action, phase, ts) {
        const emitted = keyOnce(action, phase, ts);
        if (emitted === null) return null;
        const echo =
            lastConfirmChannel === 'temple' && ts - lastConfirmAt < cooldownMs;
        if (echo) return null;
        lastConfirmAt = ts;
        lastConfirmChannel = 'key';
        return emitted;
    }

    /**
     * 挂起一次镜腿点按，等 settleMs 看看有没有方向键跟上来。
     *
     * - 已有挂起 → 回声，忽略（一次滑动可能连着报好几个 GlobalHook）。
     * - 距上一个 GlobalHook 不足 settleMs → 回声，忽略。
     * - 定时器到点时如果刚刚才确认过 → 不重复确认。
     */
    function scheduleTemple(ts) {
        if (templeTimer) return false; // 回声：已有挂起的点按
        if (ts - lastTempleAt < settleMs) return false; // 回声：太密了
        lastTempleAt = ts;
        templeTimer = setTimeout(() => {
            templeTimer = null;
            const firedAt = now();
            if (firedAt - lastConfirmAt < cooldownMs) return; // 刚确认过
            lastConfirmAt = firedAt;
            lastConfirmChannel = 'temple';
            deliver(ACTION.CONFIRM);
        }, settleMs);
        return true;
    }

    return {
        /**
         * 喂一个动作进来。
         *
         * ⚠️ **投递方式有两种，别搞混**：
         * - 同步动作（方向键 / 确认 / 返回）→ **由返回值给出**，页面自己 dispatch；
         * - 异步动作（镜腿点按的延迟确认）→ **走 `onAction` 回调**，
         *   因为它是在定时器里触发的，没有返回值可拿。
         *
         * @param {string} action 归一化后的动作
         * @param {'down' | 'up'} phase
         * @returns {string | null} 本次触发的动作（没有则 null）
         */
        feed(action, phase) {
            if (!action) return null;
            const ts = now();

            if (action === ACTION.TEMPLE) {
                // 镜腿触摸：挂起等一会儿，看是不是滑动的头
                scheduleTemple(ts);
                return null;
            }

            if (action === ACTION.CONFIRM) {
                // 真的点按（宿主同时报了 Enter）⇒ 立即确认，不等挂起窗口
                cancelTemple();
                return confirmOnce(action, phase, ts);
            }

            if (action === ACTION.BACK) {
                cancelTemple();
                return keyOnce(action, phase, ts);
            }

            // 方向键到达 ⇒ 刚才那个 GlobalHook 是滑动的头，不是点按
            cancelTemple();
            return keyOnce(action, phase, ts);
        },

        /** 当前是否有挂起的镜腿确认（调试/测试用） */
        hasPendingTemple() {
            return Boolean(templeTimer);
        },

        /** 页面卸载时清理定时器 */
        cancel() {
            cancelTemple();
        }
    };
}
