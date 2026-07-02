import { accessInsight, priceContextInsight, assembleNarrative, type Insight, type Narrative } from './shared';

export interface ParkInsightInput {
  name: string;
  parkType: string | null;
  area: number | null; // ㎡
  nearestStation: { name: string; lines: string[]; distanceMeters: number } | null;
  infra: { label: string; count: number }[];
  nearbyAptSaleManwon: number[];
}

function formatArea(area: number): string {
  if (area >= 10000) {
    const man = area / 10000;
    return `${Number.isInteger(man) ? man : man.toFixed(1)}만㎡`;
  }
  return `${area.toLocaleString('ko-KR')}㎡`;
}

function intro(d: ParkInsightInput): Insight | null {
  const hasArea = d.area != null && d.area > 0;
  if (!hasArea && !d.parkType) return null;
  const typeWord = d.parkType || '도시공원';
  if (hasArea) {
    const area = d.area!;
    const size = area >= 100000 ? '대규모 ' : area < 10000 ? '소규모 ' : '';
    return { key: 'intro', text: `면적 ${formatArea(area)}의 ${size}${typeWord}입니다.` };
  }
  return { key: 'intro', text: `${typeWord}입니다.` };
}

export function buildParkNarrative(d: ParkInsightInput): Narrative | null {
  // 자연 순서: 소개(면적·유형) → 입지(접근성) → 시세.
  const mods = [
    intro(d),
    accessInsight({ nearestStation: d.nearestStation, infra: d.infra }),
    priceContextInsight({ nearbyAptSaleManwon: d.nearbyAptSaleManwon }),
  ];
  return assembleNarrative(d.name, mods, { minFired: 2, requireKeys: ['intro'] });
}
