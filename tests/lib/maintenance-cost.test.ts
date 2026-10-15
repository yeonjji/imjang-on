import { describe, it, expect } from 'vitest';
import {
  buildMaintenanceView, parseManageArea, heatKind, won, manWon, monthLabel, type MaintenanceMonth,
} from '@/lib/insights/maintenance-cost';

const F = new Date('2026-10-15T00:00:00Z');
function month(ym: string, o: Partial<MaintenanceMonth> = {}): MaintenanceMonth {
  return {
    yearMonth: ym,
    labor: 43_728_000, cleaning: 39_403_000, guard: 28_206_000, disinfection: 1_135_000, elevator: 2_077_000,
    homeNetwork: 0, consignFee: 830_000, repairs: 15_499_000, commonEtc: 5_273_000, commonTotal: 136_151_000,
    heat: 9_729_000, hotWater: 13_344_000, gas: 0, electricity: 172_894_000, water: 26_382_000, individualEtc: 10_684_000,
    ltrLevy: 52_459_240, ltrBalance: 1_312_406_334, ltrRate: 0,
    fetchedAt: F,
    ...o,
  };
}
const basis = { households: 1000, heatType: '지역난방', manageArea: 150_000, sigunguName: '연수구' };

describe('포맷터', () => {
  it('won·manWon·monthLabel', () => {
    expect(won(136291)).toBe('136,291원');
    expect(manWon(1_312_406_334)).toBe('13억 1,241만 원');
    expect(manWon(52_459_240)).toBe('5,246만 원');
    expect(manWon(200_000_000)).toBe('2억 원');
    expect(monthLabel('202608')).toBe('2026년 8월');
  });
});

describe('parseManageArea·heatKind', () => {
  it('rawJson.kaptMarea를 숫자로 읽고, 없거나 0이면 null', () => {
    expect(parseManageArea({ kaptMarea: '147835.27' })).toBeCloseTo(147835.27);
    expect(parseManageArea({ kaptMarea: 92214 })).toBe(92214);
    expect(parseManageArea({ kaptMarea: '0' })).toBeNull();
    expect(parseManageArea({})).toBeNull();
    expect(parseManageArea(null)).toBeNull();
  });
  it('난방 방식 분류', () => {
    expect(heatKind('지역난방')).toBe('shared');
    expect(heatKind('중앙난방')).toBe('shared');
    expect(heatKind('개별난방')).toBe('individual');
    expect(heatKind('개별난방+기타')).toBe('individual');
    expect(heatKind('')).toBe('other');
    expect(heatKind(null)).toBe('other');
  });
});

describe('buildMaintenanceView', () => {
  it('데이터 있는 달이 없으면 null', () => {
    expect(buildMaintenanceView([], basis, null)).toBeNull();
    expect(buildMaintenanceView([month('202608', { commonTotal: null })], basis, null)).toBeNull();
  });

  it('최신 월 기준으로 ㎡당·세대당·합계를 계산한다', () => {
    const v = buildMaintenanceView([month('202601'), month('202608')], basis, null)!;
    expect(v.yearMonth).toBe('202608');
    expect(v.commonPerM2).toBe(908); // 136,151,000 / 150,000
    expect(v.commonAmount).toBe(136_151); // ÷ 1000세대
    expect(v.perHousehold).toBe(true);
    // 공용 136,151,000 + 개별 233,033,000 + 장충 52,459,240 → ÷1000
    expect(v.totalAmount).toBe(421_643);
  });

  it('0원 항목은 빼고, 금액 내림차순, 기타는 마지막', () => {
    const v = buildMaintenanceView([month('202608')], basis, null)!;
    expect(v.commonItems.map((i) => i.label)).toEqual(['인건비', '청소비', '경비비', '수선·시설유지', '승강기', '소독비', '위탁수수료', '기타']);
    expect(v.individualItems.map((i) => i.label)).toEqual(['전기', '수도', '급탕', '난방', '기타']);
    expect(v.barMax).toBe(172_894);
  });

  it('구 비교: 표본 5개 이상만, ±5% 안은 비슷함', () => {
    const one = [month('202608')];
    expect(buildMaintenanceView(one, basis, { medianCommonPerM2: 1000, sampleCount: 4 })!.comparison).toBeNull();
    const lower = buildMaintenanceView(one, basis, { medianCommonPerM2: 1000, sampleCount: 30 })!.comparison!;
    expect(lower).toEqual({ sigunguName: '연수구', pct: -9, label: '낮음', sampleCount: 30, medianPerM2: 1000 });
    expect(buildMaintenanceView(one, basis, { medianCommonPerM2: 880, sampleCount: 30 })!.comparison!.label).toBe('비슷함');
    expect(buildMaintenanceView(one, basis, { medianCommonPerM2: 700, sampleCount: 30 })!.comparison!.label).toBe('높음');
  });

  it('관리면적이 없으면 ㎡당·구 비교·추이를 숨긴다', () => {
    const v = buildMaintenanceView(
      ['202603', '202604', '202605', '202608'].map((m) => month(m)),
      { ...basis, manageArea: null },
      { medianCommonPerM2: 1000, sampleCount: 30 },
    )!;
    expect(v.commonPerM2).toBeNull();
    expect(v.comparison).toBeNull();
    expect(v.trend).toBeNull();
    expect(v.commonAmount).toBe(136_151);
  });

  it('세대수가 없으면 단지 전체 금액으로 표시한다', () => {
    const v = buildMaintenanceView([month('202608')], { ...basis, households: null }, null)!;
    expect(v.perHousehold).toBe(false);
    expect(v.commonAmount).toBe(136_151_000);
    expect(v.ltr!.levyPerHousehold).toBeNull();
  });

  it('추이는 데이터 있는 달이 3개 이상일 때만', () => {
    expect(buildMaintenanceView([month('202601'), month('202608')], basis, null)!.trend).toBeNull();
    const v = buildMaintenanceView(['202606', '202607', '202608'].map((m) => month(m)), basis, null)!;
    expect(v.trend!.map((t) => t.label)).toEqual(['6월', '7월', '8월']);
  });

  it('겨울·여름: 지역·중앙난방이고 같은 해 1월과 8월(없으면 7월)이 있을 때만', () => {
    const months = [month('202601', { heat: 222_167_000, electricity: 103_614_000, hotWater: 19_457_000 }), month('202608')];
    const v = buildMaintenanceView(months, basis, null)!;
    expect(v.seasonal!.winterLabel).toBe('2026년 1월');
    expect(v.seasonal!.summerLabel).toBe('2026년 8월');
    expect(v.seasonal!.rows[0]).toEqual({ label: '난방', winter: 222_167, summer: 9_729 });
    expect(buildMaintenanceView(months, { ...basis, heatType: '개별난방' }, null)!.seasonal).toBeNull();
    expect(buildMaintenanceView([month('202608')], basis, null)!.seasonal).toBeNull();
  });

  it('개별난방이면 안내 플래그', () => {
    expect(buildMaintenanceView([month('202608')], { ...basis, heatType: '개별난방' }, null)!.individualHeating).toBe(true);
    expect(buildMaintenanceView([month('202608')], basis, null)!.individualHeating).toBe(false);
  });

  it('장기수선충당금: 적립요율 0은 숨기고, 둘 다 없으면 블록 없음', () => {
    const v = buildMaintenanceView([month('202608')], basis, null)!;
    expect(v.ltr).toEqual({ levy: 52_459_240, levyPerHousehold: 52_459, levyPerM2: 350, balance: 1_312_406_334, rate: null });
    expect(buildMaintenanceView([month('202608', { ltrRate: 3 })], basis, null)!.ltr!.rate).toBe(3);
    expect(buildMaintenanceView([month('202608', { ltrLevy: null, ltrBalance: null })], basis, null)!.ltr).toBeNull();
  });
});
