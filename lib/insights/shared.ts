import { formatBillion } from '@/lib/format';
import { josa } from '@/lib/seo/josa';
import { walkMinutes } from '@/lib/walk-minutes';

export interface Insight { key: string; text: string; }
export interface Narrative { sentences: string[]; text: string; fired: string[]; }

// A: 접근성 — 최근접 역 도보분 + 반경 인프라 밀도 (아파트 aAccess와 동일 로직)
export function accessInsight(d: {
  nearestStation: { name: string; lines: string[]; distanceMeters: number } | null;
  infra: { label: string; count: number }[];
}): Insight | null {
  const station = d.nearestStation;
  const infraParts = d.infra.filter((c) => c.count > 0).map((c) => `${c.label} ${c.count}곳`);
  const hasInfra = infraParts.length >= 2;
  if (!station && !hasInfra) return null;
  const dense = infraParts.length >= 3 ? '생활 편의가 양호한 편입니다' : '기본 생활 인프라를 갖췄습니다';
  const walkMin = station ? walkMinutes(station.distanceMeters) : 0;
  const line = station && station.lines[0] ? `${station.lines[0]} ` : '';
  const stationSeg = station
    ? `인근 지하철역은 ${line}${josa(station.name, '으로', '로')} 도보 약 ${walkMin}분 거리`
    : '';
  let text: string;
  if (station && hasInfra) {
    text = `${stationSeg}이며, 반경 도보권에 ${infraParts.join('·')}이 있어 ${dense}.`;
  } else if (station) {
    text = `${stationSeg}입니다.`;
  } else {
    text = `반경 도보권에 ${infraParts.join('·')}이 있어 ${dense}.`;
  }
  return { key: 'access', text };
}

// C: 시세 맥락 — 도보권 아파트 실거래 range (만원 입력, 억 표시)
export function priceContextInsight(d: { nearbyAptSaleManwon: number[] }): Insight | null {
  const p = d.nearbyAptSaleManwon.filter((x) => x > 0);
  if (p.length < 3) return null;
  return {
    key: 'price',
    text: `도보권 아파트 실거래가는 약 ${formatBillion(Math.min(...p))}~${formatBillion(Math.max(...p))}에 분포합니다.`,
  };
}

// 조립: 발화 모듈 필터 → 가드 → 첫 문장에 엔티티명 prefix
export function assembleNarrative(
  name: string,
  mods: (Insight | null)[],
  opts: { minFired: number; requireKeys: string[] },
): Narrative | null {
  const fired = mods.filter(Boolean) as Insight[];
  if (fired.length < opts.minFired || !fired.some((m) => opts.requireKeys.includes(m.key))) return null;
  const sentences = fired.map((m, i) => (i === 0 ? `${josa(name, '은', '는')} ${m.text}` : m.text));
  return { sentences, text: sentences.join(' '), fired: fired.map((m) => m.key) };
}
