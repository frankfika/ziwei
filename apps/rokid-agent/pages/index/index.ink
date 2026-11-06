<script def>
{
    "navigationBarTitleText": "紫微星盘",
    "description": "展示紫微斗数十二宫命盘：宫位、主星与四化。用户抬头低头转头用准星选宫，单击确认后听该宫解读，也可以基于这张盘追问。",
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
    dimensionOfPalace,
    DIMENSION_LABELS,
} from '../../lib/chart-layout.js';
import {
    createCursorState,
    updateCursor,
    createTiltState,
    updateTilt,
} from '../../lib/head-cursor.js';
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
    '今年的整体运势如何',
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
        presets: PRESET_QUESTIONS,
        errorText: ''
    },

    onLoad(query) {
        this._cursor = createCursorState();
        this._tilt = createTiltState();
        this._sensorMode = 'none';
        this._readingCache = null;
        this._citationLabel = '';
        this._lastError = '';

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

        if (this.data.overlay === 'input') {
            if (code === KeyCode.CONFIRM) this._startVoiceInput();
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

        if (code === KeyCode.UP) this._select(neighborBranch(this.data.selectedBranch, 0, -1));
        else if (code === KeyCode.DOWN) this._select(neighborBranch(this.data.selectedBranch, 0, 1));
        else if (code === KeyCode.LEFT) this._select(neighborBranch(this.data.selectedBranch, -1, 0));
        else if (code === KeyCode.RIGHT) this._select(neighborBranch(this.data.selectedBranch, 1, 0));
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

            upsertProfile(birth);

            this.setData({
                ready: true,
                needInput: false,
                cells: markActive(board.cells, mingBranch),
                center: board.center,
                selectedBranch: mingBranch,
                selectedName: (cellAt(board.cells, mingBranch) || {}).name || '命宫',
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
            this.setData({ sensorLabel: '头部准星' });
        } catch (err) {
            this._fallbackToTilt();
        }
    },

    _fallbackToTilt() {
        if (this._sensorMode === 'tilt') return;
        this._sensorMode = 'tilt';
        this.setData({ sensorLabel: '抬头选宫' });

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
            this.setData({ sensorLabel: '镜腿选宫' });
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
        this.setData({
            overlay: 'reading',
            readingTitle: `${cell.name}　${cell.stemName}${cell.branchName}`,
            readingDimension: dimension ? DIMENSION_LABELS[dimension] : '命盘',
            readingText: '',
            readingLoading: true
        });

        speak(`${cell.name}，${cell.majorText || '空宫'}`);

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

    _openAsk() {
        this.setData({
            overlay: 'ask',
            askQuestion: this.data.presets[0],
            askAnswer: ''
        });
    },

    _cyclePreset(delta) {
        const list = this.data.presets;
        const current = list.indexOf(this.data.askQuestion);
        const next = list[((current < 0 ? 0 : current) + delta + list.length) % list.length];
        this.setData({ askQuestion: next });
    },

    async _submitAsk(question) {
        const q = (question || '').trim();
        if (!q || this.data.askLoading) return;

        this.setData({ askLoading: true, askQuestion: q, askAnswer: '' });
        try {
            const res = await requestAsk(this._birth, q, []);
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
                <text class="palace-name">{{item.name}}</text>
                <text class="gan-zhi">{{item.stemName}}{{item.branchName}}</text>
            </view>
            <text class="major">{{item.majorText}}</text>
            <text class="minor">{{item.minorText}}</text>
        </view>

        <view class="center">
            <text class="center-title">{{center.yinYangGender}}　{{center.wuxingJuName}}</text>
            <text class="center-line">命主 {{center.mingZhu}}　身主 {{center.shenZhu}}</text>
            <text class="center-line dim">{{center.lunarText}}</text>
            <text class="center-line dim">{{center.pillarsText}}</text>
            <view class="center-divider"></view>
            <text class="center-line strong">{{selectedName}}</text>
            <text class="center-hint">{{sensorLabel}}　单击听解读</text>
            <text class="center-hint dim">{{sourceLabel}}</text>
        </view>

        <view class="overlay" ink:if="{{overlay === 'input'}}">
            <text class="overlay-title">说出你的生辰</text>
            <text class="overlay-body">{{voiceHint}}</text>
            <text class="overlay-body strong" ink:if="{{heardText}}">{{heardText}}</text>
            <text class="overlay-body dim">格式：1990年1月1日 子时 男</text>
            <text class="overlay-body error" ink:if="{{errorText}}">{{errorText}}</text>
            <text class="overlay-hint">单击开始识别　双击返回</text>
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
            <text class="overlay-hint">单击追问　双击返回</text>
        </view>

        <view class="overlay" ink:if="{{overlay === 'ask'}}">
            <text class="overlay-title">追问</text>
            <text class="overlay-body strong">{{askQuestion}}</text>
            <scroll-view class="reading-scroll" scroll-y="{{true}}">
                <text class="reading-text" ink:if="{{!askLoading}}">{{askAnswer}}</text>
                <text class="reading-text dim" ink:if="{{askLoading}}">正在推演……</text>
            </scroll-view>
            <text class="overlay-note" ink:if="{{askCitation}}">{{askCitation}}</text>
            <text class="overlay-note">传统文化学习与研究用 · 不构成医疗、法律、投资或人生决策建议</text>
            <text class="overlay-hint">上下切换问题　单击发送</text>
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

.palace-name {
    font-size: 13px;
    line-height: 15px;
    font-weight: bold;
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
    margin-top: 4px;
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

.center-hint.dim {
    color: #174526;
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
