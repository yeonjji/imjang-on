import { describe, it, expect } from 'vitest';
import {
  deriveRangeStats,
  toChartRows,
  pctChange,
  type MonthPoint,
} from '@/lib/price-chart';

const mp = (month: string, avg: number, min = avg, max = avg, count = 1): MonthPoint => ({
  month,
  avg,
  min,
  max,
  count,
});

describe('deriveRangeStats', () => {
  it('빈 배열이면 null', () => {
    expect(deriveRangeStats([])).toBeNull();
  });

  it('실제 거래의 최고·최저·건수만 집계', () => {
    const s = deriveRangeStats([mp('2026-03', 1000, 900, 1100, 2)])!;
    expect(s.high).toBe(1100);
    expect(s.low).toBe(900);
    expect(s.count).toBe(2);
  });

  it('여러 달에 걸쳐 최고·최저·합계를 낸다', () => {
    const pts = [
      mp('2025-03', 10000, 9500, 10500, 3),
      mp('2025-09', 11000, 10000, 12000, 5),
      mp('2026-03', 12000, 11000, 13000, 4),
    ];
    const s = deriveRangeStats(pts)!;
    expect(s.high).toBe(13000);
    expect(s.low).toBe(9500);
    expect(s.count).toBe(12);
  });

  // 평형이 섞인 월평균으로 '시세'와 변동률을 만들지 않기 위해 의도적으로 뺀 필드들.
  // 평형이 맞는 값은 getAreaSummary(표본 2건 가드)가 낸다.
  it('마지막 달 평균·변동률은 제공하지 않는다', () => {
    const s = deriveRangeStats([mp('2026-03', 12000), mp('2025-03', 10000)]) as unknown as Record<string, unknown>;
    expect(s.current).toBeUndefined();
    expect(s.changePct).toBeUndefined();
    expect(s.changeMonths).toBeUndefined();
  });
});

describe('pctChange', () => {
  it('상승·하락·보합을 부호로 표현', () => {
    expect(pctChange(110, 100)).toBeCloseTo(10, 5);
    expect(pctChange(90, 100)).toBeCloseTo(-10, 5);
    expect(pctChange(100, 100)).toBe(0);
  });

  it('prior가 0 이하이면 null (0 나눗셈·무의미 기준 방지)', () => {
    expect(pctChange(100, 0)).toBeNull();
    expect(pctChange(100, -5)).toBeNull();
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
