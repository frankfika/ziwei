/**
 * 语音输入 —— 眼镜上唯一自然的主输入通道。
 *
 * AIUI 有两条等价路径：
 *  · wx 风格：`wx.speech.startRecognition({...})`
 *  · Web 风格：`new SpeechRecognition()` / `webkitSpeechRecognition`
 *
 * 两条都不可用时返回空串，调用方必须走兜底（建议语列表），
 * **不能因为没有语音能力就白屏** —— 社区实战的铁律：
 * 「不管在线接口成不成，页面永远必须有内容出，绝不白屏」。
 *
 * ⚠️ **为什么是连续识别，而不是「听一句就交差」**：
 * 社区实战（言值，2026-11 已上架）踩过的第一个真机 bug 就是
 * 「语音说一句就结束，累计只有 12 字」——
 * 根因是 `SpeechRecognition` **默认非连续**，一段话结束即触发 `onend`。
 * 修法是 `continuous = true` + `interimResults = true`，
 * 页面自己累积 `finalText + interimText`，靠「静音 5 秒 / 超时」收尾。
 *
 * 对我们更要命：用户要念的是「1990年1月1日早上男」这种**带多个信息位**的话，
 * 一句被截断就等于解析失败（缺时辰 → 按午时估算，缺日期 → 整张盘错）。
 * 所以**生辰录入和自由提问都必须走连续识别**。
 *
 * ⚠️ **兜底不能省**：眼镜上没有键盘，语音是唯一提问通道。
 * 但语音在嘈杂环境里识别率不稳定（社区实测：一句含混的话识别正确率不到一半）。
 * 所以页面必须同时留着「不依赖识别的建议语」路径（见 lib/chat-store.js）。
 */

/** 识别绝对超时（毫秒）—— 兜底，防止识别器不收尾把页面卡在「在听」 */
export const LISTEN_TIMEOUT = 12000;

/**
 * 静音收尾窗口（毫秒）—— 最后一次拿到结果后这么久没动静就收工。
 *
 * 取 4000：社区实战用 5s。这里取 4s，因为我们的输入是一句完整的话
 * （「1990年1月1日早上男」），用户念完会自然停顿；
 * 而且 ask 的响应本身要等 20–60s，用户多等 1 秒感知明显。
 */
export const SILENCE_WINDOW = 4000;

/** 当前进行中的识别的取消器（没有则为 null） */
let activeCancel = null;

/**
 * 取消正在进行的识别（尽力而为）。
 *
 * 用户按返回键退出录入时调用：逻辑层有代际令牌兜底，
 * 但设备麦克风还在收音到超时——能停就停，别让用户对着空气说话。
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
 * 听一段话（连续识别）。
 *
 * @param {Object} [options]
 * @param {number} [options.timeout] 绝对超时（毫秒）
 * @param {number} [options.silenceMs] 静音收尾窗口（毫秒）
 * @param {boolean} [options.continuous] 是否连续识别（默认 true）
 * @param {(text: string) => void} [options.onPartial] 实时文本回调（识别中显示）
 * @returns {Promise<string>} 识别文本；失败或超时返回空串
 */
export async function listenSession(options = {}) {
  const timeout = options.timeout ?? LISTEN_TIMEOUT;
  const silenceMs = options.silenceMs ?? SILENCE_WINDOW;
  const continuous = options.continuous !== false;
  const onPartial = typeof options.onPartial === 'function' ? options.onPartial : null;

  // 1) wx 风格
  try {
    const wx = await import('wx');
    const mod = wx.default || wx;
    if (mod && mod.speech && typeof mod.speech.startRecognition === 'function') {
      return await new Promise((resolve) => {
        let settled = false;
        let accumulated = '';
        let silenceTimer = null;

        const clearTimers = () => {
          if (silenceTimer) {
            clearTimeout(silenceTimer);
            silenceTimer = null;
          }
        };

        const finish = (text) => {
          if (settled) return;
          settled = true;
          clearTimers();
          clearTimeout(timer);
          activeCancel = null;
          resolve(typeof text === 'string' ? text.trim() : '');
        };

        const timer = setTimeout(() => finish(accumulated), timeout);

        const push = (chunk) => {
          if (typeof chunk !== 'string' || !chunk) return;
          accumulated += chunk;
          if (onPartial) onPartial(accumulated.trim());
          clearTimers();
          if (continuous) {
            silenceTimer = setTimeout(() => finish(accumulated), silenceMs);
          }
        };

        activeCancel = () => {
          clearTimers();
          try {
            if (typeof mod.speech.stopRecognition === 'function') {
              mod.speech.stopRecognition();
            }
          } catch (err) {
            /* ignore */
          }
          finish(accumulated);
        };

        try {
          mod.speech.startRecognition({
            lang: 'zh-CN',
            /**
             * 连续识别开关。
             *
             * ⚠️ 宿主是否认这个参数没有公开承诺 —— 认就连续收，
             * 不认也不会报错（多余字段被忽略），所以**直接传**，
             * 比在页面层猜「宿主是不是分句派发」可靠。
             */
            continuous,
            success: (res) => {
              /**
               * 宿主可能只给最终结果（`result` / `text` / `value`），
               * 也可能同时给增量（`partialText`）。
               * 两种都收：最终结果**替换**掉上一次，增量**追加**。
               */
              const finalText =
                res && (res.result !== undefined ? res.result : res.text !== undefined ? res.text : res.value);
              const partial = res && res.partialText;
              if (typeof finalText === 'string') {
                accumulated = finalText;
              } else if (Array.isArray(finalText)) {
                accumulated = finalText.join('');
              }
              if (typeof partial === 'string' && partial) {
                accumulated += partial;
              }
              if (onPartial) onPartial(accumulated.trim());
              clearTimers();
              if (continuous) {
                silenceTimer = setTimeout(() => finish(accumulated), silenceMs);
              } else {
                finish(accumulated);
              }
            },
            fail: () => {
              finish(accumulated);
            },
          });
        } catch (err) {
          finish(accumulated);
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
      let finalText = '';
      let interimText = '';
      let silenceTimer = null;

      const clearTimers = () => {
        if (silenceTimer) {
          clearTimeout(silenceTimer);
          silenceTimer = null;
        }
      };

      const current = () => (finalText + interimText).trim();

      const finish = (text) => {
        if (settled) return;
        settled = true;
        clearTimers();
        clearTimeout(timer);
        activeCancel = null;
        try {
          rec.stop();
        } catch (err) {
          /* ignore */
        }
        resolve(typeof text === 'string' ? text.trim() : '');
      };

      const rec = new Ctor();
      const timer = setTimeout(() => finish(current()), timeout);

      activeCancel = () => {
        clearTimers();
        try {
          rec.abort();
        } catch (err) {
          /* ignore */
        }
        finish(current());
      };

      rec.lang = 'zh-CN';
      rec.maxAlternatives = 1;
      /**
       * 连续 + 中间结果 —— 这是「说一句就结束」那个 bug 的正解。
       *
       * `continuous` 决定识别器说完一段后是否继续听；
       * `interimResults` 决定中间结果是否上报（页面据此显示「正在听……」）。
       */
      rec.continuous = continuous;
      rec.interimResults = continuous;

      rec.onresult = (event) => {
        /**
         * 每一次都**从头重算**，不增量追加 ——
         * 因为同一个 result 会从「非最终」变成「最终」，
         * 增量追加会把它算两遍。
         */
        finalText = '';
        interimText = '';
        const results = (event && event.results) || [];
        for (let i = 0; i < results.length; i += 1) {
          const r = results[i];
          const alt = r && r[0];
          if (!alt || typeof alt.transcript !== 'string') continue;
          if (r.isFinal) finalText += alt.transcript;
          else interimText += alt.transcript;
        }
        if (onPartial) onPartial(current());
        clearTimers();
        if (continuous) {
          silenceTimer = setTimeout(() => finish(current()), silenceMs);
        } else {
          finish(current());
        }
      };

      rec.onerror = () => {
        finish(finalText.trim());
      };

      rec.onend = () => {
        /** 识别器自己收尾了 —— 有内容就交，没内容就当没听到 */
        finish(current());
      };

      try {
        rec.start();
      } catch (err) {
        finish('');
      }
    });
  } catch (err) {
    return '';
  }
}

/**
 * 听一句话（默认连续识别 + 静音收尾）。
 *
 * ⚠️ 名字保留是为了兼容既有调用点，但**语义已经改成连续识别** ——
 * 旧的「听一句就交差」在真机上会把「1990年1月1日早上男」截断。
 *
 * @param {Object} [options] 同 listenSession
 * @returns {Promise<string>} 识别文本；失败或超时返回空串
 */
export async function listenOnce(options = {}) {
  return listenSession(options);
}

/**
 * 连续听一段话（自由提问用）。
 *
 * 与 listenOnce 的差别：显式打开连续 + 实时回调，
 * 让页面在「正在听……」时把识别到的字实时显示出来。
 *
 * @param {Object} [options] 同 listenSession
 * @returns {Promise<string>}
 */
export async function listenContinuous(options = {}) {
  return listenSession({ continuous: true, ...options });
}
