// 紫微助手 · 设计改造验收指标（Day 7 回归用）
//
// 用法：在浏览器控制台 / Playwright evaluate 里执行，返回一行 JSON。
// 对应 docs/DESIGN-HOWTO-CHANGE.md §D 的验收总表。

export function measure() {
  const q = (s) => document.querySelector(s);
  const board = q('#chart-board [role=group]') || q('#chart-board .palace-grid');
  const r = board ? board.getBoundingClientRect() : null;
  const doc = document.documentElement;

  const visible = (el) => {
    if (!el) return false;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
    const b = el.getBoundingClientRect();
    return b.width > 0 && b.height > 0;
  };

  // 顶区 chrome：SiteHeader + 摘要行（摘要行 = header 之后第一个非导航块）
  const header = q('header');
  const headerH = header ? header.getBoundingClientRect().height : 0;
  const boardTop = r ? r.top : null;

  const sihua = document.body.innerText.match(/禄|权|科|忌/g) || [];
  const heat = [...document.querySelectorAll('#chart-board *')]
    .map((el) => getComputedStyle(el).color)
    .filter((c) => c && c !== 'rgba(0, 0, 0, 0)');

  return {
    viewport: { w: innerWidth, h: innerHeight },
    // ① 盘底不超视口
    boardTop: boardTop === null ? null : Math.round(boardTop),
    boardBottom: r ? Math.round(r.bottom) : null,
    boardFitsViewport: r ? r.bottom <= innerHeight + 1 : false,
    // ② 页面不滚动（用户诉求：不要下滑）
    pageScrollablePx: doc.scrollHeight - doc.clientHeight,
    scrollRatio: +(doc.scrollHeight / doc.clientHeight).toFixed(2),
    // ③ 主题色
    themeColor: q('meta[name=theme-color]')?.getAttribute('content') ?? null,
    colorScheme:
      q('meta[name=color-scheme]')?.getAttribute('content') ??
      getComputedStyle(doc).colorScheme,
    // ④ 庙旺棕退役
    hardcodedOrangeHits: (document.documentElement.innerHTML.match(/8a5512/gi) || []).length,
    // ⑤ 选中宫有动效
    animEls: document.getAnimations().length,
    palaceBreatheDefined: [...document.styleSheets].some((s) => {
      try {
        return [...s.cssRules].some((x) => x.name === 'palace-breathe' || x.cssText?.includes('palace-breathe'));
      } catch {
        return false;
      }
    }),
    // ⑥ 解读不在盘首屏
    readingVisibleInChartTab: visible(q('#reading')) || visible(q('#reading-panel-active')),
    // ⑦ 顶区 chrome 预算
    headerH: Math.round(headerH),
    chromeBudgetOk: boardTop === null ? null : boardTop <= 112,
    // 附：星等层次抽样
    sihuaChipCount: sihua.length,
    distinctStarColors: [...new Set(heat)].slice(0, 12),
  };
}
