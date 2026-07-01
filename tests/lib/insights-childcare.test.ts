import { describe, it, expect } from 'vitest';
import { buildChildcareNarrative, type ChildcareInsightInput } from '@/lib/insights/childcare';

const base: ChildcareInsightInput = {
  name: '광교샛별어린이집',
  crType: '민간',
  capacity: 69,
  currentCount: 57,
  staffCount: 17,
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
  it('교직원당 원아: 57/17≈3.4명', () => {
    expect(buildChildcareNarrative(base)!.text).toContain('원아 약 3.4명');
  });
  it('시설: 원아 1인당 보육실 면적·CCTV·통학차량', () => {
    const t = buildChildcareNarrative(base)!.text;
    expect(t).toContain('보육실 약 3.3㎡'); // 187/57=3.28→3.3
    expect(t).toContain('CCTV 8대');
    expect(t).toContain('통학차량 운영');
  });
  it('가드: 핵심(충원율·대기) 미발화 & 3모듈 미만이면 null', () => {
    const n = buildChildcareNarrative({
      ...base, capacity: null, currentCount: null, waitByAge: [], staffCount: null,
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
