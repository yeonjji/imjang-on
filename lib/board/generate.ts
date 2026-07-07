import type { PostType, PostCategory } from '@prisma/client';

// 테스트 주입을 위한 최소 인터페이스(실제 OpenAI 클라이언트가 이 형태를 만족).
export interface OpenAiLike {
  chat: {
    completions: {
      create: (args: unknown) => Promise<{ choices: { message: { content: string | null } }[] }>;
    };
  };
}

export interface GenerateInput { sourceText: string; sourceName: string; }
export interface GenerateResult {
  type: PostType;
  category: PostCategory;
  title: string;
  summary: string;
  body: string;
}

const TYPES: PostType[] = ['PROGRAM', 'TREND'];
const CATEGORIES: PostCategory[] = ['FINANCE', 'LOAN', 'ECONOMY', 'SUBSCRIPTION', 'REALESTATE'];

const ARTICLE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'category', 'title', 'summary', 'body'],
  properties: {
    type: { type: 'string', enum: TYPES },
    category: { type: 'string', enum: CATEGORIES },
    title: { type: 'string' },
    summary: { type: 'string' },
    body: { type: 'string' },
  },
} as const;

export const SYSTEM_PROMPT = `당신은 공공데이터 보도자료를 바탕으로 부동산·금융 기사를 쓰는 한국어 기자다.
독자가 끝까지 읽도록 '핵심 요약 → 섹션별 소제목' 구조로 정리된 한 편의 기사를 쓴다.

[사실 원칙 — 반드시 지킨다]
1. 제공된 근거 자료는 여러 공식 출처의 글이 [출처: …] 블록으로 이어져 있을 수 있다. 각 사실은 해당 출처에 근거해 쓰고, 자료에 없는 내용은 절대 추측·추가하지 않는다.
2. 집값 전망·투자 조언·추천·예측 등 의견성 문장을 쓰지 않는다. 사실만 전달한다.
3. "~으로 보입니다 / 가능성이 있습니다 / 예상됩니다 / 전망 / 추천 / 유망" 같은 표현을 절대 쓰지 않는다.
4. 모든 수치·날짜·금액은 자료에 적힌 그대로 옮긴다.

[구조 — 이 골격을 지킨다]
5. 맨 위에 '## 핵심 요약' 섹션을 두고, 글의 요점을 3~4개 불릿(- )으로 정리한다. 각 불릿의 핵심어는 **굵게** 표시한다.
6. 이어서 본문을 2~4개의 '## 소제목' 섹션으로 나눈다. 흐름은 보통 배경 → 주요 내용 → 영향받는 대상 → 마무리 순으로 자연스럽게 잇되, 소제목 문구는 내용에 맞게 자유롭게 붙인다.
7. 각 섹션 본문은 문단 중심의 산문으로 서술한다. 한 섹션 안에서 정보를 잘게 토막내지 말고 문장으로 연결해 읽히게 쓴다.
8. 표는 여러 항목의 수치를 한눈에 비교해야 할 때만 1개 정도 쓴다. 어려운 용어는 문장 안에서 풀어 설명한다.
9. 맨 끝에 '## 참고 자료' 섹션을 두고 출처와 기준일을 한 줄로 밝힌다.
10. 분량은 공백 제외 한글 최소 1,000자(2,000자 안팎, 최대 2,200자). 자료의 고유 사실이 적으면 등장한 제도·상품·용어의 구조와 작동 방식, 적용 대상·일정·절차, 일반적으로 알려진 유의점을 문장으로 풀어 채운다. 단 자료에 없는 구체 수치·고유 사실은 새로 만들지 않는다.

[분류 — 태깅용]
- type: PROGRAM(신청 대상·방법이 있는 제도/상품) 또는 TREND(신청이 없는 이슈/통계). PROGRAM이면 신청 대상·기간·방법 같은 실용 정보를 섹션 안에 자연스럽게 녹인다.
- category: 주제에 맞게 FINANCE/LOAN/ECONOMY/SUBSCRIPTION/REALESTATE 중 하나.

[출력] body는 마크다운. title은 기사 제목처럼 25자 내외, summary는 기사를 한 문장으로 요약.`;

function buildUserPrompt(input: GenerateInput): string {
  return `다음은 '${input.sourceName}' 등 여러 공식 출처에서 모은 근거 자료다. 각 [출처: …] 블록의 사실만으로 종합해 한 편의 글을 작성하라.\n\n=== 근거 자료 시작 ===\n${input.sourceText}\n=== 근거 자료 끝 ===`;
}

export async function generateDraft(client: OpenAiLike, input: GenerateInput, model: string): Promise<GenerateResult> {
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.4,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(input) },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'board_article', strict: true, schema: ARTICLE_JSON_SCHEMA } },
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('generateDraft: empty completion');
  const parsed = JSON.parse(content) as GenerateResult;
  if (!TYPES.includes(parsed.type)) throw new Error(`generateDraft: invalid type ${parsed.type}`);
  if (!CATEGORIES.includes(parsed.category)) throw new Error(`generateDraft: invalid category ${parsed.category}`);
  return parsed;
}

/** 실제 OpenAI 클라이언트 생성(런타임/스크립트용). 키 없으면 throw. openai는 지연 로딩. */
export function createOpenAiClient(apiKey: string | undefined): OpenAiLike {
  if (!apiKey) throw new Error('OPENAI_API_KEY 미설정');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('openai');
  const OpenAI = mod.default ?? mod;
  return new OpenAI({ apiKey });
}
