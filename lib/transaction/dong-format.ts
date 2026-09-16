import { formatBillion } from '@/lib/format';
import type { DealType } from '@prisma/client';

/**
 * 동네 거래 목록의 표기 규칙. 홈 패널과 상세 표가 공유한다.
 *
 * 날짜에 연도를 반드시 넣는다 — 이 목록은 기간 제한이 없어 몇 년 전 거래가 섞인다.
 * MM.DD만 쓰면 2019년 거래가 올해 거래처럼 보인다(스펙 §3.5, §4.3).
 */
export function formatDongDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${y.slice(2)}.${m}.${d}`;
}

type PriceFields = {
  dealType: DealType;
  dealAmount: number | null;
  deposit: number | null;
  monthlyRent: number | null;
};

/**
 * 상세에서 이 목록 바로 위에 있는 「이 단지 최근 실거래 내역」과 같은 표기를 쓴다
 * (unified-transaction-table.tsx:25-31). 인접한 두 섹션이 같은 종류의 값을 다르게
 * 적으면 같은 지표가 두 값으로 읽힌다.
 *
 * '보'·'월' 라벨이 있어 5,000/150 축약의 문제(어느 쪽이 보증금인지 읽을 수 없음)는 없다.
 */
export function formatDongPrice(tx: PriceFields): string {
  if (tx.dealType === 'SALE') return tx.dealAmount == null ? '' : formatBillion(tx.dealAmount);
  if (tx.dealType === 'JEONSE') return tx.deposit == null ? '' : formatBillion(tx.deposit);
  if (tx.deposit == null || tx.monthlyRent == null) return '';
  return `보 ${formatBillion(tx.deposit)} / 월 ${tx.monthlyRent.toLocaleString('ko-KR')}만`;
}

type MetaFields = { exclusiveArea: number; floor: number | null; contractDate: string };

/** 층이 없으면 그 조각을 통째로 뺀다. 결측에 자리표시자를 두지 않는다. */
export function formatDongMeta(tx: MetaFields): string {
  const parts = [`${Math.round(tx.exclusiveArea)}㎡`];
  if (tx.floor != null) parts.push(`${tx.floor}층`);
  parts.push(formatDongDate(tx.contractDate));
  return parts.join(' · ');
}
