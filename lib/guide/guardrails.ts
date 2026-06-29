// 가이드 장르: 해설·비교·하우투는 허용(board와 다름). 과장·시세 단정전망·투자권유만 금지.
const FORBIDDEN_PATTERNS: { label: string; re: RegExp }[] = [
  {
    label: '시세 단정 전망',
    re: /(오를|내릴|상승할|하락할|뛸|떨어질)\s*(것|겁|거)|(급등|급락|상승|하락|오를|내릴|값)[^.]{0,6}(예상|전망|가능성)/,
  },
  {
    label: '투자권유',
    re: /지금이?\s*(기회|적기)|사두(면|세요)|매수\s*타이밍|매수하세요|사세요|구입하세요|(강력\s*)?추천(합니다|드립니다|한다)|유망(하다|합니다|한)/,
  },
  {
    label: '과장',
    re: /무조건\s*(오르|이득|수익|돈)|(수익|가격|값|시세|집값)[^.]{0,8}보장(합니다|됩니다)|확실한?\s*(수익|이득)|대박|최고의?\s*(입지|단지|수익)/,
  },
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
