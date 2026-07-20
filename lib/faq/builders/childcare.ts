import type { FaqItem } from '@/lib/faq/data';

const MHW = '보건복지부';

export interface ChildcareFaqInput {
  name: string;
  crType: string | null;
  capacity: number | null;
  currentCount: number | null;
  waitCntTot: number | null;
  staffCount: number | null;
  regionFullName: string;
}

/** 어린이집 상세용 페이지-치환 FAQ(동적 항목만). */
export function buildChildcareFaq(c: ChildcareFaqInput): FaqItem[] {
  const items: FaqItem[] = [];
  const name = c.name;

  if (c.crType) {
    items.push({
      q: `${name}은 어떤 유형의 어린이집인가요?`,
      a: `${c.regionFullName}의 ${name}은 '${c.crType}' 어린이집입니다. 유형에 따라 설립 주체·정원 규모·비용에 차이가 있습니다.`,
      source: MHW,
    });
  }

  if (c.capacity != null) {
    const cur = c.currentCount != null ? ` 현원 ${c.currentCount.toLocaleString('ko-KR')}명` : '';
    items.push({
      q: `${name}의 정원과 현원은 어떻게 되나요?`,
      a: `정원 ${c.capacity.toLocaleString('ko-KR')}명${cur} 기준입니다(보건복지부 공시). 실시간 현황은 시설에 직접 확인하는 것이 정확합니다.`,
      source: MHW,
    });
  }

  if (c.waitCntTot != null && c.waitCntTot > 0) {
    items.push({
      q: `${name}에 입소 대기가 있나요?`,
      a: `공시 기준 대기 인원은 총 ${c.waitCntTot.toLocaleString('ko-KR')}명입니다. 대기·입소 현황은 시설에 확인하세요.`,
      source: MHW,
    });
  }

  if (c.staffCount != null && c.staffCount > 0) {
    items.push({
      q: `${name}의 교직원 규모는 어느 정도인가요?`,
      a: `공시 기준 교직원 수는 ${c.staffCount.toLocaleString('ko-KR')}명입니다. 반 편성·교사 대 아동 비율은 시설에 문의하세요.`,
      source: MHW,
    });
  }

  items.push({
    q: `${name} 정보의 출처와 입소 신청 방법은 무엇인가요?`,
    a: `${name}의 유형·정원·현원 정보는 보건복지부 어린이집 정보공개 공공데이터 기반입니다. 입소 대기 신청은 임신육아종합포털(아이사랑)에서 진행합니다.`,
    source: MHW,
  });

  return items;
}
