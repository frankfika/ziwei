/**
 * lunar-javascript 的类型垫片 —— 该库自带 JS 无类型。
 *
 * 为什么不用 @types：仓库不引声明包也能过检（bare `declare module` 下按 any 用），
 * 且 tests/tsconfig.json 早已 include 本文件。若以后要真类型，装 @types/lunar-javascript
 * 并删掉本文件即可。
 */
declare module 'lunar-javascript';
