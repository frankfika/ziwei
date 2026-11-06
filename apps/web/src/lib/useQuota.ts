'use client';

/**
 * 额度状态（每天上限 / 今天已用 / 还剩几次）—— 给界面显示用。
 *
 * 请求一次 /api/quota，结果在页面生命周期内缓存（模块级 promise），
 * 多个组件共用，不会各拉一次。
 */

import { useEffect, useState } from 'react';
import { DAILY_LIMIT } from './quota';

export interface QuotaStatus {
  /** 每日上限（服务端为准，可能被 ZIWEI_ASK_DAILY_LIMIT 覆盖；VIP 不限量时为 0） */
  limit: number;
  /** 今天已用 */
  used: number;
  /** 今天还剩 */
  remaining: number;
  /** 是否命中 VIP 白名单（限时长为 VIP 日额，0 = 不限量） */
  vip?: boolean;
}

let cached: Promise<QuotaStatus> | null = null;

/** 拉一次额度状态（模块内缓存） */
export function fetchQuotaStatus(): Promise<QuotaStatus> {
  if (!cached) {
    cached = fetch('/api/quota', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Partial<QuotaStatus> | null) => ({
        limit: typeof j?.limit === 'number' ? j.limit : DAILY_LIMIT,
        used: typeof j?.used === 'number' ? j.used : 0,
        remaining: typeof j?.remaining === 'number' ? j.remaining : DAILY_LIMIT,
        ...(j?.vip ? { vip: true } : {}),
      }))
      .catch(() => ({
        limit: DAILY_LIMIT,
        used: 0,
        remaining: DAILY_LIMIT,
      }));
  }
  return cached;
}

/** 订阅额度状态；取不到时回落到默认上限（别让界面因为一次网络失败就空白） */
export function useQuotaStatus(): QuotaStatus {
  const [status, setStatus] = useState<QuotaStatus>({
    limit: DAILY_LIMIT,
    used: 0,
    remaining: DAILY_LIMIT,
  });

  useEffect(() => {
    let alive = true;
    void fetchQuotaStatus().then((s) => {
      if (alive) setStatus(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  return status;
}
