import { describe, it, expect } from 'vitest';
import { diffByHash } from '@/scripts/ingest/subscriptions/diff';
import type { NoticeWithUnits, ExistingNotice } from '@/scripts/ingest/subscriptions/types';

function item(sourceKey: string, contentHash: string): NoticeWithUnits {
  return {
    notice: { sourceKey, contentHash } as NoticeWithUnits['notice'],
    units: [],
  };
}

describe('diffByHash', () => {
  it('DB에 없는 신규 공고는 changed', () => {
    const existing = new Map<string, ExistingNotice>();
    const { changed, skipped } = diffByHash([item('A', 'h1')], existing);
    expect(changed.map((i) => i.notice.sourceKey)).toEqual(['A']);
    expect(skipped).toBe(0);
  });

  it('해시가 같으면 skip', () => {
    const existing = new Map<string, ExistingNotice>([
      ['A', { contentHash: 'h1', address: null, lat: null, lng: null }],
    ]);
    const { changed, skipped } = diffByHash([item('A', 'h1')], existing);
    expect(changed).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it('해시가 다르면 changed', () => {
    const existing = new Map<string, ExistingNotice>([
      ['A', { contentHash: 'old', address: null, lat: null, lng: null }],
    ]);
    const { changed, skipped } = diffByHash([item('A', 'h1')], existing);
    expect(changed.map((i) => i.notice.sourceKey)).toEqual(['A']);
    expect(skipped).toBe(0);
  });

  it('혼합: 신규+변경+동일을 정확히 분류', () => {
    const existing = new Map<string, ExistingNotice>([
      ['same', { contentHash: 'h', address: null, lat: null, lng: null }],
      ['changed', { contentHash: 'old', address: null, lat: null, lng: null }],
    ]);
    const { changed, skipped } = diffByHash(
      [item('same', 'h'), item('changed', 'new'), item('new', 'x')],
      existing,
    );
    expect(changed.map((i) => i.notice.sourceKey).sort()).toEqual(['changed', 'new']);
    expect(skipped).toBe(1);
  });
});
