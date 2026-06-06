import { describe, it, expect } from 'vitest';
import { computeContentHash } from '@/scripts/ingest/subscriptions/content-hash';
import type { NormalizedNotice } from '@/scripts/ingest/subscriptions/types';

function base(): NormalizedNotice {
  return {
    source: 'APPLYHOME' as NormalizedNotice['source'],
    category: 'APT' as NormalizedNotice['category'],
    sourceKey: 'H1-P1',
    houseManageNo: 'H1',
    pblancNo: 'P1',
    panId: null,
    origNoticeKey: null,
    name: '테스트아파트',
    status: null,
    regionCode: '100',
    regionName: '서울',
    address: '서울시 강남구 1',
    totalSupply: 100,
    noticeDate: new Date('2026-06-01'),
    receiptBegin: new Date('2026-06-10'),
    receiptEnd: new Date('2026-06-12'),
    winnerDate: null,
    contractBegin: null,
    contractEnd: null,
    moveInYm: '202712',
    homepage: null,
    noticeUrl: 'http://x',
    developer: '시행',
    constructor: '시공',
    tel: '02-0000',
    lat: null,
    lng: null,
    rawJson: { A: 1 },
  };
}

describe('computeContentHash', () => {
  it('같은 내용이면 같은 해시(64자 hex)', () => {
    const h = computeContentHash(base());
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(computeContentHash(base())).toBe(h);
  });

  it('lat/lng/rawJson 차이는 해시에 영향 없음', () => {
    const a = base();
    const b = { ...base(), lat: 37.5, lng: 127.0, rawJson: { B: 2 } };
    expect(computeContentHash(b)).toBe(computeContentHash(a));
  });

  it('영속 필드(address)가 바뀌면 해시가 달라짐', () => {
    const a = base();
    const b = { ...base(), address: '서울시 강남구 2' };
    expect(computeContentHash(b)).not.toBe(computeContentHash(a));
  });

  it('날짜 필드가 바뀌면 해시가 달라짐', () => {
    const a = base();
    const b = { ...base(), receiptEnd: new Date('2026-06-13') };
    expect(computeContentHash(b)).not.toBe(computeContentHash(a));
  });
});
