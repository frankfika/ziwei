/**
 * AIUI 运行时提供、但 TypeScript 标准库没有的全局对象声明。
 *
 * `SpeechRecognition` / `webkitSpeechRecognition` 是浏览器语音识别接口，
 * TS 的 lib.dom.d.ts 里**没有**这两个名字（Web Speech API 的类型至今没进标准库），
 * 但 AIUI 运行时确实提供。语音识别是眼镜上唯一自然的主输入，
 * 所以这里补一个最小声明，而不是在代码里写 any 绕过去。
 */

declare const SpeechRecognition: any;
declare const webkitSpeechRecognition: any;
