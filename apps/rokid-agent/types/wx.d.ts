/**
 * AIUI 运行时的 `wx` 模块类型垫片。
 *
 * AIUI 运行时提供 `import wx from 'wx'`（WeChat 兼容层），
 * 但官方类型包 @yodaos-pkg/ink-env 不在公共 npm 上，
 * 所以这里手写一个最小声明 —— 只声明「有这个模块」，具体方法走 any。
 *
 * 为什么不在 lib 里直接写 `const wx = ...`：
 * 真机上 `wx` 是运行时注入的全局模块，写死就等于假实现。
 */
declare module 'wx' {
  const wx: any;
  export default wx;
}
