import { describe, it, expect } from 'vitest';
import { buildParkNarrative, type ParkInsightInput } from '@/lib/insights/park';

const base: ParkInsightInput = {
  name: '중앙근린공원',
  parkType: '근린공원',
  area: 32000,
  nearestStation: { name: '시청역', lines: ['1호선'], distanceMeters: 400 },
  infra: [{ label: '카페', count: 5 }, { label: '병원', count: 3 }, { label: '약국', count: 2 }],
  nearbyAptSaleManwon: [90000, 130000, 175000],
};

describe('buildParkNarrative', () => {
  it('풍부 데이터면 이름으로 시작하고 intro+access+price 발화', () => {
    const n = buildParkNarrative(base)!;
    expect(n.sentences[0].startsWith('중앙근린공원은')).toBe(true);
    expect(n.fired).toEqual(['intro', 'access', 'price']);
  });

  it('intro 대규모: 면적 10만㎡ 이상이면 "대규모" 수식', () => {
    const t = buildParkNarrative({ ...base, area: 125000 })!.text;
    expect(t).toContain('면적 12.5만㎡의 대규모 근린공원입니다');
  });

  it('intro 무수식: 1만~10만㎡ 사이는 규모 수식 없음', () => {
    expect(buildParkNarrative({ ...base, area: 32000 })!.text).toContain('면적 3.2만㎡의 근린공원입니다');
  });

  it('intro 소규모: 1만㎡ 미만이면 "소규모" + 콤마 표기', () => {
    const t = buildParkNarrative({ ...base, area: 1850, parkType: '어린이공원' })!.text;
    expect(t).toContain('면적 1,850㎡의 소규모 어린이공원입니다');
  });

  it('면적 정수 만이면 소수점 없음(5만㎡)', () => {
    expect(buildParkNarrative({ ...base, area: 50000 })!.text).toContain('면적 5만㎡의 근린공원입니다');
  });

  it('면적 경계 1만㎡는 소규모 아님', () => {
    expect(buildParkNarrative({ ...base, area: 10000 })!.text).toContain('면적 1만㎡의 근린공원입니다');
  });

  it('area 없고 parkType만 있으면 유형 문장만', () => {
    const n = buildParkNarrative({ ...base, area: null })!;
    expect(n.text).toContain('중앙근린공원은 근린공원입니다');
    expect(n.fired).toContain('intro');
  });

  it('area·parkType 다 없으면 intro 미발화 → requireKeys 미충족 → null', () => {
    expect(buildParkNarrative({ ...base, area: null, parkType: null })).toBeNull();
  });

  it('게이트: intro만 발화(access·price 없음)면 minFired 2 미달 → null', () => {
    expect(
      buildParkNarrative({ ...base, nearestStation: null, infra: [], nearbyAptSaleManwon: [] }),
    ).toBeNull();
  });

  it('게이트: intro + access(역만)면 발화', () => {
    const n = buildParkNarrative({ ...base, infra: [], nearbyAptSaleManwon: [] })!;
    expect(n.fired).toEqual(['intro', 'access']);
  });

  it('parkType 없고 area만 있으면 "도시공원"으로 대체', () => {
    expect(buildParkNarrative({ ...base, parkType: null, area: 32000 })!.text).toContain('면적 3.2만㎡의 도시공원입니다');
  });
});
