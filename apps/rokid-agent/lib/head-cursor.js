/**
 * 头部准星 —— **纯函数，无任何运行时依赖**。
 *
 * 交互 idea：把十二宫方阵当成一块「抬头低头就能扫」的盘面。
 * 用 AbsoluteOrientationSensor 拿到头部四元数，换算成相对「正前方」的
 * 俯仰(pitch)与偏航(yaw)，映射成一个在 4×4 盘面上移动的准星。
 * 准星落在哪个宫，就选中哪个宫 —— 这是手机和网页都做不出来的交互。
 *
 * 双通道兜底：
 *  · 准星通道（AbsoluteOrientationSensor）—— 主体交互；
 *  · 倾斜通道（Accelerometer）—— 只用俯仰角做「抬头切下一宫 / 低头切上一宫」，
 *    不依赖宿主是否开启了绝对方向能力；
 *  · 镜腿按键（Arrow/Enter）—— 永远可用的精确兜底。
 *
 * 四元数约定：`[x, y, z, w]`，与 AIUI `AbsoluteOrientationSensor.quaternion` 一致。
 */

/** 准星默认参数 */
export const CURSOR_DEFAULTS = {
  /** 偏航达到该角度（度）时准星到达左右边界 */
  yawRangeDeg: 22,
  /** 俯仰达到该角度（度）时准星到达上下边界 */
  pitchRangeDeg: 16,
  /** 单元格边缘保护（0–0.5）：准星离格子边缘太近就不换宫，避免边界抖动 */
  edgeGuard: 0.2,
};

/**
 * 四元数是否有效。
 *
 * @param {unknown} q
 * @returns {boolean}
 */
export function isValidQuaternion(q) {
  return (
    Array.isArray(q) &&
    q.length >= 4 &&
    q.slice(0, 4).every((v) => Number.isFinite(v))
  );
}

/**
 * 四元数归一化。
 *
 * @param {number[]} q
 * @returns {number[] | null}
 */
export function normalizeQuaternion(q) {
  if (!isValidQuaternion(q)) return null;
  const [x, y, z, w] = q;
  const m = Math.sqrt(x * x + y * y + z * z + w * w);
  if (!Number.isFinite(m) || m === 0) return null;
  return [x / m, y / m, z / m, w / m];
}

/**
 * 四元数求逆（单位四元数的逆 = 共轭）。
 *
 * @param {number[]} q
 * @returns {number[]}
 */
export function invertQuaternion(q) {
  return [-q[0], -q[1], -q[2], q[3]];
}

/**
 * Hamilton 四元数乘法。
 *
 * @param {number[]} l
 * @param {number[]} r
 * @returns {number[]}
 */
export function multiplyQuaternions(l, r) {
  const [lx, ly, lz, lw] = l;
  const [rx, ry, rz, rw] = r;
  return [
    lw * rx + lx * rw + ly * rz - lz * ry,
    lw * ry - lx * rz + ly * rw + lz * rx,
    lw * rz + lx * ry - ly * rw + lz * rw,
    lw * rw - lx * ry - ly * rz + lz * rx,
  ];
}

/**
 * 相对四元数：从基准姿态到当前姿态的旋转。
 *
 * @param {number[]} baseline
 * @param {number[]} current
 * @returns {number[] | null}
 */
export function relativeQuaternion(baseline, current) {
  const b = normalizeQuaternion(baseline);
  const c = normalizeQuaternion(current);
  if (!b || !c) return null;
  return normalizeQuaternion(multiplyQuaternions(invertQuaternion(b), c));
}

/**
 * 四元数 → 欧拉角（弧度）。
 *
 * @param {number[]} q
 * @returns {{ yaw: number, pitch: number, roll: number } | null}
 */
export function quaternionToEuler(q) {
  const n = normalizeQuaternion(q);
  if (!n) return null;
  const [x, y, z, w] = n;
  const sinp = 2 * (w * y - z * x);
  const pitch = Math.asin(Math.min(1, Math.max(-1, sinp)));
  const yaw = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
  const roll = Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y));
  return { yaw, pitch, roll };
}

/**
 * 限制数值到区间。
 *
 * @param {number} v
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
export function clamp(v, lo, hi) {
  return Math.min(Math.max(v, lo), hi);
}

/**
 * 创建一个准星状态机。
 *
 * @param {Object} [opts]
 * @param {number} [opts.branch] 初始选中的地支（一般是命宫）
 * @param {number} [opts.yawRangeDeg]
 * @param {number} [opts.pitchRangeDeg]
 * @param {number} [opts.edgeGuard]
 * @returns {Object} state
 */
export function createCursorState(opts = {}) {
  return {
    baseline: null,
    branch: typeof opts.branch === 'number' ? opts.branch : 0,
    x: 0,
    y: 0,
    yawRangeDeg: opts.yawRangeDeg ?? CURSOR_DEFAULTS.yawRangeDeg,
    pitchRangeDeg: opts.pitchRangeDeg ?? CURSOR_DEFAULTS.pitchRangeDeg,
    edgeGuard: opts.edgeGuard ?? CURSOR_DEFAULTS.edgeGuard,
  };
}

/**
 * 盘面网格坐标 → 地支。**中宫返回 null**（中宫不是宫位，不该被选中）。
 *
 * @param {number} row 0–3
 * @param {number} col 0–3
 * @returns {number | null}
 */
export function gridToBranch(row, col) {
  const r = Math.round(row);
  const c = Math.round(col);
  if (r < 0 || r > 3 || c < 0 || c > 3) return null;
  // 中宫（行 1–2 × 列 1–2）不是宫位
  if (r >= 1 && r <= 2 && c >= 1 && c <= 2) return null;
  const map = {
    '0,0': 5, '0,1': 6, '0,2': 7, '0,3': 8,
    '1,0': 4, '1,3': 9,
    '2,0': 3, '2,3': 10,
    '3,0': 2, '3,1': 1, '3,2': 0, '3,3': 11,
  };
  const v = map[`${r},${c}`];
  return typeof v === 'number' ? v : null;
}

/**
 * 推进一次准星状态。
 *
 * 第一次拿到有效四元数时建立基准（此时准星停在初始宫，不动）。
 * 之后每次读数都换算成相对姿态 → 网格浮点坐标 → 命中宫位。
 *
 * @param {Object} state
 * @param {number[]} quaternion
 * @returns {{ state: Object, changed: boolean, branch: number }}
 */
export function updateCursor(state, quaternion) {
  const n = normalizeQuaternion(quaternion);
  if (!n) return { state, changed: false, branch: state.branch };

  if (!state.baseline) {
    return { state: { ...state, baseline: n }, changed: false, branch: state.branch };
  }

  const rel = relativeQuaternion(state.baseline, n);
  if (!rel) return { state, changed: false, branch: state.branch };

  const euler = quaternionToEuler(rel);
  if (!euler) return { state, changed: false, branch: state.branch };

  const yawDeg = (euler.yaw * 180) / Math.PI;
  const pitchDeg = (euler.pitch * 180) / Math.PI;

  const x = clamp(yawDeg / state.yawRangeDeg, -1, 1);
  const y = clamp(pitchDeg / state.pitchRangeDeg, -1, 1);

  // 浮点网格坐标 0..4（y 向下为正，抬头 → 行号变小）
  const fx = ((x + 1) / 2) * 4;
  const fy = ((1 - y) / 2) * 4;

  const col = clamp(Math.floor(fx), 0, 3);
  const row = clamp(Math.floor(fy), 0, 3);

  // 边缘保护：准星压在格子边界上时不换宫
  const guard = state.edgeGuard;
  const localX = fx - col;
  const localY = fy - row;
  if (localX < guard || localX > 1 - guard || localY < guard || localY > 1 - guard) {
    return { state: { ...state, x, y }, changed: false, branch: state.branch };
  }

  const branch = gridToBranch(row, col);
  if (branch === null || branch === state.branch) {
    // 落进中宫 → 保持当前选中宫，不丢选择
    return { state: { ...state, x, y }, changed: false, branch: state.branch };
  }

  return { state: { ...state, x, y, branch }, changed: true, branch };
}

/* ------------------------------------------------------------------ *
 * 倾斜通道：只用 Accelerometer 的重力方向做「抬头/低头切宫」
 * ------------------------------------------------------------------ */

/**
 * 加速度计默认参数。
 *
 * ⚠️ 两个参数都是**设备相关**的，只能在真机上确认一次：
 *  · `axis` —— 眼镜戴在脸上的姿态决定了「俯仰」对应设备坐标系的哪根轴。
 *    默认取 'x'（标准设备坐标系里 X 是耳-耳轴 = 俯仰轴）。
 *    真机上如果低头没反应，把它换成 'y' 或 'z' 即可（改一行）。
 *  · `signFlip` —— 抬头到底是「下一宫」还是「上一宫」，方向反了就把它翻成 true。
 */
export const TILT_DEFAULTS = {
  /** 触发一次切宫的倾角阈值（度） */
  thresholdDeg: 12,
  /** 回中死区（度）：切宫后必须回到该角度以内，才允许下一次触发 */
  rearmDeg: 5,
  /** 俯仰轴（设备坐标系）：'x' | 'y' | 'z' */
  axis: 'x',
  /** 轴向翻转开关（真机确认后调整） */
  signFlip: false,
};

/**
 * 创建一个倾斜切宫状态机。
 *
 * @param {Object} [opts]
 * @param {number} [opts.branch] 初始地支
 * @param {number} [opts.thresholdDeg]
 * @param {number} [opts.rearmDeg]
 * @param {'x'|'y'|'z'} [opts.axis]
 * @param {boolean} [opts.signFlip]
 * @returns {Object}
 */
export function createTiltState(opts = {}) {
  return {
    branch: typeof opts.branch === 'number' ? opts.branch : 0,
    rest: null,
    axis: opts.axis ?? TILT_DEFAULTS.axis,
    /** 是否允许触发切宫（切宫后要回中才重新允许） */
    armed: true,
    /** 最近一次读到的有符号倾角（度），调试用 */
    tiltDeg: 0,
    thresholdDeg: opts.thresholdDeg ?? TILT_DEFAULTS.thresholdDeg,
    rearmDeg: opts.rearmDeg ?? TILT_DEFAULTS.rearmDeg,
    signFlip: opts.signFlip ?? TILT_DEFAULTS.signFlip,
  };
}

/**
 * 推进一次倾斜状态。
 *
 * 算法：
 *  1. 首次**有效**读数建立「静止基准」重力向量（模长为 0 的读数直接丢弃 ——
 *     眼镜刚启动时加速度计确实会给 0）；
 *  2. 每次读数算「当前重力方向」与「基准重力方向」之间的**夹角**，
 *     再取其中绕主轴的那一份，得到**带符号的倾角（度）**；
 *  3. 倾角超过阈值 → 切一宫，然后**上锁**，必须回中（死区）才允许下一次。
 *
 * ⚠️ 第 2 步的量纲必须是**度**。
 * 加速度计读的是 m/s²，重力约 9.8；低头 15° 只会让相关分量变化约 0.3。
 * 拿这种差值去比「度」的阈值（十几），真机上**永远触发不了** —— 这是曾经的真 bug。
 *
 * @param {Object} state
 * @param {{ x?: number|null, y?: number|null, z?: number|null } | null} gravity 加速度计读数
 * @returns {{ state: Object, changed: boolean, branch: number, direction: number }}
 */
export function updateTilt(state, gravity) {
  const g = gravity || null;
  const x = Number(g ? g.x : NaN);
  const y = Number(g ? g.y : NaN);
  const z = Number(g ? g.z : NaN);
  if (![x, y, z].every((v) => Number.isFinite(v))) {
    return { state, changed: false, branch: state.branch, direction: 0 };
  }

  const mag = Math.hypot(x, y, z);
  if (mag < 1e-6) {
    // 模长为 0 的读数没有方向可言 —— 丢掉，不要拿它当基准。
    return { state, changed: false, branch: state.branch, direction: 0 };
  }

  if (!state.rest) {
    return {
      state: { ...state, rest: { x, y, z }, armed: true, tiltDeg: 0 },
      changed: false,
      branch: state.branch,
      direction: 0,
    };
  }

  const rest = state.rest;
  const restMag = Math.hypot(rest.x, rest.y, rest.z);
  if (restMag < 1e-6) {
    return { state, changed: false, branch: state.branch, direction: 0 };
  }

  // 单位化：加速度计的**模长**会随走动、说话变化，只有方向才是重力方向。
  const u = { x: rest.x / restMag, y: rest.y / restMag, z: rest.z / restMag };
  const v = { x: x / mag, y: y / mag, z: z / mag };

  // 夹角的余弦（总倾角 θ 的 cos）
  const c = clamp(u.x * v.x + u.y * v.y + u.z * v.z, -1, 1);
  // 旋转轴方向 × sinθ（叉积，模长即 sinθ，方向即旋转轴）
  const cr = {
    x: u.y * v.z - u.z * v.y,
    y: u.z * v.x - u.x * v.z,
    z: u.x * v.y - u.y * v.x,
  };

  // 绕主轴的那一份倾角：
  // 叉积在主轴上的投影 = sinθ · (旋转轴·主轴)，配合 cosθ 用 atan2 还原成角度。
  const axis = state.axis;
  const along = axis === 'x' ? cr.x : axis === 'y' ? cr.y : cr.z;
  let signedDeg = (Math.atan2(along, c) * 180) / Math.PI;
  if (state.signFlip) signedDeg = -signedDeg;

  const tiltDeg = Math.abs(signedDeg);
  const next = { ...state, tiltDeg };

  // 上锁状态：必须先回中（回到死区以内），才允许下一次切宫。
  // 少了这一段，用户**保持倾斜**时会连切好几宫 —— 也是曾经的真 bug。
  if (!state.armed) {
    if (tiltDeg <= state.rearmDeg) {
      return { state: { ...next, armed: true }, changed: false, branch: state.branch, direction: 0 };
    }
    return { state: next, changed: false, branch: state.branch, direction: 0 };
  }

  if (tiltDeg >= state.thresholdDeg) {
    const direction = signedDeg > 0 ? 1 : -1;
    const branch = ((state.branch + direction) % 12 + 12) % 12;
    return {
      state: { ...next, branch, armed: false },
      changed: true,
      branch,
      direction,
    };
  }

  return { state: next, changed: false, branch: state.branch, direction: 0 };
}
