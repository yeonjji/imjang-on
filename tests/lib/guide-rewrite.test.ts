import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { parseGuideDraft, validateGuideDraft } from '@/lib/guide/rewrite';

const body = '첫 문단입니다.\n\n## 소제목\n\n' + '본문 문장입니다. '.repeat(120) + '\n\n[[data:price-trend-24m]]\n';
const draft = `---\ntitle: 새 제목\nsummary: 새 요약입니다.\n---\n${body}`;

describe('parseGuideDraft', () => {
  it('앞머리 title·summary와 본문을 나눈다', () => {
    const d = parseGuideDraft(draft);
    expect(d.title).toBe('새 제목');
    expect(d.summary).toBe('새 요약입니다.');
    expect(d.body.startsWith('첫 문단입니다.')).toBe(true);
    expect(d.body.endsWith('[[data:price-trend-24m]]')).toBe(true);
  });
  it('앞머리가 없거나 title·summary가 비면 오류', () => {
    expect(() => parseGuideDraft(body)).toThrow();
    expect(() => parseGuideDraft(`---\ntitle: \nsummary: x\n---\n${body}`)).toThrow();
  });
});

describe('validateGuideDraft', () => {
  const src = { sourceName: '국토교통부 실거래가 공개시스템', sourceUrl: 'https://rt.molit.go.kr' };
  it('통과', () => {
    expect(validateGuideDraft(parseGuideDraft(draft), src)).toEqual([]);
  });
  it('모르는 데이터 블록·HTML·짧은 본문·금지 표현을 잡는다', () => {
    const bad = (b: string) => validateGuideDraft({ title: 't', summary: 's', body: b }, src);
    expect(bad(body + '\n[[data:nope]]')).toContain('알 수 없는 데이터 블록: nope');
    expect(bad(body + '\n<small>x</small>')).toContain('HTML 태그는 렌더되지 않음');
    expect(bad('짧다').some((e) => e.includes('분량'))).toBe(true);
    expect(bad(body + ' 지금이 기회입니다').some((e) => e.includes('투자권유'))).toBe(true);
  });
});

describe('content/guides 초안 전부', () => {
  it('28편 모두 파싱·검증 통과', () => {
    const files = readdirSync('content/guides').filter((f) => f.endsWith('.md'));
    expect(files.length).toBe(28);
    for (const f of files) {
      const d = parseGuideDraft(readFileSync(`content/guides/${f}`, 'utf8'));
      expect(validateGuideDraft(d, { sourceName: 'x', sourceUrl: 'x' }), f).toEqual([]);
    }
  });
});
