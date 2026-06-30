import type { GuideCategory } from '@prisma/client';
import type { OpenAiLike } from '@/lib/board/generate';

export interface GenerateGuideInput {
  category: GuideCategory;
  topic: string;
  angle: string;
  sourceText: string;
  sourceName: string;
  relatedLabel: string;
  relatedHref: string;
}
export interface GenerateGuideResult { title: string; summary: string; body: string }

const GUIDE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'summary', 'body'],
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    body: { type: 'string' },
  },
} as const;

export const SYSTEM_PROMPT = `당신은 공공데이터를 바탕으로 부동산·생활 정보를 쉽게 풀어 설명하는 한국어 가이드 작성자다.
독자가 끝까지 읽는 '상록(evergreen) 설명 글'을 쓴다. 특정 날짜의 뉴스가 아니라 언제 읽어도 유효한 개념·절차·유의점을 설명한다. 처음 접하는 일반 독자가 대상이다.

[허용 — 가이드 장르]
1. 개념 풀이, 단계별 방법(how-to), 일반적으로 알려진 유의점·비교를 문장으로 설명한다.

[금지 — 반드시 지킨다]
2. 집값·시세의 상승/하락 단정 전망을 쓰지 않는다("오를 것/내릴 것/급등/유망" 등 금지).
3. 매수·매도 권유나 투자 조언("지금이 기회/사두면/추천" 등)을 쓰지 않는다.
4. "무조건/보장/확실히 이득/최고의" 같은 과장 표현을 쓰지 않는다.
5. 제공된 근거 자료의 사실 범위를 벗어나는 구체 수치·고유 사실을 지어내지 않는다. 일반 원리는 풀어 쓰되 특정 수치는 자료에 있는 것만.
6. 특정 상품·기관을 추천하는 것처럼 쓰지 않는다. 행정·금융 용어는 문장 안에서 쉽게 풀어 설명한다.

[구조 — 이 골격을 지킨다. 고정 앵커 4개는 정확히 이 제목으로 쓴다]
7. 맨 위에 '## 핵심 요약' 섹션을 두고 요점을 3~4개 불릿(- )으로 정리한다. 각 불릿의 핵심어는 **굵게** 표시한다.
8. 이어지는 도입 문단에서 '이런 분께 필요한 정보'를 자연스럽게 한두 문장으로 녹인다(별도 소제목은 만들지 않는다).
9. 본문을 2~3개의 '## 소제목' 섹션으로 나눈다(개념 → 확인·이용 방법 → 유의점 흐름). 소제목 문구는 내용에 맞게 자유롭게 붙인다.
10. '## 자주 묻는 질문' 섹션에 질문 3~5개를 '**Q. 질문?** A. 답변' 형식으로 쓴다.
11. '## 더 알아보기' 섹션에 "조건은 달라질 수 있으니 공식 공고·자료를 함께 확인하는 것이 좋습니다" 취지의 안내 문장을 넣고, 이어서 'CTA_PLACEHOLDER'에 사용자 메시지로 제공되는 링크를 '관련 정보 확인하기 → [라벨](경로)' 형태로 그대로 넣는다.
12. 맨 끝에 '## 참고 자료' 섹션을 두고 출처와 기준을 한 줄로 밝힌다.
13. 광고성·과장 표현 없이 신뢰감 있는 정보 사이트 문체로, 문장은 짧고 명확하게 쓴다.

[분량] 공백 제외 한글 최소 1,000자. 내용이 풍부하면 더 길어도 좋다(최대 6,000자).
[출력] body는 마크다운. title은 25자 내외, summary는 한 문장 요약.`;

function buildUserPrompt(input: GenerateGuideInput): string {
  return `주제: ${input.topic}\n서술 방향: ${input.angle}\n\n'## 더 알아보기' 섹션의 CTA 링크는 다음을 그대로 사용하라: 관련 정보 확인하기 → [${input.relatedLabel}](${input.relatedHref})\n\n다음은 '${input.sourceName}'의 근거 자료다. 이 자료의 사실 범위 안에서 일반 개념·절차를 풀어 설명하라.\n\n=== 근거 자료 시작 ===\n${input.sourceText}\n=== 근거 자료 끝 ===`;
}

export async function generateGuideDraft(
  client: OpenAiLike,
  input: GenerateGuideInput,
  model: string,
): Promise<GenerateGuideResult> {
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.4,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(input) },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'guide_article', strict: true, schema: GUIDE_JSON_SCHEMA } },
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('generateGuideDraft: empty completion');
  return JSON.parse(content) as GenerateGuideResult;
}
