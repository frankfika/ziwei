import { useEffect, useState, useCallback } from 'react';

/**
 * 命盘追问的本地会话存档 —— 每张盘（排盘日 + 时辰序号 + 性别）一条线程，
 * 只存在浏览器 localStorage，不上传。关掉页面再回来，对话还在。
 */

export interface AskMessage {
  id: string;
  question: string;
  answer: string;
  /** 本条回答实际引用的维度名 */
  cited: string[];
  /** 机械自检标出的越界内容（星曜/宫位/落宫描述） */
  suspects: string[];
  model?: string;
  at: number;
}

/** 每张盘最多保留的问答条数（超出的最旧条丢弃，避免无限膨胀） */
const MAX_MESSAGES = 20;

function storageKey(identity: string): string {
  return `ziwei_ask:${identity}`;
}

function readThread(identity: string): AskMessage[] {
  try {
    const raw = localStorage.getItem(storageKey(identity));
    if (!raw) return [];
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter(
      (m): m is AskMessage =>
        !!m &&
        typeof (m as AskMessage).question === 'string' &&
        typeof (m as AskMessage).answer === 'string',
    );
  } catch {
    return [];
  }
}

function writeThread(identity: string, messages: AskMessage[]): void {
  try {
    localStorage.setItem(storageKey(identity), JSON.stringify(messages));
  } catch {
    /* 忽略写入失败（隐私模式 / 配额满） */
  }
}

/** 读入指定命盘的追问线程；identity 用 history.ts 的 chartKey 口径 */
export function useAskThread(identity: string) {
  const [messages, setMessages] = useState<AskMessage[]>([]);

  useEffect(() => {
    setMessages(readThread(identity));
  }, [identity]);

  const append = useCallback(
    (msg: Omit<AskMessage, 'id' | 'at'>) => {
      const entry: AskMessage = {
        ...msg,
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        at: Date.now(),
      };
      const updated = [...readThread(identity), entry].slice(-MAX_MESSAGES);
      writeThread(identity, updated);
      setMessages(updated);
    },
    [identity],
  );

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(storageKey(identity));
    } catch {
      /* 忽略 */
    }
    setMessages([]);
  }, [identity]);

  return { messages, append, clear };
}
