// 의견·전망·추천성 표현 금지(프로젝트 원칙 3·4). 사실/중립 서술만 허용.
const FORBIDDEN_PATTERNS: { label: string; re: RegExp }[] = [
  // 보조용언 '보이다'(추측)는 본용언 뒤에 띄어 쓴다 — "상승할 것으로 보입니다", "좋아 보입니다".
  // 경계 없이 잡으면 받침 없는 명사 + '입니다'와 겹쳐 '정보입니다·예보입니다·홍보입니다'까지
  // 금지표현으로 반려된다. 자동 생성 경로에서는 그 글이 조용히 버려지므로 앞의 공백을 요구한다.
  { label: '보입니다', re: /(?:^|\s)보(?:입니다|인다)/ },
  { label: '가능성이 있', re: /가능성이\s*(높|있|크)/ },
  { label: '예상됩니다', re: /예상(됩니다|된다|되며)/ },
  { label: '전망', re: /전망(이다|입니다|된다|이며|성)/ },
  { label: '추천', re: /추천(합니다|드립니다|한다)/ },
  // '것으로 본다/보기'는 막지 않는다 — 법령의 간주 규정을 그대로 인용하는 형식이다
  // (주택임대차보호법 제3조 제4항 '임대인의 지위를 승계한 것으로 본다').
  // 추측성인 '것으로 보입니다/보인다'는 위의 '보입니다' 규칙이 이미 잡는다.
  { label: '것으로 보여', re: /것으로\s*(보여|보이며|예상|전망)/ },
  { label: '유망', re: /유망(하다|합니다|한)/ },
];

export function findForbiddenPhrases(text: string): string[] {
  return FORBIDDEN_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.label);
}

// 하한 800: 레버리지 ETF 등 사실 빈약 공공공시는 충실하게 써도 ~800자가 한계(gpt-4.1 실측 803).
// 패딩으로 1,000자를 억지로 채우는 건 과장 금지 원칙에 어긋나, 정직한 길이에 기준을 맞춘다.
export const MAX_BODY_CHARS = 2200;

// 손수 쓴 글 전용 상한. 조문번호·시행일·검산을 함께 적는 글은 2200에서 사실이 아니라 근거 표기부터
// 잘려나가 '모든 수치에 출처 표기' 원칙과 충돌한다. 자동 생성 글은 종전 2200을 그대로 쓴다.
// 실측: 근저당·전세 권리분석 글(insert-jeonse-mortgage-priority)이 압축 없이 2,617자.
export const MAX_BODY_CHARS_MANUAL = 3000;

export function checkLength(body: string, min = 800, max = MAX_BODY_CHARS): { ok: boolean; length: number } {
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
  /** 손수 쓴 글만 MAX_BODY_CHARS_MANUAL을 넘긴다. 미지정 시 자동 생성 글 상한(2200)이 적용된다. */
  maxLength?: number;
}
export interface GuardrailResult { ok: boolean; violations: string[]; }

export function runGuardrails(input: GuardrailInput): GuardrailResult {
  const violations: string[] = [];
  if (!input.sourceName.trim() || !input.sourceUrl.trim()) violations.push('출처(sourceName/sourceUrl) 누락');
  const forbidden = findForbiddenPhrases(input.body);
  if (forbidden.length) violations.push(`금지표현: ${forbidden.join(', ')}`);
  // 두 옵션은 독립적이다 — minLength는 재작성(축출) 경로가, maxLength는 손수 쓴 글이 쓴다.
  const len = checkLength(input.body, input.minLength, input.maxLength);
  if (!len.ok) violations.push(`분량 범위 벗어남(${len.length}자)`);
  return { ok: violations.length === 0, violations };
}
