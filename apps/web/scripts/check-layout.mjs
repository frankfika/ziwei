/**
 * 布局体检：用 Chrome DevTools Protocol 在指定宽度下测量
 *   - 文档是否出现横向溢出（scrollWidth > viewport）
 *   - 哪些元素把页面撑宽了
 *
 * 零依赖：Node 22+ 自带全局 WebSocket。
 *
 * 用法：node apps/web/scripts/check-layout.mjs <url> [宽度,宽度...]
 * 例：  node apps/web/scripts/check-layout.mjs http://localhost:3000/chart?y=1990&m=1&d=1&h=0&g=male 1440 390
 */
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const CHROME =
  process.env.CHROME_PATH ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const url = process.argv[2] ?? 'http://localhost:3000/';
const widths = process.argv.slice(3).map(Number).filter(Boolean);
const targets = widths.length ? widths : [1440, 390];
const PORT = 9333;

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ziwei-layout-'));
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

async function targetsJson() {
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

const wsUrl = await targetsJson();
const ws = new WebSocket(wsUrl);
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
  return r.result?.value;
}

await send('Page.enable');
await send('Runtime.enable');

let failures = 0;

for (const width of targets) {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height: 900,
    deviceScaleFactor: 1,
    mobile: width < 640,
  });
  await send('Page.navigate', { url });
  await sleep(2500);

  const report = await evaluate(`(() => {
    const doc = document.documentElement;
    const vw = doc.clientWidth;
    const offenders = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      // 元素自身右边界超出视口，且自身没有开启横向滚动
      const style = getComputedStyle(el);
      const scrollable = style.overflowX === 'auto' || style.overflowX === 'scroll' || style.overflowX === 'hidden';
      if (r.right > vw + 1 && !scrollable) {
        offenders.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className && typeof el.className === 'string' ? el.className : '').slice(0, 90),
          right: Math.round(r.right),
          width: Math.round(r.width),
          text: (el.textContent || '').trim().slice(0, 28),
        });
      }
    }
    // 只保留最外层的越界元素
    return {
      vw,
      docScrollWidth: doc.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      offenders: offenders.slice(0, 8),
    };
  })()`);

  const overflow = report.docScrollWidth > report.vw + 1;
  if (overflow) failures++;
  console.log(
    `\n[${width}px] 视口=${report.vw} 文档 scrollWidth=${report.docScrollWidth} ` +
      `body scrollWidth=${report.bodyScrollWidth} → ${overflow ? '✗ 存在横向溢出' : '✓ 无横向溢出'}`,
  );
  for (const o of report.offenders) {
    console.log(
      `   · <${o.tag} class="${o.cls}"> right=${o.right} w=${o.width} "${o.text}"`,
    );
  }

  if (process.env.SHOT_DIR) {
    fs.mkdirSync(process.env.SHOT_DIR, { recursive: true });
    if (process.env.SHOT_SCROLL) {
      await evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(process.env.SHOT_SCROLL)});
        if (el) el.scrollIntoView({ block: 'start' });
      })()`);
      await sleep(400);
    }
    const shot = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    const file = path.join(process.env.SHOT_DIR, `page-${width}.png`);
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
    console.log(`   📸 ${file}`);
  }
}

ws.close();
chrome.kill();
try {
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
} catch {
  /* Chrome 可能还在写 profile，残留临时目录不影响结论 */
}

console.log(failures === 0 ? '\n✓ 所有宽度均无横向溢出' : `\n✗ ${failures} 个宽度存在横向溢出`);
process.exit(failures === 0 ? 0 : 1);
