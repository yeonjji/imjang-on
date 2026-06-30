import { describe, it, expect } from 'vitest';
import { splitSummary } from '@/lib/board/summary-split';

describe('splitSummary', () => {
  it('맨 앞 ## 핵심 요약 블록을 분리하고 헤딩은 제거한다', () => {
    const body = '## 핵심 요약\n- 첫째 **키워드**\n- 둘째\n\n## 배경\n본문 단락.\n';
    const r = splitSummary(body);
    expect(r.summary).toBe('- 첫째 **키워드**\n- 둘째');
    expect(r.rest).toBe('## 배경\n본문 단락.');
  });

  it('선행 공백이 있어도 분리한다', () => {
    const r = splitSummary('\n\n## 핵심 요약\n- 하나\n\n## 영향\n끝.');
    expect(r.summary).toBe('- 하나');
    expect(r.rest).toBe('## 영향\n끝.');
  });

  it('핵심 요약이 본문 맨 앞이 아니면 분리하지 않는다', () => {
    const body = '리드 문단.\n\n## 핵심 요약\n- 하나\n';
    const r = splitSummary(body);
    expect(r.summary).toBeNull();
    expect(r.rest).toBe(body);
  });

  it('핵심 요약만 있고 다른 섹션이 없으면 rest는 빈 문자열', () => {
    const r = splitSummary('## 핵심 요약\n- 하나\n- 둘');
    expect(r.summary).toBe('- 하나\n- 둘');
    expect(r.rest).toBe('');
  });

  it('### 소제목은 다음 섹션 경계로 보지 않는다(h2만 경계)', () => {
    const r = splitSummary('## 핵심 요약\n- 하나\n### 메모\n부가\n## 배경\n본문');
    expect(r.summary).toBe('- 하나\n### 메모\n부가');
    expect(r.rest).toBe('## 배경\n본문');
  });

  it('핵심 요약 헤딩만 있고 내용이 비면 분리하지 않는다', () => {
    const body = '## 핵심 요약\n\n## 배경\n본문';
    const r = splitSummary(body);
    expect(r.summary).toBeNull();
    expect(r.rest).toBe(body);
  });
});
