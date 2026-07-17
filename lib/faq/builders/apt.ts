import type { FaqItem } from '@/lib/faq/data';
import { formatBillion, formatDate } from '@/lib/format';

const MOLIT = '국토교통부 실거래가 공개시스템';

export interface AptFaqInput {
  property: {
    name: string;
    region: { sido: string };
    saleLastPrice: bigint | null;
    saleLastAt: Date | null;
    saleAvgPrice12m: bigint | null;
    saleCount12m: number;
  };
  areaSummary: { area: number; jeonseRatioPct: number | null }[];
  unifiedTotalCount: number;
}

/** 아파트 상세용 페이지-치환 FAQ(동적 항목만). generic 보강은 composeDetailFaq가 담당. */
export function buildAptFaq({ property, areaSummary, unifiedTotalCount }: AptFaqInput): FaqItem[] {
  const items: FaqItem[] = [];
  const name = property.name;
  const loc = property.region.sido;

  if (property.saleLastPrice != null && property.saleLastAt != null) {
    items.push({
      q: `${name}의 최근 매매 실거래가는 얼마인가요?`,
      a: `가장 최근 신고된 매매 실거래가는 ${formatBillion(property.saleLastPrice)}(신고일 ${formatDate(property.saleLastAt)})입니다. 전용면적·층·거래 시점에 따라 가격이 달라지니 실거래 표를 함께 확인하세요.`,
      source: MOLIT,
    });
  }

  if (property.saleAvgPrice12m != null) {
    const pyeong = areaSummary[0]?.area;
    const areaPhrase = pyeong != null ? `대표 ${pyeong}평 기준 ` : '';
    items.push({
      q: `${name}의 최근 1년 매매 시세는 어느 정도인가요?`,
      a: `${areaPhrase}최근 12개월 매매 평균가는 ${formatBillion(property.saleAvgPrice12m)}입니다. 최근 1년 매매 ${property.saleCount12m.toLocaleString('ko-KR')}건 기준이며, 표본이 적은 평형은 편차가 클 수 있습니다.`,
      source: MOLIT,
    });
  }

  const ratio = areaSummary.find((a) => a.jeonseRatioPct != null)?.jeonseRatioPct;
  if (ratio != null) {
    items.push({
      q: `${name}의 전세가율은 어떻게 되나요?`,
      a: `동일 평형의 매매·전세 실거래로 계산한 전세가율은 약 ${ratio}%입니다. 매매가 대비 전세보증금 비율로, 표본 수에 따라 참고용으로 활용하세요.`,
      source: `${MOLIT} (동일 평형 매매·전세 파생)`,
    });
  }

  items.push({
    q: `${name}의 실거래 정보는 어떤 자료 기준인가요?`,
    a: `${loc} ${name}의 매매·전세·월세 실거래 총 ${unifiedTotalCount.toLocaleString('ko-KR')}건을 국토교통부 신고 자료 기준으로 정리했습니다. 계약일로부터 30일의 신고 기한이 있어 가장 최근 거래는 일시적으로 누락될 수 있습니다.`,
    source: MOLIT,
  });

  return items;
}
