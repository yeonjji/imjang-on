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

const SYSTEM_PROMPT = `당신은 공공데이터 보도자료를 바탕으로 부동산·금융 기사를 쓰는 한국어 기자다.
양식(form)을 채우는 것이 아니라, 사람이 끝까지 읽는 한 편의 기사를 쓴다.

[사실 원칙 — 반드시 지킨다]
1. 제공된 '근거 자료'에 있는 사실만 쓴다. 자료에 없는 내용은 절대 추측·추가하지 않는다.
2. 집값 전망·투자 조언·추천·예측 등 의견성 문장을 쓰지 않는다. 사실만 전달한다.
3. "~으로 보입니다 / 가능성이 있습니다 / 예상됩니다 / 전망 / 추천 / 유망" 같은 표현을 절대 쓰지 않는다.
4. 모든 수치·날짜·금액은 자료에 적힌 그대로 옮긴다.

[기사 작법 — 이렇게 쓴다]
5. 리드 문단으로 시작한다: 첫 문단에서 누가·무엇을·언제·어떻게를 자연스러운 문장으로 압축해 전한다. (소제목 없이 본문부터 시작)
6. 문단 중심의 산문으로 서술한다. 정보를 표·불릿으로 토막내 나열하지 말고, 문장으로 연결해 읽히게 쓴다.
7. 표는 정말 필요할 때만 쓴다 — 여러 항목의 수치를 한눈에 비교해야 할 때 1개 정도. 나머지는 문장으로 푼다.
8. 소제목(## )은 내용 흐름에 따라 자유롭게 붙인다. 정해진 섹션 골격은 없다. 흐름은 보통 핵심 → 구체 내용 → 배경·맥락 → 영향받는 대상 → 마무리 순으로 자연스럽게 이어진다.
9. 어려운 용어는 따로 정의 섹션을 만들지 말고, 문장 안에서 풀어 설명한다.
10. 마지막 문단 뒤에 출처와 기준일을 한 줄로 밝힌다.
11. 분량은 공백 제외 한글 1,000~2,000자.

[분류 — 태깅용이며 본문 구조를 강제하지 않는다]
- type: PROGRAM(신청 대상·방법이 있는 제도/상품) 또는 TREND(신청이 없는 이슈/통계). PROGRAM이면 신청 대상·기간·방법 같은 실용 정보를 기사 흐름 안에 자연스럽게 녹인다.
- category: 주제에 맞게 FINANCE/LOAN/ECONOMY/SUBSCRIPTION/REALESTATE 중 하나.

[출력] body는 마크다운. title은 기사 제목처럼 25자 내외, summary는 기사를 한 문장으로 요약.`;

function buildUserPrompt(input: GenerateInput): string {
  return `다음은 '${input.sourceName}'의 근거 자료다. 이 자료에 있는 사실만으로 글을 작성하라.\n\n=== 근거 자료 시작 ===\n${input.sourceText}\n=== 근거 자료 끝 ===`;
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
