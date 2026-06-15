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

export function checkLength(body: string, min = 1500, max = 2200): { ok: boolean; length: number } {
  const length = body.replace(/\s/g, '').length;
  return { ok: length >= min && length <= max, length };
}

export interface GuardrailInput { body: string; sourceName: string; sourceUrl: string; }
export interface GuardrailResult { ok: boolean; violations: string[]; }

export function runGuardrails(input: GuardrailInput): GuardrailResult {
  const violations: string[] = [];
  if (!input.sourceName.trim() || !input.sourceUrl.trim()) violations.push('출처(sourceName/sourceUrl) 누락');
  const forbidden = findForbiddenPhrases(input.body);
  if (forbidden.length) violations.push(`금지표현: ${forbidden.join(', ')}`);
  const len = checkLength(input.body);
  if (!len.ok) violations.push(`분량 범위 벗어남(${len.length}자)`);
  return { ok: violations.length === 0, violations };
}
