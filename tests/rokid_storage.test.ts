/**
 * 眼镜端存储门禁 —— 2026-11-14（DEVICE-CHECKLIST §3 第 30 条 / E26）。
 *
 * 为什么要有这个文件：
 *   原来的 `lib/storage.js` 读写**浏览器 `localStorage`**，
 *   而眼镜端（设备侧 runtime）**根本没有这个 API** ——
 *   `typeof localStorage === 'undefined'` ⇒ 读写**静默失败**（不报错、不抛异常）⇒
 *   命盘库在眼镜上永远是空的，**换过的盘重启后又变回示例盘**。
 *   这种 bug 在模拟器里**看不出来**（模拟器有 localStorage），
 *   所以必须在这里用一个**假的 wx 宿主**把眼镜那条路单独跑一遍。
 *
 * 怎么造 wx 宿主：
 *   `wx` 在运行时是**要动态 import 的模块**、不是全局对象。
 *   node 里直接 `import('wx')` 必然失败 ⇒ 必须给一份**沙箱**：
 *   把 `lib/storage.js` **原样复制**到临时目录，再在临时目录下放一个
 *   `node_modules/wx/` 桩 —— 这样 `import('wx')` 就能解析到它。
 *   （复制而不是改 import 路径，是为了让被测的就是**仓库里那份原文件**。）
 *
 * 断言口径：
 *   · **行为**用真模块跑（wx 往返 / wx 优先 / 没 wx 时兜底）；
 *   · **结构**读源码断言（「读盘必须发生在存储就位之后」这类顺序约束）。
 */

import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { Tester } from './harness';
import { type SuiteFn } from './harness';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGENT_DIR = path.join(REPO_ROOT, 'apps/rokid-agent');
const STORAGE_FILE = path.join(AGENT_DIR, 'lib/storage.js');
const PAGE_FILE = path.join(AGENT_DIR, 'pages/index/index.ink');

const storageSrc = readFileSync(STORAGE_FILE, 'utf8');
const page = readFileSync(PAGE_FILE, 'utf8');

/** 假的 wx 宿主：一个 Map 撑起来的同步存储 */
const WX_STUB = `
const store = new Map();
module.exports = {
    getStorageSync(key) { return store.has(key) ? store.get(key) : ''; },
    setStorageSync(key, value) { store.set(key, String(value)); },
    __dump() { return Object.fromEntries(store); },
    __clear() { store.clear(); },
};
`;

/** 一个沙箱 */
interface Sandbox {
    /** 当前模块实例 */
    mod: any;
    /** 换一个模块实例（模拟页面重新加载）—— **wx 存储是同一个** */
    reload: () => Promise<any>;
    /** 看 wx 存储里到底有什么 */
    dump: () => Record<string, string>;
    /** 沙箱目录（用完要删） */
    dir: string;
}

/**
 * 造一个「眼镜端沙箱」：把 storage.js 原样复制过去，旁边放 node_modules/wx 桩。
 *
 * @param {object} [opts]
 * @param {boolean} [opts.withWx] 是否放 wx 桩（false = 模拟浏览器 / 模拟器）
 * @returns {Promise<Sandbox>}
 */
async function makeSandbox(opts: { withWx?: boolean } = {}): Promise<Sandbox> {
    const dir = mkdtempSync(path.join(tmpdir(), 'ziwei-storage-'));
    const withWx = opts.withWx !== false;

    let store: any = null;
    if (withWx) {
        const wxDir = path.join(dir, 'node_modules/wx');
        mkdirSync(wxDir, { recursive: true });
        writeFileSync(
            path.join(wxDir, 'package.json'),
            JSON.stringify({ name: 'wx', version: '1.0.0', main: 'index.js' }),
            'utf8'
        );
        writeFileSync(path.join(wxDir, 'index.js'), WX_STUB, 'utf8');
        /**
         * 直接按文件 URL import 一次这个桩 ——
         * 拿到的就是 `import('wx')` 会解析到的**同一个模块实例**（node 按绝对路径缓存）。
         */
        const wxNs = await import(pathToFileURL(path.join(wxDir, 'index.js')).href);
        store = wxNs.default || wxNs;
    }

    /**
     * 被测文件：**原样复制**，只改扩展名（.mjs 强制 ESM，与运行时一致）。
     * 复制而不是重定向 import，是为了保证测的就是仓库里那份代码。
     */
    const target = path.join(dir, 'storage.mjs');
    copyFileSync(STORAGE_FILE, target);

    let seq = 0;
    const load = async (): Promise<any> => {
        const url = pathToFileURL(target).href + (seq ? `?v=${seq}` : '');
        seq += 1;
        return await import(url);
    };

    const mod = await load();
    return {
        mod,
        reload: load,
        dump: () => (store ? store.__dump() : {}),
        dir,
    };
}

/** 装一个假的 localStorage（node 默认没有） */
function stubLocalStorage(initial: Record<string, string> = {}) {
    const map = new Map(Object.entries(initial));
    const stub = {
        getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
        setItem: (k: string, v: string) => void map.set(k, String(v)),
        removeItem: (k: string) => void map.delete(k),
        clear: () => map.clear(),
        dump: () => Object.fromEntries(map),
    };
    (globalThis as any).localStorage = stub;
    return stub;
}

/** 卸掉假的 localStorage */
function dropLocalStorage() {
    try {
        delete (globalThis as any).localStorage;
    } catch {
        /* node 里本来就没有，删不掉也无所谓 */
    }
}

export const suite: SuiteFn = async (t: Tester) => {
    /* -------------------------------------------------------------- *
     * 眼镜端真路径：wx 存储
     * -------------------------------------------------------------- */
    await t.test('眼镜端：initStorage 拿到 wx 存储', async () => {
        const box = await makeSandbox();
        try {
            const got = await box.mod.initStorage();
            assert.equal(got, true, 'initStorage 没能拿到 wx 存储');
        } finally {
            rmSync(box.dir, { recursive: true, force: true });
        }
    });

    await t.test('眼镜端：命盘库读写往返走 wx', async () => {
        const box = await makeSandbox();
        try {
            await box.mod.initStorage();
            const list = box.mod.upsertProfile({ year: 1990, month: 1, day: 1, hour: 0, gender: 'male' });
            assert.equal(list.length, 1, 'upsertProfile 没有写进去');
            assert.equal(list[0].year, 1990);

            const raw = box.dump()[box.mod.PROFILES_KEY];
            assert.ok(typeof raw === 'string' && raw.length > 0, '数据没落到 wx 存储里');
        } finally {
            rmSync(box.dir, { recursive: true, force: true });
        }
    });

    await t.test('眼镜端：重启后命盘库还在（E26 本体）', async () => {
        const box = await makeSandbox();
        try {
            await box.mod.initStorage();
            box.mod.upsertProfile({ year: 1990, month: 1, day: 1, hour: 0, gender: 'male' });

            /**
             * 「重启」= 换一个**模块实例**（页面重新加载），
             * 但 wx 存储是同一个 ⇒ 数据必须还在。
             * 这正是 E26 说的那条：换过的盘重启后还在不在。
             */
            const mod2 = await box.reload();
            await mod2.initStorage();
            const restored = mod2.loadProfiles();
            assert.equal(restored.length, 1, '重启后命盘库空了 —— E26 复发');
            assert.equal(restored[0].year, 1990);
            assert.equal(restored[0].gender, 'male');
            assert.equal(restored[0].month, 1);
        } finally {
            rmSync(box.dir, { recursive: true, force: true });
        }
    });

    await t.test('眼镜端：latestProfile 取回最近那张盘', async () => {
        const box = await makeSandbox();
        try {
            await box.mod.initStorage();
            box.mod.upsertProfile({ year: 1988, month: 8, day: 8, hour: 6, gender: 'male' });
            box.mod.upsertProfile({ year: 1990, month: 1, day: 1, hour: 0, gender: 'female' });
            const latest = box.mod.latestProfile();
            assert.ok(latest, 'latestProfile 返回空');
            assert.equal(latest.year, 1990, 'latest 不是最近存的那张');
            assert.equal(latest.gender, 'female');
        } finally {
            rmSync(box.dir, { recursive: true, force: true });
        }
    });

    await t.test('眼镜端：wx 通道优先于 localStorage', async () => {
        const ls = stubLocalStorage({
            'ziwei.agent.profiles': JSON.stringify([
                { id: 'ls', year: 1970, month: 1, day: 1, hour: 0, gender: 'male' },
            ]),
        });
        const box = await makeSandbox();
        try {
            await box.mod.initStorage();
            box.mod.upsertProfile({ year: 1990, month: 1, day: 1, hour: 0, gender: 'male' });
            const list = box.mod.loadProfiles();
            assert.equal(list.length, 1, '不该出现两张盘');
            assert.equal(list[0].year, 1990, '读到的不是 wx 里的那份');
            assert.equal(
                ls.dump()['ziwei.agent.profiles'],
                JSON.stringify([
                    { id: 'ls', year: 1970, month: 1, day: 1, hour: 0, gender: 'male' },
                ]),
                'localStorage 不该被 wx 通道覆盖'
            );
        } finally {
            rmSync(box.dir, { recursive: true, force: true });
            dropLocalStorage();
        }
    });

    /* -------------------------------------------------------------- *
     * 兜底通道：没有 wx（模拟器 / 浏览器）
     * -------------------------------------------------------------- */
    await t.test('没有 wx 时退回 localStorage（模拟器 / 电脑浏览器）', async () => {
        const ls = stubLocalStorage();
        const box = await makeSandbox({ withWx: false });
        try {
            const got = await box.mod.initStorage();
            assert.equal(got, false, '没有 wx 模块却报告拿到了 wx 存储');
            box.mod.upsertProfile({ year: 1990, month: 1, day: 1, hour: 0, gender: 'male' });
            const list = box.mod.loadProfiles();
            assert.equal(list.length, 1, 'localStorage 兜底没生效');
            assert.equal(list[0].year, 1990);
            assert.ok(ls.dump()['ziwei.agent.profiles'], '数据没落到 localStorage');
        } finally {
            rmSync(box.dir, { recursive: true, force: true });
            dropLocalStorage();
        }
    });

    await t.test('两个通道都没有时也不抛异常（读空表、写失败返回 false）', async () => {
        dropLocalStorage();
        const box = await makeSandbox({ withWx: false });
        try {
            await box.mod.initStorage();
            assert.deepEqual(box.mod.loadProfiles(), [], '没有存储通道时读出来不应该是空数组以外的东西');
            assert.equal(box.mod.saveProfiles([{ year: 1990 }]), false, '写失败时该返回 false');
        } finally {
            rmSync(box.dir, { recursive: true, force: true });
        }
    });

    /* -------------------------------------------------------------- *
     * 结构断言：顺序不能错
     * -------------------------------------------------------------- */
    await t.test('结构：storage.js 同时认 wx 与 localStorage 两个通道', () => {
        for (const token of ['getStorageSync', 'setStorageSync', "import('wx')", 'typeof localStorage']) {
            assert.ok(storageSrc.includes(token), `storage.js 里没有 ${token}`);
        }
    });

    await t.test('结构：页面必须等存储就位之后才读命盘库', () => {
        const initIdx = page.indexOf('initStorage().then(() => {');
        assert.ok(initIdx >= 0, '页面没有用 initStorage() 等存储就位');
        const tail = page.slice(initIdx);
        const closeIdx = tail.indexOf('\n        });');
        assert.ok(closeIdx > 0, 'initStorage 的回调体结构没认出来');
        const body = tail.slice(0, closeIdx);
        assert.ok(
            body.includes('resolveInitialBirth(query, latestProfile())'),
            '读盘（resolveInitialBirth）不在 initStorage 的回调里 —— 眼镜上会读不到命盘库'
        );
        assert.ok(body.includes('loadProfiles()'), 'profileCount 不是在存储就位之后才算的');
    });

    await t.test('结构：页面引入了 initStorage', () => {
        assert.ok(
            /import \{[^}]*initStorage[^}]*\} from '\.\.\/\.\.\/lib\/storage\.js';/.test(page),
            '页面没有 import initStorage'
        );
    });
};
