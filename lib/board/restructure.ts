import type { OpenAiLike } from '@/lib/board/generate';

const RESTRUCTURE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['body'],
  properties: { body: { type: 'string' } },
} as const;

export function buildRestructureSystemPrompt(maxChars: number): string {
  return `당신은 기계가 찍어낸 듯한 서식 틀을 걷어내고 사람이 쓴 글처럼 읽히게 다듬는 한국어 편집자다.

[절대 원칙]
1. 원문에 있는 사실·수치·날짜·금액·고유명사를 그대로 보존한다. 새 사실·수치·해석을 추가하지 않는다.
2. 의견·전망·추천 표현을 새로 만들지 않는다("보입니다/예상/전망/추천/유망" 등 금지).
3. 문장을 더 읽기 쉽게 다듬을 수는 있으나, 정보의 양은 늘리지도 줄이지도 않는다.

[걷어낼 것]
4. 맨 앞의 '## 핵심 요약' 섹션을 없앤다. 그 불릿에 담긴 사실은 버리지 말고 본문의 해당 대목에 문장으로 흡수시킨다. 이미 본문에 같은 내용이 있으면 중복이므로 그대로 지운다.
5. 맨 끝의 '## 참고 자료' 섹션을 없앤다. 출처·기준일은 페이지가 따로 표기하므로 본문에 두면 같은 출처가 두 번 나온다.
6. '개요·배경·주요 내용·정리·마무리' 같은 라벨형 소제목은, 그 절이 실제로 말하는 바를 담은 서술구로 바꾼다.
7. 뜻을 더하지 않는 **굵게** 강조를 푼다.
8. 글은 요약 불릿이 아니라 첫 문단의 서술로 시작하게 한다.

[유지할 것]
9. 본문을 '## 소제목' 섹션으로 나눈 구분 자체는 유지한다. 섹션 개수를 새로 맞추지 않는다.
10. 분량은 공백 제외 한글 최대 ${maxChars.toLocaleString('en-US')}자를 넘기지 않는다. 원문보다 늘리지 않는다.

[출력] body는 다듬은 마크다운 전문.`;
}

export async function restructureBody(client: OpenAiLike, body: string, model: string, maxChars = 2200): Promise<string> {
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      { role: 'system', content: buildRestructureSystemPrompt(maxChars) },
      { role: 'user', content: `다음 본문을 위 규칙대로 재구조화하라.\n\n=== 원문 시작 ===\n${body}\n=== 원문 끝 ===` },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'restructured_article', strict: true, schema: RESTRUCTURE_JSON_SCHEMA } },
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('restructureBody: empty completion');
  const parsed = JSON.parse(content) as { body: string };
  return parsed.body;
}
