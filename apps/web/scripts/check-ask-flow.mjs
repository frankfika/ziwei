/**
 * 追问流程端到端校验（无头 Chrome + CDP，零依赖）。
 *
 * 走真实交互路径：打开命盘页 → 填问题 → 点「追问」→ 等待回答渲染 → 校验内容。
 *
 * 需要模型 provider 环境变量（ZIWEI_ASK_PROVIDER / _BASE_URL / _API_KEY / _MODEL），
 * 否则只验证「未配置」分支。
 *
 * 用法：node apps/web/scripts/check-ask-flow.mjs [baseUrl]
 */
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.argv[2] ?? 'http://localhost:3000';
const PORT = Number(process.env.CDP_PORT ?? 9336);

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ziwei-ask-'));
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${PORT}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pageWsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      /* 还没起来 */
    }
    await sleep(250);
  }
  throw new Error('Chrome DevTools 端口未就绪');
}

const ws = new WebSocket(await pageWsUrl());
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

let msgId = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
});

function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) {
    throw new Error(
      r.exceptionDetails.exception?.description ??
        r.exceptionDetails.text ??
        'evaluate 失败',
    );
  }
  return r.result?.value;
}

await send('Page.enable');
await send('Runtime.enable');

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) {
    console.log(`  ✅ ${name}`);
    pass += 1;
  } else {
    console.log(`  ❌ ${name}${detail ? `  —— ${detail}` : ''}`);
    fail += 1;
  }
}

const configured = (() => {
  const p = (process.env.ZIWEI_ASK_PROVIDER ?? '').toLowerCase();
  if (!p) return false;
  // echo 本地桩不需要任何密钥
  if (p === 'echo' || p === 'local') return true;
  return Boolean(
    process.env.ZIWEI_ASK_BASE_URL && process.env.ZIWEI_ASK_API_KEY && process.env.ZIWEI_ASK_MODEL,
  );
})();

try {
  const url = `${BASE}/chart?y=1990&m=1&d=1&h=0&g=male`;
  await send('Page.navigate', { url });
  await sleep(2200);

  console.log('\n追问流程端到端校验\n');

  // 1. 面板存在
  const hasPanel = await evaluate(
    `(() => {
      const ta = document.querySelector('#ask-question');
      if (!ta) return false;
      const h = [...document.querySelectorAll('h2')].some((x) => x.textContent.includes('命盘追问'));
      return h;
    })()`,
  );
  check('命盘页出现「命盘追问」面板', hasPanel === true);

  // 2. 填问题 + 点击
  const filled = await evaluate(`(() => {
    const ta = document.querySelector('#ask-question');
    if (!ta) return 'missing';
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, '这份命盘在职业方向上有什么特点？');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return 'ok';
  })()`);
  check('问题输入框可填写', filled === 'ok');

  const clicked = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '追问');
    if (!btn) return 'missing';
    btn.click();
    return 'ok';
  })()`);
  check('「追问」按钮可点击', clicked === 'ok');

  // 3. 等回答
  let outcome = 'timeout';
  let detail = '';
  let last = null;
  for (let i = 0; i < 90; i++) {
    await sleep(1000);
    // 用 data-* 钩子判定状态，**不要**用文案子串 ——
    // 页脚的说明文字里也含「样本库未覆盖」，子串匹配会误判。
    const st = await evaluate(`(() => {
      const box = document.querySelector('[data-ask-state]');
      if (!box) return { s: 'pending' };
      const state = box.getAttribute('data-ask-state');
      const answer = document.querySelector('[data-ask-answer]');
      const verify = document.querySelector('[data-ask-verification]');
      return {
        s: state,
        t: document.body.innerText,
        hasAnswer: !!answer && (answer.innerText || '').trim().length > 40,
        verify: verify ? verify.getAttribute('data-ask-verification') : null,
        thinkLeak: (document.body.innerText || '').includes('<think>'),
      };
    })()`);
    if (st && st.s !== 'pending') {
      outcome = st.s;
      detail = st.t ?? '';
      last = st;
      break;
    }
  }

  if (configured) {
    check('追问返回了回答（真实 provider）', outcome === 'ok', `实际状态：${outcome}`);
    if (outcome === 'ok') {
      check('回答正文非空', last?.hasAnswer === true);
      check('展示了机械自检结论', last?.verify === 'clean' || last?.verify === 'warn');
      check('未出现思维链残留（<think>）', last?.thinkLeak === false);

      // 会话存档：刷新页面后回答仍在（localStorage 线程）
      await send('Page.navigate', { url });
      await sleep(2200);
      await evaluate(`(() => {
        const btn = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-controls') === 'ask-panel-content');
        if (btn && btn.getAttribute('aria-expanded') !== 'true') btn.click();
        return 'ok';
      })()`);
      await sleep(600);
      const persisted = await evaluate(`(() => {
        const a = document.querySelector('[data-ask-answer]');
        return !!a && (a.innerText || '').trim().length > 40;
      })()`);
      check('刷新后对话仍在（线程存档）', persisted === true);
    }
  } else {
    check(
      '未配置 provider 时给出明确指引',
      outcome === 'not-configured',
      `实际状态：${outcome}`,
    );
  }

  // 3.5 截图（可选）
  if (process.env.SHOT_DIR) {
    // 放到 1440×900，并显式滚到答案区（scrollIntoView 在非文档滚动容器里不可靠）
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
    });
    await sleep(400);
    await evaluate(`(() => {
      const el = document.querySelector('[data-ask-answer]');
      if (!el) return 'missing';
      const y = el.getBoundingClientRect().top + window.scrollY - 24;
      window.scrollTo(0, y);
      return 'ok';
    })()`);
    await sleep(700);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.mkdirSync(process.env.SHOT_DIR, { recursive: true });
    const file = path.join(process.env.SHOT_DIR, 'ask-flow.png');
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
    console.log(`   📸 ${file}`);
  }

  // 4. 页面无横向溢出
  const overflow = await evaluate(
    '({ doc: document.documentElement.scrollWidth, vp: window.innerWidth })',
  );
  check(
    '追问后页面无横向溢出',
    overflow.doc <= overflow.vp + 1,
    `scrollWidth=${overflow.doc} vw=${overflow.vp}`,
  );
} finally {
  ws.close();
  chrome.kill();
  try {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Chrome 可能还在写 profile */
  }
}

console.log(`\n${fail === 0 ? '✅ 全部通过' : '❌ 有失败'}：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
