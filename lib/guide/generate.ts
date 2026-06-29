import type { GuideCategory } from '@prisma/client';
import type { OpenAiLike } from '@/lib/board/generate';

export interface GenerateGuideInput {
  category: GuideCategory;
  topic: string;
  angle: string;
  sourceText: string;
  sourceName: string;
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

// board(뉴스)와 달리 해설·하우투를 허용하되, 과장·시세전망·투자권유는 금지하고 출처를 밝힌다.
const SYSTEM_PROMPT = `당신은 공공데이터를 바탕으로 부동산·생활 정보를 쉽게 풀어 설명하는 한국어 가이드 작성자다.
독자가 끝까지 읽는 한 편의 '상록(evergreen) 설명 글'을 쓴다. 특정 날짜의 뉴스가 아니라, 언제 읽어도 유효한 개념·절차·유의점을 설명한다.

[허용 — 가이드 장르]
1. 개념 풀이, 단계별 방법(how-to), 일반적으로 알려진 유의점·비교를 문장으로 설명한다.

[금지 — 반드시 지킨다]
2. 집값·시세의 상승/하락 단정 전망을 쓰지 않는다("오를 것/내릴 것/급등/유망" 등 금지).
3. 매수·매도 권유나 투자 조언("지금이 기회/사두면/추천" 등)을 쓰지 않는다.
4. "무조건/보장/확실히 이득/최고의" 같은 과장 표현을 쓰지 않는다.
5. 제공된 근거 자료의 사실 범위를 벗어나는 구체 수치·고유 사실을 지어내지 않는다. 일반 원리는 풀어 쓰되, 특정 수치는 자료에 있는 것만.

[작법]
6. 리드 문단으로 시작하고 문단 중심 산문으로 쓴다. 소제목(## )은 흐름에 따라 자유롭게.
7. 분량은 공백 제외 한글 최소 1,000자(2,000자 안팎).
8. 마지막에 출처와 기준을 한 줄로 밝힌다.

[출력] body는 마크다운. title은 25자 내외, summary는 한 문장 요약.`;

function buildUserPrompt(input: GenerateGuideInput): string {
  return `주제: ${input.topic}\n서술 방향: ${input.angle}\n\n다음은 '${input.sourceName}'의 근거 자료다. 이 자료의 사실 범위 안에서 일반 개념·절차를 풀어 설명하라.\n\n=== 근거 자료 시작 ===\n${input.sourceText}\n=== 근거 자료 끝 ===`;
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
