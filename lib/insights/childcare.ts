import { accessInsight, priceContextInsight, assembleNarrative, type Insight, type Narrative } from './shared';

export interface ChildcareInsightInput {
  name: string;
  crType: string | null;
  capacity: number | null;
  currentCount: number | null;
  staffCount: number | null;
  waitByAge: { label: string; count: number }[];
  roomSize: number | null;
  cctvCount: number | null;
  vehicleOp: string | null;
  nearestStation: { name: string; lines: string[]; distanceMeters: number } | null;
  infra: { label: string; count: number }[];
  nearbyAptSaleManwon: number[];
}

function intro(d: ChildcareInsightInput): Insight | null {
  if (!d.crType && d.capacity == null) return null;
  const type = d.crType ? `${d.crType} 어린이집` : '어린이집';
  return {
    key: 'intro',
    text: d.capacity != null ? `${type}으로 정원 ${d.capacity}명입니다.` : `${type}입니다.`,
  };
}

function occupancy(d: ChildcareInsightInput): Insight | null {
  if (d.capacity == null || d.capacity < 1 || d.currentCount == null) return null;
  const occ = d.currentCount / d.capacity;
  const pct = Math.round(occ * 100);
  const judge = occ >= 0.9 ? '정원에 거의 찬 편입니다'
    : occ >= 0.7 ? '보통 수준입니다'
    : '정원에 여유가 있는 편입니다';
  return { key: 'occupancy', text: `현원 ${d.currentCount}명으로 충원율 ${pct}%로 ${judge}.` };
}

function wait(d: ChildcareInsightInput): Insight | null {
  const w = d.waitByAge.filter((x) => x.count > 0);
  const total = w.reduce((s, x) => s + x.count, 0);
  if (total < 3) return null;
  const top = [...w].sort((a, b) => b.count - a.count)[0];
  const share = Math.round((top.count / total) * 100);
  return {
    key: 'wait',
    text: share >= 60
      ? `대기 ${total}명 중 ${top.label}가 ${top.count}명(약 ${share}%)으로 ${top.label} 반 입소 경쟁이 특히 치열합니다.`
      : `총 ${total}명이 입소 대기 중이며 ${top.label} 대기가 가장 많습니다.`,
  };
}

function ratio(d: ChildcareInsightInput): Insight | null {
  if (!d.staffCount || d.staffCount < 1 || !d.currentCount) return null;
  const r = d.currentCount / d.staffCount;
  return { key: 'ratio', text: `교직원 ${d.staffCount}명 기준 1인당 원아 약 ${r.toFixed(1)}명입니다.` };
}

function facility(d: ChildcareInsightInput): Insight | null {
  const parts: string[] = [];
  if (d.roomSize != null && d.currentCount && d.currentCount > 0) {
    parts.push(`원아 1인당 보육실 약 ${(d.roomSize / d.currentCount).toFixed(1)}㎡`);
  }
  if (d.cctvCount != null && d.cctvCount > 0) parts.push(`CCTV ${d.cctvCount}대`);
  if (d.vehicleOp && d.vehicleOp.includes('운영') && !d.vehicleOp.includes('미운영')) {
    parts.push('통학차량 운영');
  }
  if (parts.length < 2) return null;
  return { key: 'facility', text: `${parts.join(', ')} 등을 갖췄습니다.` };
}

export function buildChildcareNarrative(d: ChildcareInsightInput): Narrative | null {
  const mods = [
    intro(d),
    occupancy(d),
    wait(d),
    ratio(d),
    facility(d),
    accessInsight({ nearestStation: d.nearestStation, infra: d.infra }),
    priceContextInsight({ nearbyAptSaleManwon: d.nearbyAptSaleManwon }),
  ];
  return assembleNarrative(d.name, mods, { minFired: 3, requireKeys: ['occupancy', 'wait'] });
}
