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
  // saleDeals 원자료 first/last(=+13%)와 일부러 다른 값 → 산문이 saleTrend(그래프 기준)을 쓰는지 검증.
  saleTrend: { changePct: 8, changeMonths: 12 },
  regionAvgSaleManwon: 80000,
  regionSampleCount: 12,
  nearestStation: { name: '상현역', lines: ['신분당선'], distanceMeters: 400 },
  infra: [{ label: '카페', count: 8, capped: false }, { label: '병원', count: 2, capped: false }],
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

  it('tTrend: 변동률은 그래프와 동일 기준(saleTrend)을 쓰고, 잘린 건수는 단정하지 않는다', () => {
    const n = buildAptNarrative(base)!;
    expect(n.text).toContain('최근 12개월 사이');
    expect(n.text).toContain('8% 상승'); // saleTrend.changePct=8 (원자료 first/last +13%이 아님)
    expect(n.text).not.toContain('13% 상승'); // 원자료 기준을 쓰지 않음을 확인
    expect(n.text).not.toContain('최근 매매 2건'); // perPage=30 캡 위험 → 절대 건수 미서술
  });

  it('tTrend: saleTrend가 하락이면 하락으로, 없으면 방향 단정 없이 최근가만', () => {
    const down = buildAptNarrative({ ...base, saleTrend: { changePct: -10, changeMonths: 9 } })!;
    expect(down.text).toContain('최근 9개월 사이');
    expect(down.text).toContain('10% 하락');

    const none = buildAptNarrative({ ...base, saleTrend: null })!;
    expect(none.text).toContain(`최근 실거래가는 ${formatBillion(90000)}입니다`);
    expect(none.text).not.toContain('상승');
    expect(none.text).not.toContain('하락');
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
    const n = buildAptNarrative({ ...base, infra: [{ label: '카페', count: 8, capped: false }, { label: '병원', count: 2, capped: false }, { label: '마트', count: 3, capped: false }] })!;
    expect(n.text).toContain('양호한 편입니다');
  });

  it('aAccess: 캡(INFRA_FETCH_LIMIT)에 걸린 인프라는 "N곳 이상"으로 표기해 위젯의 "N+"와 일치시킨다', () => {
    const n = buildAptNarrative({
      ...base,
      infra: [{ label: '병원', count: 12, capped: true }, { label: '카페', count: 8, capped: false }],
    })!;
    expect(n.text).toContain('병원 12곳 이상');
    expect(n.text).toContain('카페 8곳');
    expect(n.text).not.toContain('병원 12곳,'); // 단정형 "12곳"이 아님
  });

  it('aAccess: 역만 있고 인프라<2면 완결된 문장을 만든다', () => {
    const n = buildAptNarrative({ ...base, infra: [{ label: '카페', count: 8, capped: false }] })!;
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
      infra: [{ label: '카페', count: 8, capped: false }], // 1종 → aAccess null
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

describe('파생지표 서술(floor/flags) — 색인 게이트 통과 후에만 조건부 발화', () => {
  it('floorPremium 양수 기울기: "층이 높을수록 … 오르는 경향"', () => {
    const n = buildAptNarrative({ ...base, floorPremium: { pyeong: 34, n: 22, pctPerFloor: 0.8, r2: 0.41 } })!;
    expect(n.fired).toContain('floor');
    expect(n.text).toContain('34평형은 층이 높을수록');
    expect(n.text).toContain('약 0.8% 오르는 경향');
    expect(n.text).toContain('R² 0.41');
  });

  it('floorPremium 음수 기울기: "층이 낮을수록 … 높게 나타나는 경향"(구조 분기)', () => {
    const n = buildAptNarrative({ ...base, floorPremium: { pyeong: 24, n: 15, pctPerFloor: -1.2, r2: 0.33 } })!;
    expect(n.text).toContain('24평형은 층이 낮을수록');
    expect(n.text).toContain('약 1% 높게 나타나는 경향'); // |-1.2|→반올림 1
    expect(n.text).not.toContain('오르는 경향');
  });

  it('floorPremium 효과 미미(|pct|<0.1)면 발화하지 않는다', () => {
    const n = buildAptNarrative({ ...base, floorPremium: { pyeong: 24, n: 15, pctPerFloor: 0.05, r2: 0.5 } })!;
    expect(n.fired).not.toContain('floor');
  });

  it('flags: 해제·이상치 둘 다면 두 항목을 잇는다', () => {
    const n = buildAptNarrative({
      ...base,
      flags: { cancelledCount12m: 2, anomalyCount12m: 3, topAnomaly: { pyeong: 34, date: '2026-05-01', price: 120000, deviationPct: 18 } },
    })!;
    expect(n.fired).toContain('flags');
    expect(n.text).toContain('해제 신고 2건과');
    expect(n.text).toContain('벗어난 거래 3건이 집계됩니다');
  });

  it('flags: 한 항목만이면 그 항목만 서술', () => {
    const n = buildAptNarrative({ ...base, flags: { cancelledCount12m: 0, anomalyCount12m: 1, topAnomaly: null } })!;
    expect(n.text).toContain('벗어난 거래 1건이 집계됩니다');
    expect(n.text).not.toContain('해제 신고');
  });

  it('파생지표는 색인 게이트를 바꾸지 않는다: core<3면 floorPremium이 있어도 null', () => {
    const n = buildAptNarrative({
      ...base,
      saleDeals: [], regionAvgSaleManwon: null, nearestStation: null,
      infra: [{ label: '카페', count: 8, capped: false }],
      floorPremium: { pyeong: 34, n: 22, pctPerFloor: 0.8, r2: 0.41 },
    });
    expect(n).toBeNull(); // core는 scale만 → 게이트 미달 → 파생 있어도 색인 서술 없음
  });

  it('파생지표 부재(기존 입력)면 fired는 core 4키 그대로 — 하위호환', () => {
    expect(buildAptNarrative(base)!.fired).toEqual(['scale', 'trend', 'peer', 'access']);
  });
});
