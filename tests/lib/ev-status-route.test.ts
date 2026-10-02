import { describe, it, expect, vi, beforeEach } from 'vitest';

// 실시간 충전 상태는 사용자가 버튼을 누를 때만 이 라우트로 조회한다(일일 API 한도 보호).
vi.mock('@/lib/urban/ev-status', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/urban/ev-status')>();
  return { ...actual, fetchChargerStatus: vi.fn() };
});

import { fetchChargerStatus } from '@/lib/urban/ev-status';
import { GET } from '@/app/api/ev-status/route';

const fetchMock = fetchChargerStatus as unknown as ReturnType<typeof vi.fn>;
const get = (q: string) => GET(new Request(`http://localhost/api/ev-status${q}`));

describe('GET /api/ev-status', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue([{ chgerId: '01', stat: '2', statLabel: '사용가능', lastTsdt: '20261002073000' }]);
  });

  it('statId가 없거나 형식이 틀리면 400, 외부 API를 부르지 않는다', async () => {
    expect((await get('')).status).toBe(400);
    expect((await get('?statId=../x')).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('정상 statId면 상태 목록을 JSON으로', async () => {
    const res = await get('?statId=ME174001');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      statuses: [{ chgerId: '01', stat: '2', statLabel: '사용가능', lastTsdt: '20261002073000' }],
    });
    expect(fetchMock).toHaveBeenCalledWith('ME174001');
  });
});
