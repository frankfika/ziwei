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
 *    契约必须是：**GlobalHook 挂起 ~300ms，期间方向键到达就取消这次确认。**
 *
 * 2b. **一次单击 = 先 GlobalHook，550~600ms 之后宿主才补发 `Enter`**
 *    （言值项目真机实测，2026-11 已上架 Rokid 商店）。
 *    也就是说 **`GlobalHook` 到达 ≠ 点按成立** —— 真机上「滑动」和「单击」的
 *    头部都是 GlobalHook，只能靠后续事件区分：
 *      · 50~120ms 内来方向键 ⇒ 滑动；
 *      · 550~600ms 后来 `Enter` ⇒ 单击（补发的确认键，**不重复执行**）。
 *    之前按 180ms 挂起 + 350ms 冷却，真机上必然「点一次跳两页」。
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
    TEMPLE: 'temple',
    /**
     * **双击**（镜腿双击）。
     *
     * 真机与模拟器都是「`GlobalHook` 若干次 → 补发 `Backspace`」，
     * 与物理返回键（裸 `Backspace`）在键值上分不开 ——
     * 靠「前置有没有 `GlobalHook`」来区分，见 `doubleTapWindowMs`。
     */
    DOUBLE: 'double'
});

/** 动作 → 界面上的一个字（调试行用，省地方） */
export const ACTION_GLYPH = Object.freeze({
    [ACTION.UP]: '↑',
    [ACTION.DOWN]: '↓',
    [ACTION.LEFT]: '←',
    [ACTION.RIGHT]: '→',
    [ACTION.CONFIRM]: '确认',
    [ACTION.BACK]: '返回',
    [ACTION.TEMPLE]: '镜腿',
    [ACTION.DOUBLE]: '双击'
});

/* ------------------------------------------------------------------ *
 * 参数
 * ------------------------------------------------------------------ */

/**
 * 契约参数。
 *
 * - `settleMs` —— GlobalHook 挂起窗口。
 *   取 **300ms**：真机上「滑动 → 方向键」是 50~120ms，
 *   「单击 → 补发 Enter」是 550~600ms，300 刚好把两者分开。
 * - `cooldownMs` —— 确认后的冷却。
 *   必须盖住补发 `Enter` 的延迟（550~600ms），否则一次点按会执行两次。
 * - `repeatWindowMs` —— 同方向键「按下」事件的最短间隔。
 *   挡滑动轨迹抖动（同一次滑动会连着报好几个 down）；
 *   比它长的两次真实按压都放行。
 * - `upPairWindowMs` —— 配对抬起的作用时间。
 *   宿主有时只报 keyup 不报 keydown，有时两个都报；
 *   超过这个窗口还没等到配对抬起，就当它不存在，下一次按压照常执行。
 */
export const TEMPLE_DEFAULTS = Object.freeze({
    /**
     * GlobalHook 挂起窗口（ms）。
     *
     * 取 **300**：真机实测（言值项目，2026-11 已在 Rokid 商店上架）里，
     * 「单击」= `GlobalHook`，宿主要 **550~600ms 之后才补发 `Enter`**；
     * 而一次滑动是 `GlobalHook` 之后 **50~120ms** 就来方向键。
     * 300ms 刚好把两者分开：窗口内来方向键 ⇒ 滑动；窗口内来 Enter ⇒ 单击；
     * 窗口内什么都没来 ⇒ 也判为单击（Enter 还在路上）。
     */
    settleMs: 300,
    /**
     * 确认冷却（ms）。
     *
     * 取 **1000**：真机单击是「`GlobalHook` → 550~600ms 后补发 `Enter`」，
     * 如果按 300ms 就确认，补发的 `Enter` 会在 250~300ms 后**再确认一次**
     * —— 表现就是「点一次跳两页」（言值项目踩过同一个坑，处置是
     * 「1000ms 内补发的 Enter 忽略」）。
     */
    cooldownMs: 1000,
    repeatWindowMs: 150,
    /**
     * 镜腿（`GlobalHook`）重复**按下**的回声窗口（ms）。
     *
     * ⚠️ 必须比 `repeatWindowMs` **小得多**：
     * 真机双击 = `GlobalHook` ×2，间隔约 200ms（言值项目实测）。
     * 如果这里复用方向键的 150ms 抖动窗口，
     * 间隔 120~150ms 的双击会被当成回声丢掉第一个 ——
     * 结果就是「双击切层」时灵时不灵。
     *
     * 取 **60**：宿主把同一个物理操作重复上报的间隔是毫秒级，
     * 60ms 足够挡住回声，又远小于真机双击的 200ms。
     */
    templeRepeatMs: 60,
    upPairWindowMs: 1000,
    /** 抬起回声窗口：同一个键在这么短时间内的重复抬起是回声，不是第二次按压 */
    upEchoMs: 120,
    /**
     * 方向键配对窗口（ms）。
     *
     * ⚠️ **真机一次滑动会发两个方向键**：
     *   前滑 = `ArrowRight` + `ArrowDown`，后滑 = `ArrowLeft` + `ArrowUp`。
     * 两个键必须**只算一次方向**，否则一次滑动会连跳两宫
     * （而且两个键分属两个动作域 —— 「切宫」和「切层」同时触发，
     *  表现就是评审说的「焦点切换问题 / arrow 滑动事件问题」）。
     *
     * 这个窗口只用来限制「配对键迟到多久还算同一次滑动」，
     * **判定靠配对关系**（Right↔Down / Left↔Up），不靠「窗口内的第二个键」。
     */
    dirPairWindowMs: 200,
    /**
     * 双击判定窗口（ms）。
     *
     * 取 **900**：真机双击是「`GlobalHook` ×2（约 200ms 间隔）→ 补发 `Backspace`」，
     * 补发的 `Backspace` 比物理返回键晚到（言值项目用 900ms 吞掉「跨页面的补发 Backspace」）。
     * 所以：**`Backspace` 到达时，若这之前刚有 `GlobalHook`，它就是双击补发的那一个**，
     * 否则是用户按了物理返回键。
     */
    doubleTapWindowMs: 900
});

/**
 * 真机一次滑动的**方向键配对**。
 *
 * 言值项目真机实测：前滑 = `ArrowRight` + `ArrowDown`，后滑 = `ArrowLeft` + `ArrowUp`。
 * 两个键必须只算一次方向，否则一次滑动连跳两宫。
 *
 * ⚠️ 模拟器只发**一个**方向键（Studio bundle：swipe-up → `ArrowUp`，
 * swipe-down → `ArrowDown`），所以配对不能靠「时间窗内第二个键」来判 ——
 * 那会把「快速连续两次同向滑动」也吞掉。必须靠**配对关系**判。
 */
const DIR_PARTNER = Object.freeze({
    [ACTION.RIGHT]: ACTION.DOWN,
    [ACTION.DOWN]: ACTION.RIGHT,
    [ACTION.LEFT]: ACTION.UP,
    [ACTION.UP]: ACTION.LEFT
});

/**
 * 两个方向键是不是同一次滑动的配对。
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function isDirPartner(a, b) {
    return DIR_PARTNER[a] === b;
}

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
 * @param {number} [opts.templeRepeatMs] 镜腿重复下按的回声窗口
 * @param {number} [opts.dirPairWindowMs] 方向键配对窗口（配对关系之外的兜底）
 * @param {number} [opts.doubleTapWindowMs] 双击判定窗口
 * @param {() => number} [opts.now] 时钟（测试可注入）
 * @returns {Object}
 */
export function createInputRouter(opts = {}) {
    const settleMs = opts.settleMs ?? TEMPLE_DEFAULTS.settleMs;
    const cooldownMs = opts.cooldownMs ?? TEMPLE_DEFAULTS.cooldownMs;
    const repeatWindowMs = opts.repeatWindowMs ?? TEMPLE_DEFAULTS.repeatWindowMs;
    const upPairWindowMs = opts.upPairWindowMs ?? TEMPLE_DEFAULTS.upPairWindowMs;
    const upEchoMs = opts.upEchoMs ?? TEMPLE_DEFAULTS.upEchoMs;
    const templeRepeatMs = opts.templeRepeatMs ?? TEMPLE_DEFAULTS.templeRepeatMs;
    const dirPairWindowMs = opts.dirPairWindowMs ?? TEMPLE_DEFAULTS.dirPairWindowMs;
    const doubleTapWindowMs = opts.doubleTapWindowMs ?? TEMPLE_DEFAULTS.doubleTapWindowMs;
    const now = typeof opts.now === 'function' ? opts.now : () => Date.now();
    const onAction = typeof opts.onAction === 'function' ? opts.onAction : null;

    /** 每个动作的按下状态：{ lastDownAt, pendingUpAt } */
    const keyState = new Map();

    /** 待确认的镜腿点按 */
    let templeTimer = null;
    /** 最近一次 GlobalHook 的到达时间（回声抑制用） */
    let lastTempleAt = -Infinity;
    /** 最近一次 GlobalHook **按下** 的时间（配对抬起判定用） */
    let templeDownAt = -Infinity;
    /**
     * 双击候选的时间戳。
     *
     * 只有「第二个 GlobalHook 取消了挂起的单击判定」时才会打标 ——
     * 这才是真机上双击的指纹（`GlobalHook ×2` → 补发 `Backspace`）。
     * 单击（`GlobalHook` → 补发 `Enter`）**不打标**，
     * 所以单击之后按物理返回键不会被误判成双击。
     */
    let doubleCandidateAt = -Infinity;
    /** 最近一次**真正执行**的确认的时间 */
    let lastConfirmAt = -Infinity;
    /** 最近一次确认来自哪个通道：'temple'（镜腿点按）/ 'key'（Enter 键） */
    let lastConfirmChannel = '';
    /** 最近一次**执行**的方向动作的时间（调试用） */
    let lastDirAt = -Infinity;
    /**
     * 方向键配对的挂起状态：`{ first, at }`。
     *
     * 一次滑动 = 第一个方向键 + 它的配对键（前滑 `Right`+`Down`，后滑 `Left`+`Up`）。
     * 挂起状态记着「上一个方向键是哪个、什么时候来的」，
     * 下一个方向键到达时按**配对关系**判定它是「同一次滑动的另一半」还是「新的一次滑动」。
     */
    let dirPairPending = null;

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
        /**
         * 确认动作一发生，**双击候选就作废**。
         *
         * 为什么：双击候选的用途是识别「双击补发的那个 Backspace」。
         * 一旦中间发生了别的动作（点按），那个补发窗口大概率已经过去了，
         * 还留着候选的话，后面的**物理返回键**会被误判成双击
         * （盘面态表现是「按返回键却切了层」，而不是回到生辰录入）。
         */
        doubleCandidateAt = -Infinity;
        return emitted;
    }

    /**
     * 挂起一次镜腿点按，等 settleMs 看看有没有方向键跟上来。
     *
     * - 已有挂起 → 这是**第二个 GlobalHook**（双击），取消这次「单击」判定。
     * - 距上一个 GlobalHook 不足 settleMs → 回声，忽略。
     * - 定时器到点时如果刚刚才确认过 → 不重复确认。
     */
    function scheduleTemple(ts) {
        if (templeTimer) {
            /**
             * **第二个 GlobalHook** —— 真机双击的指纹（`GlobalHook ×2`，约 200ms 间隔）。
             *
             * 处置：**取消这次「单击」判定**，并打上双击候选标记。
             *   · 双击随后会补发 `Backspace`，由它执行「双击」动作；
             *   · 若它其实是同一滑动的回声，方向键马上也会到，同样会取消挂起。
             *
             * 不取消的话，挂起窗口到期会**误确认一次** ——
             * 真机双击会变成「先弹解读浮层、再被 Backspace 关掉」。
             */
            cancelTemple();
            doubleCandidateAt = ts;
            lastTempleAt = ts;
            return false;
        }
        if (ts - lastTempleAt < settleMs) return false; // 回声：太密了
        lastTempleAt = ts;
        templeTimer = setTimeout(() => {
            templeTimer = null;
            const firedAt = now();
            if (firedAt - lastConfirmAt < cooldownMs) return; // 刚确认过
            lastConfirmAt = firedAt;
            lastConfirmChannel = 'temple';
            /** 确认一旦发生，双击候选就作废（见 confirmOnce 的说明） */
            doubleCandidateAt = -Infinity;
            deliver(ACTION.CONFIRM);
        }, settleMs);
        return true;
    }

    /**
     * 镜腿触摸（`GlobalHook`）的按下 / 抬起配对。
     *
     * ⚠️ **抬起绝对不能取消挂起的单击判定。**
     *
     * 宿主对同一个物理操作会**同时**报 keydown 和 keyup
     * （Studio 模拟器就是这么派发的：keydown → keyup，间隔 1ms）。
     * 如果把抬起也当成「又一个 GlobalHook」，那么：
     *   · 按下 → 挂起单击判定；
     *   · 抬起（1ms 后）→ 被当成第二个 GlobalHook → 取消挂起；
     *   · 结果：**点按永远不会确认**（真机上则表现为「按了没反应」）。
     *
     * 所以抬起只做「配对收尾」：配对上了就什么都不干，
     * 没配对（宿主只报 keyup）才当成一次完整的点按。
     *
     * @param {'down' | 'up'} phase
     * @param {number} ts
     */
    function feedTemple(phase, ts) {
        if (phase === 'down') {
            /**
             * 同一个 GlobalHook 的重复 down（回声）—— 间隔太密，忽略。
             *
             * ⚠️ 用 `templeRepeatMs`（60ms）而不是方向键的 `repeatWindowMs`（150ms）：
             * 真机双击的两个 GlobalHook 间隔约 200ms，
             * 用 150ms 的窗口会在间隔偏短时把第二个当回声丢掉，
             * 「双击切层」就变成时灵时不灵。
             */
            if (ts - templeDownAt < templeRepeatMs) return null;
            templeDownAt = ts;
            scheduleTemple(ts);
            return null;
        }

        // phase === 'up'
        if (ts - templeDownAt < upPairWindowMs) {
            // 配对的抬起 —— 按下时已经处理过了，不能重复处理
            return null;
        }
        // 宿主只报 keyup —— 这一下才是唯一信号
        scheduleTemple(ts);
        return null;
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
                // 镜腿触摸：挂起等一会儿，看是不是滑动的头（按下/抬起配对在 feedTemple 里）
                feedTemple(phase, ts);
                return null;
            }

            if (action === ACTION.CONFIRM) {
                // 真的点按（宿主同时报了 Enter）⇒ 立即确认，不等挂起窗口
                cancelTemple();
                return confirmOnce(action, phase, ts);
            }

            if (action === ACTION.BACK) {
                /**
                 * `Backspace` 有两个来源，键值上分不开：
                 *   · **双击补发**（`GlobalHook` 之后才到）⇒ 双击；
                 *   · **物理返回键**（裸 `Backspace`）⇒ 返回。
                 *
                 * 判据（两个都满足其一才算双击）：
                 *   ① 到达时还有一个**挂起中**的镜腿判定 ——
                 *      模拟器的双击就是「GlobalHook 紧跟 Backspace」（Studio bundle：
                 *      `PDt` 先派发 `GlobalHook`，双击时再派发 `Backspace`）；
                 *   ② 或者刚刚有**第二个 GlobalHook** 取消了挂起 ——
                 *      真机双击的指纹（`GlobalHook ×2` → 补发 `Backspace`）。
                 *
                 * ⚠️ 单击（`GlobalHook` → 补发 `Enter`）**不满足任何一条**，
                 * 所以「单击之后按物理返回键」不会被误判成双击。
                 */
                const hadPendingTemple = Boolean(templeTimer);
                cancelTemple();
                const isDouble =
                    hadPendingTemple || ts - doubleCandidateAt <= doubleTapWindowMs;
                if (isDouble) doubleCandidateAt = -Infinity; // 候选只生效一次
                /**
                 * ⚠️ **按下/抬起的配对必须挂在原始的 `Backspace` 上**，
                 * 不能挂在 `DOUBLE` / `BACK` 上。
                 *
                 * 为什么：双击的 `Backspace` 抬起到达时，
                 * 双击候选**已经被消费掉了**（见上面一行），
                 * 于是抬起会被判成「不是双击」⇒ 判成 `BACK`。
                 * 如果配对状态按判出来的动作分别记，
                 * `DOUBLE` 的按下与 `BACK` 的抬起就配不上 ——
                 * 抬起会**多执行一次返回**。
                 *
                 * 症状：双击切层 ⇒ 顺手把浮层也关了（板面态则跳到生辰录入）。
                 *
                 * 所以：配对用原始键值，只有**执行出去的动作名**才按双击与否改写。
                 */
                const emitted = keyOnce(action, phase, ts);
                if (emitted === null) return null;
                return isDouble ? ACTION.DOUBLE : ACTION.BACK;
            }

            // 方向键到达 ⇒ 刚才那个 GlobalHook 是滑动的头，不是点按
            cancelTemple();

            /**
             * 方向键配对吸收（**状态机**，不是单纯的时间窗）。
             *
             * 真机一次滑动发**一对**方向键（前滑 `ArrowRight`+`ArrowDown`，
             * 后滑 `ArrowLeft`+`ArrowUp`）。两个都执行 = 一次滑动跳两宫，
             * 而且两个键分属两个动作域（「切宫」和「切层」同时触发），
             * 表现就是评审说的「arrow 滑动事件问题 / 焦点切换问题 / 无法切换」。
             *
             * ⚠️ 判据是**配对关系**，不是「时间窗内的第二个方向键」：
             *   · 模拟器一次滑动只发**一个**方向键（swipe-up → `ArrowUp`），
             *     纯时间窗会把「快速连续两次同向滑动」吞掉；
             *   · 真机的配对键是**另一个**方向键（Right↔Down / Left↔Up），
             *     按配对关系判定既不会漏吸收，也不会误吞新的一次滑动。
             *
             * ⚠️ 只在 **down** 阶段判定：
             *   · 抬起事件必须照常走 keyOnce，否则配对状态悬着，
             *     下一次同键按压会被当成「重复按下」吞掉；
             *   · 而且被吸收的那个键，它的抬起会被当成「孤儿抬起」再执行一次。
             * 所以吸收时**仍然调用 keyOnce 维护配对状态，只是丢弃动作**。
             */
            if (phase === 'down') {
                const pending = dirPairPending;
                if (!pending) {
                    dirPairPending = { first: action, at: ts };
                } else if (ts - pending.at <= dirPairWindowMs) {
                    if (isDirPartner(pending.first, action)) {
                        /** 同一次滑动的配对键 ⇒ 吸收 */
                        dirPairPending = null;
                        keyOnce(action, phase, ts);
                        return null;
                    }
                    /** 不是配对键 ⇒ 新的一次滑动，重新起头 */
                    dirPairPending = { first: action, at: ts };
                } else {
                    /**
                     * 配对窗口已过：上一个方向键的配对键没来（或来晚了）。
                     * 这一下按**独立的一次方向输入**执行，且不再起头 ——
                     * 否则迟到的配对键会被当成新滑动的头，把下一次滑动整个吞掉。
                     */
                    dirPairPending = null;
                }
            }
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
