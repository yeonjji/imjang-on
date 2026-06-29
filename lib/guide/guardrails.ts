// 가이드 장르: 해설·비교·하우투는 허용(board와 다름). 과장·시세 단정전망·투자권유만 금지.
const FORBIDDEN_PATTERNS: { label: string; re: RegExp }[] = [
  { label: '시세 단정 전망', re: /(오를|내릴|폭등|폭락)\s*것|상승할\s*것|하락할\s*것|반드시\s*(오|내)/ },
  { label: '투자권유', re: /지금이\s*기회|매수하세요|사세요|추천(합니다|드립니다)|유망(하다|합니다|한)/ },
  { label: '과장', re: /무조건|보장(합니다|됩니다)|확실(합니다|히\s*(오|이득))|최고의/ },
];

export function findForbiddenGuidePhrases(text: string): string[] {
  return FORBIDDEN_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.label);
}

/** 가이드 본문 길이: 상록 가이드는 충실해야 하므로 하한을 둠. 상한은 넉넉히. */
export function checkGuideLength(body: string, min = 800, max = 6000): { ok: boolean; length: number } {
  const length = body.replace(/\s/g, '').length;
  return { ok: length >= min && length <= max, length };
}

export interface GuideGuardrailInput { body: string; sourceName: string; sourceUrl: string; }
export interface GuideGuardrailResult { ok: boolean; violations: string[] }

export function runGuideGuardrails(input: GuideGuardrailInput): GuideGuardrailResult {
  const violations: string[] = [];
  if (!input.sourceName.trim() || !input.sourceUrl.trim()) violations.push('출처(sourceName/sourceUrl) 누락');
  const forbidden = findForbiddenGuidePhrases(input.body);
  if (forbidden.length) violations.push(`금지표현: ${forbidden.join(', ')}`);
  const len = checkGuideLength(input.body);
  if (!len.ok) violations.push(`분량 범위 벗어남(${len.length}자)`);
  return { ok: violations.length === 0, violations };
}
