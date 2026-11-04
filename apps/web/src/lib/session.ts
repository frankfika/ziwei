import { cookies } from 'next/headers';

import { getSessionUser } from './account';

/**
 * 登录态读取 —— httpOnly cookie 里放随机 session token，服务端查表。
 *
 * cookie 属性：httpOnly + SameSite=Lax + Secure（生产）+ Path=/，30 天有效。
 * 客户端 JS 读不到 token（防 XSS 窃取），服务端每次请求查表。
 */

/** cookie 名 */
export const SESSION_COOKIE = 'ziwei_session';

/** 取当前登录用户（未登录返回 null） */
export async function currentUser() {
  const store = await cookies();
  return getSessionUser(store.get(SESSION_COOKIE)?.value);
}
