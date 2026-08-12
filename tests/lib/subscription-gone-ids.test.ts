import { describe, it, expect } from 'vitest';
import { GONE_SUBSCRIPTION_IDS, GONE_IDS_GENERATED_AT } from '@/lib/subscription/gone-ids';

describe('gone-ids 생성물', () => {
  it('목록이 비어 있으면 410 게이트가 통째로 죽는다 — 생성 누락을 여기서 잡는다', () => {
    expect(GONE_SUBSCRIPTION_IDS.size).toBeGreaterThan(0);
  });
  it('id는 전부 숫자 문자열이다 — 미들웨어 정규식이 숫자만 받는다', () => {
    for (const id of GONE_SUBSCRIPTION_IDS) expect(id).toMatch(/^\d+$/);
  });
  it('생성일이 YYYY-MM-DD 형식이다', () => {
    expect(GONE_IDS_GENERATED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
