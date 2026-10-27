import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HospitalTabOperation } from '@/app/(public)/medical/hospital/[sigunguCode]/[id]/_components/hospital-tab-operation';
import { effectiveHours } from '@/lib/hospital/hours';
import { buildHospitalFaq } from '@/lib/faq/builders/hospital';

(globalThis as unknown as { React: typeof React }).React = React;

const nemc = {
  hospitalId: 1n, hpid: 'A1', openMon: 1430, closeMon: 2100, openTue: null, closeTue: null, openWed: null, closeWed: null,
  openThu: null, closeThu: null, openFri: null, closeFri: null, openSat: 1000, closeSat: 1400, openSun: null, closeSun: null,
  openHol: null, closeHol: null, note: '점심시간 13:00~14:30', fetchedAt: new Date('2026-10-27T03:00:00Z'),
};

describe('진료시간 탭', () => {
  it('nemc 출처면 요일표·안내·출처 줄(조회일·전화)', () => {
    const html = renderToStaticMarkup(createElement(HospitalTabOperation, {
      detail: null, transits: [], hours: effectiveHours(null, nemc as never), tel: '055-245-3567',
    }));
    expect(html).toContain('14:30 ~ 21:00');
    expect(html).toContain('안내: 점심시간 13:00~14:30');
    expect(html).toContain('출처: 국립중앙의료원 전국 병·의원 찾기 · 2026-10-27 조회');
    expect(html).toContain('방문 전 전화(055-245-3567)로 확인하세요.');
  });
  it('hira 출처면 출처 줄 없음(기존 화면 그대로)', () => {
    const detail = { openMon: 900, closeMon: 1800 } as never;
    const html = renderToStaticMarkup(createElement(HospitalTabOperation, {
      detail, transits: [], hours: effectiveHours(detail, nemc as never), tel: null,
    }));
    expect(html).toContain('09:00 ~ 18:00');
    expect(html).not.toContain('국립중앙의료원');
  });
  it('진료시간도 상세도 교통도 없으면 기존 빈 문구', () => {
    const html = renderToStaticMarkup(createElement(HospitalTabOperation, { detail: null, transits: [], hours: null, tel: null }));
    expect(html).toContain('운영·교통 정보가 등록되어 있지 않습니다.');
  });
});

describe('FAQ 진료시간', () => {
  const base = { name: 'X의원', typeName: '의원', sigungu: null, sido: null, depts: [], totalDoctors: null, detail: null };
  it('nemc 값이면 출처도 국립중앙의료원', () => {
    const items = buildHospitalFaq({ ...base, hours: { monday: '14:30 ~ 21:00', source: 'nemc' } });
    const q = items.find((i) => i.q.includes('진료시간'))!;
    expect(q.a).toContain('14:30 ~ 21:00');
    expect(q.source).toBe('국립중앙의료원');
  });
  it('월요일 값이 없으면 문항 없음', () => {
    expect(buildHospitalFaq({ ...base, hours: null }).some((i) => i.q.includes('진료시간'))).toBe(false);
  });
});
