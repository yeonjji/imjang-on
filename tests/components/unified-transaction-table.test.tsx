import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { UnifiedTransactionTable } from '@/app/(public)/apt/[id]/_components/unified-transaction-table';
import type { UnifiedTxRow } from '@/lib/transaction';

(globalThis as unknown as { React: typeof React }).React = React;

const row = (id: string, o: Partial<UnifiedTxRow> = {}): UnifiedTxRow => ({
  id, dealType: 'SALE', contractDate: '2026-09-27', exclusiveArea: 84.9, floor: 5,
  dealAmount: 100000, deposit: null, monthlyRent: null, cancelled: false, ...o,
});
const render = (rows: UnifiedTxRow[], cancelledCounts?: { SALE: number; JEONSE: number; WOLSE: number }) =>
  renderToStaticMarkup(
    <UnifiedTransactionTable propertyId="1" initialRows={rows} counts={{ SALE: 4, JEONSE: 1, WOLSE: 0 }} cancelledCounts={cancelledCounts} />,
  );

describe('UnifiedTransactionTable 해제 거래 표시', () => {
  const rows = [row('1', { cancelled: true, dealAmount: 310000 }), row('2', { dealType: 'JEONSE', dealAmount: null, deposit: 60000 }), row('3')];

  it('해제 행에 배지와 취소선, 표 아래 범례', () => {
    const html = render(rows, { SALE: 2, JEONSE: 0, WOLSE: 0 });
    expect(html).toContain('data-cancelled-badge'); // 표·모바일 카드 둘 다
    expect(html.match(/data-cancelled-badge/g)).toHaveLength(2);
    expect(html).toMatch(/<s[^>]*>31억<\/s>/);
    expect(html).toContain('계약 후 해제 신고된 거래예요. 시세·평균·거래 건수 통계에는 넣지 않아요.');
  });

  it('건수는 전체와 함께 정상·해제를 나눠 보인다', () => {
    const html = render(rows, { SALE: 2, JEONSE: 0, WOLSE: 0 });
    expect(html).toContain('전체 5건');
    expect(html).toContain('정상 3건');
    expect(html).toContain('해제 2건');
  });

  it('해제 거래가 없으면 배지·범례·구분 건수를 보이지 않는다', () => {
    const html = render([row('2'), row('3')], { SALE: 0, JEONSE: 0, WOLSE: 0 });
    expect(html).not.toContain('data-cancelled-badge');
    expect(html).not.toContain('계약 후 해제 신고된');
    expect(html).not.toContain('정상 ');
    expect(html).toContain('전체 5건');
  });

  it('해제 건수를 넘기지 않으면(기존 호출) 해제가 없는 것으로 본다', () => {
    expect(render([row('3')])).not.toContain('해제');
  });

  it('범례는 지금 보이는 행에 해제가 있을 때만(다른 페이지에만 있는 경우 숨김)', () => {
    const html = render([row('3')], { SALE: 2, JEONSE: 0, WOLSE: 0 });
    expect(html).toContain('해제 2건');
    expect(html).not.toContain('계약 후 해제 신고된');
  });
});
