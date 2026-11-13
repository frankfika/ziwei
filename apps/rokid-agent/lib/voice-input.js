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
 * 识别会话的**硬超时**（毫秒）—— 页面层的看门狗。
 *
 * ⚠️ 为什么不能只靠识别层自己的超时：
 * 宿主有可能既不回调 `onend`、也不给结果，
 * `await` 就永远挂着 ⇒ 页面的「正在听」锁永远不解 ⇒
 * **之后每一次开口都被挡掉，语音输入彻底死掉**。
 * 眼镜上没有键盘，用户唯一的出路是重开应用 —— 不能接受。
 *
 * 取 14000：比识别层的 LISTEN_TIMEOUT（12s）多留 2s，
 * 让识别层自己收尾的那一段不被误杀。
 */
export const VOICE_HARD_TIMEOUT = 14000;

/**
 * 给一个 Promise 加一道**硬超时**。
 *
 * 超时不是「失败」，而是「没听到」——
 * 调用方把它当成空结果处理（提示用户再说一次），
 * 绝不能让它把页面留在半路。
 *
 * @template T
 * @param {Promise<T>} promise 被看护的 Promise
 * @param {number} ms 超时毫秒
 * @returns {Promise<T>}
 */
export function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
        let done = false;
        const timer = setTimeout(() => {
            if (done) return;
            done = true;
            reject(new Error('语音识别超时'));
        }, ms);
        Promise.resolve(promise).then(
            (value) => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                resolve(value);
            },
            (err) => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                reject(err);
            }
        );
    });
}

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
        /** 最后一次**非空**的识别文本（空结果不许清空它） */
        let lastText = '';
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

        const timer = setTimeout(() => finish(settledText()), timeout);

        const push = (chunk) => {
          if (typeof chunk !== 'string' || !chunk) return;
          accumulated += chunk;
          if (onPartial) onPartial(accumulated.trim());
          clearTimers();
          if (continuous) {
            silenceTimer = setTimeout(() => finish(settledText()), silenceMs);
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
          finish(settledText());
        };

        /**
         * 收尾用的文本：优先用「听过的最后一句」。
         *
         * ⚠️ 和 Web 分支同一个坑（2026-11-13 实测）：
         * 宿主可能先给一次文本、再给一次空结果，
         * 收尾那一刻手上是空的 ⇒ 白白丢掉已经听到的话。
         */
        function settledText() {
          return lastText || accumulated;
        }

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
            /**
             * 中间结果开关 —— **Rokid ink 运行时的真实契约**。
             *
             * ⚠️ 2026-11-13 在 AIUI Studio 的真实运行时里拆过
             * `ink_web_bg.wasm` 的字符串表，宿主的 `wx.speech.startRecognition`
             * 读的是这几个键：`continuous` / `interimResults` / `maxAlternatives`
             * / `onresult` / `onend` —— **不认 `success` / `fail`**。
             *
             * 所以下面 `onresult` / `onend` 才是正路，
             * `success` / `fail` 只是给老宿主留的兼容位（多余字段被忽略，无害）。
             */
            interimResults: continuous,
            maxAlternatives: 1,
            /**
             * 宿主的识别结果回调。
             *
             * payload 有两种可能形状，两种都认：
             * · `{transcript, isFinal, resultIndex, confidence, sessionId}`
             *   —— ink 运行时的形状（一次给一句）；
             * · `{result | text | value, partialText}`
             *   —— 兼容老宿主的形状（一次给全文）。
             */
            onresult: (res) => {
              if (settled) return;
              const chunk =
                res && typeof res.transcript === 'string'
                  ? res.transcript
                  : res && typeof res.result === 'string'
                    ? res.result
                    : res && typeof res.text === 'string'
                      ? res.text
                      : res && typeof res.value === 'string'
                        ? res.value
                        : '';
              const partial = res && typeof res.partialText === 'string' ? res.partialText : '';
              if (chunk) accumulated = chunk;
              if (partial) accumulated += partial;
              const text = accumulated.trim();
              if (text) lastText = text;
              if (onPartial) onPartial(text);
              clearTimers();
              if (continuous) {
                silenceTimer = setTimeout(() => finish(settledText()), silenceMs);
              } else {
                finish(settledText());
              }
            },
            /** 宿主收尾了 —— 有内容就交 */
            onend: () => {
              finish(settledText());
            },
            success: (res) => {
              /**
               * 宿主可能只给最终结果（`result` / `text` / `value`），
               * 也可能同时给增量（`partialText`）。
               * 两种都收：最终结果**替换**掉上一次，增量**追加**。
               */
              if (settled) return;
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
              const text = accumulated.trim();
              if (text) lastText = text;
              if (onPartial) onPartial(text);
              clearTimers();
              if (continuous) {
                silenceTimer = setTimeout(() => finish(settledText()), silenceMs);
              } else {
                finish(settledText());
              }
            },
            fail: () => {
              finish(settledText());
            },
          });
        } catch (err) {
          finish(settledText());
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
      /**
       * 最后一次**非空**的识别文本。
       *
       * ⚠️ 为什么必须单独记一份（2026-11-13 在 AIUI Studio 实测踩到）：
       * 宿主的 `onresult` 每次都带**完整结果集**，但它**不保证每次都非空** ——
       * 实测顺序是「先给一次文本，紧接着又给一次空结果，然后才 `onend`」。
       * 而 `onend` 收尾时读的是**当时**的 `finalText + interimText`，
       * 那一刻已经被空结果清空了 ⇒ 明明听清了「1989年12月5日 子时 男」，
       * 交给页面的却是**空串** ⇒ 生辰解析失败、盘面不重排。
       *
       * 记一份「听过的最后一句话」，收尾时用它兜底，
       * 空结果就再也丢不掉已经听到的内容。
       */
      let lastText = '';
      let silenceTimer = null;

      const clearTimers = () => {
        if (silenceTimer) {
          clearTimeout(silenceTimer);
          silenceTimer = null;
        }
      };

      const current = () => (finalText + interimText).trim();

      /** 收尾用的文本：优先用「听过的最后一句」，没有才用当前结果 */
      const settledText = () => lastText || current();

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
      const timer = setTimeout(() => finish(settledText()), timeout);

      activeCancel = () => {
        clearTimers();
        try {
          rec.abort();
        } catch (err) {
          /* ignore */
        }
        finish(settledText());
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
         * **会话已收尾就不要再报**（2026-11-13 实测踩到的坑）。
         *
         * 宿主可能把结果**晚于** `onend` 送到。
         * 那时页面已经把「没听清」显示出来了，
         * 如果这里还把文本报上去，状态行会从「没听清」跳回「在听：xxx」——
         * 用户看到的是「我明明说了话，页面却一直显示在听」。
         * ⇒ 收尾之后到达的一切结果一律丢弃。
         */
        if (settled) return;
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
        const text = current();
        /** 空结果不清空「听过的最后一句」 */
        if (text) lastText = text;
        if (onPartial) onPartial(text);
        clearTimers();
        if (continuous) {
          silenceTimer = setTimeout(() => finish(settledText()), silenceMs);
        } else {
          finish(settledText());
        }
      };

      rec.onerror = () => {
        finish(settledText());
      };

      rec.onend = () => {
        /** 识别器自己收尾了 —— 有内容就交，没内容就当没听到 */
        finish(settledText());
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
