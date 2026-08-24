import { describe, it, expect } from 'vitest';
import { SYSTEM_PROMPT as BOARD_PROMPT } from '@/lib/board/generate';
import { SYSTEM_PROMPT as GUIDE_PROMPT } from '@/lib/guide/generate';

describe('생성 프롬프트 섹션 골격', () => {
  // 2026-08-24 반전: 모든 글이 '## 핵심 요약 → 굵은 불릿 → ## 참고 자료'로 찍혀 나오는 것이
  // 애드센스 'Low value content' 판정의 신호로 지목돼, board는 고정 골격을 강제하지 않는다.
  // 문자열 부재가 아니라 '강제하는지'를 본다 — 프롬프트는 금지하려고 두 헤딩을 언급한다.
  it('board 프롬프트는 고정 서식 골격을 강제하지 않는다', () => {
    expect(BOARD_PROMPT).not.toContain("맨 위에 '## 핵심 요약' 섹션을 두고");
    expect(BOARD_PROMPT).not.toContain("맨 끝에 '## 참고 자료' 섹션을 두고");
    expect(BOARD_PROMPT).toContain('요약 불릿으로 글을 열지 않는다');
    expect(BOARD_PROMPT).toContain("'## 참고 자료' 섹션으로 적지 않는다");
  });

  // 원문이 얇을 때 일반론으로 분량을 채우는 것은 guardrails.ts가 하한을 800으로 낮추며
  // 이미 거부한 방침이다(주석 참고). 프롬프트가 그 방침과 어긋나지 않아야 한다.
  it('board 프롬프트는 분량 채우기를 금지한다', () => {
    expect(BOARD_PROMPT).toContain('덧붙이지 않는다');
    expect(BOARD_PROMPT).toContain('800자');
    expect(BOARD_PROMPT).not.toContain('최소 1,000자');
  });

  // 골격 제거가 '전부 산문화'로 넘어가면 일정·목록형 글이 오히려 읽기 어려워진다(dry-run 실측).
  it('board 프롬프트는 열거형 정보를 목록·표로 두라고 지시한다', () => {
    expect(BOARD_PROMPT).toContain('열거가 본질이라');
    expect(BOARD_PROMPT).toContain('목록이나 표로 둔다');
  });

  // guide는 lib/guide/insert-blocks.ts가 앵커 소제목에 의존해 아직 골격을 유지한다.
  it('guide 프롬프트는 핵심 요약·참고 자료 섹션을 강제한다', () => {
    expect(GUIDE_PROMPT).toContain('## 핵심 요약');
    expect(GUIDE_PROMPT).toContain('## 참고 자료');
  });

  it('board 프롬프트는 사실 원칙·금지표현을 유지한다', () => {
    expect(BOARD_PROMPT).toContain('추측');
    expect(BOARD_PROMPT).toContain('전망');
  });

  it('guide 프롬프트는 금지 표현 규칙을 유지한다', () => {
    expect(GUIDE_PROMPT).toContain('추천');
    expect(GUIDE_PROMPT).toContain('유망');
  });
});
