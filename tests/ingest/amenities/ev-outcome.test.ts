import { describe, it, expect } from 'vitest';
import { evIngestFailure } from '@/scripts/ingest/amenities/ev-outcome';

// 2026-08~10월 정기 수집이 첫 페이지 429(일일 한도)로 끝났는데도 'OK · 0건'으로 기록돼
// 3개월간 아무도 몰랐다. 미완료는 실패로 드러나야 한다.
describe('evIngestFailure', () => {
  it('완료되지 않았으면 실패 메시지(마지막 페이지 포함)', () => {
    const msg = evIngestFailure({ complete: false, lastPage: 240, totalStations: 0 });
    expect(msg).toMatch(/240/);
    expect(msg).toMatch(/재개/);
  });

  it('완료됐으면 null', () => {
    expect(evIngestFailure({ complete: true, lastPage: 516, totalStations: 101703 })).toBeNull();
  });
});
