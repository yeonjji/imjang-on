import { describe, it, expect } from 'vitest';
import {
  removeFaqSection,
  insertBlockMarker,
  applyGuideBodyEdit,
  GUIDE_BLOCK_PLACEMENTS,
  FAQ_HEADING,
} from '@/lib/guide/insert-blocks';
import { isGuideDataBlockKey } from '@/lib/guide/data-blocks';
import { splitGuideBody } from '@/lib/guide/body-parts';

const BODY = [
  '## 핵심 요약',
  '- 요약 한 줄',
  '',
  '## 앵커 소제목',
  '앵커 섹션 본문입니다.',
  '',
  '- 항목 하나',
  '',
  '## 다음 섹션',
  '다음 섹션 본문입니다.',
  '',
  '## 자주 묻는 질문',
  '**Q. 질문?**',
  'A. 답변.',
  '',
  '**Q. 질문 둘?**',
  'A. 답변 둘.',
  '',
  '## 더 알아보기',
  '관련 정보 확인하기 → [병원 찾기](/medical/hospital)',
  '',
  '## 참고 자료',
  '출처 표기',
].join('\n');

describe('removeFaqSection', () => {
  it('FAQ 헤딩부터 다음 ## 직전까지만 지우고 그 뒤는 보존한다', () => {
    const r = removeFaqSection(BODY);
    expect(r.removed).toBe(true);
    expect(r.body).not.toContain(FAQ_HEADING);
    expect(r.body).not.toContain('A. 답변 둘.');
    expect(r.body).toContain('## 더 알아보기');
    expect(r.body).toContain('## 참고 자료');
    expect(r.body).toContain('출처 표기');
  });

  it('FAQ가 없으면 본문을 그대로 둔다', () => {
    const noFaq = '## 소제목\n본문';
    const r = removeFaqSection(noFaq);
    expect(r.removed).toBe(false);
    expect(r.body).toBe(noFaq);
  });

  it('FAQ가 마지막 섹션이면 끝까지 지운다', () => {
    const r = removeFaqSection(`## 소제목\n본문\n\n${FAQ_HEADING}\n**Q. 질문?**\nA. 답변.`);
    expect(r.removed).toBe(true);
    expect(r.body.trimEnd()).toBe('## 소제목\n본문');
  });
});

describe('insertBlockMarker', () => {
  it('앵커 섹션의 끝(다음 ## 직전)에 표식을 넣는다', () => {
    const r = insertBlockMarker(BODY, '## 앵커 소제목', 'hospital-by-type');
    expect(r.inserted).toBe(true);
    const lines = r.body.split('\n');
    const marker = lines.indexOf('[[data:hospital-by-type]]');
    expect(marker).toBeGreaterThan(lines.indexOf('- 항목 하나'));
    expect(marker).toBeLessThan(lines.indexOf('## 다음 섹션'));
  });

  it('멱등 — 이미 표식이 있으면 다시 넣지 않는다', () => {
    const once = insertBlockMarker(BODY, '## 앵커 소제목', 'hospital-by-type');
    const twice = insertBlockMarker(once.body, '## 앵커 소제목', 'hospital-by-type');
    expect(twice.inserted).toBe(false);
    expect(twice.reason).toBe('already-present');
    expect(twice.body).toBe(once.body);
  });

  it('앵커를 못 찾으면 본문을 건드리지 않는다', () => {
    const r = insertBlockMarker(BODY, '## 없는 소제목', 'charger-mix');
    expect(r.inserted).toBe(false);
    expect(r.reason).toBe('anchor-not-found');
    expect(r.body).toBe(BODY);
  });

  it('넣은 표식은 splitGuideBody가 블록으로 인식한다', () => {
    const r = insertBlockMarker(BODY, '## 앵커 소제목', 'childcare-waitlist');
    const parts = splitGuideBody(r.body);
    expect(parts.filter((p) => p.kind === 'block')).toEqual([
      { kind: 'block', key: 'childcare-waitlist' },
    ]);
  });
});

describe('applyGuideBodyEdit', () => {
  const placement = {
    dedupeKey: 'ut-guide',
    blockKey: 'hospital-by-type' as const,
    anchorHeading: '## 앵커 소제목',
  };

  it('표식 삽입과 FAQ 제거를 함께 한다', () => {
    const r = applyGuideBodyEdit(BODY, placement);
    expect(r.blockInserted).toBe(true);
    expect(r.faqRemoved).toBe(true);
    expect(r.body).toContain('[[data:hospital-by-type]]');
    expect(r.body).not.toContain(FAQ_HEADING);
  });

  it('두 번 돌려도 결과가 같다', () => {
    const once = applyGuideBodyEdit(BODY, placement);
    const twice = applyGuideBodyEdit(once.body, placement);
    expect(twice.body).toBe(once.body);
    expect(twice.blockInserted).toBe(false);
    expect(twice.faqRemoved).toBe(false);
  });

  it('앵커를 못 찾으면 FAQ도 지우지 않는다', () => {
    const r = applyGuideBodyEdit(BODY, { ...placement, anchorHeading: '## 없는 소제목' });
    expect(r.skipReason).toBe('anchor-not-found');
    expect(r.body).toBe(BODY);
    expect(r.faqRemoved).toBe(false);
  });
});

describe('GUIDE_BLOCK_PLACEMENTS', () => {
  it('블록키는 구현된 키뿐이고 대상 가이드는 중복되지 않는다', () => {
    for (const p of GUIDE_BLOCK_PLACEMENTS) {
      expect(isGuideDataBlockKey(p.blockKey)).toBe(true);
      expect(p.anchorHeading.startsWith('## ')).toBe(true);
    }
    const keys = GUIDE_BLOCK_PLACEMENTS.map((p) => p.dedupeKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
