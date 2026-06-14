import { prisma } from '@/lib/db';

export interface LoanField {
  key: string; // rawJson 키
  label: string;
  unit?: string; // 맨 숫자형 값에만 붙는 단위(예: '년'). 이미 단위/설명이 박힌 값은 건드리지 않음
}
export interface LoanSection {
  title: string;
  fields: LoanField[];
}

// 상세 페이지 섹션 구성. rawJson 키 → 라벨.
export const LOAN_SECTIONS: LoanSection[] = [
  {
    title: '한눈에',
    fields: [
      { key: 'lnlmt', label: '대출한도(만원)' },
      { key: 'irt', label: '금리' },
      { key: 'irtCtg', label: '금리구분' },
      { key: 'maxtotlntrm', label: '최대 총 대출기간', unit: '년' },
      { key: 'maxdfrmtrm', label: '최대 거치기간', unit: '년' },
      { key: 'maxrdpttrm', label: '최대 상환기간', unit: '년' },
      { key: 'rdptmthd', label: '상환방식' },
    ],
  },
  {
    title: '자격요건',
    fields: [
      { key: 'trgt', label: '대출대상' },
      { key: 'suprtgtdtlcond', label: '지원대상 상세조건' },
      { key: 'age', label: '연령' },
      { key: 'incm', label: '소득' },
      { key: 'crdtsc', label: '신용' },
      { key: 'rsdAreaPamtEqltIstm', label: '거주지역' },
      { key: 'housholdcnt', label: '가구수' },
    ],
  },
  {
    title: '비용·우대',
    fields: [
      { key: 'rpymdcfe', label: '중도상환수수료' },
      { key: 'lnicdcst', label: '부대비용' },
      { key: 'ovitryr', label: '연체이율' },
      { key: 'prftaddirtcond', label: '우대금리조건' },
      { key: 'grninst', label: '보증기관' },
      { key: 'etcrefsbjc', label: '기타참고' },
    ],
  },
  {
    title: '신청',
    fields: [
      { key: 'jnmthd', label: '가입방법' },
      { key: 'hdlinst', label: '취급기관' },
      { key: 'hdlinstdtlvw', label: '취급기관 상세' },
      { key: 'cnpl', label: '고객센터' },
    ],
  },
];

// 표시 가능한 값인지(빈값·"-"만 숨김. "없음"은 의미있는 정보라 표시).
export function isDisplayable(v: unknown): boolean {
  if (v == null) return false;
  const s = String(v).trim();
  return s !== '' && s !== '-';
}

// 원본 데이터에 HTML 엔티티가 박혀 있음(예: '원&#40;리&#41;금' = '원(리)금'). 표시 전 디코딩.
export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

// 단위 부착: 순수 숫자형(범위 ~ · 소수 · 콤마 허용)에만 붙인다.
// 이미 '년'/'개월' 등 단위나 설명("은행별 상이")이 들어간 값은 그대로 둔다.
export function formatLoanValue(value: unknown, unit?: string): string {
  const s = decodeEntities(String(value).trim());
  if (!unit) return s;
  return /^[\d.,~\s]+$/.test(s) ? `${s}${unit}` : s;
}

export async function getLoanProduct(seq: number) {
  return prisma.loanProduct.findUnique({ where: { seq } });
}

export async function getAllLoanSeqs(): Promise<number[]> {
  const rows = await prisma.loanProduct.findMany({ select: { seq: true } });
  return rows.map((r) => r.seq);
}
