'use server';

/**
 * 对话内嵌命盘：按生辰返回一份**精简**盘面数据。
 *
 * 服务端算盘（浏览器端不接触引擎），只回传 UI 需要的字段 ——
 * 十二宫（宫名/干支/星曜/四化/大限）、中宫摘要、运限层。
 * 不含解读正文（那走数据集检索，走 ask 通路）。
 */

import { liuNianLayer, daXianLayer, type ChartPalace } from '@ziwei/chart-engine';
import { getService } from '@/lib/service';

export interface ChatChartPayload {
  palaces: ChartPalace[];
  center: {
    wuxingJuName: string;
    mingGongBranch: number;
    shenGongBranch: number;
    ziweiPos: number;
    mingZhu?: string;
    shenZhu?: string;
    yinYangGender?: string;
    currentAge: number;
  };
  liunian: {
    label: string;
    mingBranch: number;
    palaces: Array<{ branch: number; name: string }>;
    siHua: { lu: string; quan: string; ke: string; ji: string };
  } | null;
  daXian: {
    label: string;
    mingBranch: number;
    palaces: Array<{ branch: number; name: string }>;
    siHua: { lu: string; quan: string; ke: string; ji: string };
  } | null;
}

export async function getChatChart(
  year: number,
  month: number,
  day: number,
  hour: number,
  gender: 'male' | 'female',
): Promise<ChatChartPayload | null> {
  if (
    !Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day) ||
    !Number.isInteger(hour) || hour < 0 || hour > 11
  ) {
    return null;
  }

  try {
    const chart = getService().chart({ year, month, day, hour, gender });

    const ln = liuNianLayer(chart, new Date().getFullYear());
    const liunian = {
      label: `${ln.year} ${ln.ganzhi}年`,
      mingBranch: ln.mingBranch,
      palaces: ln.palaces,
      siHua: ln.siHua,
    };

    const dxPalace = chart.palaces.find((p) => p.isCurrentDaXian);
    const dxIndex = dxPalace
      ? chart.daXians.findIndex((d) => d.palaceBranch === dxPalace.branch)
      : -1;
    const dxLayer = dxIndex >= 0 ? daXianLayer(chart, dxIndex) : null;
    const daXian = dxLayer
      ? {
          label: dxLayer.label,
          mingBranch: dxLayer.mingBranch,
          palaces: dxLayer.palaces,
          siHua: dxLayer.siHua,
        }
      : null;

    return {
      palaces: chart.palaces,
      center: {
        wuxingJuName: chart.wuxingJuName,
        mingGongBranch: chart.mingGongBranch,
        shenGongBranch: chart.shenGongBranch,
        ziweiPos: chart.ziweiPos,
        ...(chart.mingZhu ? { mingZhu: chart.mingZhu } : {}),
        ...(chart.shenZhu ? { shenZhu: chart.shenZhu } : {}),
        ...(chart.yinYangGender ? { yinYangGender: chart.yinYangGender } : {}),
        currentAge: chart.currentAge,
      },
      liunian,
      daXian,
    };
  } catch {
    return null;
  }
}
