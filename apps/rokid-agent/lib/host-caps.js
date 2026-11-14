/**
 * 宿主能力探测 —— 「这个环境能不能打字」。
 *
 * 为什么要有这个模块（2026-11-14 交互重构）：
 *
 *  1. **眼镜上没有键盘**。Rokid Glasses 的输入只有语音与镜腿手势。
 *  2. 但**模拟器 / 电脑上有键盘**，而且评审、开发者、录屏都在那儿看。
 *  3. 所以「打字提问」这条路径**只在有键盘的宿主上开**。
 *
 * ⚠️ **判据为什么是「有没有 DOM」**：
 * ink 是同一份代码跑在两种宿主上 ——
 *  · 浏览器宿主（AIUI Studio 模拟调试、桌面预览）⇒ Web SDK 把页面画进
 *    `<canvas>`，**宿主页面有 DOM** ⇒ 用户有键盘 ⇒ 能打字；
 *  · 设备端宿主（设备侧 Rust runtime）⇒ **没有 DOM** ⇒ 用户没有键盘 ⇒
 *    画面上出现一个永远打不了字的输入框，只会让人反复去点它、然后发现没用
 *    —— **比没有这个输入框更让人困惑**。
 *
 * ⚠️ **这条判据的前提**是「设备端不是 WebView」。
 * 如果将来 Rokid 把眼镜端也换成 WebView，这里会误判成「能打字」，
 * 于是眼镜上出现一个用不了的输入框 ⇒ 必须重新验证
 * （DEVICE-CHECKLIST E 组）。
 *
 * 所以：**眼镜上的问答入口是「可点建议语 + 语音」，不是输入框。**
 */

/**
 * 这个宿主能不能打字。
 *
 * @param {object} [env] 注入的环境对象（默认 `globalThis`），便于单测
 * @returns {boolean} true = 有 DOM，判定为「有键盘，可以打字」
 */
export function canTypeText(env) {
    const scope =
        env || (typeof globalThis !== 'undefined' ? globalThis : {});
    if (!scope) return false;
    const doc = scope.document;
    return Boolean(doc && typeof doc.createElement === 'function');
}
