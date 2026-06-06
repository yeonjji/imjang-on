import { describe, it, expect } from 'vitest';
import {
  monthDiff,
  deriveHeaderStats,
  toChartRows,
  pickDefaultPyeong,
  type MonthPoint,
} from '@/lib/price-chart';

const mp = (month: string, avg: number, min = avg, max = avg, count = 1): MonthPoint => ({
  month,
  avg,
  min,
  max,
  count,
});

describe('monthDiff', () => {
  it('YYYY-MM 두 개의 개월 차이', () => {
    expect(monthDiff('2025-03', '2026-03')).toBe(12);
    expect(monthDiff('2025-10', '2026-03')).toBe(5);
    expect(monthDiff('2026-03', '2026-03')).toBe(0);
  });
});

describe('deriveHeaderStats', () => {
  it('빈 배열이면 null', () => {
    expect(deriveHeaderStats([])).toBeNull();
  });

  it('단일 포인트면 변동률 null, 개월 0', () => {
    const s = deriveHeaderStats([mp('2026-03', 1000, 900, 1100, 2)]);
    expect(s).not.toBeNull();
    expect(s!.current).toBe(1000);
    expect(s!.changePct).toBeNull();
    expect(s!.changeMonths).toBe(0);
    expect(s!.high).toBe(1100);
    expect(s!.low).toBe(900);
    expect(s!.count).toBe(2);
  });

  it('12개월 이상이면 12개월 전 대비 변동률', () => {
    const pts = [
      mp('2025-03', 10000, 9500, 10500, 3),
      mp('2025-09', 11000, 10000, 12000, 5),
      mp('2026-03', 12000, 11000, 13000, 4),
    ];
    const s = deriveHeaderStats(pts)!;
    expect(s.current).toBe(12000);
    expect(s.changeMonths).toBe(12); // 2025-03 기준
    expect(s.changePct).toBeCloseTo(20, 5); // (12000-10000)/10000*100
    expect(s.high).toBe(13000);
    expect(s.low).toBe(9500);
    expect(s.count).toBe(12);
  });

  it('12개월 미만이면 가장 이른 달 기준으로 폴백', () => {
    const pts = [mp('2025-12', 8000), mp('2026-03', 8800)];
    const s = deriveHeaderStats(pts)!;
    expect(s.changeMonths).toBe(3);
    expect(s.changePct).toBeCloseTo(10, 5);
  });

  it('정렬되지 않은 입력도 처리', () => {
    const pts = [mp('2026-03', 12000), mp('2025-03', 10000)];
    const s = deriveHeaderStats(pts)!;
    expect(s.current).toBe(12000);
    expect(s.changeMonths).toBe(12);
  });
});

describe('toChartRows', () => {
  it('min/max를 band 튜플로 변환하고 월 오름차순 정렬', () => {
    const rows = toChartRows([mp('2026-03', 12000, 11000, 13000, 4), mp('2025-03', 10000, 9000, 11000, 3)]);
    expect(rows.map((r) => r.month)).toEqual(['2025-03', '2026-03']);
    expect(rows[0].band).toEqual([9000, 11000]);
    expect(rows[1].avg).toBe(12000);
  });
});

describe('pickDefaultPyeong', () => {
  it('거래 최다 평형을 반환', () => {
    expect(pickDefaultPyeong([{ pyeong: 25, totalCount: 72 }, { pyeong: 34, totalCount: 134 }])).toBe(34);
  });
  it('빈 배열이면 null', () => {
    expect(pickDefaultPyeong([])).toBeNull();
  });
});
