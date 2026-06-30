import type { OpenAiLike } from '@/lib/board/generate';

const RESTRUCTURE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['body'],
  properties: { body: { type: 'string' } },
} as const;

export const RESTRUCTURE_SYSTEM_PROMPT = `당신은 이미 작성된 한국어 기사/가이드 본문을 '핵심 요약 → 섹션별 소제목' 구조로 다시 정리하는 편집자다.

[절대 원칙]
1. 원문에 있는 사실·수치·날짜·금액·고유명사를 그대로 보존한다. 새 사실·수치·해석을 추가하지 않는다.
2. 의견·전망·추천 표현을 새로 만들지 않는다("보입니다/예상/전망/추천/유망" 등 금지).
3. 문장을 더 읽기 쉽게 다듬을 수는 있으나, 정보의 양은 늘리지도 줄이지도 않는다.

[구조]
4. 맨 위에 '## 핵심 요약' 섹션 — 원문의 요점을 3~4개 불릿(- )으로, 핵심어는 **굵게**.
5. 본문을 2~4개의 '## 소제목' 섹션으로 재배열한다(소제목 문구는 내용에 맞게).
6. 원문에 출처/기준일이 있으면 맨 끝 '## 참고 자료' 섹션으로 옮긴다.
7. 분량은 공백 제외 한글 최대 2,200자를 넘기지 않는다(원문이 그 이하이면 늘리지 않는다).

[출력] body는 재구조화된 마크다운 전문.`;

export async function restructureBody(client: OpenAiLike, body: string, model: string): Promise<string> {
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      { role: 'system', content: RESTRUCTURE_SYSTEM_PROMPT },
      { role: 'user', content: `다음 본문을 위 규칙대로 재구조화하라.\n\n=== 원문 시작 ===\n${body}\n=== 원문 끝 ===` },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'restructured_article', strict: true, schema: RESTRUCTURE_JSON_SCHEMA } },
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('restructureBody: empty completion');
  const parsed = JSON.parse(content) as { body: string };
  return parsed.body;
}
