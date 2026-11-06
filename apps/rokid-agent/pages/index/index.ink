<script def>
{
    "navigationBarTitleText": "紫微星盘",
    "description": "展示紫微斗数十二宫命盘：宫位、主星与四化，可切换本命、大限、流年、流月四层运限。用户抬头低头转头用准星选宫，按确认键听该宫解读，也可以基于这张盘追问。",
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
    neighborBranch,
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
import { shouldAcceptKey } from '../../lib/key-guard.js';
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
import { speak, stopSpeaking } from '../../lib/tts.js';
import { parseBirthFromSpeech } from '../../lib/birth-parser.js';
import { listenOnce } from '../../lib/voice-input.js';

const KeyCode = Object.freeze({
    UP: 'ArrowUp',
    DOWN: 'ArrowDown',
    LEFT: 'ArrowLeft',
    RIGHT: 'ArrowRight',
    CONFIRM: 'Enter',
    BACK: 'Backspace'
});

/** 传感器采样频率（Hz）与首帧超时 */
const SENSOR = Object.freeze({
    FREQUENCY: 30,
    FIRST_FRAME_TIMEOUT_MS: 1500
});

/** 快捷问题（语音不可用时的兜底，也保证演示路径是确定的） */
const PRESET_QUESTIONS = Object.freeze([
    '今年这一层盘面有什么变化',
    '我的性格特点是什么',
    '事业上什么时候适合变动',
    '和伴侣的相处要注意什么'
]);

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
        /** 键位提示（随能力变） */
        navHint: '左右选宫　上下切层',
        sourceLabel: '',
        sensorLabel: '',
        voiceHint: '说出你的生辰，例如：1990年1月1日 子时 男',
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
        this._keyGuard = { lastCode: null, lastTs: 0 };
        this._sensorMode = 'none';
        this._readingCache = null;
        this._citationLabel = '';
        this._lastError = '';
        /** 四个时间层（运限）。端侧引擎不可用时全是 null。 */
        this._layers = null;
        /** 运限层是否可用 */
        this._layersReady = false;

        const birth = this._resolveBirth(query);
        if (!birth) {
            this.setData({ needInput: true, overlay: 'input', ready: true });
            return;
        }
        this._birth = birth;
        this._chart(birth);
    },

    onReady() {
        this._startSensors();
    },

    onUnload() {
        this._stopSensors();
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

    onKeyUp(event) {
        const code = event && event.code;
        if (!code) return;
        // 同 code 在 150ms 内的重复上报（GlobalHook 滑动误报）直接丢弃
        if (!shouldAcceptKey(this._keyGuard, code, Date.now())) return;

        if (this.data.overlay === 'input') {
            if (code === KeyCode.CONFIRM) this._startVoiceInput();
            else if (code === KeyCode.BACK) this.finish();
            return;
        }

        if (this.data.overlay === 'reading') {
            if (code === KeyCode.BACK) this._closeOverlay();
            else if (code === KeyCode.CONFIRM) this._openAsk();
            return;
        }

        if (this.data.overlay === 'ask') {
            if (code === KeyCode.BACK) this._closeOverlay();
            else if (code === KeyCode.CONFIRM) this._submitAsk(this.data.askQuestion);
            else if (code === KeyCode.UP || code === KeyCode.DOWN) this._cyclePreset(code === KeyCode.UP ? -1 : 1);
            return;
        }

        if (code === KeyCode.UP) this._vertical(-1);
        else if (code === KeyCode.DOWN) this._vertical(1);
        else if (code === KeyCode.LEFT) this._select(stepRing(this.data.selectedBranch, -1));
        else if (code === KeyCode.RIGHT) this._select(stepRing(this.data.selectedBranch, 1));
        else if (code === KeyCode.CONFIRM) this._openReading();
        else if (code === KeyCode.BACK) this.finish();

        if (typeof event.preventDefault === 'function') {
            event.preventDefault();
        }
    },

    /* ---------------------------------------------------------------- *
     * 排盘
     * ---------------------------------------------------------------- */

    _resolveBirth(query) {
        const q = query || {};
        const year = Number(q.year);
        const month = Number(q.month);
        const day = Number(q.day);
        const hour = Number(q.hour);
        const gender = q.gender === 'female' ? 'female' : q.gender === 'male' ? 'male' : null;

        if (
            Number.isInteger(year) && year >= 1900 && year <= 2100 &&
            Number.isInteger(month) && month >= 1 && month <= 12 &&
            Number.isInteger(day) && day >= 1 && day <= 31 &&
            Number.isInteger(hour) && hour >= 0 && hour <= 11 &&
            gender
        ) {
            return { year, month, day, hour, gender, name: q.name || '' };
        }

        const saved = latestProfile();
        return saved ? { ...saved } : null;
    },

    async _chart(birth) {
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

            upsertProfile(birth);

            const layerView = this._layerView('natal', board.center);

            this.setData({
                ready: true,
                needInput: false,
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
                sourceLabel: result.source === 'device' ? '端侧计算' : '服务端计算'
            });
        } catch (err) {
            this.setData({
                ready: true,
                needInput: true,
                overlay: 'input',
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
     * 上下键切层。
     *
     * 只在**有层可切**时切：传感器全废（没有准星也没有抬头低头）时，
     * 上下键必须留给选宫 —— 那时候选宫是更基本的需要。
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
 * 上下键当前是「切层」还是「选宫」。
 *
 * 左右键沿盘面外圈巡宫，十二宫**全部可达**，所以上下键可以整条让给时间层
 * （那是这个作品的主功能，不能没有）。
 * 唯一例外：端侧引擎没加载时压根没有运限层可切，这时上下键退回纵向选宫。
 *
 * @returns {boolean}
 */
_verticalIsLayer() {
    return this._layersReady;
},

/**
 * 键位提示（界面文案必须跟实际能力一致，不能承诺做不到的事）。
 *
 * @returns {string}
 */
_navHint() {
    return this._verticalIsLayer() ? '左右选宫　上下切层' : '左右选宫　上下选宫';
},

/**
 * 上下键：切层 or 选宫（纵向）。
 *
 * @param {number} delta -1 上 / +1 下
 */
_vertical(delta) {
    if (this._verticalIsLayer()) {
        this._cycleLayer(delta);
        return;
    }
    this._select(neighborBranch(this.data.selectedBranch, 0, delta));
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
            this.setData({ sensorLabel: '头部准星', navHint: this._navHint() });
        } catch (err) {
            this._fallbackToTilt();
        }
    },

    _fallbackToTilt() {
        if (this._sensorMode === 'tilt') return;
        this._sensorMode = 'tilt';
        this.setData({ sensorLabel: '抬头选宫', navHint: this._navHint() });

        try {
            const sensor = new Accelerometer({ frequency: SENSOR.FREQUENCY });
            this._accel = sensor;
            sensor.addEventListener('reading', () => {
                const res = updateTilt(this._tilt, {
                    x: sensor.x,
                    y: sensor.y,
                    z: sensor.z
                });
                this._tilt = res.state;
                if (res.changed) this._select(res.branch);
            });
            sensor.start();
        } catch (err) {
            this._sensorMode = 'none';
            this.setData({ sensorLabel: '镜腿选宫', navHint: this._navHint() });
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
            readingLoading: true
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
            speak(text);
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
            askFocus: this._focusLabel(question)
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

        this.setData({ askLoading: true, askQuestion: q, askAnswer: '', askFocus: this._focusLabel(q) });
        try {
            const res = await requestAsk(this._birth, q, [], this._focusFor(q));
            const answer = (res && res.answer) || '这一问暂时没有回答。';
            this.setData({
                askAnswer: answer,
                askLoading: false,
                // 追问的回答同样可能含受限引文，模式一并披露
                askCitation: (res && res.citationModeLabel) || ''
            });
            speak(answer);
        } catch (err) {
            this.setData({
                askAnswer: '追问暂时不可用，盘面和解读不受影响。',
                askLoading: false
            });
        }
    },

    _closeOverlay() {
        stopSpeaking();
        this.setData({ overlay: '', askLoading: false, readingLoading: false });
    },

    /* ---------------------------------------------------------------- *
     * 语音录入生辰
     * ---------------------------------------------------------------- */

    async _startVoiceInput() {
        this.setData({ voiceHint: '在听……请说出你的生辰', heardText: '' });
        const text = await listenOnce();
        if (!text) {
            this.setData({ voiceHint: '没听清，再说一次：1990年1月1日 子时 男' });
            return;
        }

        this.setData({ heardText: text });

        const birth = parseBirthFromSpeech(text);
        if (!birth) {
            this.setData({ voiceHint: '没解析出年月日和时辰，换个说法试试' });
            return;
        }

        this.setData({ voiceHint: '已识别，正在排盘' });
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
            <text class="center-hint">确认键听解读　{{navHint}}</text>
            <text class="center-hint dim">{{sensorLabel}}　{{sourceLabel}}</text>
        </view>

        <view class="overlay" ink:if="{{overlay === 'input'}}">
            <text class="overlay-title">说出你的生辰</text>
            <text class="overlay-body">{{voiceHint}}</text>
            <text class="overlay-body strong" ink:if="{{heardText}}">{{heardText}}</text>
            <text class="overlay-body dim">格式：1990年1月1日 子时 男</text>
            <text class="overlay-body error" ink:if="{{errorText}}">{{errorText}}</text>
            <text class="overlay-hint">确认键开始识别　返回键退出</text>
        </view>

        <view class="overlay" ink:if="{{overlay === 'reading'}}">
            <text class="overlay-title">{{readingTitle}}</text>
            <text class="overlay-body dim">{{readingDimension}}</text>
            <scroll-view class="reading-scroll" scroll-y="{{true}}">
                <text class="reading-text" ink:if="{{!readingLoading}}">{{readingText}}</text>
                <text class="reading-text dim" ink:if="{{readingLoading}}">正在检索解读原文……</text>
            </scroll-view>
            <text class="overlay-note" ink:if="{{readingCitation}}">{{readingCitation}}</text>
            <text class="overlay-note">传统文化学习与研究用 · 不构成医疗、法律、投资或人生决策建议</text>
            <text class="overlay-hint">确认键追问　返回键退出</text>
        </view>

        <view class="overlay" ink:if="{{overlay === 'ask'}}">
            <text class="overlay-title">追问</text>
            <text class="overlay-body strong">{{askQuestion}}</text>
            <text class="overlay-body dim" ink:if="{{askFocus}}">{{askFocus}}</text>
            <scroll-view class="reading-scroll" scroll-y="{{true}}">
                <text class="reading-text" ink:if="{{!askLoading}}">{{askAnswer}}</text>
                <text class="reading-text dim" ink:if="{{askLoading}}">正在推演……</text>
            </scroll-view>
            <text class="overlay-note" ink:if="{{askCitation}}">{{askCitation}}</text>
            <text class="overlay-note">传统文化学习与研究用 · 不构成医疗、法律、投资或人生决策建议</text>
            <text class="overlay-hint">上下键选问题　确认键发送　返回键退出</text>
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
