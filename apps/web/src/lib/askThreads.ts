import { useEffect, useState, useCallback } from 'react';

/**
 * 命盘追问的本地会话存档 —— 每张盘（排盘日 + 时辰序号 + 性别）下可有**多条对话**，
 * 像 ChatGPT 一样能新建、切换；只存在浏览器 localStorage，不上传。
 *
 * 存储结构 v2：`ziwei_ask2:{identity}` = { threads: AskThread[], activeId, trash? }
 * 兼容 v1：旧 key `ziwei_ask:{identity}` 的单条线程在首次读取时迁移成一条对话。
 *
 * 整理口径：
 * - 删除 = 进回收站（trash），30 天或超过 10 条才真正清除；删完可撤销/恢复；
 * - 归档 = 留在 threads 里打 archivedAt 标记，主列表不显示，随时可恢复；
 *   超过 30 天没动的非当前对话在读取时自动归档（惰性迁移，只写回一次）；
 * - 写失败（配额满）不静默：先清空回收站重试一次，仍失败则置 storageFull 让界面明示。
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

/** 一条对话：标题取第一个问题（可改），按 updatedAt 倒序展示 */
export interface AskThread {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  /** 归档时间；有值即不进主列表（数据保留，可恢复） */
  archivedAt?: number;
  /** 进回收站的时间（仅 trash 里的条目有） */
  deletedAt?: number;
  messages: AskMessage[];
}

interface ThreadsFile {
  threads: AskThread[];
  /** 当前对话 id；null = 没有任何对话（空草稿态，发第一条时落库） */
  activeId: string | null;
  /** 回收站：删除的对话先落这里，可恢复 */
  trash?: AskThread[];
}

/** 每条对话最多保留的问答条数（超出的最旧条丢弃，避免 localStorage 无限膨胀；界面会提示已截断）。
 *  上文真正发给模型的只有最近几轮（服务端 buildHistoryBlock 再截），留 50 条主要是留档 */
export const MAX_MESSAGES = 50;

/** 回收站容量：超出后挤掉最早删的 */
const TRASH_MAX = 10;
/** 回收站/自动归档的保留期：30 天 */
const RETAIN_MS = 30 * 24 * 60 * 60 * 1000;

const EMPTY: ThreadsFile = { threads: [], activeId: null };

function storageKey(identity: string): string {
  return `ziwei_ask2:${identity}`;
}

function legacyKey(identity: string): string {
  return `ziwei_ask:${identity}`;
}

/** 档案进回收站时，对话存档暂存到这个 key（恢复档案时整体搬回） */
function binKey(identity: string): string {
  return `ziwei_ask2_bin:${identity}`;
}

/** 档案删除时级联处理对话：暂存到回收站 key（不销毁，恢复档案可整体还原） */
export function trashAskThreads(identity: string): void {
  try {
    const raw = localStorage.getItem(storageKey(identity));
    if (raw !== null) {
      localStorage.setItem(binKey(identity), raw);
      localStorage.removeItem(storageKey(identity));
    }
  } catch {
    /* 忽略 */
  }
}

/** 档案恢复时把暂存的对话搬回原 key */
export function restoreAskThreads(identity: string): void {
  try {
    const raw = localStorage.getItem(binKey(identity));
    if (raw !== null) {
      localStorage.setItem(storageKey(identity), raw);
      localStorage.removeItem(binKey(identity));
    }
  } catch {
    /* 忽略 */
  }
}

/** 彻底清掉这张盘的全部对话（含暂存区） */
export function dropAskThreads(identity: string): void {
  try {
    localStorage.removeItem(storageKey(identity));
    localStorage.removeItem(binKey(identity));
    localStorage.removeItem(legacyKey(identity));
  } catch {
    /* 忽略 */
  }
}

function validMessage(m: unknown): m is AskMessage {
  return (
    !!m &&
    typeof (m as AskMessage).question === 'string' &&
    typeof (m as AskMessage).answer === 'string'
  );
}

function validThread(t: unknown): t is AskThread {
  return !!t && typeof (t as AskThread).id === 'string' && Array.isArray((t as AskThread).messages);
}

/**
 * 读盘 + 惰性整理：
 * - 回收站里超过 30 天的条目真正清除；
 * - 非当前对话、30 天未动、未归档的自动归档。
 * 有整理发生时写回一次。
 */
function readFile(identity: string): ThreadsFile {
  try {
    const raw = localStorage.getItem(storageKey(identity));
    if (raw) {
      const v: unknown = JSON.parse(raw);
      if (v && Array.isArray((v as ThreadsFile).threads)) {
        const f = v as ThreadsFile;
        let threads = f.threads.filter(validThread);
        let trash = Array.isArray(f.trash) ? f.trash.filter(validThread) : [];
        const activeId = typeof f.activeId === 'string' ? f.activeId : null;

        const cutoff = Date.now() - RETAIN_MS;
        const keptTrash = trash.filter((t) => (t.deletedAt ?? t.updatedAt) > cutoff);
        const tidied = threads.map((t) =>
          !t.archivedAt && t.id !== activeId && t.updatedAt < cutoff
            ? { ...t, archivedAt: Date.now() }
            : t,
        );
        const changed =
          keptTrash.length !== trash.length || tidied.some((t, i) => t !== threads[i]);
        trash = keptTrash;
        threads = tidied;
        if (changed) writeFile(identity, { threads, activeId, trash });

        return { threads, activeId, trash };
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

/** 写盘；配额满时抛错（调用方决定降级策略），其余失败按成功处理（隐私模式只读） */
function writeFile(identity: string, f: ThreadsFile): void {
  localStorage.setItem(storageKey(identity), JSON.stringify(f));
}

/** 带降级的写盘：配额满先清回收站重试；仍失败返回 false（界面要明示，不能静默丢回答） */
function writeFileSafe(identity: string, f: ThreadsFile): boolean {
  try {
    writeFile(identity, f);
    return true;
  } catch {
    try {
      writeFile(identity, { ...f, trash: [] });
      return true;
    } catch {
      return false;
    }
  }
}

function newId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * 读入指定命盘的追问对话；identity 用 history.ts 的 chartKey 口径。
 * 返回当前对话的消息 + 活跃/归档/回收站三档列表 + 整理操作。
 */
export function useAskThread(identity: string) {
  const [file, setFile] = useState<ThreadsFile>(EMPTY);
  /** 存档是否读完（第一帧恒为空，不能据此判断「有没有对话」） */
  const [loaded, setLoaded] = useState(false);
  /** 上一次写盘是否失败（存储满）—— 界面据此提示清理 */
  const [storageFull, setStorageFull] = useState(false);

  useEffect(() => {
    setFile(readFile(identity));
    setLoaded(true);
  }, [identity]);

  const active = file.threads.find((t) => t.id === file.activeId) ?? null;
  const messages = active?.messages ?? [];
  /** 主列表：有内容、未归档，按最近更新倒序（空草稿不占位） */
  const threads = file.threads
    .filter((t) => t.messages.length > 0 && !t.archivedAt)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  /** 已归档：同样按最近更新倒序 */
  const archived = file.threads
    .filter((t) => t.messages.length > 0 && t.archivedAt)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  /** 回收站：按删除时间倒序 */
  const trash = (file.trash ?? [])
    .filter((t) => t.messages.length > 0)
    .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));

  const append = useCallback(
    (msg: Omit<AskMessage, 'id' | 'at'>, title?: string) => {
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
          // 还没有对话（或刚点了「新对话」）：落一条新的 —— 话题对话直接以话题名为题
          const t: AskThread = {
            id: newId('t'),
            title: title || msg.question.slice(0, 14) || '新对话',
            createdAt: entry.at,
            updatedAt: entry.at,
            messages: [entry],
          };
          threads = [t, ...prev.threads];
          activeId = t.id;
        }
        const next: ThreadsFile = { threads, activeId, ...(prev.trash ? { trash: prev.trash } : {}) };
        setStorageFull(!writeFileSafe(identity, next));
        return next;
      });
    },
    [identity],
  );

  /** 新对话：把 activeId 指到「空草稿」（不落库），发第一条时才真正建档 */
  const newThread = useCallback(() => {
    setFile((prev) => {
      const next: ThreadsFile = { threads: prev.threads, activeId: '__draft__' };
      return next;
    });
  }, []);

  const selectThread = useCallback(
    (id: string) => {
      setFile((prev) => {
        const next = { ...prev, activeId: id };
        // 记住选择：刷新/下次打开停在这条对话（以前只改内存，重开跳回旧对话）
        setStorageFull(!writeFileSafe(identity, next));
        return next;
      });
    },
    [identity],
  );

  /** 重命名对话（空标题忽略） */
  const renameThread = useCallback(
    (id: string, title: string) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      setFile((prev) => {
        const threads = prev.threads.map((t) => (t.id === id ? { ...t, title: trimmed } : t));
        const next = { ...prev, threads };
        setStorageFull(!writeFileSafe(identity, next));
        return next;
      });
    },
    [identity],
  );

  /** 归档 / 取消归档（归档中的对话不能是当前对话：归档当前对话时先切走） */
  const setArchived = useCallback(
    (id: string, archive: boolean) => {
      setFile((prev) => {
        const threads: AskThread[] = prev.threads.map((t) => {
          if (t.id !== id) return t;
          if (archive) return { ...t, archivedAt: Date.now() };
          const { archivedAt: _a, ...rest } = t;
          return rest;
        });
        let activeId = prev.activeId;
        if (archive && prev.activeId === id) {
          activeId =
            threads
              .filter((t) => t.messages.length > 0 && !t.archivedAt && t.id !== id)
              .sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id ?? '__draft__';
        }
        const next = { ...prev, threads, activeId };
        setStorageFull(!writeFileSafe(identity, next));
        return next;
      });
    },
    [identity],
  );

  /** 删除一条对话：进回收站（可恢复）。删的正是当前对话时，自动切到最近一条活跃对话 */
  const deleteThread = useCallback(
    (id: string) => {
      setFile((prev) => {
        const victim = prev.threads.find((t) => t.id === id);
        if (!victim) return prev;
        const threads = prev.threads.filter((t) => t.id !== id);
        const trashEntry: AskThread = { ...victim, deletedAt: Date.now() };
        const trash = [trashEntry, ...(prev.trash ?? [])].slice(0, TRASH_MAX);
        let activeId = prev.activeId;
        if (prev.activeId === id) {
          activeId =
            threads
              .filter((t) => t.messages.length > 0 && !t.archivedAt)
              .sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id ?? '__draft__';
        }
        const next: ThreadsFile = { threads, activeId, trash };
        setStorageFull(!writeFileSafe(identity, next));
        return next;
      });
    },
    [identity],
  );

  /** 从回收站恢复（回到主列表，归档标记清掉） */
  const restoreThread = useCallback(
    (id: string) => {
      setFile((prev) => {
        const victim = (prev.trash ?? []).find((t) => t.id === id);
        if (!victim) return prev;
        const { deletedAt: _d, archivedAt: _a, ...clean } = victim;
        const threads = [clean, ...prev.threads];
        const trash = (prev.trash ?? []).filter((t) => t.id !== id);
        const next: ThreadsFile = { threads, activeId: prev.activeId ?? clean.id, trash };
        setStorageFull(!writeFileSafe(identity, next));
        return next;
      });
    },
    [identity],
  );

  /** 彻底删除回收站里的一条 */
  const destroyThread = useCallback(
    (id: string) => {
      setFile((prev) => {
        const trash = (prev.trash ?? []).filter((t) => t.id !== id);
        const next = { ...prev, trash };
        setStorageFull(!writeFileSafe(identity, next));
        return next;
      });
    },
    [identity],
  );

  /** 清空回收站 */
  const emptyTrash = useCallback(() => {
    setFile((prev) => {
      const next = { ...prev, trash: [] };
      setStorageFull(!writeFileSafe(identity, next));
      return next;
    });
  }, [identity]);

  return {
    messages,
    loaded,
    append,
    threads,
    archived,
    trash,
    storageFull,
    activeId: file.activeId,
    newThread,
    selectThread,
    renameThread,
    setArchived,
    deleteThread,
    restoreThread,
    destroyThread,
    emptyTrash,
  };
}
