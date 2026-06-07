import { describe, it, expect } from 'vitest';
import {
  DATA_SOURCES,
  DATA_SOURCE_CATEGORY_ORDER,
  dataSourcesByCategory,
  sourceShortLabel,
  type DataSourceId,
} from '@/lib/data-sources';

describe('DATA_SOURCES 레지스트리 무결성', () => {
  it('모든 항목이 provider·dataset·category를 가진다', () => {
    for (const [id, s] of Object.entries(DATA_SOURCES)) {
      expect(s.id, `${id}.id`).toBe(id);
      expect(s.provider.length, `${id}.provider`).toBeGreaterThan(0);
      expect(s.dataset.length, `${id}.dataset`).toBeGreaterThan(0);
      expect(DATA_SOURCE_CATEGORY_ORDER, `${id}.category`).toContain(s.category);
    }
  });

  it('url이 있으면 https로 시작한다', () => {
    for (const s of Object.values(DATA_SOURCES)) {
      if (s.url) expect(s.url.startsWith('https://')).toBe(true);
    }
  });
});

describe('dataSourcesByCategory', () => {
  it('정의된 모든 출처를 빠짐없이 그룹에 포함한다', () => {
    const grouped = dataSourcesByCategory().flatMap((g) => g.sources);
    expect(grouped).toHaveLength(Object.keys(DATA_SOURCES).length);
  });

  it('카테고리 순서를 DATA_SOURCE_CATEGORY_ORDER대로 따른다', () => {
    const order = dataSourcesByCategory().map((g) => g.category);
    const expected = DATA_SOURCE_CATEGORY_ORDER.filter((c) =>
      Object.values(DATA_SOURCES).some((s) => s.category === c),
    );
    expect(order).toEqual(expected);
  });
});

describe('sourceShortLabel', () => {
  it('제공기관명을 반환한다', () => {
    expect(sourceShortLabel('molit-rtms' as DataSourceId)).toBe('국토교통부');
  });
});
