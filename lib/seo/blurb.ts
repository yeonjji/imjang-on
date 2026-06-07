import { formatBillion } from '@/lib/format';
import { josa } from '@/lib/seo/josa';

export type Trend = 'up' | 'flat' | 'down';

/** 월별 매매 평균 포인트(오름차순)로 최근/이전 구간 평균을 비교해 추세 판정. */
export function salePriceTrend(points: { month: string; avg: number }[]): Trend | null {
  if (points.length < 4) return null;
  const sorted = [...points].sort((a, b) => a.month.localeCompare(b.month));
  const half = Math.floor(sorted.length / 2);
  const earlier = sorted.slice(0, half);
  const recent = sorted.slice(half);
  const mean = (arr: { avg: number }[]) => arr.reduce((s, p) => s + p.avg, 0) / arr.length;
  const e = mean(earlier);
  const r = mean(recent);
  if (e === 0) return null;
  const diff = (r - e) / e;
  if (diff > 0.03) return 'up';
  if (diff < -0.03) return 'down';
  return 'flat';
}

export interface PropertyBlurbInput {
  name: string;
  regionFullName: string;
  builtYear: number | null;
  households: number | null;
  txCount12m: number;
  saleCount12m: number;
  jeonseCount12m: number;
  saleAvgPrice12m: number | null;   // 만원
  jeonseAvgDeposit12m: number | null; // 만원
  trend: Trend | null;
  subwayCount: number;
  infra: { label: string; count: number }[]; // count>0 인 주요 카테고리만
}

const TREND_TEXT: Record<Trend, string> = {
  up: ' 최근 실거래는 평균 대비 상승 흐름입니다.',
  down: ' 최근 실거래는 평균 대비 하락 흐름입니다.',
  flat: ' 최근 실거래는 평균과 비슷한 보합세입니다.',
};

export function propertyBlurb(i: PropertyBlurbInput): string {
  const subject = josa(i.name, '은', '는');
  const built = i.builtYear ? `${i.builtYear}년 준공` : '준공연도 미상';
  const households = i.households ? ` (${i.households.toLocaleString('ko-KR')}세대)` : '';

  let vol: string;
  if (i.txCount12m === 0) vol = '최근 1년간 거래가 없었고';
  else if (i.txCount12m <= 5) vol = `최근 1년간 매매 ${i.txCount12m}건으로 거래가 드물었으며`;
  else if (i.txCount12m >= 40) vol = `최근 1년간 매매 ${i.saleCount12m}건·전세 ${i.jeonseCount12m}건으로 활발하게 거래됐으며`;
  else vol = `최근 1년간 매매 ${i.saleCount12m}건·전세 ${i.jeonseCount12m}건이 거래됐으며`;

  const ratio =
    i.saleAvgPrice12m && i.jeonseAvgDeposit12m
      ? Math.round((i.jeonseAvgDeposit12m / i.saleAvgPrice12m) * 100)
      : null;

  let price: string;
  if (i.saleAvgPrice12m) {
    const jeonsePart = i.jeonseAvgDeposit12m ? `, 전세 평균은 ${formatBillion(i.jeonseAvgDeposit12m)}` : '';
    const ratioPart = ratio ? `으로 전세가율은 약 ${ratio}%입니다` : '입니다';
    price = ` 평균 매매가는 ${formatBillion(i.saleAvgPrice12m)}${jeonsePart}${ratioPart}.`;
  } else {
    price = ' 최근 매매 평균가 데이터는 충분하지 않습니다.';
  }

  const trend = i.trend ? TREND_TEXT[i.trend] : '';
  const jeonseStrong = ratio && ratio >= 70 ? ' 전세가율이 높아 전세 수요가 강한 편입니다.' : '';

  const parts: string[] = [];
  if (i.subwayCount > 0) parts.push(`지하철 ${i.subwayCount}개역`);
  for (const c of i.infra) parts.push(`${c.label} ${c.count}곳`);
  const infra = parts.length ? ` 도보권에 ${parts.join(', ')}이 있습니다.` : '';

  return `${subject} ${i.regionFullName}에 위치한 ${built} 단지입니다${households}. ${vol}${price}${trend}${jeonseStrong}${infra}`;
}

export interface RegionBlurbInput {
  fullName: string;
  complexCount: number;
  txCount12m: number;
  saleAvgPrice12m: number | null;
  jeonseAvgDeposit12m: number | null;
  priceMin: number | null;
  priceMax: number | null;
  topComplexNames: string[];
}

export function regionBlurb(i: RegionBlurbInput): string {
  if (i.complexCount === 0) {
    return `${i.fullName}의 아파트 실거래가 정보를 제공합니다. 최근 1년간 신고된 거래가 아직 충분하지 않습니다.`;
  }
  const ratio =
    i.saleAvgPrice12m && i.jeonseAvgDeposit12m
      ? Math.round((i.jeonseAvgDeposit12m / i.saleAvgPrice12m) * 100)
      : null;
  const pricePart = i.saleAvgPrice12m ? ` 평균 매매가는 ${formatBillion(i.saleAvgPrice12m)}` : '';
  const rangePart =
    i.priceMin && i.priceMax ? `(${formatBillion(i.priceMin)}~${formatBillion(i.priceMax)})` : '';
  const ratioPart = ratio ? `, 전세가율은 약 ${ratio}%입니다` : i.saleAvgPrice12m ? '입니다' : '';
  const topPart =
    i.topComplexNames.length > 0
      ? ` 거래가 활발한 단지로는 ${i.topComplexNames.slice(0, 3).join(', ')} 등이 있습니다.`
      : '';

  return `${i.fullName}에는 최근 1년 거래가 있는 아파트가 ${i.complexCount.toLocaleString('ko-KR')}개 단지이며, 총 ${i.txCount12m.toLocaleString('ko-KR')}건이 거래됐습니다.${pricePart}${rangePart}${ratioPart}.${topPart}`;
}
