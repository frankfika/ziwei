/**
 * 出生参数来源 —— **对话流入参 → 本机存档 → 内置示例** 三级兜底。
 *
 * 为什么要有「内置示例」这一级（2026-11-07 加）：
 *
 *  1. **模拟器没有麦克风**。语音录入是眼镜上的主路径，但在 AIUI Studio 模拟器里
 *     `startRecognition` 永远拿不到文本 —— 于是页面永远停在「说出你的生辰」浮层，
 *     盘面一次都出不来。评审看模拟器、我们录演示视频，都卡在这里。
 *  2. **真机上语音也可能被拒**：权限没给、环境太吵、用户没唤醒。
 *     这时如果界面什么都不出，用户既不知道能干什么，也走不下去。
 *  3. **「打开就有画面」比「先说一句才看到」更稳**。首启直接给一张盘，
 *     用户立刻知道这是个什么东西。
 *
 * 所以：**拿不到任何出生信息时，先把一张示例盘亮出来**，并在中宫标注「示例盘」；
 * 用户说出自己的生辰后立刻换成自己的盘。
 *
 * 三条纪律：
 *  · 示例盘**不写入本机命盘库**（否则下次启动会被当成「用户自己的盘」读回来）；
 *  · 示例盘**不算用户数据**，界面必须标注，不能让人误以为是自己的盘；
 *  · 入参校验与端侧/服务端口径完全一致（年 1900–2100、时辰序号 0–11）。
 */

/**
 * 内置示例生辰：1990-01-01 子时 男。
 *
 * 选它是因为它是全套文档、测试与示例文案里一直用的那一份（子时 = 时辰序号 0），
 * 任何时候看到这张盘都能对上号。
 */
export const DEMO_BIRTH = Object.freeze({
    year: 1990,
    month: 1,
    day: 1,
    hour: 0,
    gender: 'male',
    name: '',
});

/**
 * 从对话流入参里取出生参数。
 *
 * @param {Object} [query] 页面 onLoad 收到的 query（对话流会把生辰参数塞在这里）
 * @returns {Object | null} 合法则返回 {year,month,day,hour,gender,name}，否则 null
 */
export function birthFromQuery(query) {
    const q = query || {};
    const year = Number(q.year);
    const month = Number(q.month);
    const day = Number(q.day);
    const hour = Number(q.hour);
    const gender = q.gender === 'female' ? 'female' : q.gender === 'male' ? 'male' : null;

    if (
        Number.isInteger(year) && year >= 1900 && year <= 2100 &&
        Number.isInteger(month) && month >= 1 && month <= 12 &&
        Number.isInteger(day) && day >= 1 && day <= 31 &&
        Number.isInteger(hour) && hour >= 0 && hour <= 11 &&
        gender
    ) {
        return { year, month, day, hour, gender, name: q.name || '' };
    }

    return null;
}

/**
 * 定出生参数：对话流入参 → 本机存档 → 内置示例。
 *
 * @param {Object} [query] 页面 onLoad 收到的 query
 * @param {Object | null} [saved] 本机存档里最近一张盘（latestProfile()）
 * @returns {{ birth: Object, demo: boolean }} demo=true 表示这是内置示例盘
 */
export function resolveInitialBirth(query, saved) {
    const fromQuery = birthFromQuery(query);
    if (fromQuery) {
        return { birth: fromQuery, demo: false };
    }

    if (
        saved &&
        Number.isInteger(saved.year) &&
        Number.isInteger(saved.month) &&
        Number.isInteger(saved.day) &&
        Number.isInteger(saved.hour) &&
        (saved.gender === 'male' || saved.gender === 'female')
    ) {
        return { birth: { ...saved }, demo: false };
    }

    return { birth: { ...DEMO_BIRTH }, demo: true };
}
