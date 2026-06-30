import { describe, it, expect } from 'vitest';
import { SYSTEM_PROMPT as BOARD_PROMPT } from '@/lib/board/generate';
import { SYSTEM_PROMPT as GUIDE_PROMPT } from '@/lib/guide/generate';

describe('생성 프롬프트 섹션 골격', () => {
  it('board 프롬프트는 핵심 요약·참고 자료 섹션을 강제한다', () => {
    expect(BOARD_PROMPT).toContain('## 핵심 요약');
    expect(BOARD_PROMPT).toContain('## 참고 자료');
  });

  it('guide 프롬프트는 핵심 요약·참고 자료 섹션을 강제한다', () => {
    expect(GUIDE_PROMPT).toContain('## 핵심 요약');
    expect(GUIDE_PROMPT).toContain('## 참고 자료');
  });

  it('board 프롬프트는 사실 원칙·금지표현을 유지한다', () => {
    expect(BOARD_PROMPT).toContain('추측');
    expect(BOARD_PROMPT).toContain('전망');
  });
});
