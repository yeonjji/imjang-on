import { describe, it, expect } from 'vitest';
import { restructureBody, RESTRUCTURE_SYSTEM_PROMPT } from '@/lib/board/restructure';
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
  it('재구조화된 body 문자열을 반환한다', async () => {
    const out = await restructureBody(mockClient('## 핵심 요약\n- 하나\n\n## 배경\n본문'), '원본 본문', 'gpt-x');
    expect(out).toBe('## 핵심 요약\n- 하나\n\n## 배경\n본문');
  });

  it('프롬프트는 사실 보존·추가 금지를 명시한다', () => {
    expect(RESTRUCTURE_SYSTEM_PROMPT).toContain('보존');
    expect(RESTRUCTURE_SYSTEM_PROMPT).toContain('## 핵심 요약');
  });

  it('원본 본문을 user 메시지로 전달한다', async () => {
    let seen: unknown;
    await restructureBody(mockClient('x', (a) => { seen = a; }), '원본 사실 ABC', 'gpt-x');
    const messages = (seen as { messages: { role: string; content: string }[] }).messages;
    const user = messages.find((m) => m.role === 'user');
    expect(user?.content).toContain('원본 사실 ABC');
  });
});
