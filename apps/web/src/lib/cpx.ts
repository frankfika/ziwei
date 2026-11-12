/**
 * CPX Research 问卷解锁 —— 配置、签名、发奖换算。
 *
 * 商业模式：免费日额用完后，登录用户答问卷换追问次数（奖励走 addPackBalance，
 * 与购买流量包同一余额池，「我的额度」页自动可见）。
 *
 * 官方约定（cpx-research.com/main/en/doc.php）：
 *   · 问卷墙 iframe：https://offers.cpx-research.com/index.php?app_id=…&ext_user_id=…&secure_hash=…
 *   · secure_hash = md5(ext_user_id + '-' + app_secure_hash)
 *   · postback 在 publisher 后台 Postback Settings-Tab 配置（参数宏只在后台可见）
 *
 * env 未配置 → cpxConfigured() 为 false → 入口全局隐藏（照抄 alipayConfigured 模式），
 * 国内实例不配 CPX env 就零展示、零分岔。
 */

import crypto from 'node:crypto';

/** CPX 是否已配置（决定问卷入口显隐） */
export function cpxConfigured(): boolean {
  return Boolean(process.env.ZIWEI_CPX_APP_ID && process.env.ZIWEI_CPX_SECRET);
}

/** 官方公式：md5(ext_user_id + '-' + app_secure_hash) */
export function cpxSecureHash(userId: string): string {
  return crypto
    .createHash('md5')
    .update(`${userId}-${process.env.ZIWEI_CPX_SECRET ?? ''}`)
    .digest('hex');
}

/** 问卷墙 URL：subId 绑定登录 userId，奖励只发得到本人账户（未登录无处可发） */
export function cpxWallUrl(user: { id: string; email: string }): string {
  const q = new URLSearchParams({
    app_id: process.env.ZIWEI_CPX_APP_ID ?? '',
    ext_user_id: user.id,
    secure_hash: cpxSecureHash(user.id),
    // 文档：带上 email 有助于 CPX 侧去重匹配
    email: user.email,
  });
  return `https://offers.cpx-research.com/index.php?${q.toString()}`;
}

/** 每美元换几次（默认 25 ≈ $0.04/次，贴着现有流量包 $3.99/100 次的单价） */
export function asksFromPayout(usd: number): number {
  const rate = Number(process.env.ZIWEI_CPX_ASKS_PER_USD ?? 25) || 25;
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  return Math.max(1, Math.floor(usd * rate));
}

/**
 * 校验 postback 签名。
 * ponytail: 预期公式 md5(tx + '-' + secret)，但 CPX 后台 Postback Settings-Tab 的
 * 参数宏格式拿到账号前无法核对 —— 与官方约定不一致时只改这一个函数；
 * ZIWEI_CPX_DEBUG=1 时放行并打印原始参数，用于首个真实回调标定。
 */
export function verifyCpxPostback(p: { tx: string; uid: string; sig: string }): boolean {
  if (process.env.ZIWEI_CPX_DEBUG === '1') {
    console.log('[cpx] debug postback accept:', p);
    return Boolean(p.tx && p.uid);
  }
  if (!p.tx || !p.uid || !p.sig) return false;
  const expect = crypto
    .createHash('md5')
    .update(`${p.tx}-${process.env.ZIWEI_CPX_SECRET ?? ''}`)
    .digest('hex');
  return expect === p.sig.toLowerCase();
}
