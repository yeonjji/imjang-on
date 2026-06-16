import { describe, it, expect } from 'vitest';
import { generateDraft, type OpenAiLike } from '@/lib/board/generate';

function fakeClient(payload: object): OpenAiLike {
  return { chat: { completions: { create: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }) } } };
}

describe('generateDraft', () => {
  it('구조화 응답을 파싱해 결과로 돌려준다', async () => {
    const payload = { type: 'PROGRAM', category: 'LOAN', title: '디딤돌 대출 한도 상향', summary: '국토부 발표 요약', body: '## 서론\n본문'.repeat(50) };
    const res = await generateDraft(fakeClient(payload), { sourceText: '국토부 보도자료 원문', sourceName: '국토교통부' }, 'gpt-4.1-mini');
    expect(res.type).toBe('PROGRAM');
    expect(res.category).toBe('LOAN');
    expect(res.title).toBe('디딤돌 대출 한도 상향');
    expect(res.body.length).toBeGreaterThan(0);
  });
  it('잘못된 type이면 에러', async () => {
    const res = generateDraft(fakeClient({ type: 'X', category: 'LOAN', title: 't', summary: 's', body: 'b' }), { sourceText: 'x', sourceName: 'y' }, 'm');
    await expect(res).rejects.toThrow();
  });
});
