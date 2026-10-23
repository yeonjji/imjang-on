import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Faq } from '@/app/(public)/_components/faq';

(globalThis as unknown as { React: typeof React }).React = React;

describe('Faq', () => {
  it('상세: /faq 전체 보기 링크, JSON-LD는 전달 문항만', () => {
    const h = renderToStaticMarkup(createElement(Faq, { items: [{ q: '단지 질문?', a: '답' }] }));
    expect(h).toContain('href="/faq"');
    expect(h).toContain('자주 묻는 질문 전체 보기');
    expect(h).toContain('단지 질문?');
    expect(h).not.toContain('실거래가와 호가는 어떻게 다른가요?');
  });
  it('목록(showAllLink=false): 링크 없음', () => {
    const h = renderToStaticMarkup(createElement(Faq, { items: [{ q: '질문?', a: '답' }], showAllLink: false }));
    expect(h).not.toContain('자주 묻는 질문 전체 보기');
  });
});
