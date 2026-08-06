import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChildcareStaff } from '@/app/(public)/childcare/[sigunguCode]/[id]/_components/childcare-staff';
import type { Childcare } from '@prisma/client';

// 컴포넌트는 자동 JSX 런타임(React import 없음)을 쓰지만 vitest(esbuild)는 classic 런타임으로
// 변환해 React.createElement를 전역에서 찾는다. 전역 shim으로 맞춘다.(hospital-tabs-ssr.test.ts와 동일)
(globalThis as unknown as { React: typeof React }).React = React;

// 운영 데이터 실측 사례(아이소리어린이집): 교직원 7명이 1/1/2/3명으로 갈리고
// 근속 필드에는 그 비율 14/14/29/43(%)이 들어온다. 실인원이면 성립할 수 없는 값이다.
const item = {
  emRoleTot: 7,
  emRoleDirector: 1, emRoleTeacher: 6,
  emTenure0y: 0, emTenure1y: 14, emTenure2y: 14, emTenure4y: 29, emTenure6y: 43,
} as unknown as Childcare;

describe('ChildcareStaff SSR', () => {
  it('근속년수 분포는 비율(%)로 표기한다 — 실인원(명)으로 쓰면 총원을 넘는 값이 나온다', () => {
    const html = renderToStaticMarkup(createElement(ChildcareStaff, { item }));
    expect(html).toContain('근속년수별 비율');
    expect(html).toContain('43%');
    expect(html).not.toContain('43명');
  });

  it('직역별은 실인원(명)으로 표기한다', () => {
    const html = renderToStaticMarkup(createElement(ChildcareStaff, { item }));
    expect(html).toContain('6명'); // 보육교사 6명
    expect(html).toContain('총 7명');
  });
});
