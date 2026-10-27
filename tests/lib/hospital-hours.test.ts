import { describe, it, expect } from 'vitest';
import { effectiveHours, hiraHasHours } from '@/lib/hospital/hours';

const empty: Record<string, number | null> = {
  openMon: null, closeMon: null, openTue: null, closeTue: null, openWed: null, closeWed: null,
  openThu: null, closeThu: null, openFri: null, closeFri: null, openSat: null, closeSat: null,
  openSun: null, closeSun: null,
};
const detail = (o: Record<string, number | null>) => ({ ...empty, ...o }) as never;
const nemc = (o: Record<string, unknown>) =>
  ({ ...empty, openHol: null, closeHol: null, note: null, hpid: 'H', hospitalId: 1n, fetchedAt: new Date('2026-10-27T00:00:00Z'), ...o }) as never;

describe('effectiveHours', () => {
  it('심평원 값이 하나라도 있으면 심평원만(요일 섞지 않음)', () => {
    const r = effectiveHours(detail({ openMon: 900, closeMon: 1800 }), nemc({ openTue: 900, closeTue: 1800 }))!;
    expect(r.source).toBe('hira');
    expect(r.days).toEqual([{ label: '월', hours: '09:00 ~ 18:00' }]);
  });
  it('심평원이 비어 있으면 nemc, 공휴일 줄은 맨 아래', () => {
    const r = effectiveHours(detail({}), nemc({ openMon: 1430, closeMon: 2100, openHol: 900, closeHol: 1300, note: '점심시간 13:00~14:30' }))!;
    expect(r.source).toBe('nemc');
    expect(r.days.map((d) => d.label)).toEqual(['월', '공휴일']);
    expect(r.note).toBe('점심시간 13:00~14:30');
    expect(r.fetchedAt).toEqual(new Date('2026-10-27T00:00:00Z'));
  });
  it('심평원 값이 모순(종료<시작)뿐이어도 심평원 우선 — 표시할 요일 없음', () => {
    const r = effectiveHours(detail({ openMon: 1800, closeMon: 900 }), nemc({ openMon: 900, closeMon: 1800 }));
    expect(r?.source).toBe('hira');
    expect(r?.days).toEqual([]);
  });
  it('nemc의 잘못된 값(2500, 0000~0000)은 요일표에서 빠진다', () => {
    const r = effectiveHours(null, nemc({ openMon: 900, closeMon: 2500, openTue: 0, closeTue: 0, openWed: 900, closeWed: 1800 }))!;
    expect(r.days).toEqual([{ label: '수', hours: '09:00 ~ 18:00' }]);
  });
  it('공휴일만 있으면 요일표엔 공휴일, 오늘 진료(at)는 null', () => {
    const r = effectiveHours(null, nemc({ openHol: 900, closeHol: 1300 }))!;
    expect(r.days).toEqual([{ label: '공휴일', hours: '09:00 ~ 13:00' }]);
    expect(r.at(1)).toBeNull();
  });
  it('at(jsDay)·monday는 같은 출처에서', () => {
    const r = effectiveHours(null, nemc({ openMon: 930, closeMon: 1830, openSun: 1000, closeSun: 1300 }))!;
    expect(r.at(1)).toBe('09:30 ~ 18:30');
    expect(r.at(0)).toBe('10:00 ~ 13:00');
    expect(r.monday).toBe('09:30 ~ 18:30');
  });
  it('둘 다 없으면 null', () => {
    expect(effectiveHours(null, null)).toBeNull();
    expect(effectiveHours(detail({}), null)).toBeNull();
  });
  it('hiraHasHours는 14칸 중 하나라도 non-null', () => {
    expect(hiraHasHours(detail({ closeSat: 1300 }))).toBe(true);
    expect(hiraHasHours(detail({}))).toBe(false);
    expect(hiraHasHours(null)).toBe(false);
  });
});
