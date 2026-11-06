/**
 * 语音播报 —— 解读朗读与交互反馈的出声通道。
 *
 * AIUI 有两条等价路径，运行时哪条都可能有：
 *  · wx 风格：`wx.speech.playTTS(text)`
 *  · Web 风格：`speechSynthesis.speak(new SpeechSynthesisUtterance(text), 'enqueue')`
 *
 * 眼镜上「声音」比「屏幕」更重要：盘面是单色绿小屏，用户读不完一屏字，
 * 但听得完一句话。所以**每一步操作都要有声音反馈**，用户不看屏也知道自己在哪。
 */

/** 上一次播报是否还在进行（避免叠声） */
let speaking = false;

/**
 * 播报一段文本。**永不抛错** —— 播报失败不能影响主流程。
 *
 * @param {string} text
 * @param {Object} [options]
 * @param {boolean} [options.replace] true = 打断当前播报；false = 排队
 * @returns {Promise<boolean>} 是否真的播出来了
 */
export async function speak(text, options = {}) {
  const content = typeof text === 'string' ? text.trim() : '';
  if (!content) return false;

  const replace = options.replace !== false;

  try {
    const wx = await import('wx');
    const mod = wx.default || wx;
    if (mod && mod.speech && typeof mod.speech.playTTS === 'function') {
      speaking = true;
      mod.speech.playTTS(content);
      // 没有可靠的完成回调，这里给一个粗略的时长估计用于抑制连播
      setTimeout(() => {
        speaking = false;
      }, Math.min(15000, 1200 + content.length * 180));
      return true;
    }
  } catch (err) {
    // 落到 Web 风格
  }

  try {
    if (typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined') {
      const utterance = new SpeechSynthesisUtterance(content);
      // DOM 的类型签名只允许 speak(utterance)，
      // 但 AIUI 运行时支持第二个 mode 参数（'replace' | 'enqueue'）。
      const synth = /** @type {any} */ (speechSynthesis);
      synth.speak(utterance, replace ? 'replace' : 'enqueue');
      speaking = true;
      setTimeout(() => {
        speaking = false;
      }, Math.min(15000, 1200 + content.length * 180));
      return true;
    }
  } catch (err) {
    // 静默失败
  }

  return false;
}

/**
 * 停止播报。
 *
 * @returns {void}
 */
export function stopSpeaking() {
  speaking = false;
  try {
    if (typeof speechSynthesis !== 'undefined' && typeof speechSynthesis.cancel === 'function') {
      speechSynthesis.cancel();
    }
  } catch (err) {
    // ignore
  }
}

/**
 * 当前是否正在播报。
 *
 * @returns {boolean}
 */
export function isSpeaking() {
  return speaking;
}
