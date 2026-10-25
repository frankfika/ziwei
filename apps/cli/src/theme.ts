/**
 * 终端配色。
 *
 * 零依赖实现：自己拼 ANSI 转义序列，不引 chalk。
 * 颜色只在「显式要求或确实是终端」时开启，避免污染管道里的输出。
 */

export type Paint = (text: string) => string;

export interface Theme {
  readonly enabled: boolean;
  bold: Paint;
  dim: Paint;
  red: Paint;
  green: Paint;
  yellow: Paint;
  blue: Paint;
  magenta: Paint;
  cyan: Paint;
}

const ESC = '\u001b[';

function wrap(code: number): Paint {
  return (text: string) => `${ESC}${code}m${text}${ESC}0m`;
}

function identity(text: string): string {
  return text;
}

/** 是否启用颜色 */
export function shouldUseColor(noColorFlag: boolean): boolean {
  if (noColorFlag) return false;
  // https://no-color.org —— 存在即关闭
  if (process.env.NO_COLOR !== undefined) return false;
  // 显式强制（便于在 CI / 截图里保留颜色）
  const force = process.env.FORCE_COLOR;
  if (force !== undefined && force !== '0' && force !== '') return true;
  return Boolean(process.stdout.isTTY);
}

export function createTheme(enabled: boolean): Theme {
  if (!enabled) {
    return {
      enabled: false,
      bold: identity,
      dim: identity,
      red: identity,
      green: identity,
      yellow: identity,
      blue: identity,
      magenta: identity,
      cyan: identity,
    };
  }
  return {
    enabled: true,
    bold: wrap(1),
    dim: wrap(2),
    red: wrap(31),
    green: wrap(32),
    yellow: wrap(33),
    blue: wrap(34),
    magenta: wrap(35),
    cyan: wrap(36),
  };
}
