import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { School } from '@prisma/client';
import { SchoolInfo } from '@/app/(public)/school/[sigunguCode]/[id]/_components/school-info';
import { SchoolHero } from '@/app/(public)/school/[sigunguCode]/[id]/_components/school-hero';

// vitest(esbuild) classic 런타임 shim — amenity-hero-ssr.test.ts와 동일
(globalThis as unknown as { React: typeof React }).React = React;

const d = (s: string) => new Date(`${s}T00:00:00Z`);
function school(over: Partial<School>): School {
  return {
    id: 1n, sourceId: 'S1', name: '가락고등학교', address: '서울특별시 송파구 송이로 42',
    schoolKind: '고등학교', foundType: '공립', coeduType: '남여공학', region: '서울특별시',
    eduOffice: '서울특별시교육청', tel: '02-416-4658', homepage: null, sigunguCode: '11710',
    hsType: '일반고', hsTrack: '일반계', specialPurpose: null, admissionPeriod: '후기',
    foundedAt: d('1988-12-23'), anniversaryAt: d('1989-04-28'), updatedAt: new Date(),
    ...over,
  } as School;
}

describe('SchoolInfo', () => {
  it('고등학교: 고교 유형·계열·입학 전형·설립일·개교기념일', () => {
    const html = renderToStaticMarkup(createElement(SchoolInfo, { school: school({}), regionFullName: '서울 송파구' }));
    expect(html).toContain('일반고 · 일반계');
    expect(html).toContain('후기');
    expect(html).toContain('1988-12-23');
    expect(html).toContain('4월 28일');
  });

  it('초등학교에는 고교 전용 행이 없다(일반계·전기 기본값 무시)', () => {
    const html = renderToStaticMarkup(
      createElement(SchoolInfo, {
        school: school({ name: '경기초등학교', schoolKind: '초등학교', hsType: null, hsTrack: '일반계', admissionPeriod: '전기' }),
        regionFullName: '서울 종로구',
      }),
    );
    expect(html).not.toContain('고교 유형');
    expect(html).not.toContain('입학 전형');
    expect(html).not.toContain('전기');
  });

  it('값이 없는 행은 숨기고 지역 행은 남긴다', () => {
    const html = renderToStaticMarkup(
      createElement(SchoolInfo, {
        school: school({ tel: null, eduOffice: null, foundedAt: null, anniversaryAt: null }),
        regionFullName: '서울 송파구',
      }),
    );
    expect(html).not.toContain('>-<');
    expect(html).not.toContain('관할 교육청');
    expect(html).toContain('서울 송파구');
  });
});

describe('SchoolHero', () => {
  it('고등학교: 고교 유형 배지와 개교 N년', () => {
    const html = renderToStaticMarkup(createElement(SchoolHero, { school: school({}), nowYear: 2026 }));
    expect(html).toContain('일반고');
    expect(html).toContain('개교 37년');
  });

  it('개교기념일이 없으면 개교 문구 없음', () => {
    const html = renderToStaticMarkup(createElement(SchoolHero, { school: school({ anniversaryAt: null }), nowYear: 2026 }));
    expect(html).not.toContain('개교');
  });

  it('올해 개교는 "올해 개교"', () => {
    const html = renderToStaticMarkup(createElement(SchoolHero, { school: school({ anniversaryAt: d('2026-03-02') }), nowYear: 2026 }));
    expect(html).toContain('올해 개교');
  });
});
