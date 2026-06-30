export interface SplitResult {
  summary: string | null;
  rest: string;
}

const HEAD = '## 핵심 요약';

/**
 * 본문 맨 앞의 `## 핵심 요약` 섹션을 분리한다.
 * - summary: 핵심 요약 헤딩을 제외한 그 섹션 마크다운 내용(없으면 null)
 * - rest: 핵심 요약 섹션을 제거한 나머지 본문
 * 핵심 요약이 맨 앞이 아니거나 내용이 비면 분리하지 않고 원본을 그대로 둔다.
 */
export function splitSummary(body: string): SplitResult {
  const head = body.replace(/^\s+/, '');
  if (!head.startsWith(HEAD)) return { summary: null, rest: body };

  const nl = head.indexOf('\n');
  if (nl === -1) return { summary: null, rest: body }; // 헤딩 한 줄뿐
  const after = head.slice(nl + 1);

  // 다음 h2(`## `) 경계 — 줄 시작의 `## ` 만. `### `는 매칭되지 않는다(세 번째 문자가 공백 아님).
  const m = after.match(/^##\s/m);
  let summary: string;
  let rest: string;
  if (m && m.index !== undefined) {
    summary = after.slice(0, m.index).trim();
    rest = after.slice(m.index).trim();
  } else {
    summary = after.trim();
    rest = '';
  }

  if (!summary) return { summary: null, rest: body };
  return { summary, rest };
}
