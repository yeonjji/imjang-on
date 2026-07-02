import { describe, it, expect } from 'vitest';
import { buildAptNarrative, type AptInsightInput } from '@/lib/insights/apt';
import { formatBillion } from '@/lib/format';

const base: AptInsightInput = {
  name: '광교센트럴아파트',
  sigunguName: '수원시 영통구',
  builtYear: 2013,
  households: 998,
  saleDeals: [
    { contractDate: '2026-03-10', amountManwon: 80000 },
    { contractDate: '2026-06-20', amountManwon: 90000 },
  ],
  regionAvgSaleManwon: 80000,
  regionSampleCount: 12,
  nearestStation: { name: '상현역', lines: ['신분당선'], distanceMeters: 400 },
  infra: [{ label: '카페', count: 8 }, { label: '병원', count: 2 }],
};

describe('buildAptNarrative', () => {
  it('4개 모듈 모두 발화하면 이름으로 시작하고 fired에 4키를 담는다', () => {
    const n = buildAptNarrative(base)!;
    expect(n).not.toBeNull();
    expect(n.text.startsWith('광교센트럴아파트는')).toBe(true);
    expect(n.fired).toEqual(['scale', 'trend', 'peer', 'access']); // 자연 읽기 순서
    expect(n.sentences).toHaveLength(4);
    expect(n.sentences[0].startsWith('광교센트럴아파트는')).toBe(true); // 첫 문장에만 단지명
  });

  it('tTrend: 상승 방향과 건수를 판단으로 표현', () => {
    const n = buildAptNarrative(base)!;
    expect(n.text).toContain('최근 매매 2건');
    expect(n.text).toContain('13% 상승'); // (90000-80000)/80000=12.5→13
  });

  it('pPeer 구간 분기: +5~+15%면 "웃도는 수준"', () => {
    const n = buildAptNarrative(base)!; // 90000 vs 80000 = +13%
    expect(n.text).toContain('수원시 영통구 평균을 웃도는 수준');
  });

  it('pPeer 구간 분기: +15%↑이면 "뚜렷하게 높은 상위 가격대"', () => {
    const n = buildAptNarrative({
      ...base,
      saleDeals: [{ contractDate: '2026-06-20', amountManwon: 95000 }, { contractDate: '2026-03-10', amountManwon: 80000 }],
    })!; // latest 95000 vs 80000 = +18.75%→19
    expect(n.text).toContain('뚜렷하게 높은 상위 가격대');
  });

  it('pPeer 구간 분기: -5%↓이면 "진입 부담이 적은 편"', () => {
    const n = buildAptNarrative({
      ...base,
      saleDeals: [{ contractDate: '2026-03-10', amountManwon: 72000 }, { contractDate: '2026-06-20', amountManwon: 70000 }],
    })!; // latest 70000 vs 80000 = -12.5%→-13
    expect(n.text).toContain('진입 부담이 적은 편');
  });

  it('aAccess: 도보 분과 인프라 밀도를 표현', () => {
    const n = buildAptNarrative(base)!;
    expect(n.text).toContain('상현역'); // 400m/80 = 5분
    expect(n.text).toContain('도보 약 5분');
    expect(n.text).toContain('기본 생활 인프라를 갖췄습니다'); // 인프라 2종 → 기본
  });

  it('aAccess: 인프라 3종↑이면 "양호한 편"', () => {
    const n = buildAptNarrative({ ...base, infra: [{ label: '카페', count: 8 }, { label: '병원', count: 2 }, { label: '마트', count: 3 }] })!;
    expect(n.text).toContain('양호한 편입니다');
  });

  it('aAccess: 역만 있고 인프라<2면 완결된 문장을 만든다', () => {
    const n = buildAptNarrative({ ...base, infra: [{ label: '카페', count: 8 }] })!;
    expect(n.text).toContain('도보 약 5분 거리입니다');
  });

  it('bScale: 준공·세대 규모', () => {
    expect(buildAptNarrative(base)!.text).toContain('2013년 준공 · 998세대 단지입니다');
  });

  it('가드: 발화 모듈 3개 미만이면 null (매매<2, 지역표본부족, 인프라1종)', () => {
    const n = buildAptNarrative({
      ...base,
      saleDeals: [{ contractDate: '2026-06-20', amountManwon: 90000 }], // 1건 → tTrend null, pPeer는 발화 가능
      regionSampleCount: 3,   // <5 → pPeer null
      nearestStation: null,
      infra: [{ label: '카페', count: 8 }], // 1종 → aAccess null
    }); // scale만 발화 → null
    expect(n).toBeNull();
  });

  it('가드: 스타(trend/peer) 미발화면 null', () => {
    const n = buildAptNarrative({
      ...base,
      saleDeals: [],          // tTrend·pPeer 모두 침묵
      regionAvgSaleManwon: null,
    }); // scale+access 2개 → 3 미만이자 스타 없음 → null
    expect(n).toBeNull();
  });

  it('고유성: 가격이 다르면 결론 문장이 달라진다', () => {
    const high = buildAptNarrative(base)!;
    const low = buildAptNarrative({
      ...base,
      saleDeals: [{ contractDate: '2026-03-10', amountManwon: 72000 }, { contractDate: '2026-06-20', amountManwon: 70000 }],
    })!;
    expect(high.text).not.toEqual(low.text);
  });

  it('tTrend·pPeer가 같은 날짜 복수 거래에서 동일한 최근 실거래 값을 쓴다', () => {
    // 같은 최근일에 90000·70000 두 건 → 두 모듈 모두 오름차순 마지막(70000)을 최근값으로.
    const n = buildAptNarrative({
      ...base,
      saleDeals: [
        { contractDate: '2026-06-20', amountManwon: 90000 },
        { contractDate: '2026-06-20', amountManwon: 70000 },
      ],
    })!;
    expect(n.text).toContain(formatBillion(70000));
    expect(n.text).not.toContain(`최근 실거래 ${formatBillion(90000)}`);
  });
});
