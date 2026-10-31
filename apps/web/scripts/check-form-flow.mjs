/**
 * 表单流程端到端校验（无头 Chrome + CDP，零依赖）。
 *
 * 走真实交互路径：填日期 → 切「按钟点」→ 填钟点 → 提交 → 校验跳转 URL 与页面提示。
 * 覆盖：时辰模式、钟点模式、晚子时顺延、未覆盖年份。
 *
 * 用法：node apps/web/scripts/check-form-flow.mjs [baseUrl]
 */
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.argv[2] ?? 'http://localhost:3000';
const PORT = 9334;

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ziwei-flow-'));
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
// 固定桌面视口：命盘页桌面/移动各渲染一套宫位按钮，不定视口会让计数漂移
await send('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});

/** 设置受控 <select> / <input> 的值并触发 React 的 onChange */
function setValueExpr(sel, val) {
  return `(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return 'missing:' + ${JSON.stringify(sel)};
  const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(el, ${JSON.stringify(val)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return 'ok';
})()`;
}

const setValue = (sel, val) => evaluate(setValueExpr(sel, val));

/** 按可见文案点击按钮 */
function clickByText(text) {
  return `(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(text)});
  if (!btn) return 'missing';
  btn.click();
  return 'ok';
})()`;
}

async function goto(url) {
  await send('Page.navigate', { url });
  await sleep(1800);
}

async function waitForUrlChange(prev, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const href = await evaluate('location.href');
    if (href && href !== prev) {
      // URL 变了不代表渲染完 —— dev 模式下页面内容要等重编译
      await sleep(1800);
      return href;
    }
    await sleep(300);
  }
  return null;
}

let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
}

/* ── 用例 1：时辰模式 1990-01-01 子时 男 ───────────────────────── */
await goto(`${BASE}/`);
await setValue('#zi-date', '1990-01-01');
await sleep(300);

const preview = await evaluate(`(() => document.body.innerText)()`);
check(
  '时辰模式：实时口径提示已生成',
  preview.includes('将按 1990 年 1 月 1 日 子时 排盘'),
  preview.slice(0, 60),
);

const before1 = await evaluate('location.href');
await evaluate(`document.querySelector('button[type="submit"]').click()`);
const url1 = await waitForUrlChange(before1);
check(
  '时辰模式提交 → /chart 携带 y/m/d/h/g',
  !!url1 && /\/chart\?y=1990&m=1&d=1&h=0&g=male/.test(url1),
  url1 ?? '未跳转',
);

/* ── 用例 2：钟点模式 23:30 → 次日子时 ─────────────────────────── */
await goto(`${BASE}/`);
await setValue('#zi-date', '1990-01-01');
await sleep(200);

// 切到「按钟点」
await evaluate(clickByText('按钟点'));
await sleep(400);

await setValue('#zi-clock', '23:30');
await sleep(400);

const clockPreview = await evaluate(`(() => document.body.innerText)()`);
check(
  '钟点模式：23:30 提示顺延至次日',
  clockPreview.includes('晚子时') && clockPreview.includes('将按 1990 年 1 月 2 日 子时 排盘'),
  clockPreview.replace(/\s+/g, ' ').match(/将按[^。]*/)?.[0] ?? '未见口径行',
);

const before2 = await evaluate('location.href');
await evaluate(`document.querySelector('button[type="submit"]').click()`);
const url2 = await waitForUrlChange(before2);
check(
  '钟点 23:30 → 排盘日顺延到 1990-01-02 子时',
  !!url2 && /y=1990&m=1&d=2&h=0/.test(url2) && /late=1/.test(url2) && /bd=1990-01-01/.test(url2),
  url2 ?? '未跳转',
);

if (url2) {
  const notice = await evaluate(
    `document.body.innerText.includes('已按晚子时规则调整') ? 'yes' : 'no'`,
  );
  check('命盘页显示「已按晚子时规则调整」', notice === 'yes', notice);
}

/* ── 用例 3：钟点模式 00:30 → 当日子时（不顺延） ───────────────── */
await goto(`${BASE}/`);
await setValue('#zi-date', '1990-01-01');
await sleep(200);
await evaluate(clickByText('按钟点'));
await sleep(400);
await setValue('#zi-clock', '00:30');
await sleep(400);
const before3 = await evaluate('location.href');
await evaluate(`document.querySelector('button[type="submit"]').click()`);
const url3 = await waitForUrlChange(before3);
check(
  '钟点 00:30 → 当日子时，不顺延',
  !!url3 && /y=1990&m=1&d=1&h=0/.test(url3) && !/late=1/.test(url3),
  url3 ?? '未跳转',
);

/* ── 用例 4：未覆盖年份 1991-06-15 午时 女 ─────────────────────── */
await goto(`${BASE}/`);
await setValue('#zi-date', '1991-06-15');
await sleep(300);
await setValue('#zi-shichen', '6');
await sleep(300);
await evaluate(clickByText('女'));
await sleep(300);
const before4 = await evaluate('location.href');
await evaluate(`document.querySelector('button[type="submit"]').click()`);
const url4 = await waitForUrlChange(before4);
check(
  '未覆盖年份提交 → /chart?y=1991&m=6&d=15&h=6&g=female',
  !!url4 && /y=1991&m=6&d=15&h=6&g=female/.test(url4),
  url4 ?? '未跳转',
);

if (url4) {
  const miss = await evaluate(`(() => {
    const t = document.body.innerText;
    return {
      hasNotice: t.includes('这个生辰暂时没有解读'),
      hasMessage: t.includes('1991'),
      leaked: t.includes('你是天生的守护者') || t.includes('一句话定调'),
      // 全量索引环境下 1991 已覆盖，本用例不适用
      coveredHere: t.includes('十三维解读'),
    };
  })()`);
  if (miss.coveredHere) {
    console.log('  ⏭  未覆盖用例 ×3（当前服务的索引已覆盖 1991，跳过）');
  } else {
    check('未覆盖：显示 not-covered 提示', miss.hasNotice);
    check('未覆盖：core 的 message 原样展示', miss.hasMessage);
    check('未覆盖：没有任何解读正文泄漏', !miss.leaked);
  }
}

/* ── 用例 5：点击宫位查看三方四正 ─────────────────────────────── */
await goto(`${BASE}/chart?y=1990&m=1&d=1&h=0&g=male`);
const sf = await evaluate(`(() => {
  // 桌面与移动端各渲染一套宫位按钮，只数当前视口可见的那套
  const visible = (b) => b.offsetParent !== null;
  const cells = [...document.querySelectorAll('button[aria-pressed]')].filter(visible);
  if (cells.length !== 12) return { cells: cells.length };
  cells[0].click();
  return new Promise((resolve) => setTimeout(() => {
    const after = [...document.querySelectorAll('button[aria-pressed]')].filter(visible);
    resolve({
      cells: after.length,
      selected: after.filter((b) => b.getAttribute('aria-pressed') === 'true').length,
      sanFang: after.filter((b) => b.className.includes('bg-zhu-soft/25')).length,
    });
  }, 400));
})()`);
check('十二宫渲染 12 格', sf.cells === 12, `cells=${sf.cells}`);
check(
  '点击宫位后标记 1 个选中 + 3 个三方四正',
  sf.selected === 1 && sf.sanFang === 3,
  `selected=${sf.selected} sanFang=${sf.sanFang}`,
);

/* ── 用例 6：两种输入方式互相联动 ─────────────────────────────── */
await goto(`${BASE}/`);
await setValue('#zi-date', '1990-01-01');
await setValue('#zi-shichen', '6'); // 午时
await sleep(300);
await evaluate(clickByText('按钟点'));
await sleep(400);
const linked = await evaluate(`(() => ({
  clock: document.querySelector('#zi-clock')?.value,
}))()`);
check(
  '按时辰 → 按钟点联动（午时 → 11:30）',
  linked.clock === '11:30',
  `clock=${linked.clock}`,
);

await evaluate(clickByText('按时辰'));
await sleep(400);
const back = await evaluate(`document.querySelector('#zi-shichen')?.value`);
check('按钟点 → 按时辰联动（11:30 → 时辰序号 6）', back === '6', `shichen=${back}`);

/* ── 用例 7：排盘历史写入本地 ─────────────────────────────────── */
await goto(`${BASE}/`);
await setValue('#zi-date', '2000-03-03');
await sleep(300);
await evaluate(clickByText('女'));
await sleep(200);
const before7 = await evaluate('location.href');
await evaluate(`document.querySelector('button[type="submit"]').click()`);
const url7 = await waitForUrlChange(before7);
check('用例 7：提交成功跳转', !!url7 && /y=2000&m=3&d=3/.test(url7), url7 ?? '未跳转');

await goto(`${BASE}/`);
const hist = await evaluate(`(() => {
  const raw = localStorage.getItem('ziwei_history');
  if (!raw) return { n: 0, sample: '' };
  const list = JSON.parse(raw);
  return { n: list.length, sample: list[0]?.label ?? '' };
})()`);
check('排盘历史已写入 localStorage', hist.n >= 1, `${hist.n} 条 · "${hist.sample}"`);

ws.close();
chrome.kill();
try {
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
} catch {
  /* Chrome 可能还在写 profile，残留临时目录不影响结论 */
}
try {
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
} catch {
  /* Chrome 可能还在写 profile，残留临时目录不影响结论 */
}

console.log(failures === 0 ? '\n✓ 表单流程全部通过' : `\n✗ ${failures} 项未通过`);
process.exit(failures === 0 ? 0 : 1);
