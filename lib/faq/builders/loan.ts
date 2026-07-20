import type { FaqItem } from '@/lib/faq/data';
import { formatAsOf } from '@/lib/format';
import { decodeEntities } from '@/lib/text/decode-entities';

const KINFA = '서민금융진흥원';

export interface LoanFaqInput {
  finprdnm: string;
  lnlmt: number | null;
  irt: string | null;
  ofrinstnm: string | null;
  targetTags: string[];
  updatedAt: Date;
}

const has = (s: string | null): s is string => !!s && s.trim() !== '' && s.trim() !== '-';

/** 서민금융(대출) 상세용 페이지-치환 FAQ(동적 항목만). */
export function buildLoanFaq(p: LoanFaqInput): FaqItem[] {
  const items: FaqItem[] = [];
  const name = p.finprdnm;

  if (p.lnlmt != null || has(p.irt)) {
    const limit = p.lnlmt != null ? `대출한도는 최대 ${p.lnlmt.toLocaleString('ko-KR')}만원` : '';
    const rate = has(p.irt) ? `${limit ? ', ' : ''}금리는 ${decodeEntities(p.irt.trim())}` : '';
    items.push({
      q: `${name}의 대출한도와 금리는 어떻게 되나요?`,
      a: `${limit}${rate} 수준입니다(상품 안내 기준). 실제 한도·금리는 소득·신용·담보 등 개인 상황에 따라 달라지니 취급기관에서 확인하세요.`,
      source: KINFA,
    });
  }

  if (has(p.ofrinstnm) || p.targetTags.length > 0) {
    const inst = has(p.ofrinstnm) ? `${decodeEntities(p.ofrinstnm)}이(가) 제공하는 상품` : '서민금융 상품';
    const tgt = p.targetTags.length > 0 ? ` 주요 대상은 ${p.targetTags.slice(0, 3).join('·')}입니다.` : '';
    items.push({
      q: `${name}은 누가 제공하고 누구를 위한 상품인가요?`,
      a: `${name}은 ${inst}입니다.${tgt} 실제 신청과 심사는 취급 금융기관에서 진행됩니다.`,
      source: KINFA,
    });
  }

  items.push({
    q: `${name} 정보는 언제 기준 자료인가요?`,
    a: `이 정보는 서민금융진흥원 데이터 기준일 ${formatAsOf(p.updatedAt)} 시점의 상품 안내이며, 조건은 변경될 수 있습니다. 최신 조건은 취급기관에서 확인하세요.`,
    source: KINFA,
  });

  return items;
}
