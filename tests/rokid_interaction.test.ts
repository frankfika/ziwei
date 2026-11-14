/**
 * 交互重构门禁 —— 2026-11-14 第一批（缺陷 A + 可点建议语 + 打字提问）。
 *
 * 为什么要有这个文件：
 *   2026-11-14 Frank 在 AIUI Studio 模拟调试里指出两件事：
 *     ① 「推演期间按下去毫无反馈」= 观感就是死机（**缺陷 A**）；
 *     ② 「看不出来该点什么才能提问」—— 建议语是**纯 `<text>`，根本点不了**。
 *   这两条都是**结构性的**，肉眼在模拟器里看几遍容易漏，
 *   而漏了就等于没改 ⇒ 必须钉进回归网。
 *
 * 断言口径（沿用本仓库的老规矩）：
 *   · **纯函数**直接测（宿主能力探测）；
 *   · **页面模板**读源码断言结构 —— 只断言「必须存在」，
 *     并且**同时断言「旧的静默写法不许回来」**（否则新增一处就白改了）。
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { canTypeText } from '../apps/rokid-agent/lib/host-caps.js';
import { SUGGESTIONS } from '../apps/rokid-agent/lib/chat-store.js';
import type { Tester } from './harness';
import { type SuiteFn } from './harness';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE_FILE = path.join(REPO_ROOT, 'apps/rokid-agent/pages/index/index.ink');
const page = readFileSync(PAGE_FILE, 'utf8');

export const suite: SuiteFn = async (t: Tester) => {
    /* -------------------------------------------------------------- *
     * 宿主能力探测：能不能打字
     * -------------------------------------------------------------- */
    await t.test('canTypeText：没有 DOM ⇒ 判定为「不能打字」（眼镜）', () => {
        assert.equal(canTypeText({}), false);
        assert.equal(canTypeText({ document: null }), false);
        assert.equal(canTypeText({ document: {} }), false);
    });

    await t.test('canTypeText：有 DOM ⇒ 判定为「能打字」（模拟器 / 电脑）', () => {
        assert.equal(
            canTypeText({ document: { createElement: () => ({}) } }),
            true
        );
    });

    await t.test('canTypeText：Node 环境（没有 document）⇒ false', () => {
        assert.equal(canTypeText(), false);
    });

    /* -------------------------------------------------------------- *
     * 缺陷 A：busy 状态不许再「静默丢弃」
     * -------------------------------------------------------------- */
    await t.test('缺陷 A：推演期间再按一次，会给「正在推演，请稍候」的反馈', () => {
        assert.ok(
            page.includes("this._refreshStatus('正在推演，请稍候')"),
            '页面里找不到推演中的反馈提示 —— 缺陷 A 没修'
        );
    });

    await t.test('缺陷 A：识别中再按一次，会给「正在聆听，请稍候」的反馈', () => {
        assert.ok(
            page.includes("this._refreshStatus('正在聆听，请稍候')"),
            '页面里找不到聆听中的反馈提示 —— 缺陷 A 没修'
        );
    });

    await t.test('缺陷 A：旧的静默 return 写法不许回来', () => {
        // 旧写法：`if (!q || this._askLoading) return;` / `if (this._listening) return;`
        // 这两行一出现，就说明有人又把 busy 状态变回「按了没反应」了。
        //
        // ⚠️ **只匹配「代码形态」**：页面注释里就写着这两句作为反例
        // （讲清楚为什么不能静默 return），所以不能用子串匹配 ——
        // 否则注释里的反例会被当成「缺陷复发」。
        // 判据 = 整行就是这句 if（行内没有别的说明文字）。
        const silentListening = /^\s*if \(this\._listening\) return;\s*$/m;
        const silentAskLoading = /^\s*if \([^)]*_askLoading[^)]*\) return;\s*$/m;
        assert.equal(
            silentListening.test(page),
            false,
            '出现了静默的 _listening return —— 缺陷 A 复发'
        );
        assert.equal(
            silentAskLoading.test(page),
            false,
            '出现了静默的 _askLoading return —— 缺陷 A 复发'
        );
    });

    /* -------------------------------------------------------------- *
     * 建议语可点（模拟器 / 电脑的鼠标路径）
     * -------------------------------------------------------------- */
    await t.test('四条建议语各自绑定了自己的 tap 处理器', () => {
        for (const name of ['onSug0', 'onSug1', 'onSug2', 'onSug3']) {
            const hits = page.split(`bindtap="${name}"`).length - 1;
            assert.equal(hits, 1, `${name} 的 bindtap 绑定次数应为 1，实际 ${hits}`);
        }
    });

    await t.test('建议语 chip 渲染的是 sug0~sug3 四个固定字段', () => {
        for (const key of ['sug0', 'sug1', 'sug2', 'sug3']) {
            assert.ok(
                page.includes(`{{${key}}}`),
                `模板里找不到 {{${key}}} —— 建议语 chip 没接上`
            );
        }
    });

    await t.test('建议语 chip 的四条与 SUGGESTIONS 常量一一对应', () => {
        assert.equal(SUGGESTIONS.length, 4, '建议语应当是四条');
        // 页面 data 里 sug0..sug3 依次取 SUGGESTIONS[0..3]
        for (let i = 0; i < 4; i += 1) {
            assert.ok(
                page.includes(`sug${i}: SUGGESTIONS[${i}]`),
                `data.sug${i} 应当等于 SUGGESTIONS[${i}]`
            );
        }
    });

    /* -------------------------------------------------------------- *
     * 打字提问（只在有键盘的宿主上出现）
     * -------------------------------------------------------------- */
    await t.test('输入框与发送按钮存在，且带事件绑定', () => {
        assert.ok(page.includes('<input class="chat-input"'), '找不到打字输入框');
        assert.ok(page.includes('bindinput="onTypeInput"'), '输入框没有绑 onTypeInput');
        assert.ok(page.includes('bindtap="onSendTyped"'), '发送按钮没有绑 onSendTyped');
    });

    await t.test('输入框区域由 canType 守卫 —— 眼镜上不会出现打不了字的输入框', () => {
        assert.ok(
            page.includes('ink:if="{{canType}}"'),
            '找不到 canType 守卫 —— 眼镜上可能出现没法用的输入框'
        );
        assert.ok(
            page.includes('ink:if="{{!canType}}"'),
            '找不到眼镜端的降级分支'
        );
    });

    await t.test('页面在加载时探测宿主能力并写进 canType', () => {
        assert.ok(
            page.includes('this.setData({ canType: canTypeText() })'),
            'onLoad 里没有探测宿主打字能力'
        );
    });

    await t.test('眼镜端降级分支给的是「双击问这一句」，不是输入框', () => {
        assert.ok(
            page.includes('双击镜腿问这一句'),
            '眼镜端没有可执行的下一步提示 —— 用户会不知道该干什么'
        );
    });
};
