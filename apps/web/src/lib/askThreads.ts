import { useEffect, useState, useCallback } from 'react';

/**
 * 命盘追问的本地会话存档 —— 每张盘（排盘日 + 时辰序号 + 性别）下可有**多条对话**，
 * 像 ChatGPT 一样能新建、切换；只存在浏览器 localStorage，不上传。
 *
 * 存储结构 v2：`ziwei_ask2:{identity}` = { threads: AskThread[], activeId }
 * 兼容 v1：旧 key `ziwei_ask:{identity}` 的单条线程在首次读取时迁移成一条对话。
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
  /** 本条回答用的配置来源：user = 用户的 Key，builtin = 站内内置免费额度 */
  source?: 'user' | 'builtin';
  at: number;
}

/** 一条对话：标题取第一个问题，按 updatedAt 倒序展示 */
export interface AskThread {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: AskMessage[];
  /** 归档时间：归档后不再出现在对话列表，收进「已归档」分组；选中即恢复 */
  archivedAt?: number;
}

interface ThreadsFile {
  threads: AskThread[];
  /** 当前对话 id；null = 没有任何对话（空草稿态，发第一条时落库） */
  activeId: string | null;
}

/** 每条对话最多保留的问答条数（超出的最旧条丢弃，避免无限膨胀；界面会提示已截断） */
export const MAX_MESSAGES = 20;

const EMPTY: ThreadsFile = { threads: [], activeId: null };

function storageKey(identity: string): string {
  return `ziwei_ask2:${identity}`;
}

function legacyKey(identity: string): string {
  return `ziwei_ask:${identity}`;
}

function validMessage(m: unknown): m is AskMessage {
  return (
    !!m &&
    typeof (m as AskMessage).question === 'string' &&
    typeof (m as AskMessage).answer === 'string'
  );
}

function readFile(identity: string): ThreadsFile {
  try {
    const raw = localStorage.getItem(storageKey(identity));
    if (raw) {
      const v: unknown = JSON.parse(raw);
      if (v && Array.isArray((v as ThreadsFile).threads)) {
        const f = v as ThreadsFile;
        return {
          threads: f.threads.filter(
            (t) => t && typeof t.id === 'string' && Array.isArray(t.messages),
          ),
          activeId: typeof f.activeId === 'string' ? f.activeId : null,
        };
      }
    }
    // v1 迁移：旧的单线程整条包成一条对话，标题取第一个问题
    const legacyRaw = localStorage.getItem(legacyKey(identity));
    if (legacyRaw) {
      const list: unknown = JSON.parse(legacyRaw);
      if (Array.isArray(list) && list.length > 0) {
        const messages = list.filter(validMessage);
        if (messages.length > 0) {
          const oldest = messages[0].at || Date.now();
          return {
            threads: [
              {
                id: 'legacy',
                title: messages[0].question.slice(0, 14) || '之前的对话',
                createdAt: oldest,
                updatedAt: messages[messages.length - 1].at || oldest,
                messages,
              },
            ],
            activeId: 'legacy',
          };
        }
      }
    }
  } catch {
    /* 坏数据按空处理 */
  }
  return EMPTY;
}

function writeFile(identity: string, f: ThreadsFile): void {
  try {
    localStorage.setItem(storageKey(identity), JSON.stringify(f));
  } catch {
    /* 忽略写入失败（隐私模式 / 配额满） */
  }
}

function newId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * 读入指定命盘的追问对话；identity 用 history.ts 的 chartKey 口径。
 * 返回当前对话的消息 + 全部对话列表 + 新建/切换。
 */
export function useAskThread(identity: string) {
  const [file, setFile] = useState<ThreadsFile>(EMPTY);
  /** 存档是否读完（第一帧恒为空，不能据此判断「有没有对话」） */
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setFile(readFile(identity));
    setLoaded(true);
  }, [identity]);

  const active = file.threads.find((t) => t.id === file.activeId) ?? null;
  const messages = active?.messages ?? [];
  /** 有内容的对话才进切换列表（空草稿不占位）；已归档的收进单独分组 */
  const visible = file.threads.filter((t) => t.messages.length > 0);
  const threads = visible
    .filter((t) => !t.archivedAt)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const archivedThreads = visible
    .filter((t) => t.archivedAt)
    .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0));

  const append = useCallback(
    (msg: Omit<AskMessage, 'id' | 'at'>) => {
      setFile((prev) => {
        const entry: AskMessage = { ...msg, id: newId('m'), at: Date.now() };
        const cur = prev.threads.find((t) => t.id === prev.activeId) ?? null;
        let threads: AskThread[];
        let activeId: string;
        if (cur) {
          // 接着当前对话写
          activeId = cur.id;
          threads = prev.threads.map((t) =>
            t.id === cur.id
              ? { ...t, updatedAt: entry.at, messages: [...t.messages, entry].slice(-MAX_MESSAGES) }
              : t,
          );
        } else {
          // 还没有对话（或刚点了「新对话」）：落一条新的
          const t: AskThread = {
            id: newId('t'),
            title: msg.question.slice(0, 14) || '新对话',
            createdAt: entry.at,
            updatedAt: entry.at,
            messages: [entry],
          };
          threads = [t, ...prev.threads];
          activeId = t.id;
        }
        const next = { threads, activeId };
        writeFile(identity, next);
        return next;
      });
    },
    [identity],
  );

  /** 新对话：把 activeId 指到「空草稿」（不落库），发第一条时才真正建档 */
  const newThread = useCallback(() => {
    setFile((prev) => {
      const next = { threads: prev.threads, activeId: '__draft__' };
      return next;
    });
  }, []);

  const selectThread = useCallback(
    (id: string) => {
      setFile((prev) => {
        const next = { ...prev, activeId: id };
        // 记住选择：刷新/下次打开停在这条对话（以前只改内存，重开跳回旧对话）
        writeFile(identity, next);
        return next;
      });
    },
    [identity],
  );

  /** 清空当前对话的消息（对话本身保留，继续聊还在这一条里） */
  const clear = useCallback(() => {
    setFile((prev) => {
      const next = {
        threads: prev.threads.map((t) =>
          t.id === prev.activeId ? { ...t, messages: [] } : t,
        ),
        activeId: prev.activeId,
      };
      writeFile(identity, next);
      return next;
    });
  }, [identity]);

  /**
   * 归档一条对话：从列表里收起来（数据仍在，可在「已归档」分组找回，选中即恢复）。
   * 归档的正是当前对话时，自动切到最近一条其它对话；没有就落到空草稿。
   */
  const archiveThread = useCallback(
    (id: string) => {
      setFile((prev) => {
        const now = Date.now();
        const threads = prev.threads.map((t) =>
          t.id === id ? { ...t, archivedAt: now } : t,
        );
        let activeId = prev.activeId;
        if (prev.activeId === id) {
          const next = threads
            .filter((t) => t.messages.length > 0 && !t.archivedAt)
            .sort((a, b) => b.updatedAt - a.updatedAt)[0];
          activeId = next?.id ?? '__draft__';
        }
        const next = { threads, activeId };
        writeFile(identity, next);
        return next;
      });
    },
    [identity],
  );

  /** 恢复归档：清掉归档标记（切到这条对话由调用方负责） */
  const unarchiveThread = useCallback(
    (id: string) => {
      setFile((prev) => {
        const threads = prev.threads.map((t) =>
          t.id === id ? { ...t, archivedAt: undefined } : t,
        );
        const next = { threads, activeId: prev.activeId };
        writeFile(identity, next);
        return next;
      });
    },
    [identity],
  );

  return {
    messages,
    loaded,
    append,
    clear,
    threads,
    archivedThreads,
    activeId: file.activeId,
    newThread,
    selectThread,
    archiveThread,
    unarchiveThread,
  };
}
