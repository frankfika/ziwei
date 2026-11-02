import { generateChart } from './engine/algorithm';
import { buildLiuYuePillar } from './engine/liuyue';
import { BRANCHES, PALACE_NAMES_ORDER, STEMS } from './engine/constants';
import {
  getLiuNianSiHua,
  getYearBranchIndex,
  getYearStemIndex,
} from './engine/sihua';
import type { ZiweiChart, Palace, Star } from './engine/types';
import {
  HOUR_BRANCHES,
  InvalidBirthError,
  type Birth,
  type ChartDaXian,
  type ChartJSON,
  type ChartFortuneLayer,
  type ChartLiuNian,
  type ChartLiuYue,
  type ChartPalace,
  type ChartStar,
  type StarType,
} from './types';

/**
 * 校验生辰输入。
 * 引擎本身也会校验，这里提前拦下并给出更贴近用户的错误信息。
 */
export function validateBirth(birth: Birth): void {
  const { year, month, day, hour } = birth;
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw new InvalidBirthError(`出生年份需在 1900–2100 之间，收到：${year}`);
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new InvalidBirthError(`出生月份需在 1–12 之间，收到：${month}`);
  }
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new InvalidBirthError(`出生日期需在 1–31 之间，收到：${day}`);
  }
  // 公历日期必须真实存在（2 月 30 日、非闰年 2 月 29 日等）
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new InvalidBirthError(`该日期不存在：${year}-${month}-${day}`);
  }
  if (!Number.isInteger(hour) || hour < 0 || hour > 11) {
    throw new InvalidBirthError(
      `时辰需为 0–11 的序号（子=0 … 亥=11），收到：${hour}`,
    );
  }
  if (birth.gender !== 'male' && birth.gender !== 'female') {
    throw new InvalidBirthError(`性别需为 male 或 female，收到：${birth.gender}`);
  }
}

/**
 * 宫名规范化。
 *
 * 引擎返回的是「兄弟 / 财帛 / 夫妻」这类两字名（仅命宫自带「宫」字），
 * 而紫微盘的标准称法是「兄弟宫 / 财帛宫 / 夫妻宫」。
 * 在适配器层统一补齐，下游（Web / CLI / 提示词）就不用各自处理。
 */
function palaceLabel(name: string): string {
  if (!name) return name;
  return name.endsWith('宫') ? name : `${name}宫`;
}

function mapStar(s: Star): ChartStar {
  return {
    name: s.name,
    type: s.type as StarType,
    ...(s.brightness ? { brightness: s.brightness } : {}),
    ...(s.brightnessRaw ? { brightnessRaw: s.brightnessRaw } : {}),
    ...(s.siHua ? { siHua: s.siHua } : {}),
  };
}

function mapPalace(p: Palace): ChartPalace {
  const stars = p.stars.map(mapStar);
  return {
    branch: p.branch,
    branchName: BRANCHES[p.branch] ?? '',
    stem: p.stem,
    stemName: STEMS[p.stem] ?? '',
    name: palaceLabel(p.name),
    isMingGong: !!p.isMingGong,
    isShenGong: !!p.isShenGong,
    isEmpty: !!p.isEmpty,
    ...(p.borrowedFromBranch !== undefined ? { borrowedFromBranch: p.borrowedFromBranch } : {}),
    ...(p.borrowedFromName ? { borrowedFromName: palaceLabel(p.borrowedFromName) } : {}),
    ...(p.borrowedStars ? { borrowedStars: p.borrowedStars } : {}),
    ...(p.selfSihua
      ? { selfSihua: p.selfSihua.map((s) => ({ siHua: s.siHua, starName: s.starName })) }
      : {}),
    ...(p.daXianAge ? { daXianAge: p.daXianAge } : {}),
    ...(p.isCurrentDaXian !== undefined ? { isCurrentDaXian: p.isCurrentDaXian } : {}),
    ...(p.oppositeBranch !== undefined ? { oppositeBranch: p.oppositeBranch } : {}),
    stars,
    majorStars: stars.filter((s) => s.type === 'major').map((s) => s.name),
    minorStars: stars.filter((s) => s.type === 'minor').map((s) => s.name),
    luckyStars: stars.filter((s) => s.type === 'lucky').map((s) => s.name),
    shaStars: stars.filter((s) => s.type === 'sha').map((s) => s.name),
  };
}

function mapDaXian(d: ZiweiChart['daXians'][number]): ChartDaXian {
  return {
    startAge: d.startAge,
    endAge: d.endAge,
    palaceBranch: d.palaceBranch,
    palaceName: palaceLabel(d.palaceName),
    ...(d.stemIndex !== undefined ? { stemIndex: d.stemIndex } : {}),
    ...(d.stemName ? { stemName: d.stemName } : {}),
    ...(d.siHua
      ? { siHua: { lu: d.siHua.lu, quan: d.siHua.quan, ke: d.siHua.ke, ji: d.siHua.ji } }
      : {}),
  };
}

/**
 * 排盘主入口。
 *
 * 这是「排盘只走确定性引擎、禁止 LLM 自己算盘」的落地点：
 * 上层（Web / CLI / 追问）只能通过本函数拿盘，拿不到就是拿不到。
 */
export function chart(birth: Birth): ChartJSON {
  validateBirth(birth);

  const ziwei: ZiweiChart = generateChart({
    year: birth.year,
    month: birth.month,
    day: birth.day,
    hour: birth.hour,
    gender: birth.gender,
    ...(birth.name ? { name: birth.name } : {}),
    ...(birth.longitude !== undefined ? { longitude: birth.longitude } : {}),
  });

  return {
    birth: { ...birth },
    lunar: {
      lunarYear: ziwei.lunarInfo.lunarYear,
      lunarMonth: ziwei.lunarInfo.lunarMonth,
      lunarDay: ziwei.lunarInfo.lunarDay,
      yearStem: ziwei.lunarInfo.yearStem,
      yearBranch: ziwei.lunarInfo.yearBranch,
      isLeapMonth: ziwei.lunarInfo.isLeapMonth,
      ...(ziwei.lunarInfo.fourPillars ? { fourPillars: ziwei.lunarInfo.fourPillars } : {}),
      ...(ziwei.lunarInfo.fourPillarsLunar
        ? { fourPillarsLunar: ziwei.lunarInfo.fourPillarsLunar }
        : {}),
    },
    mingGongBranch: ziwei.mingGongBranch,
    shenGongBranch: ziwei.shenGongBranch,
    wuxingJu: ziwei.wuxingJu,
    wuxingJuName: ziwei.wuxingJuName,
    ziweiPos: ziwei.ziweiPos,
    ...(ziwei.mingZhu ? { mingZhu: ziwei.mingZhu } : {}),
    ...(ziwei.shenZhu ? { shenZhu: ziwei.shenZhu } : {}),
    ...(ziwei.yinYangGender ? { yinYangGender: ziwei.yinYangGender } : {}),
    currentAge: ziwei.currentAge,
    // 统一按地支 0–11 升序。引擎返回的是传统盘面序（寅起逆时针），
    // 下游按 branch 定位宫位，顺序统一可避免各处自行排序。
    palaces: [...ziwei.palaces].sort((a, b) => a.branch - b.branch).map(mapPalace),
    daXians: ziwei.daXians.map(mapDaXian),
  };
}

/** 按地支索引取宫；不存在返回 null */
export function palaceAt(c: ChartJSON, branch: number): ChartPalace | null {
  return c.palaces.find((p) => p.branch === branch) ?? null;
}

/**
 * 流年运限层。
 *
 * 直接基于已排出的 ChartJSON 的宫支/星曜计算，不重新排盘：
 *   年干支按 sihua.ts 的公历年柱口径（(year - 4) % N）；
 *   流年命宫 = 流年地支；流年十二宫自命宫起逐宫地支减 1（模 12）；
 *   四化取流年天干查表；落宫在 c.palaces[].stars 里找四化星所在宫支。
 */
/**
 * 运限层通用构造：大限与流年共用「层命宫 → 十二宫名 → 层四化落宫」这一条路。
 *
 * @param mingBranch 该层命宫落宫的地支索引
 * @param siHua 该层四化四星名
 */
function buildFortuneLayer(
  c: ChartJSON,
  kind: 'daxian' | 'liunian',
  label: string,
  mingBranch: number,
  siHua: { lu: string; quan: string; ke: string; ji: string },
): ChartFortuneLayer {
  // 运限十二宫：自命宫起按 PALACE_NAMES_ORDER 每下一宫地支索引减 1（模 12）
  const palaces = PALACE_NAMES_ORDER.map((name, i) => ({
    branch: (((mingBranch - i) % 12) + 12) % 12,
    name,
  }));

  // 四化星落宫；星不在任何宫则省略该键
  const siHuaPalaces: Record<string, number> = {};
  const starOf: Array<[string, string]> = [
    ['禄', siHua.lu],
    ['权', siHua.quan],
    ['科', siHua.ke],
    ['忌', siHua.ji],
  ];
  for (const [key, starName] of starOf) {
    if (!starName) continue;
    const palace = c.palaces.find((p) => p.stars.some((s) => s.name === starName));
    if (palace) siHuaPalaces[key] = palace.branch;
  }

  return { kind, label, mingBranch, palaces, siHua, siHuaPalaces };
}

/**
 * 当前大限运限层。
 *
 * 大限命宫 = 大限所落宫的宫位（大限以该宫起限，命宫随之移位）；
 * 大限十二宫与大限四化均由该宫宫干推出。
 */
export function daXianLayer(c: ChartJSON, index: number): ChartFortuneLayer | null {
  const dx = c.daXians[index];
  if (!dx) return null;
  const siHua = dx.siHua ?? { lu: '', quan: '', ke: '', ji: '' };
  return buildFortuneLayer(
    c,
    'daxian',
    `${dx.startAge}–${dx.endAge} 岁`,
    dx.palaceBranch,
    siHua,
  );
}

export function liuNianLayer(c: ChartJSON, year: number): ChartLiuNian {
  const y = Math.trunc(year);
  const yearStem = getYearStemIndex(y);
  const yearBranch = getYearBranchIndex(y);
  const ganzhi = `${STEMS[yearStem] ?? ''}${BRANCHES[yearBranch] ?? ''}`;

  // 流年命宫 = 流年地支
  const mingBranch = yearBranch;

  // 流年十二宫：自命宫起按 PALACE_NAMES_ORDER 每下一宫地支索引减 1（模 12）
  const palaces = PALACE_NAMES_ORDER.map((name, i) => ({
    branch: (((mingBranch - i) % 12) + 12) % 12,
    name,
  }));

  // 流年四化（流年天干查表）
  const t = getLiuNianSiHua(y).transforms;
  const siHua = { lu: t.禄, quan: t.权, ke: t.科, ji: t.忌 };

  // 四化星落宫；星不在任何宫则省略该键
  const siHuaPalaces: Record<string, number> = {};
  const starOf: Array<[string, string]> = [
    ['禄', siHua.lu],
    ['权', siHua.quan],
    ['科', siHua.ke],
    ['忌', siHua.ji],
  ];
  for (const [key, starName] of starOf) {
    if (!starName) continue;
    const palace = c.palaces.find((p) => p.stars.some((s) => s.name === starName));
    if (palace) siHuaPalaces[key] = palace.branch;
  }

  return { year: y, ganzhi, mingBranch, palaces, siHua, siHuaPalaces };
}

/**
 * 流月运限层。
 *
 * 流月命宫 = 流月月支（正月=寅…十二月=丑）；十二宫与四化落宫与流年同构。
 * month 传农历月序 1–12；闰月口径通过 options 传入。
 */
export function liuYueLayer(
  c: ChartJSON,
  year: number,
  month: number,
  options?: { isLeapMonth?: boolean; liuriDay?: number },
): ChartLiuYue {
  const y = Math.trunc(year);
  const pillar = buildLiuYuePillar(y, month, options);

  const layer = buildFortuneLayer(
    c,
    'liunian',
    `${pillar.ganzhi}`,
    pillar.branch,
    pillar.siHua,
  );

  return {
    year: y,
    month: pillar.month,
    ganzhi: pillar.ganzhi,
    mingBranch: pillar.branch,
    palaces: layer.palaces,
    siHua: layer.siHua,
    siHuaPalaces: layer.siHuaPalaces,
  };
}

/**
 * 把命盘压成一段紧凑文本，供追问层注入提示词。
 * 只陈述盘面事实，不含任何解读断语（断语来自数据集检索）。
 */
export function chartSummary(c: ChartJSON): string {
  const lines: string[] = [];
  const b = c.birth;
  lines.push(
    `生辰：${b.year}年${b.month}月${b.day}日 ${HOUR_BRANCHES[b.hour]}时（时辰序号 ${b.hour}） ${
      b.gender === 'male' ? '男' : '女'
    }`,
  );
  lines.push(
    `农历：${c.lunar.lunarYear}年${c.lunar.lunarMonth}月${c.lunar.lunarDay}日` +
      `${c.lunar.isLeapMonth ? '（闰月）' : ''}` +
      `${c.lunar.fourPillars ? ` 四柱 ${c.lunar.fourPillars.join(' ')}` : ''}`,
  );
  lines.push(
    `命宫在${c.palaces.find((p) => p.branch === c.mingGongBranch)?.branchName ?? '?'}，` +
      `身宫在${c.palaces.find((p) => p.branch === c.shenGongBranch)?.branchName ?? '?'}，` +
      `${c.wuxingJuName}，命主${c.mingZhu ?? '—'}，身主${c.shenZhu ?? '—'}` +
      `${c.yinYangGender ? `，${c.yinYangGender}` : ''}`,
  );
  lines.push('');
  lines.push('十二宫：');
  for (const p of c.palaces) {
    const stars = p.stars
      .map((s) => {
        const bh = s.brightnessRaw ? `(${s.brightnessRaw})` : '';
        const sh = s.siHua ? `[${s.siHua}]` : '';
        return `${s.name}${bh}${sh}`;
      })
      .join('、');
    const marks = [
      p.isMingGong ? '命宫' : '',
      p.isShenGong ? '身宫' : '',
      p.isEmpty ? '空宫' : '',
    ].filter(Boolean).join('/');
    lines.push(
      `- ${p.name}（${p.branchName}宫${marks ? `·${marks}` : ''}` +
        `${p.daXianAge ? `·大限${p.daXianAge[0]}–${p.daXianAge[1]}岁` : ''}）：${
          stars || '无主星'
        }`,
    );
  }
  return lines.join('\n');
}
