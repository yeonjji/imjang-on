import type { Insight, Narrative } from './shared';
import { formatBillion } from '@/lib/format';
import { josa } from '@/lib/seo/josa';

export interface AptInsightInput {
  name: string;
  sigunguName: string;
  builtYear: number | null;
  households: number | null;
  saleDeals: { contractDate: string; amountManwon: number }[];
  regionAvgSaleManwon: number | null;
  regionSampleCount: number;
  nearestStation: { name: string; lines: string[]; distanceMeters: number } | null;
  infra: { label: string; count: number }[];
}

export type AptNarrative = Narrative;

// T: 최근 매매 추세 — 표 재서술이 아니라 건수·방향 판단
function tTrend(d: AptInsightInput): Insight | null {
  const sales = [...d.saleDeals].sort((a, b) => a.contractDate.localeCompare(b.contractDate));
  if (sales.length < 2) return null;
  const first = sales[0].amountManwon;
  const last = sales[sales.length - 1].amountManwon;
  const diff = first === 0 ? 0 : Math.round(((last - first) / first) * 100);
  const dir = diff >= 3 ? `직전 대비 약 ${diff}% 상승`
    : diff <= -3 ? `직전 대비 약 ${Math.abs(diff)}% 하락`
    : '큰 변동 없이 보합';
  return { key: 'trend',
    text: `최근 매매 ${sales.length}건이 신고됐고 실거래가는 ${dir} 흐름입니다(최근 ${formatBillion(last)}).` };
}

// P: 시군구 평균 대비 가격 위치 (벤치마크 = getRegionStats)
function pPeer(d: AptInsightInput): Insight | null {
  if (!d.saleDeals.length || d.regionAvgSaleManwon == null || d.regionSampleCount < 5) return null;
  // tTrend과 동일한 오름차순 정렬 후 마지막(=최근) 건을 써서 두 모듈의 '최근 실거래' 값을 일치시킨다.
  const sorted = [...d.saleDeals].sort((a, b) => a.contractDate.localeCompare(b.contractDate));
  const latest = sorted[sorted.length - 1].amountManwon;
  const avg = d.regionAvgSaleManwon;
  const diff = Math.round(((latest - avg) / avg) * 100);
  const judge = diff >= 15 ? `${d.sigunguName} 평균보다 뚜렷하게 높은 상위 가격대`
    : diff >= 5 ? `${d.sigunguName} 평균을 웃도는 수준`
    : diff > -5 ? `${d.sigunguName} 평균과 비슷한 수준`
    : `${d.sigunguName} 평균보다 낮아 상대적으로 진입 부담이 적은 편`;
  return { key: 'peer',
    text: `최근 실거래 ${josa(formatBillion(latest), '은', '는')} ${judge}입니다(${d.sigunguName} 평균 ${formatBillion(avg)}).` };
}

// A: 접근성 — 최근접 역 도보분 + 반경 인프라 밀도
function aAccess(d: AptInsightInput): Insight | null {
  const station = d.nearestStation;
  const infraParts = d.infra.filter((c) => c.count > 0).map((c) => `${c.label} ${c.count}곳`);
  const hasInfra = infraParts.length >= 2;
  if (!station && !hasInfra) return null;
  const dense = infraParts.length >= 3 ? '생활 편의가 양호한 편입니다' : '기본 생활 인프라를 갖췄습니다';
  const walkMin = station ? Math.max(1, Math.round(station.distanceMeters / 80)) : 0;
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

// 규모·연식 — 단지 소개(맨 앞 문장)
function bScale(d: AptInsightInput): Insight | null {
  const parts: string[] = [];
  if (d.builtYear != null) parts.push(`${d.builtYear}년 준공`);
  if (d.households != null) parts.push(`${d.households.toLocaleString('ko-KR')}세대`);
  if (!parts.length) return null;
  return { key: 'scale', text: `${parts.join(' · ')} 단지입니다.` };
}

export function buildAptNarrative(d: AptInsightInput): AptNarrative | null {
  // 자연스러운 읽기 순서: 규모·연식(소개) → 추세 → 가격 위치 → 입지.
  const mods = [bScale, tTrend, pPeer, aAccess].map((fn) => fn(d)).filter(Boolean) as Insight[];
  // 가드: 발화 ≥3 AND (추세 또는 또래 발화). 미달 → null(=서술 생략+noindex).
  if (mods.length < 3 || !mods.some((m) => m.key === 'trend' || m.key === 'peer')) return null;
  // 첫 문장에만 단지명을 붙인다.
  const sentences = mods.map((m, i) => (i === 0 ? `${josa(d.name, '은', '는')} ${m.text}` : m.text));
  return { sentences, text: sentences.join(' '), fired: mods.map((m) => m.key) };
}
