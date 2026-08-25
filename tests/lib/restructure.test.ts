import { describe, it, expect } from 'vitest';
import {
  restructureBody,
  buildRestructureSystemPrompt,
  promoteDemotedHeadings,
  stripSkeletonSections,
} from '@/lib/board/restructure';
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

// 골격 삭제는 LLM이 아니라 코드가 한다 — 맡겼더니 남은 소제목까지 통째로 지웠다(운영 실측).
describe('stripSkeletonSections', () => {
  it('맨 앞 핵심 요약과 맨 끝 참고 자료를 떼고 본문 소제목은 남긴다', () => {
    const body = [
      '## 핵심 요약',
      '- **요점** 하나',
      '',
      '## 배경',
      '본문 문단.',
      '',
      '## 참고 자료',
      '- 출처: 정책브리핑, 2026년 6월 16일 기준',
    ].join('\n');
    const out = stripSkeletonSections(body);
    expect(out).toBe('## 배경\n본문 문단.');
  });

  it('참고 자료가 마지막이 아니어도 그 섹션만 떼어낸다', () => {
    const out = stripSkeletonSections('## 배경\n가.\n\n## 참고 자료\n- 출처\n\n## 마무리\n나.');
    expect(out).toBe('## 배경\n가.\n\n## 마무리\n나.');
  });

  it('골격이 없으면 원본을 그대로 둔다', () => {
    const body = '리드 문단.\n\n## 배경\n본문.';
    expect(stripSkeletonSections(body)).toBe(body);
  });
});

// 운영 11편 실측에서 6편(55%)이 '## 핵심 요약' 제거와 함께 남은 소제목을 ###로 낮췄다.
describe('promoteDemotedHeadings', () => {
  const OLD = '## 핵심 요약\n- 하나\n\n## 배경\n본문\n\n## 영향\n본문';

  it('통째로 한 단계 밀렸으면 h2로 되돌린다', () => {
    const out = promoteDemotedHeadings(OLD, '리드.\n\n### 배경\n본문\n\n### 영향\n본문');
    expect(out).toBe('리드.\n\n## 배경\n본문\n\n## 영향\n본문');
  });

  it('h2가 하나라도 남아 있으면 의도된 단계 구성으로 보고 건드리지 않는다', () => {
    const src = '리드.\n\n## 배경\n본문\n\n### 세부\n본문';
    expect(promoteDemotedHeadings(OLD, src)).toBe(src);
  });

  it('원문에 h3이 있었으면 건드리지 않는다', () => {
    const src = '리드.\n\n### 배경\n본문';
    expect(promoteDemotedHeadings(OLD + '\n\n### 세부\n본문', src)).toBe(src);
  });

  it('h3이 없으면 그대로 둔다', () => {
    const src = '리드.\n\n본문만 있다.';
    expect(promoteDemotedHeadings(OLD, src)).toBe(src);
  });
});

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

  // 골격 삭제는 stripSkeletonSections가 코드로 처리한다. 프롬프트는 '다듬기'만 지시하고,
  // 무엇보다 소제목을 지우지 말라고 못박아야 한다(운영 실측에서 통째로 지우는 사고가 났다).
  it('프롬프트는 소제목 보존을 못박고 다듬기만 지시한다', () => {
    const p = buildRestructureSystemPrompt(2200);
    expect(p).toContain("'## 소제목'을 하나도 지우지 않는다");
    expect(p).toContain('평문 문단만 남기는 것은 금지');
    expect(p).toContain('구체적 내용을 가리키는 문구로 바꾼다');
    // 삭제 지시는 더 이상 프롬프트에 없다.
    expect(p).not.toContain("'## 핵심 요약' 섹션을 없앤다");
  });

  // dry-run 실측(#1 청약 12건 현황)에서 단지별 접수일 목록이 통째로 산문화돼 오히려
  // 읽기 어려워졌다. 산문화는 해설 대목에만 적용되어야 한다.
  it('프롬프트는 열거형 내용의 목록·표를 보존하라고 지시한다', () => {
    const p = buildRestructureSystemPrompt(2200);
    expect(p).toContain('목록·표를 그대로 둔다');
    expect(p).toContain('원문이 목록이면 목록으로 남긴다');
  });

  it('h3으로 밀린 소제목을 h2로 되돌린 뒤 반환한다', async () => {
    const out = await restructureBody(
      mockClient('리드 문단.\n\n### 배경\n본문\n\n### 영향\n본문'),
      '## 핵심 요약\n- 하나\n\n## 배경\n본문\n\n## 영향\n본문',
      'gpt-x',
    );
    expect(out).toContain('## 배경');
    expect(out).not.toContain('### 배경');
  });

  it('원본 본문을 user 메시지로 전달한다', async () => {
    let seen: unknown;
    await restructureBody(mockClient('x', (a) => { seen = a; }), '원본 사실 ABC', 'gpt-x');
    const messages = (seen as { messages: { role: string; content: string }[] }).messages;
    const user = messages.find((m) => m.role === 'user');
    expect(user?.content).toContain('원본 사실 ABC');
  });
});
