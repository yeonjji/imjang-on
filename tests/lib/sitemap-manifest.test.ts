import { describe, it, expect } from 'vitest';
import { buildManifest, type SourceCount } from '@/lib/sitemap/manifest';

const CHUNK = 10_000;

describe('buildManifest', () => {
  it('소스별 샤드 수 = ceil(count / chunkSize)', () => {
    const counts: SourceCount[] = [
      { key: 'core', count: 1500 },
      { key: 'property', count: 74_759 },
      { key: 'hospital', count: 79_562 },
    ];
    const shards = buildManifest(counts, CHUNK);
    expect(shards.filter((s) => s.key === 'core')).toHaveLength(1);
    expect(shards.filter((s) => s.key === 'property')).toHaveLength(8);
    expect(shards.filter((s) => s.key === 'hospital')).toHaveLength(8);
  });

  it('id가 0부터 연속이고 중복이 없다', () => {
    const shards = buildManifest(
      [{ key: 'a', count: 25_000 }, { key: 'b', count: 5_000 }],
      CHUNK,
    );
    expect(shards.map((s) => s.id)).toEqual([0, 1, 2, 3]);
  });

  it('모든 샤드의 limit이 chunkSize 이하다', () => {
    const shards = buildManifest([{ key: 'a', count: 25_001 }], CHUNK);
    expect(shards.every((s) => s.limit <= CHUNK)).toBe(true);
    expect(shards.map((s) => s.limit)).toEqual([10_000, 10_000, 5_001]);
  });

  it('offset/limit이 소스 범위를 겹침·누락 없이 분할한다', () => {
    const shards = buildManifest([{ key: 'a', count: 25_001 }], CHUNK);
    expect(shards.map((s) => s.offset)).toEqual([0, 10_000, 20_000]);
  });

  it('count가 0이면 샤드를 만들지 않는다', () => {
    const shards = buildManifest([{ key: 'a', count: 0 }, { key: 'b', count: 1 }], CHUNK);
    expect(shards).toEqual([{ id: 0, key: 'b', offset: 0, limit: 1 }]);
  });

  it('count가 chunkSize의 정확한 배수면 정확히 두 샤드로 나눈다', () => {
    const shards = buildManifest([{ key: 'a', count: 20_000 }], CHUNK);
    expect(shards).toHaveLength(2);
    expect(shards.map((s) => s.limit)).toEqual([10_000, 10_000]);
  });
});
