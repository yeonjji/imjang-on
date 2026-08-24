import { describe, it, expect } from 'vitest';
import { restructureBody, buildRestructureSystemPrompt } from '@/lib/board/restructure';
import type { OpenAiLike } from '@/lib/board/generate';

function mockClient(returnText: string, capture?: (args: unknown) => void): OpenAiLike {
  return {
    chat: {
      completions: {
        create: async (args: unknown) => {
          capture?.(args);
          return { choices: [{ message: { content: JSON.stringify({ body: returnText }) } }] };
        },
      },
    },
  };
}

describe('restructureBody', () => {
  it('다듬은 body 문자열을 반환한다', async () => {
    const out = await restructureBody(mockClient('첫 문단 서술.\n\n## 배경\n본문'), '원본 본문', 'gpt-x');
    expect(out).toBe('첫 문단 서술.\n\n## 배경\n본문');
  });

  it('프롬프트는 사실 보존·추가 금지를 명시한다', () => {
    expect(buildRestructureSystemPrompt(2200)).toContain('보존');
    expect(buildRestructureSystemPrompt(2200)).toContain('2,200');
    expect(buildRestructureSystemPrompt(6000)).toContain('6,000');
  });

  // 2026-08-24 방향 반전: 골격을 '부여'하던 프롬프트를 '제거'로 돌렸다.
  it('프롬프트는 고정 서식 골격을 걷어내라고 지시한다', () => {
    const p = buildRestructureSystemPrompt(2200);
    expect(p).toContain("'## 핵심 요약' 섹션을 없앤다");
    expect(p).toContain("'## 참고 자료' 섹션을 없앤다");
    expect(p).toContain('구체적 내용을 가리키는 문구로 바꾼다');
  });

  // dry-run 실측(#1 청약 12건 현황)에서 단지별 접수일 목록이 통째로 산문화돼 오히려
  // 읽기 어려워졌다. 산문화는 해설 대목에만 적용되어야 한다.
  it('프롬프트는 열거형 내용의 목록·표를 보존하라고 지시한다', () => {
    const p = buildRestructureSystemPrompt(2200);
    expect(p).toContain('목록·표를 그대로 둔다');
    expect(p).toContain('원문이 목록이면 목록으로 남긴다');
  });

  it('원본 본문을 user 메시지로 전달한다', async () => {
    let seen: unknown;
    await restructureBody(mockClient('x', (a) => { seen = a; }), '원본 사실 ABC', 'gpt-x');
    const messages = (seen as { messages: { role: string; content: string }[] }).messages;
    const user = messages.find((m) => m.role === 'user');
    expect(user?.content).toContain('원본 사실 ABC');
  });
});
