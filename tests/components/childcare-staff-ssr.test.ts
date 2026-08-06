import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChildcareStaff } from '@/app/(public)/childcare/[sigunguCode]/[id]/_components/childcare-staff';
import type { Childcare } from '@prisma/client';

// 컴포넌트는 자동 JSX 런타임을 쓰지만 vitest(esbuild)는 classic 런타임으로 변환해
// React.createElement를 전역에서 찾는다. (amenity-hero-ssr.test.ts와 동일 shim)
(globalThis as unknown as { React: typeof React }).React = React;

// 실제 /childcare/11110/1 관측값: 총 17명인데 근속년수 합이 100 → 원본 em_cnt_*y는 비율(%)이다.
const item = {
  emRoleTot: 17,
  emRoleDirector: 1,
  emRoleTeacher: 13,
  emRoleCook: 2,
  emTenure0y: 39,
  emTenure1y: 15,
  emTenure2y: 15,
  emTenure4y: 0,
  emTenure6y: 31,
} as unknown as Childcare;

describe('ChildcareStaff 단위 표기', () => {
  it('근속년수는 원본이 비율이므로 %로 표기한다', () => {
    const html = renderToStaticMarkup(createElement(ChildcareStaff, { item }));
    expect(html).toContain('39%');
    expect(html).not.toContain('39명');
  });

  it('직역별은 실제 인원이므로 명으로 표기한다', () => {
    const html = renderToStaticMarkup(createElement(ChildcareStaff, { item }));
    expect(html).toContain('13명');
  });
});
