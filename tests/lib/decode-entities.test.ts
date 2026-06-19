import { describe, it, expect } from 'vitest';
import { decodeEntities } from '@/lib/text/decode-entities';

describe('decodeEntities', () => {
  it('명명 엔티티(lt, gt, amp, quot, apos)를 디코딩한다', () => {
    // 실제 버그 케이스: 편의점 이름 '<주>세븐'이 '&lt;주&gt;세븐'으로 저장됨
    expect(decodeEntities('&lt;주&gt;세븐')).toBe('<주>세븐');
    expect(decodeEntities('A&amp;B')).toBe('A&B');
    expect(decodeEntities('&quot;인용&quot;')).toBe('"인용"');
    expect(decodeEntities('It&#39;s')).toBe("It's");
  });

  it('숫자 엔티티(10진·16진)를 디코딩한다', () => {
    expect(decodeEntities('원&#40;리&#41;금')).toBe('원(리)금');
    expect(decodeEntities('&#x3c;x&#x3e;')).toBe('<x>');
  });

  it('amp를 마지막에 풀어 혼합 인코딩을 정확히 복원한다', () => {
    expect(decodeEntities('A&amp;B &lt;x&gt;')).toBe('A&B <x>');
  });

  it('엔티티가 없는 문자열은 그대로 둔다(안전)', () => {
    expect(decodeEntities('스타벅스 서초점')).toBe('스타벅스 서초점');
    expect(decodeEntities('GS25 양재역점')).toBe('GS25 양재역점');
    expect(decodeEntities('John & Jane')).toBe('John & Jane');
  });
});
