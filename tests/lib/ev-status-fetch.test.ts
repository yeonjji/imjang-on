import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';

vi.mock('@/lib/env', () => ({
  env: { PUBLIC_DATA_KEY: 'test-key', LOG_LEVEL: 'silent' },
}));

import { fetchChargerStatus } from '@/lib/urban/ev-status';

const xml = (resultCode: string, items: string) =>
  new Response(
    `<?xml version="1.0" encoding="UTF-8"?><response><header><resultCode>${resultCode}</resultCode><resultMsg>MSG</resultMsg></header><body>${items}</body></response>`,
    { status: 200 },
  );
const item = (chgerId: string, stat: string) =>
  `<item><statId>ME174001</statId><chgerId>${chgerId}</chgerId><stat>${stat}</stat><lastTsdt>20261026101910</lastTsdt></item>`;

let fetchSpy: MockInstance<typeof fetch>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe('fetchChargerStatus', () => {
  it('정상 응답이면 충전기별 상태를 돌려준다', async () => {
    fetchSpy.mockResolvedValue(xml('00', `<items>${item('01', '2')}${item('02', '3')}</items>`));
    expect(await fetchChargerStatus('ME174001')).toEqual([
      { chgerId: '01', stat: '2', statLabel: '사용가능', lastTsdt: '20261026101910' },
      { chgerId: '02', stat: '3', statLabel: '충전중', lastTsdt: '20261026101910' },
    ]);
  });

  it('조회 결과가 0건이면 빈 배열(충전소가 원천에 없음)', async () => {
    fetchSpy.mockResolvedValue(xml('00', '<items/>'));
    expect(await fetchChargerStatus('ME174001')).toEqual([]);
  });

  it('가이드 v1.25의 6(예약중)·9(상태미확인) 코드를 표시한다', async () => {
    fetchSpy.mockResolvedValue(xml('00', `<items>${item('01', '6')}${item('02', '9')}</items>`));
    const r = await fetchChargerStatus('ME174001');
    expect(r?.map((s) => s.statLabel)).toEqual(['예약중', '상태미확인']);
  });

  it('resultCode가 00이 아니면(한도 초과 등) 실패(null)', async () => {
    fetchSpy.mockResolvedValue(xml('22', ''));
    expect(await fetchChargerStatus('ME174001')).toBeNull();
  });

  it('HTTP 오류면 한 번 다시 시도하고, 그래도 실패면 null', async () => {
    fetchSpy.mockResolvedValue(new Response('', { status: 500 }));
    expect(await fetchChargerStatus('ME174001')).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('첫 시도가 실패해도 재시도가 성공하면 결과를 돌려준다', async () => {
    fetchSpy
      .mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError'))
      .mockResolvedValueOnce(xml('00', `<items>${item('01', '2')}</items>`));
    expect(await fetchChargerStatus('ME174001')).toHaveLength(1);
  });

  it('호출마다 시간 제한(AbortSignal)을 건다', async () => {
    fetchSpy.mockResolvedValue(xml('00', '<items/>'));
    await fetchChargerStatus('ME174001');
    expect(fetchSpy.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });
});
