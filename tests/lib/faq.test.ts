import { describe, it, expect } from 'vitest';
import { FAQ, FAQ_CATEGORY_LABEL, FAQ_PAGE_ORDER, type FaqCategory } from '@/lib/faq/data';

const CATEGORIES = Object.keys(FAQ) as FaqCategory[];

describe('FAQ 레지스트리 무결성', () => {
  it('모든 카테고리가 최소 3개 항목을 가진다', () => {
    for (const c of CATEGORIES) {
      expect(FAQ[c].length, `${c} 항목 수`).toBeGreaterThanOrEqual(3);
    }
  });

  it('모든 항목의 q는 물음표로 끝나고 a는 비어있지 않다', () => {
    for (const c of CATEGORIES) {
      for (const item of FAQ[c]) {
        expect(item.q.trim().length, `${c} q`).toBeGreaterThan(0);
        expect(item.q.trim().endsWith('?'), `${c} q="${item.q}"`).toBe(true);
        expect(item.a.trim().length, `${c} a`).toBeGreaterThan(10);
      }
    }
  });

  it('카테고리 내 질문이 중복되지 않는다', () => {
    for (const c of CATEGORIES) {
      const qs = FAQ[c].map((i) => i.q);
      expect(new Set(qs).size, `${c} 중복`).toBe(qs.length);
    }
  });

  it('모든 카테고리에 라벨이 있고 노출 순서에 포함된다', () => {
    for (const c of CATEGORIES) {
      expect(FAQ_CATEGORY_LABEL[c], `${c} 라벨`).toBeTruthy();
      expect(FAQ_PAGE_ORDER, `${c} 순서`).toContain(c);
    }
    expect(new Set(FAQ_PAGE_ORDER).size).toBe(FAQ_PAGE_ORDER.length);
  });
});
