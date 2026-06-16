import { describe, it, expect } from 'vitest';
import { buildSubscriptionDigest, MIN_NOTICES, type DigestNotice } from '@/scripts/ingest/posts/sources/subscription';

const TODAY = new Date('2026-06-16T00:00:00Z');

function notice(over: Partial<DigestNotice>): DigestNotice {
  return {
    name: '○○자이', regionName: '서울', address: '서울특별시 강서구 ...', category: 'APT',
    totalSupply: 500, receiptBegin: new Date('2026-06-10'), receiptEnd: new Date('2026-06-20'),
    winnerDate: new Date('2026-06-27'), moveInYm: '202806', ...over,
  };
}

describe('buildSubscriptionDigest', () => {
  it('MIN_NOTICES 미만이면 null', () => {
    const rows = Array.from({ length: MIN_NOTICES - 1 }, () => notice({}));
    expect(buildSubscriptionDigest(rows, TODAY)).toBeNull();
  });

  it('충분한 공고면 사실 digest 생성', () => {
    const rows = [
      notice({ name: '강서한강자이', totalSupply: 500 }),
      notice({ name: '미래도시뉴홈', receiptBegin: new Date('2026-06-22'), receiptEnd: new Date('2026-06-26'), category: 'LH_PRESUB' }),
      notice({ name: '판교센트럴', regionName: '경기', address: '경기도 성남시 분당구 ...' }),
    ];
    const out = buildSubscriptionDigest(rows, TODAY)!;
    expect(out).not.toBeNull();
    expect(out.title).toContain('3개 단지');
    expect(out.bodyText).toContain('3건');
    expect(out.bodyText).toContain('강서한강자이');
    expect(out.bodyText).toContain('강서구'); // 주소에서 구 추출
    expect(out.bodyText).toContain('500세대');
    expect(out.bodyText).toContain('접수중'); // 06-10~06-20, today 06-16
    expect(out.bodyText).toContain('접수 예정'); // 06-22~ 미래
    expect(out.bodyText).toContain('2026.06.20'); // 마감일 표기
  });
});
