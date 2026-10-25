/**
 * 网络守卫（仅自测用）。
 *
 * **必须在其它 import 之前被引入**，这样才能证明
 * 「import 本包时不会发起任何网络请求」——
 * ESM 的模块求值顺序 = import 声明顺序，所以把本文件放在自测文件的第一行即可。
 */

export const netGuard = {
  /** fetch 被调用的次数 */
  calls: 0,
  /** 被拦截的 URL */
  urls: [] as string[],
  restored: false,
};

const realFetch = globalThis.fetch;

globalThis.fetch = ((input: RequestInfo | URL, ...rest: unknown[]) => {
  netGuard.calls += 1;
  netGuard.urls.push(String(input));
  throw new Error(
    `自测期间不允许网络请求，但有人调用了 fetch(${String(input)})`,
  );
}) as typeof fetch;

/** 还原真实 fetch（自测收尾用）。 */
export function restoreFetch(): void {
  if (netGuard.restored) return;
  netGuard.restored = true;
  globalThis.fetch = realFetch;
}
