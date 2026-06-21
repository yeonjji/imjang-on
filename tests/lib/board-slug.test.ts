import { describe, it, expect } from 'vitest';
import { buildBoardSlug, boardPath } from '@/lib/board/slug';

describe('buildBoardSlug', () => {
  it('날짜 + 정규화 제목으로 만든다', () => {
    expect(buildBoardSlug('디딤돌 대출 한도 상향!', '2026-06-15')).toBe('2026-06-15-디딤돌대출한도상향');
  });
  it('긴 제목은 자른다', () => {
    const s = buildBoardSlug('가'.repeat(100), '2026-06-15');
    expect(s.length).toBeLessThanOrEqual(11 + 40);
  });
  it('suffix로 충돌 회피', () => {
    expect(buildBoardSlug('대출', '2026-06-15', 2)).toBe('2026-06-15-대출-2');
  });
});

describe('boardPath', () => {
  it('/board/<id> 형식이다(제목 글자가 경로에 들어가지 않음 → % 깨짐 원천 차단)', () => {
    expect(boardPath(12847n)).toBe('/board/12847');
    // 어떤 입력이든 경로에 raw % 같은 URL 위험 문자가 생길 수 없다
    expect(boardPath(12847n)).not.toMatch(/[%?#&]/);
  });
  it('number id 도 받는다', () => {
    expect(boardPath(7)).toBe('/board/7');
  });
});
