import type { FaqItem } from '@/lib/faq/data';
import { formatWon, bankNames, reqTargetLabel, prodKindLabel } from '@/lib/jeonse/labels';
import { formatAsOf } from '@/lib/format';

const HF = '한국주택금융공사';

export interface JeonseFaqInput {
  rcmdProdNm: string;
  maxLoanLmtAmt: number | null;
  rentGrntMaxLoanLmtRate: number | null;
  exptGrfeRateCont: string | null;
  grntReqTrgtDvcd: string | null;
  rcmdGrntProdDvcd: string | null;
  trtBankCont: string | null;
  updatedAt: Date;
}

/** 전세자금보증 상세용 페이지-치환 FAQ(동적 항목만). */
export function buildJeonseFaq(p: JeonseFaqInput): FaqItem[] {
  const items: FaqItem[] = [];
  const name = p.rcmdProdNm;

  if (p.maxLoanLmtAmt != null || p.rentGrntMaxLoanLmtRate != null) {
    const amt = p.maxLoanLmtAmt != null ? `최대 보증한도는 ${formatWon(p.maxLoanLmtAmt)}` : '';
    const rate =
      p.rentGrntMaxLoanLmtRate != null
        ? `${amt ? ', ' : ''}임차보증금 대비 한도비율은 ${p.rentGrntMaxLoanLmtRate}%`
        : '';
    items.push({
      q: `${name}의 최대 보증한도는 얼마인가요?`,
      a: `${amt}${rate}입니다(상품 기준 상한). 실제 한도는 소득·부채 등 개인 상황과 심사로 확정됩니다.`,
      source: HF,
    });
  }

  if (p.exptGrfeRateCont && p.exptGrfeRateCont.trim()) {
    items.push({
      q: `${name}의 예상 보증료율은 어느 정도인가요?`,
      a: `예상 보증료율은 ${p.exptGrfeRateCont} 수준입니다. 실제 보증료는 보증금액·기간 등에 따라 달라집니다.`,
      source: HF,
    });
  }

  const kind = prodKindLabel(p.rcmdGrntProdDvcd);
  const tgt = reqTargetLabel(p.grntReqTrgtDvcd);
  const parts = [kind, tgt && tgt !== '전체' ? `${tgt} 대상` : null].filter((x): x is string => !!x);
  if (parts.length > 0) {
    items.push({
      q: `${name}은 어떤 대상·종류의 상품인가요?`,
      a: `${name}은 ${parts.join(', ')} 전세자금보증 상품입니다. 자세한 자격 요건은 공고·한국주택금융공사(HF)에서 확인하세요.`,
      source: HF,
    });
  }

  const banks = bankNames(p.trtBankCont);
  if (banks.length > 0) {
    items.push({
      q: `${name}은 어느 은행에서 신청하나요?`,
      a: `취급 은행은 ${banks.slice(0, 6).join(', ')}입니다. 보증은 한국주택금융공사(HF)가 제공하고 실제 대출 실행은 취급 은행을 통해 이뤄집니다.`,
      source: HF,
    });
  }

  items.push({
    q: `${name} 정보는 언제 기준 자료인가요?`,
    a: `이 정보는 한국주택금융공사(HF) 데이터 기준일 ${formatAsOf(p.updatedAt)} 시점의 상품 안내이며, 조건은 변경될 수 있습니다.`,
    source: HF,
  });

  return items;
}
