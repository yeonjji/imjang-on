import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HospitalTabs } from '@/app/(public)/medical/hospital/[sigunguCode]/[id]/_components/hospital-tabs';
import type { HospitalWithRelations } from '@/lib/hospital';

// 컴포넌트는 자동 JSX 런타임(React import 없음)을 쓰지만 vitest(esbuild)는 classic 런타임으로
// 변환해 React.createElement를 전역에서 찾는다. 전역 shim으로 맞춘다.(location-viewer-ssr.test.ts와 동일)
(globalThis as unknown as { React: typeof React }).React = React;

// facility/detail가 truthy면 각 패널의 '병상 현황'/'진료시간' 헤딩이 렌더된다.
// 나머지 배열 필드는 빈 배열이면 충분(각 패널이 빈 상태를 안전하게 처리).
const mockHospital = {
  depts: [], staff: [], specialties: [], specialTreatments: [], nursingGrades: [],
  facility: {}, equipment: [], mealSurcharges: [],
  detail: {}, transits: [],
} as unknown as HospitalWithRelations;

describe('HospitalTabs SSR', () => {
  it('세 탭(진료·시설·운영) 패널 콘텐츠를 모두 초기 SSR 마크업에 포함한다', () => {
    const html = renderToStaticMarkup(createElement(HospitalTabs, { hospital: mockHospital }));
    expect(html).toContain('병상 현황'); // 시설 탭 — 현재는 누락
    expect(html).toContain('진료시간');   // 운영 탭 — 현재는 누락
  });
});
