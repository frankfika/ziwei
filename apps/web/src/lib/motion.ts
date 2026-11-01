/** Client-side motion preference helpers. */

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function preferredScrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? 'auto' : 'smooth';
}

/** 命名动效时长（毫秒）—— 组件不要写魔法数字，都从这里取 */
export const DURATION = {
  breathe: 1800, // 恒星呼吸（选中宫光晕）
  sanfang: 220, // 三方四正淡入
  tab: 180, // 解读维切换溶化
  submit: 120, // 提交按钮 → spinner
  skeleton: 200, // 排盘骨架淡入
} as const;

/** 命名缓动 —— 统一用这一条，不要散落 cubic-bezier 字面量 */
export const EASE = {
  standard: 'cubic-bezier(0.22, 1, 0.36, 1)',
} as const;

/**
 * 组件内联样式：class 负责 keyframes，这里负责时长 + 缓动。
 * 时长只有一个来源（DURATION），缓动只有一个来源（EASE.standard）。
 */
export function motionStyle(duration: number): {
  animationDuration: string;
  animationTimingFunction: string;
} {
  return {
    animationDuration: `${duration}ms`,
    animationTimingFunction: EASE.standard,
  };
}

/** 用户开了 reduced-motion 就把时长压到 ≤80ms（JS 侧降级，CSS 兜底见 globals.css） */
export function motionDuration(duration: number): number {
  return prefersReducedMotion() ? Math.min(duration, 80) : duration;
}
