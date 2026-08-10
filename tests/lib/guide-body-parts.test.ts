import { describe, it, expect } from 'vitest';
import { splitGuideBody } from '@/lib/guide/body-parts';

describe('splitGuideBody', () => {
  it('표식이 없으면 마크다운 한 조각', () => {
    expect(splitGuideBody('## 제목\n본문입니다.')).toEqual([
      { kind: 'markdown', text: '## 제목\n본문입니다.' },
    ]);
  });

  it('표식을 기준으로 앞뒤를 나눈다', () => {
    expect(splitGuideBody('앞\n\n[[data:charger-mix]]\n\n뒤')).toEqual([
      { kind: 'markdown', text: '앞' },
      { kind: 'block', key: 'charger-mix' },
      { kind: 'markdown', text: '뒤' },
    ]);
  });

  it('표식이 여러 개면 순서를 보존한다', () => {
    const parts = splitGuideBody('A\n[[data:charger-mix]]\nB\n[[data:childcare-waitlist]]\nC');
    expect(parts.map((p) => (p.kind === 'block' ? p.key : p.text))).toEqual([
      'A', 'charger-mix', 'B', 'childcare-waitlist', 'C',
    ]);
  });

  it('모르는 블록키는 조용히 버린다 — 오타로 페이지가 깨지지 않게', () => {
    expect(splitGuideBody('앞\n[[data:nope]]\n뒤')).toEqual([
      { kind: 'markdown', text: '앞' },
      { kind: 'markdown', text: '뒤' },
    ]);
  });

  it('빈 마크다운 조각은 버린다', () => {
    expect(splitGuideBody('[[data:charger-mix]]')).toEqual([
      { kind: 'block', key: 'charger-mix' },
    ]);
  });

  it('코드블록 안의 표식은 치환하지 않는다', () => {
    const body = '설명\n\n```\n[[data:charger-mix]]\n```\n\n끝';
    const parts = splitGuideBody(body);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({ kind: 'markdown', text: body });
  });

  // 회귀 테스트: 펜스 종류 혼용
  it('펜스를 다른 문자로 닫으려고 하면 무시한다', () => {
    const body = '설명\n\n```\ncode\n~~~\n[[data:charger-mix]]\n~~~\nend\n```\n\n끝';
    const parts = splitGuideBody(body);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({ kind: 'markdown', text: body });
  });

  // 회귀 테스트: 펜스 길이 추적
  it('펜스는 같은 길이이거나 더 긴 같은 문자로만 닫힌다', () => {
    const body = '설명\n\n````\ncode\n```\n[[data:charger-mix]]\n```\nend\n````\n\n끝';
    const parts = splitGuideBody(body);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({ kind: 'markdown', text: body });
  });

  // 회귀 테스트: 표식 앞 공백
  it('표식 앞에 공백이 있어도 블록으로 치환한다', () => {
    expect(splitGuideBody('앞\n  [[data:charger-mix]]\n뒤')).toEqual([
      { kind: 'markdown', text: '앞' },
      { kind: 'block', key: 'charger-mix' },
      { kind: 'markdown', text: '뒤' },
    ]);
  });

  // 회귀 테스트: 문장 중간의 표식
  it('문장 중간의 표식은 치환하지 않는다', () => {
    const body = '앞 [[data:charger-mix]] 뒤';
    expect(splitGuideBody(body)).toEqual([
      { kind: 'markdown', text: body },
    ]);
  });
});
