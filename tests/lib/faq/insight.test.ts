import { describe, it, expect } from 'vitest';
import { buildingFaq, maintenanceFaq, schoolZoneFaq, subscriptionResultsFaq } from '@/lib/faq/builders/insight';
import type { MaintenanceView } from '@/lib/insights/maintenance-cost';
import type { SchoolZoneView } from '@/lib/insights/school-zone';
import type { BuildingView } from '@/lib/insights/building-register';
import { buildResultsView } from '@/lib/insights/subscription-results';

const FORBIDDEN = /좋|유리|추천|당첨 가능|불리/;

const mv = (over: Partial<MaintenanceView> = {}): MaintenanceView =>
  ({
    yearMonth: '202608',
    monthLabel: '2026년 8월',
    heatType: '지역난방',
    households: 100,
    manageArea: 8000,
    perHousehold: true,
    commonPerM2: 1250,
    commonAmount: 100000,
    comparison: { sigunguName: '서초구', pct: 12, label: '높음', sampleCount: 214, medianPerM2: 1120 },
    totalAmount: 200000,
    commonItems: [{ label: '인건비', amount: 42300 }, { label: '청소비', amount: 10000 }],
    individualItems: [],
    individualTotal: 0,
    barMax: 0,
    trend: null,
    trendRangeLabel: null,
    seasonal: null,
    individualHeating: false,
    ltr: null,
    fetchedAt: new Date(),
    ...over,
  }) as MaintenanceView;

describe('maintenanceFaq', () => {
  it('비교·최대 항목·난방 방식', () => {
    const f = maintenanceFaq('래미안서초', mv())!;
    expect(f.q).toBe('래미안서초 관리비는 같은 서초구 아파트와 비교하면 어느 수준인가요?');
    expect(f.a).toBe(
      '2026년 8월 부과분 공용관리비는 ㎡당 1,250원으로, 서초구 아파트 중앙값(1,120원)보다 약 12% 높은 수준입니다. 비교 대상은 같은 달 관리비가 공개된 서초구 아파트 214개 단지입니다. 공용관리비 중 가장 큰 항목은 인건비로 세대당 월 42,300원입니다. 난방 방식은 지역난방입니다.',
    );
    expect(f.source).toContain('임장ON 계산');
    expect(f.a).not.toMatch(FORBIDDEN);
  });
  it('낮음·비슷함', () => {
    expect(maintenanceFaq('A', mv({ comparison: { sigunguName: '서초구', pct: -8, label: '낮음', sampleCount: 9, medianPerM2: 1300 } }))!.a).toContain('약 8% 낮은 수준입니다');
    expect(maintenanceFaq('A', mv({ comparison: { sigunguName: '서초구', pct: 3, label: '비슷함', sampleCount: 9, medianPerM2: 1200 } }))!.a).toContain('비슷한 수준입니다');
  });
  it('세대수 미상이면 단지 전체 월, 기타만 있으면 최대 항목 문장 생략, 난방 없으면 생략', () => {
    const a = maintenanceFaq('A', mv({ perHousehold: false, heatType: null }))!.a;
    expect(a).toContain('단지 전체 월 42,300원');
    expect(a).not.toContain('난방 방식');
    expect(maintenanceFaq('A', mv({ commonItems: [{ label: '기타', amount: 5 }] }))!.a).not.toContain('가장 큰 항목');
    // '기타'는 크기와 무관하게 맨 뒤에 붙는다 — 기타가 가장 크면 이름 있는 항목을 '가장 큰'이라 하지 않는다.
    expect(maintenanceFaq('A', mv({ commonItems: [{ label: '청소비', amount: 100 }, { label: '기타', amount: 500 }] }))!.a).not.toContain('가장 큰 항목');
  });
  it("난방 방식은 개별·지역·중앙난방만 문장으로('기타'·'개별난방+기타'는 생략)", () => {
    expect(maintenanceFaq('A', mv({ heatType: '기타' }))!.a).not.toContain('난방 방식');
    expect(maintenanceFaq('A', mv({ heatType: '개별난방+기타' }))!.a).not.toContain('난방 방식');
    expect(maintenanceFaq('A', mv({ heatType: '개별난방' }))!.a).toContain('난방 방식은 개별난방입니다.');
  });
  it('뷰 없음·비교 없음이면 null', () => {
    expect(maintenanceFaq('A', null)).toBeNull();
    expect(maintenanceFaq('A', mv({ comparison: null }))).toBeNull();
  });
});

const sz = (over: Partial<SchoolZoneView> = {}): SchoolZoneView => ({
  zoneName: '서초초',
  kind: 'general',
  kindLabel: null,
  eduName: '서울특별시강남서초교육지원청',
  baseDateLabel: '2025-09-22',
  loadedAtLabel: null,
  primary: [{ name: '서초초등학교', href: null, distanceLabel: '약 420m' }],
  others: [],
  ...over,
});

describe('schoolZoneFaq', () => {
  it('학교 1곳: 거리와 교육지원청', () => {
    const f = schoolZoneFaq('래미안서초', sz())!;
    expect(f.q).toBe('래미안서초는 어느 초등학교 통학구역인가요?');
    expect(f.a).toBe(
      '학구도상 서초초등학교 통학구역에 속하며, 단지 대표 위치에서 직선거리로 약 420m입니다(임장ON 계산). 같은 단지라도 동·호수에 따라 배정이 다를 수 있어, 입학 전에는 서울특별시강남서초교육지원청에 확인하세요(학구도 기준일 2025-09-22).',
    );
  });
  it('여러 학교·광역, 교육지원청 미상', () => {
    const a = schoolZoneFaq('힐스테이트', sz({
      kind: 'shared', kindLabel: '공동통학구역', eduName: null,
      primary: [{ name: 'A초등학교', href: null, distanceLabel: '약 300m' }, { name: 'B초등학교', href: null, distanceLabel: null }],
      others: [{ name: 'C초등학교', href: null, distanceLabel: null }],
    }))!.a;
    expect(a).toContain('공동통학구역으로, 학구도상 A초등학교·B초등학교가 함께 지정돼 있습니다.');
    expect(a).not.toContain('직선거리');
    expect(a).toContain('광역통학구역으로 함께 지정된 학교는 C초등학교입니다.');
    expect(a).toContain('관할 교육지원청에 확인하세요');
    const b = schoolZoneFaq('X', sz({ kindLabel: null, primary: [{ name: 'A초등학교', href: null, distanceLabel: null }, { name: 'B초등학교', href: null, distanceLabel: null }] }))!.a;
    expect(b).toContain('학구도상 A초등학교·B초등학교가 함께 지정된 구역입니다.');
  });
  it('뷰 없음·학교 없음이면 null', () => {
    expect(schoolZoneFaq('A', null)).toBeNull();
    expect(schoolZoneFaq('A', sz({ primary: [] }))).toBeNull();
  });
});

const bv = (over: Partial<BuildingView> = {}): BuildingView =>
  ({
    tiles: [
      { label: '사용승인', value: '7년차', sub: '2019년 8월' },
      { label: '규모', value: '지상 6층' },
      { label: '주차', value: '세대당 0.86대', sub: '총 12대' },
      { label: '승강기', value: '1대' },
    ],
    rows: [{ label: '주용도', value: '공동주택', note: '기타: 공동주택, 제1종근린생활시설' }],
    neighborhoodNotice: false,
    createdLabel: null,
    fetchedLabel: '2026-10-20',
    formula: null,
    ...over,
  }) as BuildingView;

describe('buildingFaq', () => {
  it('사용승인·주차·규모·승강기·용도', () => {
    const f = buildingFaq('서초빌라하우스', bv())!;
    expect(f.q).toBe('서초빌라하우스는 언제 지어졌고 주차는 어떤가요?');
    expect(buildingFaq('센트럴101', bv())!.q).toBe('센트럴101은 언제 지어졌고 주차는 어떤가요?');
    expect(f.a).toBe(
      '건축물대장상 2019년 8월에 사용승인을 받아 7년차입니다. 주차는 세대당 0.86대(총 12대, 임장ON 계산)입니다. 지상 6층 건물에 승강기 1대가 있습니다. 주용도는 공동주택(기타 용도: 공동주택, 제1종근린생활시설)입니다.',
    );
    expect(f.source).toBe('국토교통부 건축물대장 · 2026-10-20 조회');
    expect(f.a).not.toMatch(FORBIDDEN);
  });
  it("승강기 0대는 '없습니다'", () => {
    const a = buildingFaq('A', bv({ tiles: [{ label: '사용승인', value: '3년차', sub: '2023년 1월' }, { label: '규모', value: '지상 4층' }, { label: '승강기', value: '0대' }] }))!.a;
    expect(a).toContain('지상 4층 건물이고 승강기는 없습니다.');
    expect(a).not.toContain('0대가');
  });
  it('주차 총대수만·승강기 없음', () => {
    const a = buildingFaq('A', bv({ tiles: [{ label: '사용승인', value: '3년차', sub: '2023년 1월' }, { label: '주차', value: '총 5대' }, { label: '규모', value: '지상 4층' }], rows: [] }))!.a;
    expect(a).toContain('주차는 총 5대입니다.');
    expect(a).toContain('지상 4층 건물입니다.');
    expect(a).not.toContain('주용도');
  });
  it('사용승인·주차 모두 없거나 뷰 없음이면 null', () => {
    expect(buildingFaq('A', bv({ tiles: [{ label: '승강기', value: '1대' }] }))).toBeNull();
    expect(buildingFaq('A', null)).toBeNull();
  });
});

const cmp = (ty: string, rank: number, secd: string, rate: string, req: string, sup: number) => ({
  HOUSE_TY: ty, SUBSCRPT_RANK_CODE: rank, RESIDE_SECD: secd, CMPET_RATE: rate, REQ_CNT: req, SUPLY_HSHLDCO: sup,
});
const data = (v: ReturnType<typeof buildResultsView>) => (v ? { view: v, fetchedLabel: '2026-10-21' } : null);

describe('subscriptionResultsFaq', () => {
  it('APT 경쟁 공고: 전체·최고·특별공급 최고·가점 최저', () => {
    const v = buildResultsView(
      'APT',
      [cmp('059.9800 ', 1, '01', '1692.33', '10154', 6), cmp('084.9700A', 1, '01', '467.53', '8883', 19)],
      [
        { HOUSE_TY: '059.9800 ', RESIDE_SENM: '해당지역', LWET_SCORE: '70', AVRG_SCORE: '70', TOP_SCORE: '70' },
        { HOUSE_TY: '084.9700A', RESIDE_SENM: '해당지역', LWET_SCORE: '69', AVRG_SCORE: '70.07', TOP_SCORE: '74' },
      ],
      [{ HOUSE_TY: 'x', LFE_FRST_HSHLDCO: 7, CRSPAREA_LFE_FRST_CNT: 4884, YGMN_HSHLDCO: 2, CRSPAREA_YGMN_CNT: 10 }],
    );
    const f = subscriptionResultsFaq('역삼센트럴자이', data(v))!;
    expect(f.q).toBe('역삼센트럴자이 청약 경쟁률은 어땠나요?');
    expect(f.a).toBe(
      '1순위 해당지역 전체 경쟁률은 761.48대 1입니다(임장ON 계산: 접수 합 ÷ 일반공급 합). 가장 높은 주택형은 59.98㎡로 1,692.33대 1이었습니다. 특별공급은 생애최초가 697.71대 1로 가장 높았습니다(임장ON 계산: 접수 ÷ 배정). 당첨 가점 최저는 69점(84.97㎡ A, 해당지역)이었습니다.',
    );
    expect(f.source).toBe('한국부동산원 청약홈 · 2026-10-21 조회');
    expect(f.a).not.toMatch(FORBIDDEN);
  });
  it('미달 공고: 최고 주택형 대신 최종 미달', () => {
    const v = buildResultsView('APT', [cmp('084.9500A', 1, '01', '(△236)', '183', 419), cmp('084.9500A', 2, '01', '(△164)', '6', 419)], null, null);
    const a = subscriptionResultsFaq('소제지구', data(v))!.a;
    expect(a).toContain('2순위까지 접수한 뒤에도 164세대가 미달됐습니다(청약홈 공식 집계).');
    expect(a).not.toContain('가장 높은 주택형');
  });
  it('요약 경쟁률이 숨겨진 공고(해당지역 배정)는 전체 경쟁률 문장 없음', () => {
    const v = buildResultsView('APT', [cmp('084.0000A', 1, '01', '4.05', '81', 67)], null, null);
    const a = subscriptionResultsFaq('평택', data(v))!.a;
    expect(a).not.toContain('전체 경쟁률');
    expect(a).toContain('가장 높은 주택형은 84.00㎡ A로 4.05대 1이었습니다.');
  });
  it('그 외 유형: 최고 경쟁률·미달 수', () => {
    const v = buildResultsView('OFFICETEL_ETC', [
      { HOUSE_TY: '1', RESIDNT_PRIOR_SENM: '거주자우선', SUPLY_HSHLDCO: 182, REQ_CNT: '270', CMPET_RATE: '7.50' },
      { HOUSE_TY: '6', RESIDNT_PRIOR_SENM: '기타', SUPLY_HSHLDCO: 280, REQ_CNT: '125', CMPET_RATE: '(△14)' },
    ], null, null);
    const a = subscriptionResultsFaq('힐스테이트', data(v))!.a;
    expect(a).toBe('가장 높은 곳은 타입 1(거주자우선)로 7.50대 1이었습니다. 1개 타입에서 미달이 났습니다(청약홈 공식값).');
  });
  it('오피스텔 미달은 타입별 마지막 구분 행으로만 센다(실측: 거주자우선 미달을 기타가 채움)', () => {
    const o = buildResultsView('OFFICETEL_ETC', [
      { HOUSE_TY: '90B', RESIDNT_PRIOR_SENM: '거주자우선', SUPLY_HSHLDCO: 3, REQ_CNT: '0', CMPET_RATE: '(△1)' },
      { HOUSE_TY: '90B', RESIDNT_PRIOR_SENM: '기타', SUPLY_HSHLDCO: 3, REQ_CNT: '5', CMPET_RATE: '1.67' },
      { HOUSE_TY: '82A', RESIDNT_PRIOR_SENM: '거주자우선', SUPLY_HSHLDCO: 148, REQ_CNT: '20', CMPET_RATE: '(△9)' },
      { HOUSE_TY: '82A', RESIDNT_PRIOR_SENM: '기타', SUPLY_HSHLDCO: 148, REQ_CNT: '109', CMPET_RATE: '(△19)' },
    ], null, null);
    expect(subscriptionResultsFaq('A', data(o))!.a).toContain('1개 타입에서 미달이 났습니다');
  });
  it('가점 지역이 비면 괄호에 넣지 않는다', () => {
    const v = buildResultsView('APT', [cmp('084.0000A', 1, '01', '2.00', '20', 10)], [{ HOUSE_TY: '084.0000A', RESIDE_SENM: '', LWET_SCORE: '45', AVRG_SCORE: '50', TOP_SCORE: '60' }], null);
    expect(subscriptionResultsFaq('A', data(v))!.a).toContain('당첨 가점 최저는 45점(84.00㎡ A)이었습니다.');
  });
  it("구분이 '전체'면 괄호 생략, 주택형 뒤 조사", () => {
    const o = buildResultsView('OFFICETEL_ETC', [{ HOUSE_TY: '83B', RESIDNT_PRIOR_SENM: '전체', SUPLY_HSHLDCO: 3, REQ_CNT: '30', CMPET_RATE: '10.00' }], null, null);
    expect(subscriptionResultsFaq('A', data(o))!.a).toBe('가장 높은 곳은 타입 83B로 10.00대 1이었습니다.');
    const r = buildResultsView('REMNANT', [{ HOUSE_TY: '074.6900 ', SUPLY_HSHLDCO: 1, REQ_CNT: '75', CMPET_RATE: '75.00' }], null, null);
    expect(subscriptionResultsFaq('A', data(r))!.a).toBe('가장 높은 곳은 74.69㎡로 75.00대 1이었습니다.');
  });
  it('결과 없음이면 null', () => {
    expect(subscriptionResultsFaq('A', null)).toBeNull();
  });
});
