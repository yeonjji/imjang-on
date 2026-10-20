import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BuildingRegisterSection } from '@/app/(public)/apt/[id]/_components/building-register-section';
import type { BuildingView } from '@/lib/insights/building-register';

(globalThis as unknown as { React: typeof React }).React = React;

const villa: BuildingView = {
  tiles: [{ label: '사용승인', value: '7년차', sub: '2019년 8월' }, { label: '주차', value: '세대당 0.86대', sub: '총 12대' }],
  rows: [{ label: '주용도', value: '공동주택', note: '기타: 공동주택, 제1종근린생활시설(소매점)' }, { label: '지역지구', value: '제2종일반주거지역', note: '(용도지역)' }, { label: '내진설계', value: '적용' }],
  neighborhoodNotice: true, createdLabel: '2022-08-13', fetchedLabel: '2026-10-20', formula: '세대당 주차 = 총 주차대수 ÷ 세대수',
};
const html = (v: BuildingView | null) => renderToStaticMarkup(createElement(BuildingRegisterSection, { view: v, id: 'building-register' }));

describe('BuildingRegisterSection', () => {
  it('view가 없으면 렌더하지 않는다', () => expect(html(null)).toBe(''));
  it('타일·행·출처·계산식', () => {
    const h = html(villa);
    expect(h).toContain('id="building-register"');
    expect(h).toContain('건축물 정보');
    expect(h).toContain('건축물대장 기준');
    expect(h).toContain('세대당 0.86대');
    expect(h).toContain('제2종일반주거지역');
    expect(h).toContain('(용도지역)');
    expect(h).toContain('대장 생성일 2022-08-13');
    expect(h).toContain('2026-10-20 조회');
    expect(h).toContain('임장ON 계산: 세대당 주차 = 총 주차대수 ÷ 세대수');
  });
  it('근린생활시설 안내 문구(spec §5 그대로)', () => {
    expect(html(villa)).toContain('건축물대장 표제부에 근린생활시설 용도가 포함되어 있습니다. 실제 계약 대상 호실의 용도와 주거 이용 관련 사항은 건축물대장 전유부 및 관계 기관을 통해 확인하시기 바랍니다.');
    expect(html({ ...villa, neighborhoodNotice: false })).not.toContain('근린생활시설 용도가 포함');
  });
  it('미적용·위법·대출 같은 판단 문구가 없다', () => {
    const h = html(villa);
    for (const w of ['미적용', '위법', '대출 불가', '전입 불가', '불법']) expect(h).not.toContain(w);
  });
  it('계산식이 없으면 그 줄이 없다', () => {
    expect(html({ ...villa, formula: null })).not.toContain('임장ON 계산');
  });
});
