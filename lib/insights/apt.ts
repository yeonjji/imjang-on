import type { Insight, Narrative } from './shared';
import type { FloorPremium, TransactionFlags } from '@/lib/transaction';
import { formatBillion } from '@/lib/format';
import { josa } from '@/lib/seo/josa';
import { walkMinutes } from '@/lib/walk-minutes';

export interface AptInsightInput {
  name: string;
  sigunguName: string;
  builtYear: number | null;
  households: number | null;
  saleDeals: { contractDate: string; amountManwon: number }[];
  /** 가격 흐름 그래프와 동일 기준(월 평균, 최근 ~12개월)의 매매 변동률. 산문·그래프 변동률 불일치 방지. */
  saleTrend: { changePct: number | null; changeMonths: number } | null;
  regionAvgSaleManwon: number | null;
  regionSampleCount: number;
  nearestStation: { name: string; lines: string[]; distanceMeters: number } | null;
  infra: { label: string; count: number; capped: boolean }[];
  /** 색인 게이트 통과 후 서술을 다양화하는 고유 파생지표(있을 때만 문장 발화). */
  floorPremium?: FloorPremium | null;
  flags?: TransactionFlags | null;
}

export type AptNarrative = Narrative;

// T: 최근 매매 추세 — 변동률은 가격 흐름 그래프와 동일 기준(월 평균, saleTrend)으로 통일한다.
// 잘린 건수(perPage=30 캡)를 단정하지 않도록 절대 건수는 서술하지 않는다(건수는 표·요약 카드가 라벨과 함께 표기).
function tTrend(d: AptInsightInput): Insight | null {
  const sales = [...d.saleDeals].sort((a, b) => a.contractDate.localeCompare(b.contractDate));
  if (sales.length < 2) return null;
  const last = sales[sales.length - 1].amountManwon;
  const t = d.saleTrend;
  if (t && t.changePct != null) {
    const pct = Math.round(t.changePct);
    const body = pct >= 3 ? `직전 대비 약 ${pct}% 상승했습니다`
      : pct <= -3 ? `직전 대비 약 ${Math.abs(pct)}% 하락했습니다`
      : '큰 변동 없이 보합세입니다';
    return { key: 'trend',
      text: `실거래가는 최근 ${t.changeMonths}개월 사이 ${body}(최근 실거래 ${formatBillion(last)}).` };
  }
  // 그래프 기준 변동률이 없으면(최근 24개월 월 데이터 부족) 방향 단정 없이 최근가만.
  return { key: 'trend', text: `최근 실거래가는 ${formatBillion(last)}입니다.` };
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
  const infraParts = d.infra
    .filter((c) => c.count > 0)
    .map((c) => `${c.label} ${c.count}${c.capped ? '곳 이상' : '곳'}`);
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

// 규모·연식 — 단지 소개(맨 앞 문장)
function bScale(d: AptInsightInput): Insight | null {
  const parts: string[] = [];
  if (d.builtYear != null) parts.push(`${d.builtYear}년 준공`);
  if (d.households != null) parts.push(`${d.households.toLocaleString('ko-KR')}세대`);
  if (!parts.length) return null;
  return { key: 'scale', text: `${parts.join(' · ')} 단지입니다.` };
}

// F: 층 프리미엄 — 동일 평형 층별 회귀(경쟁사 미보유 고유 데이터). 기울기 부호에 따라 문장 구조가 갈린다.
function floorPremiumInsight(d: AptInsightInput): Insight | null {
  const fp = d.floorPremium;
  if (!fp) return null;
  const mag = Math.abs(fp.pctPerFloor);
  if (mag < 0.1) return null; // 층 효과가 미미하면 굳이 서술하지 않는다.
  const pct = mag >= 1 ? Math.round(mag) : Math.round(mag * 10) / 10;
  const r2 = fp.r2.toFixed(2);
  const text = fp.pctPerFloor > 0
    ? `${fp.pyeong}평형은 층이 높을수록 ㎡당 실거래가가 한 층당 약 ${pct}% 오르는 경향이 관측됩니다(최근 매매 ${fp.n}건·설명력 R² ${r2}).`
    : `${fp.pyeong}평형은 층이 낮을수록 ㎡당 실거래가가 한 층당 약 ${pct}% 높게 나타나는 경향이 관측됩니다(최근 매매 ${fp.n}건·설명력 R² ${r2}).`;
  return { key: 'floor', text };
}

// D: 거래 데이터 특이사항(자동) — 있는 항목에 따라 문장이 갈리고, 둘 다 없으면 문장 자체가 없다.
function flagsInsight(d: AptInsightInput): Insight | null {
  const f = d.flags;
  if (!f) return null;
  const items: string[] = [];
  if (f.cancelledCount12m > 0) items.push(`해제 신고 ${f.cancelledCount12m}건`);
  if (f.anomalyCount12m > 0) items.push(`동일 평형 중앙값에서 ±10% 넘게 벗어난 거래 ${f.anomalyCount12m}건`);
  if (!items.length) return null;
  return { key: 'flags', text: `최근 1년 거래에는 ${items.join('과 ')}이 집계됩니다.` };
}

export function buildAptNarrative(d: AptInsightInput): AptNarrative | null {
  // 자연스러운 읽기 순서: 규모·연식(소개) → 추세 → 가격 위치 → 입지.
  const core = [bScale, tTrend, pPeer, aAccess].map((fn) => fn(d)).filter(Boolean) as Insight[];
  // 색인 게이트: 발화 ≥3 AND (추세 또는 또래 발화). 미달 → null(=서술 생략+noindex).
  // 게이트는 core 4모듈로만 판정한다(아래 파생 문장은 색인 여부를 바꾸지 않는다).
  if (core.length < 3 || !core.some((m) => m.key === 'trend' || m.key === 'peer')) return null;
  // 게이트 통과 페이지에만, 데이터가 뒷받침하면 고유 파생지표 해석을 덧붙인다.
  // 조건부·구간별 분기라 단지마다 문장 구성이 달라져 near-duplicate를 줄인다(메타 설명은 앞 core 문장 유지).
  const extra = [floorPremiumInsight, flagsInsight].map((fn) => fn(d)).filter(Boolean) as Insight[];
  const mods = [...core, ...extra];
  // 첫 문장에만 단지명을 붙인다.
  const sentences = mods.map((m, i) => (i === 0 ? `${josa(d.name, '은', '는')} ${m.text}` : m.text));
  return { sentences, text: sentences.join(' '), fired: mods.map((m) => m.key) };
}
