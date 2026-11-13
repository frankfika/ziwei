/**
 * 眼镜端**语音输入**回归 —— 挂进回归套件。
 *
 * ── 这套测试守的是什么 ───────────────────────────────────────────
 * 眼镜上「说话」是**唯一的主输入**：换生辰、问这宫、追问全靠它。
 * 2026-11-13 在 AIUI Studio 的**真实 ink 运行时**里实测时，
 * 语音链路踩到了一个很隐蔽的坑：
 *
 *   宿主的 `onresult` **每次都带完整结果集，但不保证每次都非空**。
 *   实测顺序是：
 *     ① `onresult`（带文本）   → 页面显示「在听：1989年12月5日 子时 男」
 *     ② `onresult`（**空**）     → 识别层把已听到的文本**清空了**
 *     ③ `onend`                 → 收尾时读到的是**空串**
 *
 *   于是「明明听清了」却把**空串**交给页面 ⇒ 生辰解析失败 ⇒ 盘面不重排，
 *   而且状态行被迟到的回调改回「在听：…」，用户看到的是
 *   「我明明说了话，页面却一直显示在听」。
 *
 * 另外两个同源的风险：
 *   · 宿主把结果**晚于** `onend` 送到 ⇒ 迟到的回调会把界面说谎；
 *   · 宿主既不回调 `onend` 也不给结果 ⇒ `await` 永远挂着 ⇒
 *     「正在听」那把锁永远不解 ⇒ **之后每一次开口都被挡掉**，
 *     语音输入彻底死掉（眼镜上没有键盘，用户唯一的出路是重开应用）。
 *
 * ── 守住的四条 ───────────────────────────────────────────────────
 *  ① 空结果**不许**清空已经听到的文本；
 *  ② 收尾之后到达的结果**一律丢弃**（不许再改状态行）；
 *  ③ `withTimeout` 到点必须**拒收**（让页面回到「没听清」而不是卡死）；
 *  ④ 迟到的 Promise 拒收不许变成未捕获异常。
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Tester } from './harness';
import { isMainModule, runStandalone, type SuiteFn } from './harness';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const VOICE_INPUT = path.join(REPO_ROOT, 'apps/rokid-agent/lib/voice-input.js');

type VoiceInput = typeof import('../apps/rokid-agent/lib/voice-input.js');

const voice = (await import(VOICE_INPUT)) as VoiceInput;

/** 一条识别结果（Web 风格的 `results` 形状） */
interface MockResult {
    transcript: string;
    isFinal?: boolean;
}

/** 最近一次创建的识别实例 —— 测试靠它把事件喂进去 */
let lastInstance: MockSpeechRecognition | null = null;

/**
 * 假宿主：按脚本把事件喂给页面。
 *
 * 形状照 Web SpeechRecognition：构造器上有 `onresult` / `onend`，
 * `start()` 之后由测试自己按顺序触发。
 */
class MockSpeechRecognition {
    onresult: ((event: { results: MockResult[][] }) => void) | null = null;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    continuous = false;
    interimResults = false;
    lang = '';
    maxAlternatives = 1;
    stopped = false;

    /** 带文本的结果 */
    emitResult(transcript: string, isFinal = true): void {
        this.onresult?.({ results: [[{ transcript, isFinal }]] });
    }

    /** 空结果 —— 宿主「重置」识别时会给这个 */
    emitEmpty(): void {
        this.onresult?.({ results: [[]] });
    }

    emitEnd(): void {
        this.onend?.();
    }

    start(): void {
        lastInstance = this;
    }

    stop(): void {
        this.stopped = true;
    }

    abort(): void {
        this.stopped = true;
    }
}

/** 把假宿主装到 globalThis 上（voice-input.js 运行时才去读这个全局） */
function installMock(): void {
    (globalThis as unknown as { SpeechRecognition: unknown }).SpeechRecognition = MockSpeechRecognition;
    lastInstance = null;
}

function removeMock(): void {
    delete (globalThis as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
}

/** 让出事件循环，等识别层把回调跑完 */
const tick = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** 等识别实例建好（`import('wx')` 失败之后才会落到 Web 分支） */
async function waitForInstance(): Promise<MockSpeechRecognition> {
    for (let i = 0; i < 100; i += 1) {
        if (lastInstance) return lastInstance;
        await tick(2);
    }
    throw new Error('识别实例没有建起来');
}

export const suite: SuiteFn = async (t) => {
    await t.test('空结果不许清空已经听到的文本（收尾要交出听清的那句）', async () => {
        installMock();
        try {
            const seen: string[] = [];
            const promise = voice.listenSession({
                timeout: 5000,
                silenceMs: 5000,
                continuous: true,
                onPartial: (p) => seen.push(p)
            });
            const inst = await waitForInstance();

            inst.emitResult('1989年12月5日 子时 男', true);
            await tick(5);
            inst.emitEmpty();
            await tick(5);
            inst.emitEnd();

            const text = await promise;
            assert.equal(text, '1989年12月5日 子时 男', '空结果之后仍然要交出听清的文本');
            assert.ok(seen.includes('1989年12月5日 子时 男'), '中途应当把文本报给页面');
        } finally {
            removeMock();
        }
    });

    await t.test('收尾之后到达的结果一律丢弃（不许再改状态行）', async () => {
        installMock();
        try {
            const seen: string[] = [];
            const promise = voice.listenSession({
                timeout: 5000,
                silenceMs: 5000,
                continuous: true,
                onPartial: (p) => seen.push(p)
            });
            const inst = await waitForInstance();

            inst.emitResult('今年事业怎么样', true);
            await tick(5);
            inst.emitEnd();
            const text = await promise;
            assert.equal(text, '今年事业怎么样');

            /** 迟到的结果 —— 收尾之后才到 */
            const before = seen.length;
            inst.emitResult('迟到的结果', true);
            await tick(5);
            assert.equal(seen.length, before, '收尾之后不该再报给页面');
        } finally {
            removeMock();
        }
    });

    await t.test('withTimeout：到点拒收（页面回到「没听清」，而不是卡死）', async () => {
        let rejected = false;
        try {
            await voice.withTimeout(new Promise(() => {}), 30);
        } catch (err) {
            rejected = true;
            assert.ok(err instanceof Error);
        }
        assert.equal(rejected, true, '悬挂的 Promise 必须被超时拒收');
    });

    await t.test('withTimeout：正常兑现的 Promise 原样通过', async () => {
        const value = await voice.withTimeout(Promise.resolve('听到了'), 1000);
        assert.equal(value, '听到了');
    });

    await t.test('withTimeout：迟到的拒收不许变成未捕获异常', async () => {
        /** 先拒收（超时），再让原 Promise 晚一点拒收 */
        const late = new Promise((_resolve, reject) => {
            setTimeout(() => reject(new Error('迟到的失败')), 40);
        });
        let caught = '没有拒收';
        try {
            await voice.withTimeout(late, 10);
        } catch (err) {
            caught = err instanceof Error ? err.message : String(err);
        }
        assert.notEqual(caught, '没有拒收', '应当被超时拒收');
        await tick(60);
        /** 跑到这里没崩 ⇒ 迟到的拒收被吞掉了 */
        assert.ok(true);
    });
};

/**
 * 独立运行：
 *
 *   npx tsx tests/rokid_voice.test.ts
 */
if (isMainModule(import.meta.url)) {
  await runStandalone(suite, '眼镜端语音输入');
}
