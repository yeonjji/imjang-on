/** 전세자금보증 표시용 코드 라벨(UI 공용). */

/** 추천상품구분(rcmdGrntProdDvcd). */
export const PROD_KIND_LABELS: Record<string, string> = {
  '01': '일반(청년 포함)',
  '02': '협약',
  '03': '특례',
};

/** 신청대상구분(grntReqTrgtDvcd). */
export const REQ_TARGET_LABELS: Record<string, string> = {
  '00': '전체',
  '01': '청년',
  '02': '신혼부부',
  '03': '기타',
};

export function reqTargetLabel(code: string | null): string | null {
  return code ? (REQ_TARGET_LABELS[code] ?? null) : null;
}
export function prodKindLabel(code: string | null): string | null {
  return code ? (PROD_KIND_LABELS[code] ?? null) : null;
}

/** 금융기관코드(취급은행) → 은행명. 표준 금융결제원 코드 일부. 미지의 코드는 코드 그대로. */
const BANK_LABELS: Record<string, string> = {
  '002': '산업은행',
  '003': '기업은행',
  '004': '국민은행',
  '007': '수협',
  '011': '농협',
  '020': '우리은행',
  '023': 'SC제일은행',
  '027': '씨티은행',
  '031': '대구은행',
  '032': '부산은행',
  '034': '광주은행',
  '035': '제주은행',
  '037': '전북은행',
  '039': '경남은행',
  '045': '새마을금고',
  '048': '신협',
  '050': '저축은행',
  '071': '우체국',
  '081': '하나은행',
  '088': '신한은행',
  '089': '케이뱅크',
  '090': '카카오뱅크',
  '092': '토스뱅크',
};

/** 취급은행 코드 문자열('039|034|...') → 은행명 배열. */
export function bankNames(trtBankCont: string | null): string[] {
  if (!trtBankCont) return [];
  return trtBankCont
    .split('|')
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => BANK_LABELS[c] ?? c);
}

/** 데이터 스냅샷 기준일 → "YYYY.MM.DD"(KST). 서버 TZ와 무관하게 한국 날짜로 표기. */
export function formatAsOf(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

/** 원 단위 금액 → "N억 N,NNN만원" 한국어 표기. */
export function formatWon(won: number): string {
  if (!Number.isFinite(won) || won <= 0) return '0원';
  const eok = Math.floor(won / 100_000_000);
  const man = Math.floor((won % 100_000_000) / 10_000);
  const parts: string[] = [];
  if (eok) parts.push(`${eok}억`);
  if (man) parts.push(`${man.toLocaleString('ko-KR')}만`);
  return parts.length ? `${parts.join(' ')}원` : '0원';
}
