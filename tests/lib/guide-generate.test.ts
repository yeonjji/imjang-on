import { describe, it, expect } from 'vitest';
import { generateGuideDraft } from '@/lib/guide/generate';
import { type OpenAiLike } from '@/lib/board/generate';
import { GuideCategory } from '@prisma/client';

function fakeClient(payload: object): OpenAiLike {
  return { chat: { completions: { create: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }) } } };
}

const input = {
  category: GuideCategory.REALESTATE,
  topic: '실거래가, 어떻게 읽어야 할까',
  angle: '실거래가의 의미와 호가와의 차이를 설명한다.',
  sourceText: '국토부 실거래가 공개시스템 안내문 원문',
  sourceName: '국토교통부 실거래가 공개시스템',
  relatedLabel: '실거래가 조회하기',
  relatedHref: '/list',
};

describe('generateGuideDraft', () => {
  it('구조화 응답을 파싱해 title/summary/body로 돌려준다', async () => {
    const payload = { title: '실거래가 읽는 법', summary: '실거래가의 의미를 설명', body: '## 실거래가란\n본문 '.repeat(80) };
    const res = await generateGuideDraft(fakeClient(payload), input, 'gpt-4.1-mini');
    expect(res.title).toBe('실거래가 읽는 법');
    expect(res.summary.length).toBeGreaterThan(0);
    expect(res.body.length).toBeGreaterThan(0);
  });
  it('빈 응답이면 에러', async () => {
    const empty: OpenAiLike = { chat: { completions: { create: async () => ({ choices: [{ message: { content: null } }] }) } } };
    await expect(generateGuideDraft(empty, input, 'm')).rejects.toThrow();
  });
  it('사용자 프롬프트에 마무리 CTA 링크를 그대로 주입한다', async () => {
    let captured = '';
    const spy: OpenAiLike = {
      chat: { completions: { create: async (args: unknown) => {
        const typedArgs = args as { messages: { role: string; content: string }[] };
        captured = typedArgs.messages.map((m) => m.content).join('\n');
        return { choices: [{ message: { content: JSON.stringify({ title: 't', summary: 's', body: 'b' }) } }] };
      } } },
    };
    await generateGuideDraft(spy, input, 'm');
    expect(captured).toContain('[실거래가 조회하기](/list)');
  });
});
