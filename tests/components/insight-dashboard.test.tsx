import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { InsightDashboard } from '@/app/(public)/apt/[id]/_components/insight-dashboard';
import type { Narrative } from '@/lib/insights/shared';

// 이 저장소의 vitest는 esbuild classic JSX 변환을 쓴다. JSX를 쓰려면 React가 전역에 있어야 한다
// (tests/components/property-detail-hero-ssr.test.ts와 동일 패턴).
(globalThis as unknown as { React: typeof React }).React = React;

const FULL: Narrative = {
  sentences: ['헬리오시티는 2018년 준공 · 9,510세대 단지입니다.', '두 번째 문장.'],
  text: '헬리오시티는 2018년 준공 · 9,510세대 단지입니다. 두 번째 문장.',
  fired: ['scale', 'trend'],
  badges: ['역세권', '중소형 중심'],
  display: [
    { shape: 'tile', key: 'peer', label: '가격 수준', value: '29억', sub: '송파구 평균 13.4억' },
    { shape: 'tile', key: 'trend', label: '가격 흐름', value: '+17%', sub: '직전 12개월 대비 · 표본 93건', tone: 'up' },
    { shape: 'tile', key: 'access', label: '입지', value: '도보 6분', sub: '8호선 송파' },
    { shape: 'chips', key: 'infra', label: '생활 편의', chips: [{ label: '카페', value: '7' }, { label: '병원', value: '12+' }] },
    { shape: 'card', key: 'floor', label: '층별 시세', value: '한 층당 +1%', sub: '최근 매매 77건 · 설명력 R² 0.35' },
    { shape: 'alert', key: 'flags', label: '거래 특이사항', value: '±10% 이탈 13건', sub: '최근 1년' },
  ],
};

const html = (n: Narrative) => renderToStaticMarkup(<InsightDashboard narrative={n} />);

describe('InsightDashboard', () => {
  it('헤더는 첫 문장이다', () => {
    expect(html(FULL)).toContain('헬리오시티는 2018년 준공 · 9,510세대 단지입니다.');
  });

  it('배지를 렌더한다', () => {
    const out = html(FULL);
    expect(out).toContain('역세권');
    expect(out).toContain('중소형 중심');
  });

  it('타일·칩·카드·주의 박스를 모두 렌더한다', () => {
    const out = html(FULL);
    for (const s of ['가격 수준', '29억', '가격 흐름', '+17%', '입지', '도보 6분',
                     '생활 편의', '카페', '12+', '층별 시세', '한 층당 +1%',
                     '거래 특이사항', '±10% 이탈 13건']) {
      expect(out).toContain(s);
    }
  });

  it('sentences가 비면 아무것도 렌더하지 않는다', () => {
    expect(html({ sentences: [], text: '', fired: [] })).toBe('');
  });

  it('display가 없어도 헤더 문장은 남는다', () => {
    const out = html({ sentences: ['삼익은 1994년 준공 단지입니다.'], text: '삼익은 1994년 준공 단지입니다.', fired: ['scale'] });
    expect(out).toContain('삼익은 1994년 준공 단지입니다.');
  });

  it('배지가 없으면 배지 줄이 없다', () => {
    const out = html({ ...FULL, badges: [] });
    expect(out).not.toContain('역세권');
  });

  it('타일이 없으면 타일 행이 없다 — 빈 칸을 두지 않는다', () => {
    const out = html({ ...FULL, display: FULL.display!.filter((u) => u.shape !== 'tile') });
    expect(out).not.toContain('가격 수준');
    expect(out).toContain('생활 편의');
  });

  it('보조 줄이 없는 타일은 보조 줄을 아예 빼고 — 를 찍지 않는다', () => {
    const out = html({ ...FULL, display: [{ shape: 'tile', key: 'peer', label: '가격 수준', value: '4.42억' }] });
    expect(out).toContain('4.42억');
    expect(out).not.toContain('—');
  });

  it('하락은 파랑, 상승은 빨강 (한국 관례)', () => {
    const up = html({ ...FULL, display: [{ shape: 'tile', key: 'trend', label: '가격 흐름', value: '+17%', tone: 'up' }] });
    const down = html({ ...FULL, display: [{ shape: 'tile', key: 'trend', label: '가격 흐름', value: '−3%', tone: 'down' }] });
    expect(up).toContain('--color-red');
    expect(down).toContain('--color-blue');
  });
});
