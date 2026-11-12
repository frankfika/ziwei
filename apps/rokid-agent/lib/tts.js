/**
 * 语音播报 —— 解读朗读与交互反馈的出声通道。
 *
 * AIUI 有两条等价路径，运行时哪条都可能有：
 *  · wx 风格：`wx.speech.playTTS(text)`
 *  · Web 风格：`speechSynthesis.speak(new SpeechSynthesisUtterance(text), 'enqueue')`
 *
 * 眼镜上「声音」比「屏幕」更重要：盘面是单色绿小屏，用户读不完一屏字，
 * 但听得完一句话。所以**每一步操作都要有声音反馈**，用户不看屏也知道自己在哪。
 *
 * 并发模型：**代际（gen）+ 队列**。
 *  · `replace: true`（默认）= 作废当前播报、清空队列，立即播新内容；
 *  · `replace: false` = 排进队列，等当前播报（按估算时长）结束后接着播。
 * 典型用法：宫位摘要用 replace 立即出声，长篇解读正文用 enqueue 接在摘要后面，
 * 不然摘要还没念完就被正文顶掉（白念）。
 */

/** 代际令牌：每次 replace / stopSpeaking 自增，使挂起的定时器与队列失效 */
let gen = 0;
/** 当前是否有播报在进行（含队列等待中的下一段开始前） */
let speaking = false;
/** 等待队列（enqueue 模式） */
const queue = [];
/** 估算时长的完成定时器 */
let doneTimer = null;

/**
 * 播报时长估算（AIUI 没有可靠的完成回调）。
 *
 * @param {string} content
 * @returns {number} 毫秒
 */
function estimateMs(content) {
  return Math.min(15000, 1200 + content.length * 180);
}

/**
 * 真正出声。永不抛错 —— 播报失败不能影响主流程。
 *
 * @param {string} content
 * @param {number} token 本次播报的代际
 * @returns {Promise<boolean>} 是否真的播出来了
 */
async function playNow(content, token) {
  let played = false;

  try {
    const wx = await import('wx');
    const mod = wx.default || wx;
    if (mod && mod.speech && typeof mod.speech.playTTS === 'function') {
      mod.speech.playTTS(content);
      played = true;
    }
  } catch (err) {
    // 落到 Web 风格
  }

  if (!played) {
    try {
      if (typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined') {
        const utterance = new SpeechSynthesisUtterance(content);
        // DOM 的类型签名只允许 speak(utterance)，
        // 但 AIUI 运行时支持第二个 mode 参数（'replace' | 'enqueue'）。
        const synth = /** @type {any} */ (speechSynthesis);
        synth.speak(utterance, 'replace');
        played = true;
      }
    } catch (err) {
      // 静默失败
    }
  }

  if (played && token === gen) {
    speaking = true;
    if (doneTimer) clearTimeout(doneTimer);
    doneTimer = setTimeout(() => {
      doneTimer = null;
      if (token !== gen) return; // 已被 replace / stop 作废
      speaking = false;
      drain(token);
    }, estimateMs(content));
  }

  return played;
}

/**
 * 当前段播完后，接着播队列里的下一段。
 *
 * @param {number} token
 */
function drain(token) {
  if (token !== gen) return;
  const next = queue.shift();
  if (next) playNow(next, token);
}

/**
 * 播报一段文本。**永不抛错** —— 播报失败不能影响主流程。
 *
 * @param {string} text
 * @param {Object} [options]
 * @param {boolean} [options.replace] true（默认）= 打断当前播报；false = 排队
 * @returns {Promise<boolean>} 是否真的播出来了（排队视为会播，返回 true）
 */
export async function speak(text, options = {}) {
  const content = typeof text === 'string' ? text.trim() : '';
  if (!content) return false;

  const replace = options.replace !== false;

  if (replace) {
    gen += 1;
    queue.length = 0;
    speaking = false;
    if (doneTimer) {
      clearTimeout(doneTimer);
      doneTimer = null;
    }
    return playNow(content, gen);
  }

  // 排队：当前没有在播就直接播；否则进队列等接棒
  if (!speaking) {
    return playNow(content, gen);
  }
  queue.push(content);
  return true;
}

/**
 * 停止播报：清队列、作废品代际，正在播的也一并取消。
 *
 * @returns {void}
 */
export function stopSpeaking() {
  gen += 1;
  queue.length = 0;
  speaking = false;
  if (doneTimer) {
    clearTimeout(doneTimer);
    doneTimer = null;
  }
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
  return speaking || queue.length > 0;
}
