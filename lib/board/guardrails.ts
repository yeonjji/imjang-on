// 의견·전망·추천성 표현 금지(프로젝트 원칙 3·4). 사실/중립 서술만 허용.
const FORBIDDEN_PATTERNS: { label: string; re: RegExp }[] = [
  { label: '보입니다', re: /보입니다|보인다/ },
  { label: '가능성이 있', re: /가능성이\s*(높|있|크)/ },
  { label: '예상됩니다', re: /예상(됩니다|된다|되며)/ },
  { label: '전망', re: /전망(이다|입니다|된다|이며|성)/ },
  { label: '추천', re: /추천(합니다|드립니다|한다)/ },
  { label: '것으로 보', re: /것으로\s*(보|예상|전망)/ },
  { label: '유망', re: /유망(하다|합니다|한)/ },
];

export function findForbiddenPhrases(text: string): string[] {
  return FORBIDDEN_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.label);
}

// 하한 800: 레버리지 ETF 등 사실 빈약 공공공시는 충실하게 써도 ~800자가 한계(gpt-4.1 실측 803).
// 패딩으로 1,000자를 억지로 채우는 건 과장 금지 원칙에 어긋나, 정직한 길이에 기준을 맞춘다.
export function checkLength(body: string, min = 800, max = 2200): { ok: boolean; length: number } {
  const length = body.replace(/\s/g, '').length;
  return { ok: length >= min && length <= max, length };
}

export interface GuardrailInput {
  body: string;
  sourceName: string;
  sourceUrl: string;
  /**
   * 하한 재지정. 기본 800은 **새 글 생성** 기준이다 — 그 아래는 패딩 없이 못 채운다는 뜻이었다.
   * 이미 게시된 글의 서식 틀을 걷어내는 작업에는 맞지 않는다: 중복이던 '## 핵심 요약'·'## 참고 자료'
   * 약 150자가 정당하게 빠지므로, 원문이 856자(운영 36편 최소)면 결과가 800을 밑돈다.
   * 그 작업에서 필요한 판정은 '짧은가'가 아니라 '내용이 유실됐는가'이고, 그건 호출부가 원문과 대조한다.
   */
  minLength?: number;
}
export interface GuardrailResult { ok: boolean; violations: string[]; }

export function runGuardrails(input: GuardrailInput): GuardrailResult {
  const violations: string[] = [];
  if (!input.sourceName.trim() || !input.sourceUrl.trim()) violations.push('출처(sourceName/sourceUrl) 누락');
  const forbidden = findForbiddenPhrases(input.body);
  if (forbidden.length) violations.push(`금지표현: ${forbidden.join(', ')}`);
  const len = checkLength(input.body, input.minLength);
  if (!len.ok) violations.push(`분량 범위 벗어남(${len.length}자)`);
  return { ok: violations.length === 0, violations };
}
