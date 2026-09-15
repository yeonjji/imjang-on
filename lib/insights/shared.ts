import { formatBillion } from '@/lib/format';
import { josa } from '@/lib/seo/josa';
import { walkMinutes } from '@/lib/walk-minutes';

/**
 * 화면 표시 단위. 모듈이 문장을 만들기 전에 가진 값을 그대로 구조화해 넘긴다.
 * value·sub는 **모듈이 완성한 문자열**이다 — 화면은 파싱하거나 재계산하지 않는다.
 * shape이 판별자다. 'card'를 두 번 쓰면 TS가 구분하지 못하므로 칩 카드는 'chips'로 나눈다.
 */
export type DisplayUnit =
  | { shape: 'tile'; key: string; label: string; value: string; sub?: string; tone?: 'up' | 'down' }
  | { shape: 'chips'; key: string; label: string; chips: { label: string; value: string }[] }
  | { shape: 'card'; key: string; label: string; value: string; sub?: string }
  | { shape: 'alert'; key: string; label: string; value: string; sub?: string };

export interface Insight {
  key: string;
  text: string;
  /** 화면 전용. 없으면 그 모듈은 대시보드에 표시되지 않는다(문장으로만 남는다). */
  display?: DisplayUnit[];
}

export interface Narrative {
  sentences: string[];
  text: string;
  fired: string[];
  /** 발화 모듈의 display를 순서대로 이어 붙인 것. fired와 무관하다. */
  display?: DisplayUnit[];
  badges?: string[];
}

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
