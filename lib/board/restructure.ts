import type { OpenAiLike } from '@/lib/board/generate';
import { splitSummary } from '@/lib/board/summary-split';

const RESTRUCTURE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['body'],
  properties: { body: { type: 'string' } },
} as const;

/**
 * 골격 섹션을 기계로 떼어낸다. LLM에게 '삭제'를 맡겼더니 남은 소제목까지 통째로 지우는 일이
 * 잦았다 — 운영 26편 실측에서 절반 이상이 '## 소제목' 전멸로 차단됐다(#23은 5개 → 0개).
 *
 * 삭제는 판단이 필요 없는 작업이므로 코드가 한다. LLM에는 다듬기만 남긴다.
 * - '## 핵심 요약': 본문의 요약이라 정의상 중복이고, Post.summary 필드가 따로 있다.
 * - '## 참고 자료': board/[id]/page.tsx가 sourceName·sourceUrl·sourceDate로 이미 표기한다.
 */
export function stripSkeletonSections(body: string): string {
  const withoutSummary = splitSummary(body).rest;
  // '## 참고 자료' 헤딩과 그 아래 '## '로 시작하지 않는 줄 전부를 제거한다.
  // (종전의 게으른 [\s\S]*? + \s*$ 전방탐색은 첫 줄 끝에서 멈춰 뒷줄을 남겼다.)
  const out = withoutSummary.replace(/^## 참고 자료[^\n]*(?:\n(?!## )[^\n]*)*\n?/m, '');
  // 섹션이 중간에서 빠지면 빈 줄이 겹친다 — 문단 구분 한 줄로 정규화.
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

export function buildRestructureSystemPrompt(maxChars: number): string {
  return `당신은 기계적으로 찍어낸 티가 나는 한국어 기사 본문을 사람이 쓴 글처럼 다듬는 편집자다.
골격 섹션은 이미 제거된 상태로 주어진다. 당신이 할 일은 남은 본문을 다듬는 것뿐이다.

[절대 원칙]
1. 원문에 있는 사실·수치·날짜·금액·고유명사를 그대로 보존한다. 새 사실·수치·해석을 추가하지 않는다.
   특히 **계산하지 않는다** — 항목별 수치를 더하거나 비율·평균을 구해 원문에 없던 숫자를 만들지 않는다.
   원문이 합계를 적어두지 않았다면 합계는 쓰지 않는다.
2. 의견·전망·추천 표현을 새로 만들지 않는다("보입니다/예상/전망/추천/유망" 등 금지).
3. 문장을 더 읽기 쉽게 다듬을 수는 있으나, 정보의 양은 늘리지도 줄이지도 않는다.

[반드시 지킬 구조 — 어기면 결과를 버린다]
4. 주어진 '## 소제목'을 하나도 지우지 않는다. 개수를 그대로 유지한다.
   단계도 '## '(h2) 그대로 둔다. '### '로 낮추지 않는다.
   소제목을 걷어내고 평문 문단만 남기는 것은 금지다.
5. 열거가 본질인 내용은 목록·표를 그대로 둔다. 단지별 접수일·발표일, 항목별 수치, 일정표처럼
   독자가 훑어서 찾는 정보를 산문으로 풀어쓰지 않는다. 원문이 목록이면 목록으로 남긴다.

[다듬을 것]
6. '개요·배경·주요 내용·정리·마무리' 같은 라벨형 소제목은 그 절의 구체적 내용을 가리키는 문구로 바꾼다.
   조사나 단어 한둘을 갈아끼우는 것('및'→'과', '유의사항'→'주의할 점')은 바꾼 것이 아니다.
   다만 자료에 없는 판단·평가를 소제목에 새로 넣지는 않는다. 소제목을 바꾸되 개수는 그대로다.
7. 뜻을 더하지 않는 **굵게** 강조를 푼다.
8. 제도·배경·차이를 설명하는 해설 대목의 불릿은 문단 산문으로 잇는다. 토막난 문장을 문장으로 연결한다.
9. 분량은 공백 제외 한글 최대 ${maxChars.toLocaleString('en-US')}자를 넘기지 않는다. 원문보다 늘리지 않는다.

[출력] body는 다듬은 마크다운 전문.`;
}

/**
 * 소제목 단계 복구. 모델이 맨 앞 '## 핵심 요약'을 지우면서 남은 소제목을 '### '로 한 단계씩
 * 낮추는 일이 잦다 — 운영 11편 실측에서 6편(55%)이 그랬다. 프롬프트에 h2 유지를 명시해도
 * 비결정적으로 재발한다.
 *
 * 원문에 '### '가 없었고 새 본문에 '## '가 하나도 없다면 통째로 한 단계 밀린 것이므로,
 * 내용 판단 없이 서식만 되돌린다. 원문에 '### '가 있었거나 새 본문에 '## '가 남아 있으면
 * 의도적인 단계 구성일 수 있으므로 건드리지 않는다.
 */
export function promoteDemotedHeadings(oldBody: string, newBody: string): string {
  if (/^### /m.test(oldBody)) return newBody;
  if (/^## /m.test(newBody)) return newBody;
  if (!/^### /m.test(newBody)) return newBody;
  return newBody.replace(/^### /gm, '## ');
}

export async function restructureBody(client: OpenAiLike, body: string, model: string, maxChars = 2200): Promise<string> {
  // 골격 제거는 코드가 먼저 끝낸다. LLM에 맡기면 남은 소제목까지 지운다(운영 실측).
  const stripped = stripSkeletonSections(body);
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      { role: 'system', content: buildRestructureSystemPrompt(maxChars) },
      { role: 'user', content: `다음 본문을 위 규칙대로 다듬어라.\n\n=== 본문 시작 ===\n${stripped}\n=== 본문 끝 ===` },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'restructured_article', strict: true, schema: RESTRUCTURE_JSON_SCHEMA } },
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('restructureBody: empty completion');
  const parsed = JSON.parse(content) as { body: string };
  // 모델이 출처 섹션을 되살려 붙이는 경우가 있어 출력에도 한 번 더 적용한다(멱등).
  return stripSkeletonSections(promoteDemotedHeadings(stripped, parsed.body));
}
