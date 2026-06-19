import { prisma } from '@/lib/db';
import { decodeEntities } from '@/lib/text/decode-entities';

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

// HTML 엔티티 디코딩은 공용 유틸(@/lib/text/decode-entities)로 이동. 기존 import 경로 호환용 re-export.
export { decodeEntities };

// 연 단위 필드에서 비현실적 값(50년 초과 숫자 포함)은 소스 데이터 오류로 보고 숨긴다.
// 단, 단위/맥락이 있는 텍스트("5(최대 60개월…)")는 판단하지 않고 그대로 둔다(순수 숫자형만 검사).
export function isPlausibleValue(value: unknown, unit?: string): boolean {
  if (unit !== '년') return true;
  const s = String(value).trim();
  if (!/^[\d.,~\s]+$/.test(s)) return true;
  const nums = s.match(/\d+(\.\d+)?/g) ?? [];
  return !nums.some((n) => Number(n) > 50);
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
