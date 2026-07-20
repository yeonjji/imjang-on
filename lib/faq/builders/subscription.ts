import type { FaqItem } from '@/lib/faq/data';
import type { SubscriptionCategory } from '@prisma/client';
import { formatReceiptPeriodShort, formatMoveInYm } from '@/lib/format';
import { deriveStatus, STATUS_LABEL, categoryLabel } from '@/lib/subscription';

const APPLY = '한국부동산원 청약홈';

export interface SubscriptionFaqInput {
  name: string;
  regionName: string | null;
  totalSupply: number | null;
  receiptBegin: Date | null;
  receiptEnd: Date | null;
  category: SubscriptionCategory;
  moveInYm: string | null;
  unitCount: number;
}

/** 청약 상세용 페이지-치환 FAQ(동적 항목만). 일정+유형은 항상 생성(≥2 보장). */
export function buildSubscriptionFaq(n: SubscriptionFaqInput): FaqItem[] {
  const items: FaqItem[] = [];
  const name = n.name;
  const locPrefix = n.regionName ? `${n.regionName} ` : '';

  const status = deriveStatus(n.receiptBegin, n.receiptEnd);
  const period = formatReceiptPeriodShort(n.receiptBegin, n.receiptEnd);
  items.push({
    q: `${name}의 청약 접수 일정은 언제인가요?`,
    a: `접수 기간은 ${period}이며 현재 상태는 '${STATUS_LABEL[status.status]}'입니다. 실제 청약 신청은 청약홈에서 진행되며, 일정은 변경될 수 있어 공고를 확인하세요.`,
    source: APPLY,
  });

  if (n.totalSupply != null) {
    const models = n.unitCount > 0 ? ` 주택형 ${n.unitCount.toLocaleString('ko-KR')}개` : '';
    items.push({
      q: `${name}의 공급 세대수는 얼마나 되나요?`,
      a: `${locPrefix}${name}의 공급 규모는 총 ${n.totalSupply.toLocaleString('ko-KR')}세대${models}입니다. 자세한 주택형·공급 세대는 공급 정보를 확인하세요.`,
      source: APPLY,
    });
  }

  items.push({
    q: `${name}은 어떤 유형의 청약인가요?`,
    a: `${name}은 '${categoryLabel(n.category)}' 유형입니다. 유형에 따라 자격 요건과 신청 방법이 다르니 공고의 자격 조건을 확인하세요.`,
    source: APPLY,
  });

  const moveIn = formatMoveInYm(n.moveInYm);
  if (moveIn !== '-') {
    items.push({
      q: `${name}의 입주 예정 시기는 언제인가요?`,
      a: `입주 예정월은 ${moveIn}입니다. 사업 일정에 따라 변동될 수 있습니다.`,
      source: APPLY,
    });
  }

  return items;
}
