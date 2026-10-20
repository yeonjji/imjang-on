import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SchoolZoneSection } from '@/app/(public)/apt/[id]/_components/school-zone-section';
import type { SchoolZoneView } from '@/lib/insights/school-zone';

(globalThis as unknown as { React: typeof React }).React = React;

const general: SchoolZoneView = {
  zoneName: '서울대청초통학구역', kind: 'general', kindLabel: null, eduName: '서울특별시강남서초교육지원청', baseDateLabel: '2025-09-22',
  primary: [{ name: '서울대청초등학교', href: '/school/11680/458', distanceLabel: '약 290m' }], others: [],
};
const html = (v: SchoolZoneView | null) => renderToStaticMarkup(createElement(SchoolZoneSection, { view: v, id: 'school-zone' }));

describe('SchoolZoneSection', () => {
  it('view가 없으면 렌더하지 않는다', () => expect(html(null)).toBe(''));

  it('일반: 기본 학교 카드·링크·직선거리·공통 안내·출처', () => {
    const h = html(general);
    expect(h).toContain('id="school-zone"');
    expect(h).toContain('배정 초등학교');
    expect(h).toContain('단지 대표 위치 기준 통학구역');
    expect(h).toContain('서울대청초등학교');
    expect(h).toContain('직선거리 약 290m');
    expect(h).toContain('href="/school/11680/458"');
    expect(h).toContain('동·호수에 따라 다를 수 있습니다');
    expect(h).toContain('서울특별시강남서초교육지원청');
    expect(h).toContain('기준일 2025-09-22');
    expect(h).toContain('임장ON 계산');
  });

  it('공동: 배지와 안내문, 학교 목록', () => {
    const h = html({
      ...general, kind: 'shared', kindLabel: '공동통학구역', zoneName: '가람초나래초공동통학구역',
      primary: [{ name: '가람초등학교', href: '/school/1/1', distanceLabel: '약 300m' }, { name: '나래초등학교', href: null, distanceLabel: null }],
    });
    expect(h).toContain('공동통학구역');
    expect(h).toContain('여러 학교가 함께 지정된 구역입니다');
    expect(h).toContain('가람초등학교');
    expect(h).not.toContain('href="null"');
    expect(h).toMatch(/나래초등학교/);
  });

  it('광역: 함께 지정된 학교 목록', () => {
    const h = html({
      ...general, kind: 'wide', kindLabel: '광역통학구역', zoneName: '가남초광역통학구역',
      primary: [{ name: '가남초등학교', href: '/school/48330/1', distanceLabel: '약 580m' }],
      others: [{ name: '물금초등학교', href: '/school/48330/2', distanceLabel: '약 1.4km' }],
    });
    expect(h).toContain('광역통학구역으로 함께 지정된 학교');
    expect(h).toContain('물금초등학교');
    expect(h).toContain('직선 약 1.4km');
  });

  it('매칭 안 된 학교는 링크가 없다', () => {
    const h = html({ ...general, primary: [{ name: '없는초등학교', href: null, distanceLabel: null }] });
    expect(h).toContain('없는초등학교');
    expect(h).not.toMatch(/<a[^>]*>(?:(?!<\/a>).)*없는초등학교/);
  });

  it('교육지원청명이 없으면 "관할 교육지원청"', () => {
    expect(html({ ...general, eduName: null })).toContain('관할 교육지원청');
  });

  it('단정·평가 문구가 없다', () => {
    const h = html(general);
    for (const w of ['배정됩니다', '우수', '좋은 학교', '명문']) expect(h).not.toContain(w);
  });
});
