/**
 * 语音输入 —— 眼镜上唯一自然的主输入通道。
 *
 * AIUI 有两条等价路径：
 *  · wx 风格：`wx.speech.startRecognition({...})`
 *  · Web 风格：`new SpeechRecognition()` / `webkitSpeechRecognition`
 *
 * 两条都不可用时返回空串，调用方必须走兜底（快捷问题列表），
 * **不能因为没有语音能力就白屏** —— 社区实战的铁律：
 * 「不管在线接口成不成，页面永远必须有内容出，绝不白屏」。
 */

/** 识别超时（毫秒） */
export const LISTEN_TIMEOUT = 8000;

/** 当前进行中的识别的取消器（没有则为 null） */
let activeCancel = null;

/**
 * 取消正在进行的识别（尽力而为）。
 *
 * 用户按返回键退出录入时调用：逻辑层有代际令牌兜底，
 * 但设备麦克风还在收音到超时（8s）——能停就停，别让用户对着空气说话。
 * wx 风格若宿主提供 stopRecognition 就调，没有就靠提前 resolve 收尾。
 *
 * @returns {void}
 */
export function cancelListen() {
  const cancel = activeCancel;
  activeCancel = null;
  if (cancel) {
    try {
      cancel();
    } catch (err) {
      /* ignore */
    }
  }
}

/**
 * 听一句话。
 *
 * @param {Object} [options]
 * @param {number} [options.timeout] 超时
 * @returns {Promise<string>} 识别文本；失败或超时返回空串
 */
export async function listenOnce(options = {}) {
  const timeout = options.timeout ?? LISTEN_TIMEOUT;

  // 1) wx 风格
  try {
    const wx = await import('wx');
    const mod = wx.default || wx;
    if (mod && mod.speech && typeof mod.speech.startRecognition === 'function') {
      return await new Promise((resolve) => {
        let settled = false;
        const finish = (text) => {
          if (settled) return;
          settled = true;
          activeCancel = null;
          resolve(typeof text === 'string' ? text.trim() : '');
        };
        const timer = setTimeout(() => finish(''), timeout);
        activeCancel = () => {
          clearTimeout(timer);
          try {
            if (typeof mod.speech.stopRecognition === 'function') {
              mod.speech.stopRecognition();
            }
          } catch (err) {
            /* ignore */
          }
          finish('');
        };
        try {
          mod.speech.startRecognition({
            lang: 'zh-CN',
            success: (res) => {
              clearTimeout(timer);
              const t = res && (res.result || res.text || res.value);
              finish(Array.isArray(t) ? t.join('') : t);
            },
            fail: () => {
              clearTimeout(timer);
              finish('');
            },
          });
        } catch (err) {
          clearTimeout(timer);
          finish('');
        }
      });
    }
  } catch (err) {
    // 落到 Web 风格
  }

  // 2) Web 风格
  try {
    const Ctor =
      typeof SpeechRecognition !== 'undefined'
        ? SpeechRecognition
        : typeof webkitSpeechRecognition !== 'undefined'
          ? webkitSpeechRecognition
          : null;
    if (!Ctor) return '';

    return await new Promise((resolve) => {
      let settled = false;
      const rec = new Ctor();
      const finish = (text) => {
        if (settled) return;
        settled = true;
        activeCancel = null;
        try {
          rec.stop();
        } catch (err) {
          /* ignore */
        }
        resolve(typeof text === 'string' ? text.trim() : '');
      };
      const timer = setTimeout(() => finish(''), timeout);
      activeCancel = () => {
        clearTimeout(timer);
        try {
          rec.abort();
        } catch (err) {
          /* ignore */
        }
        finish('');
      };
      rec.lang = 'zh-CN';
      rec.maxAlternatives = 1;
      rec.onresult = (event) => {
        clearTimeout(timer);
        const alt = event && event.results && event.results[0] && event.results[0][0];
        finish(alt ? alt.transcript : '');
      };
      rec.onerror = () => {
        clearTimeout(timer);
        finish('');
      };
      rec.onend = () => {
        clearTimeout(timer);
        finish('');
      };
      try {
        rec.start();
      } catch (err) {
        clearTimeout(timer);
        finish('');
      }
    });
  } catch (err) {
    return '';
  }
}
