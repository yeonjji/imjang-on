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
    expect(p).toContain('서술구로 바꾼다');
  });

  it('원본 본문을 user 메시지로 전달한다', async () => {
    let seen: unknown;
    await restructureBody(mockClient('x', (a) => { seen = a; }), '원본 사실 ABC', 'gpt-x');
    const messages = (seen as { messages: { role: string; content: string }[] }).messages;
    const user = messages.find((m) => m.role === 'user');
    expect(user?.content).toContain('원본 사실 ABC');
  });
});
