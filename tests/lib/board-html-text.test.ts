import { describe, it, expect } from 'vitest';
import { htmlToText, decodeEntities } from '@/lib/board/html-text';

describe('htmlToText', () => {
  it('태그 제거 + 블록은 줄바꿈', () => {
    expect(htmlToText('<p>가나</p><p>다라</p>')).toBe('가나\n다라');
  });
  it('br은 줄바꿈, 엔티티 디코드', () => {
    expect(htmlToText('a&amp;b<br>c')).toBe('a&b\nc');
  });
});

describe('decodeEntities', () => {
  it('명명/숫자 엔티티 디코드', () => {
    expect(decodeEntities('&middot;&#65;&#x42;')).toBe('·AB');
  });
});
