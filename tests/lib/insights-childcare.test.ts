import { describe, it, expect } from 'vitest';
import { buildChildcareNarrative, type ChildcareInsightInput } from '@/lib/insights/childcare';

const base: ChildcareInsightInput = {
  name: '광교샛별어린이집',
  crType: '민간',
  capacity: 69,
  currentCount: 57,
  emRoleTeacher: 17,
  sigunguFillMedian: null,
  waitByAge: [{ label: '만 0세', count: 35 }, { label: '만 1세', count: 2 }, { label: '만 2세', count: 2 }],
  roomSize: 187,
  cctvCount: 8,
  vehicleOp: '운영',
  nearestStation: { name: '상현역', lines: ['신분당선'], distanceMeters: 1100 },
  infra: [{ label: '카페', count: 8 }, { label: '병원', count: 2 }],
  nearbyAptSaleManwon: [90000, 120000, 165000],
};

describe('buildChildcareNarrative', () => {
  it('풍부한 데이터면 이름으로 시작하고 핵심 모듈이 발화', () => {
    const n = buildChildcareNarrative(base)!;
    expect(n.sentences[0].startsWith('광교샛별어린이집은')).toBe(true);
    expect(n.fired).toContain('occupancy');
    expect(n.fired).toContain('wait');
    expect(n.fired).toContain('access');
    expect(n.fired).toContain('price');
  });
  it('충원율 구간: 57/69=83% → 보통 수준', () => {
    expect(buildChildcareNarrative(base)!.text).toContain('충원율 83%로 보통 수준');
  });
  it('충원율 구간: <70% → 여유', () => {
    const n = buildChildcareNarrative({ ...base, currentCount: 40 })!; // 40/69=58%
    expect(n.text).toContain('정원에 여유가 있는 편');
  });
  it('대기: 최다 연령 share≥60%면 경쟁 치열 문장', () => {
    // 35/(35+2+2)=90%
    expect(buildChildcareNarrative(base)!.text).toContain('만 0세가 35명(약 90%)');
    expect(buildChildcareNarrative(base)!.text).toContain('경쟁이 특히 치열');
  });
  it('보육교사당 원아: 57/17≈3.4명(보육교사 기준 문구)', () => {
    expect(buildChildcareNarrative(base)!.text).toContain('보육교사 17명 기준 1인당 원아 약 3.4명');
  });
  it('시설: 원아 1인당 보육실 면적·CCTV·통학차량', () => {
    const t = buildChildcareNarrative(base)!.text;
    expect(t).toContain('보육실 약 3.3㎡'); // 187/57=3.28→3.3
    expect(t).toContain('CCTV 8대');
    expect(t).toContain('통학차량 운영');
  });
  it('가드: 핵심(충원율·대기) 미발화 & 3모듈 미만이면 null', () => {
    const n = buildChildcareNarrative({
      ...base, capacity: null, currentCount: null, waitByAge: [],
      roomSize: null, cctvCount: null, vehicleOp: null,
      nearestStation: null, infra: [{ label: '카페', count: 8 }], nearbyAptSaleManwon: [],
    });
    expect(n).toBeNull();
  });
  it('고유성: 충원율이 다르면 결론 문장이 달라진다', () => {
    const a = buildChildcareNarrative(base)!;
    const b = buildChildcareNarrative({ ...base, currentCount: 40 })!;
    expect(a.text).not.toEqual(b.text);
  });
  it('충원율 구간: ≥90% → 정원에 거의 찬 편', () => {
    const n = buildChildcareNarrative({ ...base, currentCount: 66 })!; // 66/69=95.6%→96%
    expect(n.text).toContain('정원에 거의 찬 편');
  });

  it('대기: 최다 연령 share<60%면 "가장 많습니다"(치열 아님)', () => {
    const n = buildChildcareNarrative({
      ...base,
      waitByAge: [{ label: '만 0세', count: 2 }, { label: '만 1세', count: 2 }], // top share 50%
    })!;
    expect(n.text).toContain('가장 많습니다');
    expect(n.text).not.toContain('경쟁이 특히 치열');
  });

  it('시설: vehicleOp 미운영이면 통학차량 문구 없음', () => {
    const n = buildChildcareNarrative({ ...base, vehicleOp: '미운영' })!;
    expect(n.text).not.toContain('통학차량');
  });

  it('대기 라벨이 자음 종성(6세 이상)이면 조사 "이" 처리', () => {
    const n = buildChildcareNarrative({
      ...base,
      waitByAge: [{ label: '6세 이상', count: 10 }, { label: '만 0세', count: 1 }], // top share ~91%
    })!;
    expect(n.text).toContain('6세 이상이');
    expect(n.text).not.toContain('6세 이상가');
  });
});

// mk: 충원율 벤치마크·교사비율 케이스 전용 공용 픽스처(위 base와는 별개 이름 — 상단 base와 충돌 방지).
const mk = (o: Partial<ChildcareInsightInput> = {}) =>
  buildChildcareNarrative({
    name: '햇살어린이집', crType: '국공립', capacity: 100, currentCount: 90,
    emRoleTeacher: 15, sigunguFillMedian: 0.7,
    waitByAge: [{ label: '만 1세', count: 5 }], roomSize: 200, cctvCount: 10, vehicleOp: '운영',
    nearestStation: null, infra: [], nearbyAptSaleManwon: [], ...o,
  });

describe('충원율 시군구 중앙값 벤치마크', () => {
  it('중앙값보다 높으면 "높은"', () => {
    expect(mk({ currentCount: 90, sigunguFillMedian: 0.7 })!.text).toContain('같은 시군구 중앙값보다 높은');
  });
  it('중앙값과 비슷하면 "비슷한"', () => {
    expect(mk({ currentCount: 72, sigunguFillMedian: 0.7 })!.text).toContain('같은 시군구 중앙값과 비슷한');
  });
  it('중앙값보다 낮으면 "낮은"', () => {
    expect(mk({ currentCount: 50, sigunguFillMedian: 0.7 })!.text).toContain('같은 시군구 중앙값보다 낮은');
  });
  it('중앙값 없으면 절대 기준 폴백', () => {
    expect(mk({ currentCount: 95, sigunguFillMedian: null })!.text).toContain('정원에 거의 찬');
  });
});

describe('교사비율 보육교사 기준', () => {
  it('보육교사 분모로 서술', () => {
    // 90 / 15 = 6.0
    expect(mk({ currentCount: 90, emRoleTeacher: 15 })!.text).toContain('보육교사 15명 기준 1인당 원아 약 6.0명');
  });
  it('보육교사 없으면 교사비율 문장 생략', () => {
    const t = mk({ emRoleTeacher: null })!.text;
    expect(t).not.toContain('보육교사');
    expect(t).not.toContain('1인당 원아');
  });
});
