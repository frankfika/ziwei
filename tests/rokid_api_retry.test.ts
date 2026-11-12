/**
 * 眼镜端**追问重试**回归 —— 挂进回归套件。
 *
 * ── 这套测试守的是什么 ───────────────────────────────────────────
 * 2026-11-13 实测生产域名 `/api/agent/ask`：
 * 响应时间在 **15.8s / 29.6s / 34.2s / 36.5s / 47.6s / 57.5s** 之间大幅波动
 * （模型负载），而且**偶发整次失败** ——
 * 渲染提审预览视频时实测到一次，页面只能显示「这一问暂时没有回答，单击重试。」
 *
 * 眼镜上没有键盘、用户只能重按一次镜腿；而录制**赛事作品视频**时
 * 一次失败就得整段重拍 ⇒ `lib/api.js` 的 `requestAsk` 自动重试一次。
 *
 * 但**超时不能重试**：超时说明后端跑了很久、用户也等了很久，
 * 再来一轮只会把等待从 120s 翻成 240s。
 *
 * ⇒ 三条口径必须钉死：
 *  ① 5xx / 网络抖动 → 重试一次并成功；
 *  ② 一直失败 → 重试**一次**就抛（不能无限重试）；
 *  ③ 超时 → **一次都不重试**。
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Tester } from './harness';
import { type SuiteFn } from './harness';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = path.join(REPO_ROOT, 'apps/rokid-agent/lib/api.js');

type Api = typeof import('../apps/rokid-agent/lib/api.js');

const api = (await import(API)) as Api;

const BIRTH = { year: 1990, month: 1, day: 1, hour: 0, gender: 'male' };

/** 装一个假的 fetch，返回调用次数 */
function stubFetch(handler: (call: number) => { status?: number; body?: unknown; throwErr?: Error }) {
  const real = globalThis.fetch;
  const calls: number[] = [];
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    const n = calls.length + 1;
    calls.push(n);
    const r = handler(n);
    if (r.throwErr) throw r.throwErr;
    const status = r.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => r.body ?? {}
    } as unknown as Response;
  }) as typeof globalThis.fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = real;
    }
  };
}

export const suite: SuiteFn = async (t) => {
  /* ── ① 5xx 重试一次并成功 ───────────────────────────────── */

  await t.test('5xx：重试一次，第二次成功就返回（不把失败暴露给用户）', async () => {
    const stub = stubFetch((n) =>
      n === 1 ? { status: 503 } : { body: { answer: '**今年事业有进展。**', cited: [] } },
    );
    try {
      const res = await api.requestAsk(BIRTH, '今年事业怎么样');
      assert.equal(stub.calls.length, 2, `应重试一次（实际调用 ${stub.calls.length} 次）`);
      assert.ok(res.answer.includes('今年事业有进展'), res.answer);
      /** 重试成功的那次也要走纯文本化 —— 两条路径必须一致 */
      assert.ok(!res.answer.includes('**'), `重试路径漏了纯文本化：${res.answer}`);
    } finally {
      stub.restore();
    }
  });

  /* ── ② 一直失败：只重试一次就抛 ─────────────────────────── */

  await t.test('一直 5xx：重试一次后抛错（不无限重试）', async () => {
    const stub = stubFetch(() => ({ status: 503 }));
    try {
      await assert.rejects(() => api.requestAsk(BIRTH, '今年事业怎么样'));
      assert.equal(stub.calls.length, 2, `应恰好调用 2 次（实际 ${stub.calls.length}）`);
    } finally {
      stub.restore();
    }
  });

  /* ── ③ 超时不重试 ───────────────────────────────────────── */

  await t.test('超时：一次都不重试（用户已经等了 120s，不能再翻倍）', async () => {
    const abort = new Error('The operation was aborted');
    abort.name = 'AbortError';
    const stub = stubFetch(() => ({ throwErr: abort }));
    try {
      await assert.rejects(
        () => api.requestAsk(BIRTH, '今年事业怎么样'),
        (err: unknown) => {
          assert.ok((err as { isTimeout?: boolean }).isTimeout, '超时错误应带 isTimeout 标记');
          return true;
        },
      );
      assert.equal(stub.calls.length, 1, `超时应只调用 1 次（实际 ${stub.calls.length}）`);
    } finally {
      stub.restore();
    }
  });

  /* ── ④ 首轮成功就不该有第二次 ───────────────────────────── */

  await t.test('首轮成功：只调用一次（重试不能变成常态开销）', async () => {
    const stub = stubFetch(() => ({ body: { answer: '平顺。', cited: [] } }));
    try {
      const res = await api.requestAsk(BIRTH, '今年事业怎么样');
      assert.equal(stub.calls.length, 1);
      assert.equal(res.answer, '平顺。');
    } finally {
      stub.restore();
    }
  });

  /* ── ⑤ 解读接口的纯文本化 ───────────────────────────────── */

  await t.test('解读维度正文在 api 层就洗成纯文本（界面与 TTS 拿到的都干净）', async () => {
    const stub = stubFetch(() => ({
      body: {
        status: 'ok',
        dimensions: [{ key: 'overview', label: '命格总览', text: '**【命格总览】**\n\n🟢 **武曲化禄**（落夫妻）' }],
        citationModeLabel: '引文已降级'
      },
    }));
    try {
      const res = await api.requestReading(BIRTH);
      const text = res.dimensions![0].text;
      assert.ok(!text.includes('**'), `还有 ** 残留：${text}`);
      assert.ok(!text.includes('🟢'), `还有 emoji 残留：${text}`);
      assert.ok(text.includes('武曲化禄'), `内容丢了：${text}`);
      /** 引文模式标注**不能**被一起洗掉（那是必须披露的合规信息） */
      assert.equal(res.citationModeLabel, '引文已降级');
    } finally {
      stub.restore();
    }
  });
};
